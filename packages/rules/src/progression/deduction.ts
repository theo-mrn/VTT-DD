/**
 * Valeurs de base déduites de valeurs calculées connues (import d'une fiche, docs/import-fiche.md) :
 * une fiche donne le PV max, pas le jet de dé de vie qui le fait. Pour chaque valeur lue qui
 * diffère du calcul, une base dont dépend sa formule, que la fiche ne fixe pas, est décalée de
 * l'écart si cela fait tomber juste (et reste dans ses bornes). Aucun attribut nommé : tout vient
 * des formules du système.
 */
import { calculer } from '../calcul/index.js';
import { chemins, systemePour, type SystemeCharge } from '../chargement/index.js';
import type { EtatEntite } from '../schema/index.js';

export function deduireBases(
  systemeDonne: SystemeCharge,
  etat: EtatEntite,
  lues: Readonly<Record<string, number>>,
  /** Bases données par la fiche : jamais décalées. */
  fixes: ReadonlySet<string>,
): EtatEntite {
  const systeme = systemePour(systemeDonne, etat);
  const entite = systeme.entites.get(etat.type);
  if (!entite) return etat;
  let courant = etat;
  for (const [cle, lu] of Object.entries(lues)) {
    if (entite.attributs.get(cle)?.nature !== 'derivee') continue;
    const fiche = calculer(systeme, courant);
    const ecart = lu - Number(fiche.valeur(cle));
    if (!ecart) continue;
    const formule = systeme.formules.get(chemins.attribut(etat.type, cle, 'formule'));
    for (const dep of formule?.dependances ?? []) {
      if (fixes.has(dep) || entite.attributs.get(dep)?.nature !== 'base') continue;
      const base = fiche.valeurs.get(dep);
      const attribut = entite.attributs.get(dep)!;
      // Valeur saisie (sans les effets qui s'y ajoutent), décalée de l'écart
      const saisie = courant.valeurs[dep] ?? ('defaut' in attribut ? attribut.defaut : undefined);
      const valeur = Number(saisie ?? 0) + ecart;
      if (
        (base?.min !== undefined && valeur < base.min) ||
        (base?.max !== undefined && valeur > base.max)
      )
        continue;
      const essai = { ...courant, valeurs: { ...courant.valeurs, [dep]: valeur } };
      if (Number(calculer(systeme, essai).valeur(cle)) === lu) {
        courant = essai;
        break;
      }
    }
  }
  return courant;
}
