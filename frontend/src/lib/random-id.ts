/**
 * Identifiant aléatoire : UUID v4 quand le navigateur le fournit. `crypto.randomUUID` n'existe
 * qu'en contexte sécurisé (https, localhost) ; ailleurs (autre appareil du réseau en http),
 * 128 bits tirés par `crypto.getRandomValues`, disponible partout.
 */
export function randomId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
