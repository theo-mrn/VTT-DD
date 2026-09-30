/**
 * Dés repérés par leur phase et leur position : c'est ce qui permet un jet commun à plusieurs
 * cibles (les mêmes dés servent à toutes) et des dés physiques (les faces lues sur les dés 3D
 * sont rejouées par le serveur, docs/combat.md § 6.4).
 *
 * Un dé est repéré par `phase:sorte:k` : la phase de l'action (`jet`, `apres`, `tables`), sa
 * sorte (sorte d'un dé à symboles, sinon `d<faces>`) et son rang parmi les dés de cette sorte
 * demandés pendant la phase. Un dé propre à une cible (bonus contre les morts-vivants) prend la
 * position suivante : les dés que toutes les cibles demandent gardent la leur.
 *
 * Tout est déterministe : mêmes dés fournis, même suite de résultats.
 */
import type { ContexteDe, Generateur, PhaseDes } from '../formules/index.js';
import type { ResultatAction } from './actions.js';

/** Un dé demandé par une action et pas encore connu (dés physiques à lancer). */
export interface DeRequis {
  /** Identifiant stable dans le jet (préfixe de la cible, phase, sorte, position). */
  id: string;
  phase: PhaseDes;
  faces: number;
  /** Sorte d'un dé à symboles ; absente : dé numérique. */
  de?: string;
  /** Cible pour qui le dé est lancé ; absente : dé commun. */
  cible?: string;
}

/**
 * Levée par un générateur planifié quand une phase se termine alors que des dés manquaient :
 * aucun calcul n'est rendu avec une valeur provisoire, l'appelant lance ces dés puis rejoue.
 */
export class DesRequis extends Error {
  /**
   * Ce qui est déjà exact, posé par `executer` au changement de phase : le jet et son issue
   * quand les dés manquent après le jet (dégâts), plus les valeurs après le jet et les
   * modifications quand ils manquent aux tables. Absent : les dés du jet manquent.
   */
  partiel?: ResultatAction;

  constructor(public readonly des: DeRequis[]) {
    super(`${des.length} dé(s) à lancer`);
    this.name = 'DesRequis';
  }

  /** Phase des dés manquants (la plus tôt s'il y en a de plusieurs). */
  get phase(): PhaseDes {
    return premierePhase(this.des.map((d) => d.phase)) ?? 'jet';
  }
}

/**
 * Levée par `executer` après un jet réussi quand des paramètres `etape: apres` manquent (l'arme,
 * une fois la cible touchée) : l'appelant les demande, puis rejoue avec eux. `partiel` : le jet
 * et son issue, déjà exacts.
 */
export class ParametresRequis extends Error {
  readonly phase: PhaseDes = 'apres';

  constructor(
    public readonly parametres: string[],
    public readonly partiel: ResultatAction,
  ) {
    super(`Paramètre(s) à choisir après le jet : ${parametres.join(', ')}`);
    this.name = 'ParametresRequis';
  }
}

/** Ordre des phases d'une action. */
export const PHASES: readonly PhaseDes[] = ['jet', 'apres', 'tables', 'fin'];

/** La plus tôt de ces phases, ou undefined s'il n'y en a aucune. */
export function premierePhase(phases: readonly PhaseDes[]): PhaseDes | undefined {
  return [...phases].sort((a, b) => PHASES.indexOf(a) - PHASES.indexOf(b))[0];
}

/** Générateurs par cible d'une exécution à plusieurs cibles. */
export interface SourceDes {
  /** Générateur de la cible `id` (`index` : sa place dans la liste des cibles). */
  pour(id: string, index: number): Generateur;
}

const sorteDe = (max: number, contexte?: ContexteDe) => contexte?.de ?? `d${max}`;

/** Repère des dés d'une vue : phase courante et rang de chaque sorte dans la phase. */
function reperes() {
  let phase: PhaseDes = 'jet';
  const rangs = new Map<string, number>();
  return {
    get phase() {
      return phase;
    },
    changer(nom: PhaseDes) {
      phase = nom;
      rangs.clear();
    },
    suivant(max: number, contexte?: ContexteDe): string {
      const sorte = sorteDe(max, contexte);
      const k = rangs.get(sorte) ?? 0;
      rangs.set(sorte, k + 1);
      return `${phase}:${sorte}:${k}`;
    },
  };
}

/**
 * Jet commun : un dé à une position donnée n'est tiré qu'une fois (par `base`), puis rendu à
 * chaque cible qui le demande. Les cibles lancent dans l'ordre de la liste.
 */
export function partagerGenerateur(base: Generateur): SourceDes {
  const tires = new Map<string, number>();
  return {
    pour() {
      const r = reperes();
      return {
        entier(max, contexte) {
          const cle = `${r.suivant(max, contexte)}:${max}`;
          let v = tires.get(cle);
          if (v === undefined) {
            v = base.entier(max, contexte);
            tires.set(cle, v);
          }
          return v;
        },
        phase: (nom) => r.changer(nom),
      };
    },
  };
}

/** Un jet par cible : chaque cible tire ses propres dés, l'une après l'autre. */
export function generateurParCible(base: Generateur): SourceDes {
  return {
    pour: () => ({
      entier: (max, contexte) => base.entier(max, contexte),
      phase: (nom) => base.phase?.(nom),
    }),
  };
}

export interface OptionsPlanifie {
  /** Faces connues, par identifiant de dé (lues sur les dés 3D, ou tirées avant). */
  faces: Readonly<Record<string, number>>;
  /** `commun` : un même dé sert à toutes les cibles (identifiants sans cible). */
  commun: boolean;
  /**
   * Repli : les dés inconnus sont tirés par ce générateur au lieu d'être demandés (dés sans
   * forme 3D, délai dépassé, `serverFallback`). Ils sont notés dans `tires`.
   */
  repli?: Generateur;
}

/**
 * Générateur planifié (dés physiques, étape C de docs/combat.md) : rejoue les faces fournies ;
 * un dé inconnu vaut 1 (ni explosion ni branche coûteuse) et il est noté, puis `DesRequis` est
 * levée au changement de phase suivant. Avec `repli`, le dé inconnu est tiré aussitôt.
 */
export function aleatoirePlanifie(o: OptionsPlanifie): SourceDes & {
  /** Dés tirés par le repli, par identifiant (source « serveur »). */
  tires: Record<string, number>;
} {
  const tires: Record<string, number> = {};
  return {
    tires,
    pour(cible, index) {
      const r = reperes();
      const manquants = new Map<string, DeRequis>();
      const prefixe = o.commun ? '' : `${index}:`;
      const lever = () => {
        if (!manquants.size) return;
        const des = [...manquants.values()];
        manquants.clear();
        throw new DesRequis(des);
      };
      return {
        entier(max, contexte) {
          const id = `${prefixe}${r.suivant(max, contexte)}`;
          const connue = o.faces[id] ?? tires[id];
          if (connue !== undefined) {
            if (!Number.isInteger(connue) || connue < 1 || connue > max)
              throw new Error(`Face ${connue} hors de 1..${max} pour le dé ${id}`);
            return connue;
          }
          if (o.repli) {
            const v = o.repli.entier(max, contexte);
            tires[id] = v;
            return v;
          }
          manquants.set(id, {
            id,
            phase: r.phase,
            faces: max,
            ...(contexte?.de ? { de: contexte.de } : {}),
            ...(o.commun ? {} : { cible }),
          });
          return 1;
        },
        phase(nom) {
          lever();
          r.changer(nom);
        },
      };
    },
  };
}
