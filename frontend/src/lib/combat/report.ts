/**
 * Résultats du moteur de règles (en français) → contrat du combat (`@vtt/contracts`, en
 * anglais) : rapport complet d'une cible (MJ), vue de l'attaquant, modifications proposées.
 *
 * Même passage que character (`backend/character/src/regles/combat.ts`) : depuis la décision
 * de Théo du 2026-09-30, le navigateur de l'attaquant calcule l'attaque et envoie ce rapport
 * tout fait (docs/combat.md § 5.4). Aucune clé de jeu : attributs, entrées, tables et dés sont
 * ceux du système.
 */
import {
  durationMomentOf,
  type AttackModification,
  type AttackOutcome,
  AttackRoll,
  type AttackTableDraw,
  type AttackTargetResult,
  type AttackTargetView,
  type EffectSide,
  type RolledDiceGroup,
} from '@vtt/contracts';
import {
  vueActeur,
  type CoteJet,
  type JetDes,
  type JetNumeriqueResultat,
  type JetSymbolesResultat,
  type Modification,
  type ResultatAction,
  type SystemeCharge,
  type TirageTable,
} from '@vtt/rules';

const SIDES: Record<CoteJet, EffectSide> = { action: 'action', acteur: 'actor', cible: 'target' };
const POOL_OPERATIONS = {
  ajouter: 'add',
  ameliorer: 'upgrade',
  retrograder: 'downgrade',
  retirer: 'remove',
} as const;
const OPERATIONS: Partial<Record<string, 'add' | 'subtract'>> = {
  ajouter: 'add',
  retirer: 'subtract',
};
const RESISTANCE_OPERATIONS: Partial<Record<string, 'cancel' | 'multiply'>> = {
  annuler: 'cancel',
  multiplier: 'multiply',
};

/** Dés numériques (source `server`, comme les rapports calculés par character). */
function groups(jets: readonly JetDes[]): RolledDiceGroup[] {
  return jets.map((j) => ({
    faces: j.faces,
    values: j.des.map((d) => ({
      value: d.valeur,
      kept: d.garde,
      exploded: d.explosion,
      source: 'server' as const,
    })),
  }));
}

export function toRoll(jet: JetNumeriqueResultat | JetSymbolesResultat): AttackRoll {
  if (jet.type === 'numerique')
    return {
      kind: 'numeric',
      formula: jet.formule,
      dice: groups(jet.jets),
      value: jet.valeur,
      bonuses: jet.bonus.map((b) => ({
        source: b.source,
        name: b.nom,
        value: b.valeur,
        side: SIDES[b.cote],
      })),
      total: jet.total,
      natural: jet.naturel,
    };
  return {
    kind: 'symbols',
    pool: jet.pool.map((p) => ({ die: p.de, count: p.nombre })),
    construction: jet.construction.map((e) => ({
      source: e.source,
      name: e.nom,
      operation: POOL_OPERATIONS[e.operation],
      die: e.de,
      ...(e.vers !== undefined ? { to: e.vers } : {}),
      count: e.nombre,
      side: SIDES[e.cote],
    })),
    dice: jet.des.map((d) => ({ die: d.de, face: d.face, symbols: d.symboles, source: 'server' })),
    symbols: jet.symboles,
    results: jet.resultats,
  };
}

function outcomeOf(r: Pick<ResultatAction, 'reussi' | 'jet'>): AttackOutcome {
  return {
    success: r.reussi,
    critical: r.jet.type === 'numerique' ? r.jet.critique : false,
    fumble: r.jet.type === 'numerique' ? r.jet.fumble : false,
  };
}

const int = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));

/**
 * Décompte d'une entrée donnée → contrat : l'ancre `source` devient l'attaquant (`sourceId`) ;
 * inconnu, le porteur (docs/combat.md § 18.8).
 */
function timingOf(m: Extract<Modification, { entree: string }>, sourceId?: string) {
  if (!m.decompte || m.decompte.moment === 'fin-round') return {};
  const anchorId = m.decompte.de ?? (m.decompte.source ? sourceId : undefined);
  return {
    timing: { moment: durationMomentOf(m.decompte.moment), ...(anchorId ? { anchorId } : {}) },
  };
}

/**
 * Modification du moteur → contrat (`entity` : l'attaquant ou la cible). `sourceId` :
 * l'attaquant, ancre d'une durée qui se décompte à son tour.
 */
export function toModification(m: Modification, sourceId?: string): AttackModification {
  const entity = m.entite === 'acteur' ? ('actor' as const) : ('target' as const);
  if ('entree' in m) {
    const timed = m.duree !== undefined && m.duree >= 1;
    return {
      kind: 'entry',
      entity,
      entry: m.entree,
      operation: m.operation === 'donner' ? 'give' : 'remove',
      ranks: int(m.rangs, 0, 100),
      ...(timed ? { duration: int(m.duree!, 1, 10_000), ...timingOf(m, sourceId) } : {}),
      ...(m.exemplaire !== undefined ? { instance: m.exemplaire } : {}),
    };
  }
  return {
    kind: 'attribute',
    entity,
    attribute: m.attribut,
    operation: OPERATIONS[m.operation] ?? 'set',
    value: m.valeur,
    ...(m.type !== undefined ? { damageType: m.type } : {}),
    ...(m.brut !== undefined ? { raw: m.brut } : {}),
    ...(m.minimum !== undefined ? { minimum: m.minimum } : {}),
    ...(m.resistances?.length
      ? {
          resistances: m.resistances.map((l) => ({
            source: l.source,
            name: l.nom,
            operation: RESISTANCE_OPERATIONS[l.operation] ?? 'reduce',
            value: l.valeur,
            ignored: l.ignore === true,
          })),
        }
      : {}),
  };
}

function toTable(systeme: SystemeCharge, t: TirageTable): AttackTableDraw {
  const name = systeme.tables.get(t.table)?.nom;
  return {
    table: t.table,
    ...(name ? { name } : {}),
    modifier: t.modificateur,
    value: t.valeur,
    dice: groups(t.jets),
    line: t.ligne
      ? {
          min: t.ligne.min,
          max: t.ligne.max,
          name: t.ligne.nom,
          ...(t.ligne.description ? { description: t.ligne.description } : {}),
          ...(t.ligne.entree ? { entry: t.ligne.entree } : {}),
        }
      : null,
    outOfRange: t.horsTable,
  };
}

/** Rapport complet d'une cible, pour le MJ seul (`sourceId` : l'attaquant). */
export function targetResult(
  systeme: SystemeCharge,
  r: ResultatAction,
  sourceId?: string,
): AttackTargetResult {
  return {
    outcome: outcomeOf(r),
    roll: toRoll(r.jet),
    variables: r.variables,
    modifications: r.modifications.map((m) => toModification(m, sourceId)),
    tables: r.tables.map((t) => toTable(systeme, t)),
    explanations: r.explications,
    errors: r.erreurs.map((e) => ({ where: e.ou, message: e.message })),
  };
}

/** Ce que voit l'attaquant (vue de l'acteur du moteur) : jamais une valeur de la cible. */
export function targetView(systeme: SystemeCharge, r: ResultatAction): AttackTargetView {
  const v = vueActeur(systeme, r);
  return {
    outcome: { success: v.reussi, critical: v.critique, fumble: v.fumble },
    roll: toRoll(v.jet),
    values: v.valeurs.map((x) => ({
      key: x.cle,
      ...(x.nom ? { name: x.nom } : {}),
      value: x.valeur,
    })),
    explanations: v.explications,
  };
}
