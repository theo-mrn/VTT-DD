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

/**
 * Attaque d'arme D&D : le type d'attaque (`score`) se déclare, l'arme vient après le jet. Les
 * tests écrits avec l'arme seule prennent le type de l'arme (son champ `attaque`).
 */
export function avecType(
  systeme: SystemeCharge,
  action: string,
  parametres: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const a = systeme.actions.get(action);
  const arme = parametres.arme;
  if (!a?.parametres.some((p) => p.id === 'score') || parametres.score !== undefined)
    return parametres;
  if (typeof arme !== 'string' || !arme) return parametres;
  const type = systeme.entrees.get(arme.split('#')[0]!)?.champs.attaque;
  return { score: typeof type === 'string' ? type : 'Contact', ...parametres };
}
