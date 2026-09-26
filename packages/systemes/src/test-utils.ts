/** Chargement direct depuis les sources YAML, pour les tests (sans build). */
import { charger, verifierPresentation, type Presentation, type SystemeCharge } from '@vtt/rules';
import { lirePresentation, lireSysteme } from './sources.js';

export function chargerSource(id: string): SystemeCharge {
  const r = charger(lireSysteme(id));
  if (!r.ok) {
    throw new Error(
      `${id} invalide :\n${r.erreurs.map((e) => `  ${e.chemin} : ${e.message}${e.position !== undefined ? ` @${e.position}` : ''}`).join('\n')}`,
    );
  }
  return r.systeme;
}

/** Présentation validée depuis les sources YAML, pour les tests. */
export function presentationSource(id: string): Presentation {
  const r = verifierPresentation(lirePresentation(id), chargerSource(id));
  if (!r.ok) {
    throw new Error(
      `${id} : présentation invalide :\n${r.erreurs.map((e) => `  ${e.chemin} : ${e.message}`).join('\n')}`,
    );
  }
  return r.presentation;
}
