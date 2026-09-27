/**
 * Formules du lanceur de dés écrites comme dans l'ancienne app : `1d20+CON`,
 * `1d6-CON+8`, `2d6+INIT`. Un identifiant nu qui est une clé d'attribut devient
 * le terme que le système déclare pour les jets (`jet.apport`) :
 *
 *   - apport `modificateur` : `CON` → `mod(@CON)` ;
 *   - apport `valeur`       : `INIT` → `@INIT` ;
 *   - apport en formule     : `Defense` → `(mod(@DEX) + @niveau)` ;
 *   - attribut sans `jet`   : sa valeur, `@CLE`.
 *
 * Les formes explicites (`@CON`, `mod(@CON)`), les dés (`1d20`, `4d6k3`), les
 * appels de fonction et les mots du langage (`vrai`, `et`…) ne sont pas
 * touchés. La réécriture suit le découpage du langage : `CONTACT` n'est pas
 * `CON`, `d20` est un dé. Fonctions pures : aucune clé de jeu n'est connue ici.
 */
import type { SystemeCharge } from '../chargement/index.js';
import { decouperFormule, type ErreurFormule } from '../formules/index.js';
import { declarationsJetables } from './jetables.js';

export type ResultatFormuleJet =
  { ok: true; formule: string } | { ok: false; erreur: ErreurFormule };

const MOTS = new Set(['vrai', 'faux', 'et', 'ou', 'non']);

/**
 * Réécrit les clés nues d'une formule de jet en termes du moteur, pour un type
 * d'entité du système. La casse est tolérée quand elle ne prête pas à
 * confusion (`con` → `CON`). Un identifiant qui n'est pas une clé d'attribut
 * est une erreur, avec sa position dans le texte.
 */
export function normaliserFormuleJet(
  systeme: SystemeCharge,
  entite: string,
  formule: string,
): ResultatFormuleJet {
  const d = decouperFormule(formule);
  if (!d.ok) return d;
  const attributs = systeme.entites.get(entite)?.attributs;
  const cles = attributs ? [...attributs.keys()] : [];
  const termes = new Map(
    declarationsJetables(systeme, entite, { mj: true }).map((x) => [x.cle, x.terme]),
  );

  const resoudre = (nom: string): string | undefined => {
    if (attributs?.has(nom)) return nom;
    const proches = cles.filter((c) => c.toLowerCase() === nom.toLowerCase());
    return proches.length === 1 ? proches[0] : undefined;
  };

  const remplacements: { debut: number; fin: number; texte: string }[] = [];
  const { jetons } = d;
  for (let i = 0; i < jetons.length; i++) {
    const j = jetons[i]!;
    if (j.k !== 'ident' || MOTS.has(j.v)) continue;
    const suivant = jetons[i + 1];
    if (suivant?.k === 'op' && suivant.v === '(') continue; // appel : mod(…), max(…)
    const cle = j.v.includes('.') ? undefined : resoudre(j.v);
    if (!cle) {
      return {
        ok: false,
        erreur: {
          message: attributs
            ? `« ${j.v} » n’est pas un attribut du personnage`
            : `Type d’entité inconnu : ${entite}`,
          position: j.pos,
        },
      };
    }
    remplacements.push({
      debut: j.pos,
      fin: j.pos + j.v.length,
      texte: termes.get(cle) ?? `@${cle}`,
    });
  }

  let sortie = formule;
  for (const r of remplacements.reverse())
    sortie = sortie.slice(0, r.debut) + r.texte + sortie.slice(r.fin);
  return { ok: true, formule: sortie };
}

/** Référence à un attribut dans une formule : `@CLE` ou `mod(@CLE)`, avec son étendue. */
export interface TermeAttribut {
  debut: number;
  /** Position juste après le terme. */
  fin: number;
  cle: string;
  /** `mod(@CLE)` : le modificateur de l'attribut ; sinon sa valeur. */
  modificateur: boolean;
}

/**
 * Termes d'attribut de l'entité courante (`@CLE`, `mod(@CLE)`) d'une formule,
 * dans l'ordre : de quoi afficher le détail d'un jet avec les valeurs de la
 * fiche (`[12] + 2`). Formule illisible : aucun terme.
 */
export function termesAttributs(formule: string): TermeAttribut[] {
  const d = decouperFormule(formule);
  if (!d.ok) return [];
  const { jetons } = d;
  const sortie: TermeAttribut[] = [];
  for (let i = 0; i < jetons.length; i++) {
    const j = jetons[i]!;
    const [ouvrante, ref, fermante] = [jetons[i + 1], jetons[i + 2], jetons[i + 3]];
    if (
      j.k === 'ident' &&
      j.v === 'mod' &&
      ouvrante?.k === 'op' &&
      ouvrante.v === '(' &&
      ref?.k === 'ref' &&
      !ref.entite &&
      fermante?.k === 'op' &&
      fermante.v === ')'
    ) {
      sortie.push({ debut: j.pos, fin: fermante.pos + 1, cle: ref.cle, modificateur: true });
      i += 3;
    } else if (j.k === 'ref' && !j.entite) {
      sortie.push({ debut: j.pos, fin: j.pos + 1 + j.cle.length, cle: j.cle, modificateur: false });
    }
  }
  return sortie;
}
