/**
 * Liaison d'une identité Discord au compte connecté (docs/discord.md) : le bot remet un jeton
 * signé par identity (`/link`), la page /discord/lier le présente ici.
 */
import { api } from './api';

/** Nom Discord porté par le jeton (affichage seulement : identity vérifie la signature). */
export function nomDiscordDuJeton(jeton: string): string | null {
  try {
    const charge = (jeton.split('.')[1] ?? '').replaceAll('-', '+').replaceAll('_', '/');
    const octets = Uint8Array.from(atob(charge), (c) => c.codePointAt(0) ?? 0);
    const nom = (JSON.parse(new TextDecoder().decode(octets)) as { name?: unknown }).name;
    return typeof nom === 'string' && nom ? nom : null;
  } catch {
    return null;
  }
}

export function lierDiscord(jeton: string) {
  return api<{ discordName: string | null; linked: true }>('/v1/auth/discord/link', {
    method: 'POST',
    body: JSON.stringify({ token: jeton }),
  });
}
