/** Chargement direct depuis les sources YAML, pour les tests (sans build). */
import { charger, type SystemeCharge } from '@vtt/rules';
import { lireSysteme } from './sources.js';

export function chargerSource(id: string): SystemeCharge {
  const r = charger(lireSysteme(id));
  if (!r.ok) {
    throw new Error(
      `${id} invalide :\n${r.erreurs.map((e) => `  ${e.chemin} : ${e.message}${e.position !== undefined ? ` @${e.position}` : ''}`).join('\n')}`,
    );
  }
  return r.systeme;
}
