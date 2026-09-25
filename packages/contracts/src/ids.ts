/**
 * UUID version 7 (RFC 9562) : 48 bits d'horodatage en millisecondes, puis de
 * l'aléa. Triés par date de création, ils gardent les index B-tree compacts
 * (contrairement aux UUIDv4) et servent d'identifiant aux comptes, sessions et
 * événements. Fonctionne dans Node comme dans le navigateur (Web Crypto).
 */
export function uuidv7(now: number = Date.now()): string {
  const octets = new Uint8Array(16);
  globalThis.crypto.getRandomValues(octets);

  // Horodatage sur 48 bits, gros-boutiste (octets 0 à 5)
  let ms = Math.floor(now);
  for (let i = 5; i >= 0; i--) {
    octets[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  octets[6] = (octets[6]! & 0x0f) | 0x70; // version 7
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
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
