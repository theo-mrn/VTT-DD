/** Dernière milliseconde servie sur l'heure courante, et compteur dans cette milliseconde. */
let lastMs = -1;
let counter = 0;

/**
 * UUID version 7 (RFC 9562) : 48 bits d'horodatage en millisecondes, puis de
 * l'aléa. Triés par date de création, ils gardent les index B-tree compacts
 * (contrairement aux UUIDv4) et servent d'identifiant aux comptes, sessions et
 * événements. Fonctionne dans Node comme dans le navigateur (Web Crypto).
 *
 * Sur l'heure courante (sans `now`), ils sont strictement croissants dans le processus, même
 * dans une milliseconde (compteur sur 12 bits, RFC 9562 § 6.2, méthode 1) : deux événements
 * écrits dans la même transaction se publient dans leur ordre d'écriture. Avec `now` (import
 * d'une date passée), l'horodatage est celui donné, suivi d'aléa.
 */
export function uuidv7(now?: number): string {
  const octets = new Uint8Array(16);
  globalThis.crypto.getRandomValues(octets);

  let ms: number;
  let sequence: number;
  if (now === undefined) {
    ms = Date.now();
    if (ms <= lastMs) {
      // Même milliseconde (ou horloge reculée) : on reste sur la dernière, compteur + 1
      ms = lastMs;
      counter += 1;
      if (counter > 0xfff) {
        ms = lastMs + 1;
        counter = 0;
      }
    } else counter = octets[7]! & 0x7f; // départ aléatoire, avec de la marge pour la suite
    lastMs = ms;
    sequence = counter;
  } else {
    ms = Math.floor(now);
    sequence = ((octets[6]! & 0x0f) << 8) | octets[7]!;
  }

  // Horodatage sur 48 bits, gros-boutiste (octets 0 à 5)
  let rest = ms;
  for (let i = 5; i >= 0; i--) {
    octets[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  octets[6] = 0x70 | (sequence >> 8); // version 7, puis les 4 bits hauts du compteur
  octets[7] = sequence & 0xff;
  octets[8] = (octets[8]! & 0x3f) | 0x80; // variante RFC 9562

  const hex = Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidv7(valeur: string): boolean {
  return UUID_V7.test(valeur);
}

/** Date de création encodée dans un UUIDv7. */
export function uuidv7Timestamp(id: string): number {
  return Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
}
