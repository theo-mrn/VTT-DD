/**
 * Initiative : chaque participant exécute l'action d'initiative du système,
 * puis les participants sont triés selon `initiative.tri` (clés successives,
 * ordre décroissant). À égalité parfaite, l'ordre des participants fourni est
 * conservé (tri stable).
 */
import type { Fiche } from '../calcul/index.js';
import { chemins, type SystemeCharge } from '../chargement/index.js';
import type { Generateur, Valeur } from '../formules/index.js';
import { executer, type ErreurAction, type ResultatAction } from './actions.js';

export interface Participant {
  /** Identifiant libre (jeton, combattant…), repris dans le classement. */
  id: string;
  fiche: Fiche;
  parametres?: Record<string, Valeur>;
  /** Cible de l'action d'initiative, si elle en déclare une. */
  cible?: Fiche;
}

export interface RangInitiative {
  id: string;
  /** Valeurs des clés de tri, dans l'ordre de `initiative.tri`. */
  cles: number[];
  resultat: ResultatAction;
}

export interface ErreurInitiative extends ErreurAction {
  /** Participant concerné, le cas échéant. */
  participant?: string;
}

export type ResultatInitiative =
  { ok: true; ordre: RangInitiative[] } | { ok: false; erreurs: ErreurInitiative[] };

/** Les participants lancent dans l'ordre fourni (ordre de consommation du générateur). */
export function initiative(
  systeme: SystemeCharge,
  participants: Participant[],
  aleatoire: Generateur,
): ResultatInitiative {
  const ini = systeme.source.initiative;
  if (!ini) {
    return {
      ok: false,
      erreurs: [{ message: `Le système ${systeme.source.nom} ne déclare pas d’initiative` }],
    };
  }

  const erreurs: ErreurInitiative[] = [];
  const vus = new Set<string>();
  for (const p of participants) {
    if (vus.has(p.id))
      erreurs.push({ participant: p.id, message: `Participant en double : ${p.id}` });
    vus.add(p.id);
  }
  if (erreurs.length) return { ok: false, erreurs };

  const rangs: RangInitiative[] = [];
  for (const p of participants) {
    const r = executer(systeme, {
      action: ini.action,
      acteur: p.fiche,
      ...(p.cible ? { cible: p.cible } : {}),
      parametres: p.parametres ?? {},
      aleatoire,
    });
    if (!r.ok) {
      erreurs.push(...r.erreurs.map((e) => ({ ...e, participant: p.id })));
      continue;
    }
    const cles = ini.tri.map((_, i) => Number(r.evaluer(chemins.tri(i), 0)));
    rangs.push({ id: p.id, cles, resultat: r.resultat });
  }
  if (erreurs.length) return { ok: false, erreurs };

  const ordre = [...rangs].sort((a, b) => {
    for (let i = 0; i < a.cles.length; i++) {
      const d = b.cles[i]! - a.cles[i]!;
      if (d !== 0) return d;
    }
    return 0;
  });
  return { ok: true, ordre };
}
