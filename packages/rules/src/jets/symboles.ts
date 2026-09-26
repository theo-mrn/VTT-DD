/**
 * Dés à symboles : composition d'un pool (ajouts, améliorations) et lancer.
 * Le moteur ne connaît ni les sortes de dé ni les symboles : tout vient de
 * `systeme.source.des`.
 */
import type { SystemeCharge } from '../chargement/index.js';
import { chemins } from '../chargement/index.js';
import {
  ErreurEvaluation,
  evaluer,
  LIMITES,
  type Generateur,
  type Valeur,
} from '../formules/index.js';

/** Composition d'un pool : nombre de dés de chaque sorte. */
export type Pool = { de: string; nombre: number }[];

export interface DeSymbole {
  /** Sorte de dé. */
  de: string;
  /** Face tirée, de 1 au nombre de faces (ordre de déclaration des faces). */
  face: number;
  /** Symboles portés par la face (seulement ceux présents). */
  symboles: Record<string, number>;
}

export interface ErreurJet {
  /** Chemin de la formule ou élément concerné. */
  ou: string;
  message: string;
}

export interface LancerSymboles {
  /** Dés lancés, dans l'ordre des sortes déclarées par le système. */
  des: DeSymbole[];
  /** Total de chaque symbole déclaré (0 s'il n'est pas sorti). */
  symboles: Record<string, number>;
  /** Résultats déclarés (`des.resultats`), évalués avec les symboles comme variables. */
  resultats: Record<string, number>;
  /** Formules de résultat en échec (le résultat vaut alors 0). */
  erreurs: ErreurJet[];
}

/** Regroupe les lignes d'une même sorte de dé, en gardant l'ordre de première apparition. */
export function regrouperPool(pool: Pool): Pool {
  const nombres = new Map<string, number>();
  for (const p of pool) nombres.set(p.de, (nombres.get(p.de) ?? 0) + p.nombre);
  return [...nombres].map(([de, nombre]) => ({ de, nombre }));
}

/**
 * Améliore `nombre` dés `de` en dés `vers`. Règle générique, appliquée dé par
 * dé : chaque amélioration change un dé `de` en dé `vers` ; s'il ne reste
 * aucun dé `de`, elle ajoute un dé `de` à la place (qu'une amélioration
 * suivante pourra à son tour changer en `vers`). Ainsi 2 améliorations sur un
 * pool sans dé `de` donnent un dé `vers`, 3 donnent un `vers` et un `de`.
 * Un nombre négatif ou nul ne fait rien. Renvoie un nouveau pool.
 */
export function ameliorer(pool: Pool, de: string, vers: string, nombre: number): Pool {
  const nombres = new Map(regrouperPool(pool).map((p) => [p.de, p.nombre]));
  for (let i = 0; i < nombre; i++) {
    const restants = nombres.get(de) ?? 0;
    if (restants > 0) {
      nombres.set(de, restants - 1);
      nombres.set(vers, (nombres.get(vers) ?? 0) + 1);
    } else {
      nombres.set(de, 1);
    }
  }
  return [...nombres].map(([d, n]) => ({ de: d, nombre: n })).filter((p) => p.nombre > 0);
}

/** Remplace jusqu'à `nombre` dés `de` par des dés `vers` (sans rien ajouter s'il n'y en a pas). */
export function retrograder(pool: Pool, de: string, vers: string, nombre: number): Pool {
  const nombres = new Map(regrouperPool(pool).map((p) => [p.de, p.nombre]));
  const n = Math.min(nombre, nombres.get(de) ?? 0);
  nombres.set(de, (nombres.get(de) ?? 0) - n);
  nombres.set(vers, (nombres.get(vers) ?? 0) + n);
  return [...nombres].map(([d, x]) => ({ de: d, nombre: x })).filter((p) => p.nombre > 0);
}

/** Retire jusqu'à `nombre` dés `de` du pool. */
export function retirer(pool: Pool, de: string, nombre: number): Pool {
  return regrouperPool(pool)
    .map((p) => (p.de === de ? { de, nombre: Math.max(0, p.nombre - nombre) } : p))
    .filter((p) => p.nombre > 0);
}

/**
 * Lance un pool de dés à symboles. Les dés sont lancés dans l'ordre des sortes
 * déclarées par le système (et non dans l'ordre du pool), pour qu'un même pool
 * consomme toujours le générateur de la même façon.
 */
export function lancerSymboles(
  systeme: SystemeCharge,
  pool: Pool,
  generateur: Generateur,
): LancerSymboles {
  const des = systeme.source.des;
  if (!des) throw new Error(`Le système ${systeme.source.id} ne déclare pas de dés à symboles`);

  const nombres = new Map<string, number>();
  let totalDes = 0;
  for (const p of regrouperPool(pool)) {
    if (!des.sortes.some((s) => s.id === p.de)) throw new Error(`Dé inconnu : ${p.de}`);
    if (!Number.isInteger(p.nombre) || p.nombre < 0)
      throw new Error(`Nombre de dés invalide pour ${p.de} : ${p.nombre}`);
    nombres.set(p.de, p.nombre);
    totalDes += p.nombre;
  }
  if (totalDes > LIMITES.desParJet)
    throw new Error(`Trop de dés : ${totalDes} (${LIMITES.desParJet} au plus)`);

  const symboles: Record<string, number> = {};
  for (const s of des.symboles) symboles[s.id] = 0;

  const lances: DeSymbole[] = [];
  for (const sorte of des.sortes) {
    for (let i = 0; i < (nombres.get(sorte.id) ?? 0); i++) {
      const face = generateur.entier(sorte.faces.length);
      const porte: Record<string, number> = {};
      for (const [sym, n] of Object.entries(sorte.faces[face - 1]!)) {
        if (n <= 0) continue;
        porte[sym] = n;
        symboles[sym] = (symboles[sym] ?? 0) + n;
      }
      lances.push({ de: sorte.id, face, symboles: porte });
    }
  }

  const erreurs: ErreurJet[] = [];
  const resultats: Record<string, number> = {};
  for (const r of des.resultats) {
    const chemin = chemins.resultat(r.cle);
    const f = systeme.formule(chemin);
    try {
      const v = evaluer(f.noeud, {
        attribut: (cle) => {
          throw new ErreurEvaluation(`Attribut illisible ici : ${cle}`, 0);
        },
        modificateur: (cle) => {
          throw new ErreurEvaluation(`Modificateur illisible ici : ${cle}`, 0);
        },
        variable: (nom): Valeur => {
          const s = symboles[nom];
          if (s === undefined) throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
          return s;
        },
      }).valeur;
      resultats[r.cle] = Number(v);
    } catch (e) {
      if (!(e instanceof ErreurEvaluation)) throw e;
      erreurs.push({ ou: chemin, message: `${e.message} (« ${f.texte} »)` });
      resultats[r.cle] = 0;
    }
  }

  return { des: lances, symboles, resultats, erreurs };
}
