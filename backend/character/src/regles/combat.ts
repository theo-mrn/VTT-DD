/**
 * Combat (docs/combat.md § 5 à 7) : passage des résultats du moteur de règles (en français) au
 * contrat du combat (`@vtt/contracts`, en anglais), et des décisions du MJ au moteur ; delta
 * d'une application et son annulation. Pur : aucune base, aucun réseau.
 *
 * Aucune clé de jeu : attributs, entrées, tables et dés sont ceux du système du personnage.
 */
import {
  deepEqual,
  DURATION_MOMENT_RULES,
  durationMomentOf,
  type AttackModification,
  type AttackModificationInput,
  type AttackOutcome,
  type AttackRoll,
  type AttackTableDraw,
  type AttackTargetResult,
  type AttackTargetView,
  type EffectSide,
  type RolledDiceGroup,
} from '@vtt/contracts';
import {
  ligneDeTable,
  vueActeur,
  type BonusLibre,
  type CoteJet,
  type EntiteChargee,
  type EtatEntite,
  type JetDes,
  type JetNumeriqueResultat,
  type JetSymbolesResultat,
  type Modification,
  type Possession,
  type ResultatAction,
  type SystemeCharge,
  type TirageTable,
  type Valeur,
} from '@vtt/rules';

// ─── Résultat d'une résolution → contrat ──────────────────────────────────────

const COTES: Record<CoteJet, EffectSide> = { action: 'action', acteur: 'actor', cible: 'target' };
const OPERATIONS_POOL = {
  ajouter: 'add',
  ameliorer: 'upgrade',
  retrograder: 'downgrade',
  retirer: 'remove',
} as const;

/** Dés numériques ; tous tirés par le serveur tant que les dés physiques n'existent pas (étape C). */
function groupes(jets: readonly JetDes[]): RolledDiceGroup[] {
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

export function versJet(jet: JetNumeriqueResultat | JetSymbolesResultat): AttackRoll {
  if (jet.type === 'numerique')
    return {
      kind: 'numeric',
      formula: jet.formule,
      dice: groupes(jet.jets),
      value: jet.valeur,
      bonuses: jet.bonus.map((b) => ({
        source: b.source,
        name: b.nom,
        value: b.valeur,
        side: COTES[b.cote],
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
      operation: OPERATIONS_POOL[e.operation],
      die: e.de,
      ...(e.vers !== undefined ? { to: e.vers } : {}),
      count: e.nombre,
      side: COTES[e.cote],
    })),
    dice: jet.des.map((d) => ({ die: d.de, face: d.face, symbols: d.symboles, source: 'server' })),
    symbols: jet.symboles,
    results: jet.resultats,
  };
}

function issue(r: Pick<ResultatAction, 'reussi' | 'jet'>): AttackOutcome {
  return {
    success: r.reussi,
    critical: r.jet.type === 'numerique' ? r.jet.critique : false,
    fumble: r.jet.type === 'numerique' ? r.jet.fumble : false,
  };
}

const entier = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)));

/**
 * Décompte d'une entrée donnée → contrat : l'ancre `source` devient l'acteur de l'action
 * (`sourceId`) ; inconnu, le porteur (docs/combat.md § 18.8).
 */
function versTiming(m: Extract<Modification, { entree: string }>, sourceId?: string) {
  if (!m.decompte || m.decompte.moment === 'fin-round') return {};
  const anchorId = m.decompte.de ?? (m.decompte.source ? sourceId : undefined);
  return {
    timing: { moment: durationMomentOf(m.decompte.moment), ...(anchorId ? { anchorId } : {}) },
  };
}

/**
 * Modification du moteur → contrat (`entity` : l'attaquant ou la cible). `sourceId` : l'acteur
 * de l'action, ancre d'une durée qui se décompte à son tour.
 */
export function versModification(m: Modification, sourceId?: string): AttackModification {
  const entity = m.entite === 'acteur' ? ('actor' as const) : ('target' as const);
  if ('entree' in m) {
    const duree = m.duree !== undefined && m.duree >= 1;
    return {
      kind: 'entry',
      entity,
      entry: m.entree,
      operation: m.operation === 'donner' ? 'give' : 'remove',
      ranks: entier(m.rangs, 0, 100),
      ...(duree ? { duration: entier(m.duree!, 1, 10_000), ...versTiming(m, sourceId) } : {}),
      ...(m.exemplaire !== undefined ? { instance: m.exemplaire } : {}),
    };
  }
  return {
    kind: 'attribute',
    entity,
    attribute: m.attribut,
    operation: OPERATION_ANGLAISE[m.operation] ?? 'set',
    value: m.valeur,
    ...(m.type !== undefined ? { damageType: m.type } : {}),
    ...(m.brut !== undefined ? { raw: m.brut } : {}),
    ...(m.minimum !== undefined ? { minimum: m.minimum } : {}),
    ...(m.resistances?.length
      ? {
          resistances: m.resistances.map((l) => ({
            source: l.source,
            name: l.nom,
            operation: OPERATION_LIMITE[l.operation] ?? ('reduce' as const),
            value: l.valeur,
            ignored: l.ignore === true,
          })),
        }
      : {}),
  };
}

function versTable(systeme: SystemeCharge, t: TirageTable): AttackTableDraw {
  const nom = systeme.tables.get(t.table)?.nom;
  return {
    table: t.table,
    ...(nom ? { name: nom } : {}),
    modifier: t.modificateur,
    value: t.valeur,
    dice: groupes(t.jets),
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

/** Résultat complet d'une cible, pour le MJ seul (`sourceId` : l'attaquant). */
export function resultatCible(
  systeme: SystemeCharge,
  r: ResultatAction,
  sourceId?: string,
): AttackTargetResult {
  return {
    outcome: issue(r),
    roll: versJet(r.jet),
    variables: r.variables,
    modifications: r.modifications.map((m) => versModification(m, sourceId)),
    tables: r.tables.map((t) => versTable(systeme, t)),
    explanations: r.explications,
    errors: r.erreurs.map((e) => ({ where: e.ou, message: e.message })),
  };
}

/** Ce que voit l'attaquant (vue de l'acteur du moteur). */
export function vueCible(systeme: SystemeCharge, r: ResultatAction): AttackTargetView {
  const v = vueActeur(systeme, r);
  return {
    outcome: { success: v.reussi, critical: v.critique, fumble: v.fumble },
    roll: versJet(v.jet),
    values: v.valeurs.map((x) => ({
      key: x.cle,
      ...(x.nom ? { name: x.nom } : {}),
      value: x.valeur,
    })),
    explanations: v.explications,
  };
}

// ─── Décisions du MJ → moteur ─────────────────────────────────────────────────

/** Vérification en cours des modifications décidées pour un type d'entité. */
interface Verification {
  systeme: SystemeCharge;
  type: string;
  entite: EntiteChargee;
  erreurs: string[];
  sortie: Modification[];
}

/** Refus d'une entrée que le personnage touché ne peut pas posséder ; null si elle l'est. */
function refusPossession(v: Verification, id: string): string | null {
  const e = v.systeme.entrees.get(id);
  if (!e) return `Entrée inconnue du système : ${id}`;
  if (!v.systeme.sortes.get(e.sorte)?.pour.includes(v.type))
    return `${e.nom} n’est pas possédable par ${v.entite.type.nom}`;
  return null;
}

/** Modification d'un attribut de base ou d'une ressource. */
function modificationAttribut(
  v: Verification,
  m: Extract<AttackModificationInput, { kind: 'attribute' }>,
): void {
  const a = v.entite.attributs.get(m.attribute);
  if (!a || (a.nature !== 'base' && a.nature !== 'ressource')) {
    v.erreurs.push(`Attribut de base ou ressource attendu : ${m.attribute}`);
    return;
  }
  if (
    m.damageType !== undefined &&
    !v.systeme.source.typesDegats.some((t) => t.id === m.damageType)
  )
    v.erreurs.push(`Type de dégâts inconnu : ${m.damageType}`);
  v.sortie.push({
    entite: 'cible',
    attribut: m.attribute,
    operation: OPERATION_FRANCAISE[m.operation] ?? 'fixer',
    valeur: m.value,
    ...(m.damageType !== undefined ? { type: m.damageType } : {}),
  });
}

/** Entrée donnée ou retirée. */
function modificationEntree(
  v: Verification,
  m: Exclude<AttackModificationInput, { kind: 'attribute' }>,
): void {
  const refus = refusPossession(v, m.entry);
  if (refus) {
    v.erreurs.push(refus);
    return;
  }
  v.sortie.push({
    entite: 'cible',
    entree: m.entry,
    operation: m.operation === 'give' ? 'donner' : 'retirer',
    rangs: m.ranks,
    ...(m.duration !== undefined ? { duree: m.duration } : {}),
    ...(m.duration !== undefined && m.timing && m.timing.moment !== 'round_end'
      ? {
          decompte: {
            moment: DURATION_MOMENT_RULES[m.timing.moment],
            ...(m.timing.anchorId ? { de: m.timing.anchorId } : {}),
          },
        }
      : {}),
    ...(m.instance !== undefined ? { exemplaire: m.instance } : {}),
  });
}

/** Table tirée : son entrée, si elle est celle d'une de ses lignes, est donnée. */
function modificationTable(v: Verification, t: { table: string; entry: string | null }): void {
  if (!v.systeme.tables.has(t.table)) {
    v.erreurs.push(`Table inconnue : ${t.table}`);
    return;
  }
  if (t.entry === null) return;
  if (!ligneDeTable(v.systeme, t.table, t.entry)) {
    v.erreurs.push(`${t.entry} n’est l’entrée d’aucune ligne de la table ${t.table}`);
    return;
  }
  const refus = refusPossession(v, t.entry);
  if (refus) v.erreurs.push(refus);
  else v.sortie.push({ entite: 'cible', entree: t.entry, operation: 'donner', rangs: 1 });
}

/**
 * Modifications décidées (contrat) → moteur, vérifiées contre le type d'entité du personnage
 * touché : attribut de base ou ressource, entrée connue et possédable ; tables : l'entrée d'une
 * de leurs lignes (donnée comme par `appliquerTirage`). Renvoie les erreurs lisibles.
 */
export function modificationsDecidees(
  systeme: SystemeCharge,
  type: string,
  modifications: readonly AttackModificationInput[],
  tables: readonly { table: string; entry: string | null }[],
): { modifications: Modification[]; erreurs: string[] } {
  const entite = systeme.entites.get(type);
  const erreurs: string[] = [];
  const sortie: Modification[] = [];
  if (!entite) return { modifications: [], erreurs: [`Type d’entité inconnu : ${type}`] };
  const v: Verification = { systeme, type, entite, erreurs, sortie };
  for (const m of modifications) {
    if (m.kind === 'attribute') modificationAttribut(v, m);
    else modificationEntree(v, m);
  }
  for (const t of tables) modificationTable(v, t);
  return { modifications: sortie, erreurs };
}

// ─── Delta d'une écriture et annulation ───────────────────────────────────────

/** Avant et après d'un élément de l'état (valeur, possession, bonus) ; `null` : absent. */
interface Ecart<T> {
  cle: string;
  /** Position avant l'écriture, pour remettre l'élément à sa place. */
  index: number;
  avant: T | null;
  apres: T | null;
}

/**
 * Ce qu'une écriture a changé dans l'état, élément par élément : de quoi la rendre sans
 * écraser ce qui a changé depuis ailleurs. Les possessions sont repérées par
 * `entree#exemplaire` (comme le diff de `character.updated`), les bonus par leur identifiant.
 */
export interface DeltaEtat {
  valeurs: Ecart<Valeur>[];
  possessions: Ecart<Possession>[];
  bonus: Ecart<BonusLibre>[];
}

export const DELTA_VIDE: DeltaEtat = { valeurs: [], possessions: [], bonus: [] };

const clePossession = (p: Pick<Possession, 'entree' | 'exemplaire'>) =>
  p.exemplaire === undefined ? p.entree : `${p.entree}#${p.exemplaire}`;

function ecarts<T>(avant: readonly T[], apres: readonly T[], cle: (x: T) => string): Ecart<T>[] {
  const index = new Map(avant.map((x, i) => [cle(x), i] as const));
  const a = new Map(avant.map((x) => [cle(x), x] as const));
  const b = new Map(apres.map((x) => [cle(x), x] as const));
  const sortie: Ecart<T>[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k) ?? null;
    const y = b.get(k) ?? null;
    if (!deepEqual(x, y)) sortie.push({ cle: k, index: index.get(k) ?? -1, avant: x, apres: y });
  }
  return sortie;
}

export function deltaEtat(avant: EtatEntite, apres: EtatEntite): DeltaEtat {
  const valeurs: Ecart<Valeur>[] = [];
  for (const k of new Set([...Object.keys(avant.valeurs), ...Object.keys(apres.valeurs)])) {
    const x = avant.valeurs[k] ?? null;
    const y = apres.valeurs[k] ?? null;
    if (!deepEqual(x, y)) valeurs.push({ cle: k, index: -1, avant: x, apres: y });
  }
  return {
    valeurs,
    possessions: ecarts(avant.possessions, apres.possessions, clePossession),
    bonus: ecarts(avant.bonus, apres.bonus, (b) => b.id),
  };
}

export const deltaVide = (d: DeltaEtat) =>
  !d.valeurs.length && !d.possessions.length && !d.bonus.length;

/**
 * Annulation d'une écriture sur l'état actuel : chaque élément qu'elle a changé revient à sa
 * valeur d'avant, s'il vaut toujours celle d'après. Sinon il est en conflit (chemin au format
 * du diff) ; `forcer` le rend quand même.
 */
export function annuler(
  actuel: EtatEntite,
  delta: DeltaEtat,
  forcer = false,
): { etat: EtatEntite; conflits: string[] } {
  const conflits: string[] = [];
  const valeurs = { ...actuel.valeurs };
  for (const e of delta.valeurs) {
    if (!deepEqual(valeurs[e.cle] ?? null, e.apres)) conflits.push(`etat.valeurs.${e.cle}`);
  }
  const rendre = <T>(
    liste: readonly T[],
    ecarts: Ecart<T>[],
    cle: (x: T) => string,
    nom: string,
  ) => {
    const courante = [...liste];
    for (const e of ecarts) {
      const x = courante.find((y) => cle(y) === e.cle) ?? null;
      if (!deepEqual(x, e.apres)) conflits.push(`etat.${nom}[${e.cle}]`);
    }
    // Retirer d'abord ce que l'écriture a posé, puis remettre chaque élément à sa place
    let sortie = courante.filter((y) => !ecarts.some((e) => e.cle === cle(y)));
    for (const e of [...ecarts].sort((a, b) => a.index - b.index)) {
      if (e.avant === null) continue;
      const i = e.index < 0 ? sortie.length : Math.min(e.index, sortie.length);
      sortie = [...sortie.slice(0, i), e.avant, ...sortie.slice(i)];
    }
    return sortie;
  };
  const possessions = rendre(actuel.possessions, delta.possessions, clePossession, 'possessions');
  const bonus = rendre(actuel.bonus, delta.bonus, (b) => b.id, 'bonus');
  if (conflits.length && !forcer) return { etat: actuel, conflits };
  for (const e of delta.valeurs) {
    if (e.avant === null) delete valeurs[e.cle];
    else valeurs[e.cle] = e.avant;
  }
  return { etat: { ...actuel, valeurs, possessions, bonus }, conflits };
}

/** Opérations du moteur (français) ↔ du contrat de combat (anglais). */
const OPERATION_ANGLAISE: Partial<Record<string, 'add' | 'subtract' | 'set'>> = {
  ajouter: 'add',
  retirer: 'subtract',
};
const OPERATION_FRANCAISE: Partial<Record<string, 'ajouter' | 'retirer' | 'fixer'>> = {
  add: 'ajouter',
  subtract: 'retirer',
};
const OPERATION_LIMITE: Partial<Record<string, 'cancel' | 'multiply' | 'reduce'>> = {
  annuler: 'cancel',
  multiplier: 'multiply',
};
