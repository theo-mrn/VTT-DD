/**
 * Conversion sans perte des valeurs Firestore en JSON.
 *
 * Les types propres à Firestore sont balisés pour que les imports puissent les
 * reconstituer exactement :
 *   Timestamp          -> { "$timestamp": "2026-09-25T14:21:00.123456789Z" }  (nanosecondes conservées)
 *   DocumentReference  -> { "$ref": "cartes/abc/characters/xyz" }
 *   GeoPoint           -> { "$geo": [latitude, longitude] }
 *   Bytes / Buffer     -> { "$bytes": "base64" }
 * Les clés commençant par « $ » dans les données d'origine sont préfixées d'un
 * « $ » supplémentaire pour ne jamais être confondues avec une balise.
 */

export type Json = null | boolean | number | string | Json[] | { [cle: string]: Json };

interface TimestampLike {
  seconds: number;
  nanoseconds: number;
  toDate(): Date;
}

function estTimestamp(v: object): v is TimestampLike {
  return (
    typeof (v as TimestampLike).toDate === 'function' &&
    typeof (v as TimestampLike).seconds === 'number' &&
    typeof (v as TimestampLike).nanoseconds === 'number'
  );
}

function estReference(v: object): v is { path: string; firestore: unknown } {
  return typeof (v as { path?: unknown }).path === 'string' && 'firestore' in v;
}

/**
 * Classe GeoPoint de firebase-admin : un simple objet { latitude, longitude }
 * enregistré par l'app doit rester un objet ordinaire.
 */
function estGeoPoint(v: object): v is { latitude: number; longitude: number } {
  return (
    v.constructor?.name === 'GeoPoint' &&
    typeof (v as { latitude?: unknown }).latitude === 'number' &&
    typeof (v as { longitude?: unknown }).longitude === 'number'
  );
}

/** ISO 8601 avec les nanosecondes de Firestore (Date n'en garde que les millisecondes). */
function isoNanosecondes(t: TimestampLike): string {
  const base = new Date(t.seconds * 1000).toISOString().slice(0, 19);
  return `${base}.${String(t.nanoseconds).padStart(9, '0')}Z`;
}

export function normaliser(valeur: unknown): Json {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === 'boolean' || typeof valeur === 'string') return valeur;
  if (typeof valeur === 'number') {
    // NaN et ±Infinity n'existent pas en JSON : balisés pour ne pas devenir null
    return Number.isFinite(valeur) ? valeur : { $number: String(valeur) };
  }
  if (typeof valeur === 'bigint') return { $number: valeur.toString() };
  if (valeur instanceof Uint8Array) return { $bytes: Buffer.from(valeur).toString('base64') };
  if (Array.isArray(valeur)) return valeur.map(normaliser);
  if (typeof valeur === 'object') {
    if (estTimestamp(valeur)) return { $timestamp: isoNanosecondes(valeur) };
    if (estReference(valeur)) return { $ref: valeur.path };
    if (estGeoPoint(valeur)) return { $geo: [valeur.latitude, valeur.longitude] };
    if (typeof (valeur as { toBase64?: unknown }).toBase64 === 'function') {
      return { $bytes: (valeur as { toBase64(): string }).toBase64() };
    }
    const sortie: { [cle: string]: Json } = {};
    for (const [cle, v] of Object.entries(valeur)) {
      sortie[cle.startsWith('$') ? `$${cle}` : cle] = normaliser(v);
    }
    return sortie;
  }
  throw new Error(`Type Firestore non géré : ${typeof valeur}`);
}
