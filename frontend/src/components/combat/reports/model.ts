/**
 * Rapports d'attaque côté MJ (docs/combat.md § 7, § 12.4) : filtres, brouillons de décision
 * (appliquer, ne pas appliquer, modifier les valeurs avant d'appliquer), raccourcis (moitié,
 * double, résistance, aucun dégât, ±1), revue groupée (« Tout appliquer ») et corps des routes
 * `…/apply`, `…/attacks/apply`. Calculs purs, sans React ni réseau.
 *
 * Rien n'est recalculé ici : les valeurs proposées viennent du rapport (règles, résistances
 * déjà comptées par le serveur) ; le MJ ne fait que les corriger. Une cible laissée telle
 * quelle part sans `modifications` : le serveur applique celles de son rapport.
 */
import { translate } from '@/i18n/runtime';
import {
  ATTACK_APPLY_BATCH_MAX,
  type ApplyAttack,
  type ApplyAttacks,
  type Attack,
  type AttackModification,
  type AttackModificationInput,
  type AttackTableChoice,
  type AttackTarget,
  type DieSource,
} from '@vtt/contracts';

// ─── Statuts et filtres ──────────────────────────────────────────────────────

/** En cours : réactions ou dés attendus. */
export const isOpen = (a: Pick<Attack, 'status'>) =>
  a.status === 'awaiting_reactions' || a.status === 'awaiting_dice';

/** Résolue, en attente du MJ. */
export const isPending = (a: Pick<Attack, 'status'>) => a.status === 'pending';

/** Décidée : appliquée ou écartée. */
export const isDecided = (a: Pick<Attack, 'status'>) =>
  a.status === 'applied' || a.status === 'dismissed';

export type ReportFilter = 'pending' | 'decided' | 'all';
export type ReportScope = 'combat' | 'outside' | 'all';

/** Rapports montrés par la liste, les plus récents d'abord (ordre du serveur gardé). */
export function filterReports(
  attacks: readonly Attack[],
  filter: ReportFilter,
  scope: ReportScope,
  combatId: string | null,
): Attack[] {
  return attacks.filter((a) => {
    if (filter === 'pending' && !(isPending(a) || isOpen(a))) return false;
    if (filter === 'decided' && !isDecided(a)) return false;
    if (scope === 'combat' && (combatId === null || a.combatId !== combatId)) return false;
    if (scope === 'outside' && a.combatId !== null) return false;
    return true;
  });
}

/** Nombre de rapports qui attendent une décision (pastille de l'onglet). */
export function pendingCount(attacks: readonly Attack[]): number {
  return attacks.filter(isPending).length;
}

/** Une cible résolue et pas encore décidée (ou dont l'application a été annulée). */
export const isDecidable = (t: Pick<AttackTarget, 'status' | 'decision'>) =>
  t.status === 'resolved' && (t.decision === 'pending' || t.decision === 'reverted');

/** Cibles décidables d'un rapport. */
export function decidableTargets(a: Attack): AttackTarget[] {
  return isPending(a) ? a.targets.filter(isDecidable) : [];
}

/** Coûts de l'attaquant à décider (stress, munitions…). */
export function actorDecidable(a: Attack): boolean {
  const actor = a.actor;
  return (
    !!actor &&
    actor.modifications.length > 0 &&
    (actor.decision === 'pending' || actor.decision === 'reverted')
  );
}

/** Quelque chose a été appliqué et peut être annulé. */
export function canRevert(a: Attack): boolean {
  return a.targets.some((t) => t.decision === 'applied') || a.actor?.decision === 'applied';
}

// ─── Lecture d'un rapport ────────────────────────────────────────────────────

export type DiceOrigin = 'physical' | 'server' | 'mixed';

/** Sources des dés d'une cible : ceux de son jet, puis ceux des tables tirées. */
function addDiceSources(t: AttackTarget, sources: Set<DieSource>) {
  const roll = t.result?.roll ?? t.view?.roll;
  if (!roll) return;
  const dice = roll.kind === 'numeric' ? roll.dice.flatMap((g) => g.values) : roll.dice;
  for (const d of dice) sources.add(d.source);
  for (const draw of t.result?.tables ?? [])
    for (const d of draw.dice.flatMap((g) => g.values)) sources.add(d.source);
}

/** Source des dés d'un rapport : tous en 3D, tous tirés par le serveur, ou un mélange. */
export function diceOrigin(a: Attack): DiceOrigin {
  const sources = new Set<DieSource>();
  for (const t of a.targets) addDiceSources(t, sources);
  if (sources.size === 0) return a.dice;
  if (sources.size > 1) return 'mixed';
  return sources.has('physical') ? 'physical' : 'server';
}

/** Origine des dés d'un rapport (`combat.diceOrigin.<origine>`). */
export const diceOriginLabel = (origin: DiceOrigin) => translate(`combat.diceOrigin.${origin}`);

/** Personnages hors de combat après une application de ce rapport. */
export function defeatedBy(a: Attack): string[] {
  return a.targets.flatMap((t) =>
    t.applied?.defeated ? [t.applied.redirectedTo ?? t.characterId] : [],
  );
}

// ─── Brouillon de décision ───────────────────────────────────────────────────

export type AttributeInput = Extract<AttackModificationInput, { kind: 'attribute' }>;
export type EntryInput = Extract<AttackModificationInput, { kind: 'entry' }>;

/** Modification du rapport réduite à ce que la décision renvoie (sans `entity`, `raw`…). */
export function toInput(m: AttackModification): AttackModificationInput {
  if (m.kind === 'attribute') {
    const out: AttributeInput = {
      kind: 'attribute',
      attribute: m.attribute,
      operation: m.operation,
      value: m.value,
    };
    if (m.damageType !== undefined) out.damageType = m.damageType;
    return out;
  }
  const out: EntryInput = {
    kind: 'entry',
    entry: m.entry,
    operation: m.operation,
    ranks: m.ranks,
  };
  if (m.duration !== undefined) out.duration = m.duration;
  if (m.instance !== undefined) out.instance = m.instance;
  return out;
}

/** Ce que le MJ s'apprête à décider pour une cible. */
export interface TargetDraft {
  characterId: string;
  apply: boolean;
  modifications: AttackModificationInput[];
  tables: AttackTableChoice[];
  /** Appliquer à un autre personnage engagé, valeurs inchangées. */
  redirectTo: string | null;
}

/** Modifications proposées pour la cible elle-même (les coûts de l'attaquant sont à part). */
export function proposedFor(t: AttackTarget): AttackModificationInput[] {
  return (t.result?.modifications ?? []).filter((m) => m.entity === 'target').map(toInput);
}

/** Tables proposées, appliquées telles quelles. */
function proposedTables(t: AttackTarget): AttackTableChoice[] {
  return (t.result?.tables ?? []).map((d) => ({ table: d.table, apply: true }));
}

/** Brouillon de départ : appliquer tel quel. */
export function draftOf(t: AttackTarget): TargetDraft {
  return {
    characterId: t.characterId,
    apply: true,
    modifications: proposedFor(t),
    tables: proposedTables(t),
    redirectTo: null,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Le MJ a changé les valeurs ou les états proposés. */
export function modificationsChanged(draft: TargetDraft, t: AttackTarget): boolean {
  return !same(draft.modifications, proposedFor(t));
}

/** Le MJ a écarté une table ou choisi une autre entrée. */
export function tablesChanged(draft: TargetDraft, t: AttackTarget): boolean {
  return !same(draft.tables, proposedTables(t));
}

/** Rien de changé : la décision est « appliquer tel quel ». */
export function isAsProposed(draft: TargetDraft, t: AttackTarget): boolean {
  return (
    draft.apply &&
    draft.redirectTo === null &&
    !modificationsChanged(draft, t) &&
    !tablesChanged(draft, t)
  );
}

type TargetDecision = ApplyAttack['targets'][number];

/**
 * Décision d'une cible pour `…/apply` : seules les parties changées partent (le serveur applique
 * celles de son rapport pour le reste).
 */
export function targetDecision(draft: TargetDraft, t: AttackTarget): TargetDecision {
  if (!draft.apply) return { characterId: draft.characterId, apply: false };
  const out: TargetDecision = { characterId: draft.characterId, apply: true };
  if (modificationsChanged(draft, t)) out.modifications = draft.modifications;
  if (tablesChanged(draft, t)) out.tables = draft.tables;
  if (draft.redirectTo) out.redirectTo = draft.redirectTo;
  return out;
}

export interface ActorDraft {
  apply: boolean;
  modifications: AttackModificationInput[];
}

export function actorDraftOf(a: Attack): ActorDraft | null {
  if (!actorDecidable(a)) return null;
  return { apply: true, modifications: a.actor!.modifications.map(toInput) };
}

/** Corps de `…/attacks/:attackId/apply`. */
export function buildApply(
  a: Attack,
  drafts: readonly TargetDraft[],
  actor: ActorDraft | null,
  note?: string,
): ApplyAttack {
  const byId = new Map(a.targets.map((t) => [t.characterId, t]));
  const targets = drafts.flatMap((d) => {
    const t = byId.get(d.characterId);
    return t && isDecidable(t) ? [targetDecision(d, t)] : [];
  });
  const body: ApplyAttack = { version: a.version, targets };
  if (actor && actorDecidable(a)) {
    const proposed = a.actor!.modifications.map(toInput);
    if (!actor.apply) body.actor = { apply: false };
    else if (same(actor.modifications, proposed)) body.actor = { apply: true };
    else body.actor = { apply: true, modifications: actor.modifications };
  }
  const trimmed = note?.trim();
  if (trimmed) body.note = trimmed;
  return body;
}

// ─── Raccourcis sur les valeurs ──────────────────────────────────────────────

/** Valeur à corriger : un attribut ajouté ou retiré (dégâts, soins, stress…). */
export const isAmount = (m: AttackModificationInput): m is AttributeInput =>
  m.kind === 'attribute' && m.operation !== 'set';

const clamp0 = (n: number) => Math.max(0, Math.round(n));

/** Applique `f` aux valeurs (toutes, ou celle d'index `only`). */
export function mapAmounts(
  mods: readonly AttackModificationInput[],
  f: (value: number) => number,
  only?: number,
): AttackModificationInput[] {
  return mods.map((m, i) =>
    isAmount(m) && (only === undefined || only === i) ? { ...m, value: clamp0(f(m.value)) } : m,
  );
}

/** « Moitié » (arrondi inférieur). */
export const halve = (mods: readonly AttackModificationInput[], only?: number) =>
  mapAmounts(mods, (v) => Math.floor(v / 2), only);

/** « Double ». */
export const double = (mods: readonly AttackModificationInput[], only?: number) =>
  mapAmounts(mods, (v) => v * 2, only);

/** « Résistance − n ». */
export const reduceBy = (mods: readonly AttackModificationInput[], n: number, only?: number) =>
  mapAmounts(mods, (v) => v - n, only);

/** « Aucun dégât ». */
export const zero = (mods: readonly AttackModificationInput[], only?: number) =>
  mapAmounts(mods, () => 0, only);

/** ±1 (ou ±n). */
export const adjust = (mods: readonly AttackModificationInput[], delta: number, only?: number) =>
  mapAmounts(mods, (v) => v + delta, only);

/** Valeur saisie. */
export const setAmount = (mods: readonly AttackModificationInput[], index: number, value: number) =>
  mapAmounts(mods, () => (Number.isFinite(value) ? value : 0), index);

/** Type de dégâts changé (ou retiré : dégâts non typés). */
export function setDamageType(
  mods: readonly AttackModificationInput[],
  index: number,
  damageType: string | null,
): AttackModificationInput[] {
  return mods.map((m, i) => {
    if (i !== index || m.kind !== 'attribute') return m;
    const { damageType: _old, ...rest } = m;
    return damageType ? { ...rest, damageType } : rest;
  });
}

/** Durée d'un état donné (null : jusqu'au retrait). */
export function setDuration(
  mods: readonly AttackModificationInput[],
  index: number,
  duration: number | null,
): AttackModificationInput[] {
  return mods.map((m, i) => {
    if (i !== index || m.kind !== 'entry') return m;
    const { duration: _old, ...rest } = m;
    return duration && duration > 0 ? { ...rest, duration: Math.round(duration) } : rest;
  });
}

/** État ajouté par le MJ (donné, un rang, durée facultative). */
export function addEntry(
  mods: readonly AttackModificationInput[],
  entry: string,
  duration: number | null,
): AttackModificationInput[] {
  const m: EntryInput = { kind: 'entry', entry, operation: 'give', ranks: 1 };
  if (duration && duration > 0) m.duration = Math.round(duration);
  return [...mods, m];
}

export function removeAt(
  mods: readonly AttackModificationInput[],
  index: number,
): AttackModificationInput[] {
  return mods.filter((_, i) => i !== index);
}

/** Valeur d'une ressource après la modification (aperçu avant/après). */
export function applyToValue(current: number, m: AttributeInput): number {
  if (m.operation === 'set') return m.value;
  return m.operation === 'add' ? current + m.value : current - m.value;
}

// ─── Revue groupée (« Tout appliquer ») ──────────────────────────────────────

export interface BulkRow {
  /** Clé stable de la ligne : `attaque:cible`. */
  key: string;
  attackId: string;
  attackerId: string;
  characterId: string;
  actionName: string;
  modifications: AttackModificationInput[];
  selected: boolean;
}

export const bulkKey = (attackId: string, characterId: string) => `${attackId}:${characterId}`;

/** Une ligne par cible à décider de chaque rapport en attente, cochée, valeurs du rapport. */
export function bulkRows(attacks: readonly Attack[]): BulkRow[] {
  return attacks.flatMap((a) =>
    decidableTargets(a).map((t) => ({
      key: bulkKey(a.id, t.characterId),
      attackId: a.id,
      attackerId: a.attackerId,
      characterId: t.characterId,
      actionName: a.action.name,
      modifications: proposedFor(t),
      selected: true,
    })),
  );
}

/** Ajustement global ±n des lignes cochées (comme l'ancienne revue). */
export function adjustSelected(rows: readonly BulkRow[], delta: number): BulkRow[] {
  return rows.map((r) =>
    r.selected ? { ...r, modifications: adjust(r.modifications, delta) } : r,
  );
}

/**
 * Corps de `…/attacks/apply`, découpés par lots (au plus `ATTACK_APPLY_BATCH_MAX` rapports par
 * appel). Une ligne décochée reste en attente ; un rapport sans ligne cochée n'est pas envoyé.
 * Les coûts de l'attaquant d'un rapport envoyé sont appliqués tels quels.
 */
export function buildApplyAll(
  attacks: readonly Attack[],
  rows: readonly BulkRow[],
): ApplyAttacks[] {
  const byAttack = new Map<string, BulkRow[]>();
  for (const r of rows) {
    if (!r.selected) continue;
    const list = byAttack.get(r.attackId) ?? [];
    list.push(r);
    byAttack.set(r.attackId, list);
  }
  const items: ApplyAttacks['items'] = [];
  for (const a of attacks) {
    const chosen = byAttack.get(a.id);
    if (!chosen?.length || !isPending(a)) continue;
    const targets = new Map(a.targets.map((t) => [t.characterId, t]));
    const decisions = chosen.flatMap((r) => {
      const t = targets.get(r.characterId);
      if (!t || !isDecidable(t)) return [];
      const draft: TargetDraft = { ...draftOf(t), modifications: r.modifications };
      return [targetDecision(draft, t)];
    });
    if (!decisions.length) continue;
    items.push({
      attackId: a.id,
      version: a.version,
      targets: decisions,
      ...(actorDecidable(a) ? { actor: { apply: true } } : {}),
    });
  }
  const batches: ApplyAttacks[] = [];
  for (let i = 0; i < items.length; i += ATTACK_APPLY_BATCH_MAX)
    batches.push({ items: items.slice(i, i + ATTACK_APPLY_BATCH_MAX) });
  return batches;
}

// ─── Annulation ──────────────────────────────────────────────────────────────

export interface RevertConflict {
  /** Personnage dont la fiche a changé ; null si le serveur ne le dit pas. */
  characterId: string | null;
  /** Chemins de la fiche en cause (`etat.valeurs.PV`…). */
  paths: string[];
}

function pathOf(p: unknown): string[] {
  if (typeof p === 'string') return [p];
  const path = p && typeof p === 'object' ? (p as { path?: unknown }).path : undefined;
  return typeof path === 'string' ? [path] : [];
}

/** Conflit d'un personnage (`{ characterId, paths }`) ; sinon null (chemin isolé). */
function characterConflict(c: unknown): RevertConflict | null {
  const o = c && typeof c === 'object' ? (c as { characterId?: unknown; paths?: unknown }) : null;
  if (!o || !Array.isArray(o.paths)) return null;
  return {
    characterId: typeof o.characterId === 'string' ? o.characterId : null,
    paths: o.paths.flatMap(pathOf),
  };
}

/**
 * Conflit d'une annulation (409 `revert_conflict`) : la fiche a changé depuis, par personnage
 * (`conflicts: [{ characterId, paths }]`, ou une liste de chemins). Null pour toute autre
 * erreur.
 */
export function revertConflictOf(err: unknown): RevertConflict[] | null {
  if (!err || typeof err !== 'object' || !('problem' in err)) return null;
  const problem = (err as { problem: Record<string, unknown> }).problem;
  if (problem.status !== 409 || problem.code !== 'revert_conflict') return null;
  const raw = problem.conflicts ?? problem.paths;
  if (!Array.isArray(raw)) return [];
  const loose: string[] = [];
  const out: RevertConflict[] = [];
  for (const c of raw) {
    const conflict = characterConflict(c);
    if (conflict) out.push(conflict);
    else loose.push(...pathOf(c));
  }
  if (loose.length) out.push({ characterId: null, paths: loose });
  return out;
}

// ─── Cartes des rapports (une par cible) ─────────────────────────────────────

/**
 * Élément de la grille des rapports (§ 12.4) : une carte par cible, comme l'ancienne app, puis
 * les coûts de l'attaquant de l'attaque sur une ligne à part.
 */
export type ReportItem =
  | {
      kind: 'target';
      key: string;
      attack: Attack;
      target: AttackTarget;
      /** Rang de la cible dans l'attaque (0…), et nombre de cibles. */
      index: number;
      count: number;
    }
  | { kind: 'actor'; key: string; attack: Attack };

/** Cartes de ces attaques, dans leur ordre (les plus récentes d'abord). */
export function reportItems(attacks: readonly Attack[]): ReportItem[] {
  return attacks.flatMap((a): ReportItem[] => {
    const targets = a.targets.map((t, index): ReportItem => ({
      kind: 'target',
      key: `${a.id}:${t.characterId}`,
      attack: a,
      target: t,
      index,
      count: a.targets.length,
    }));
    const actor =
      a.actor && a.actor.modifications.length > 0
        ? [{ kind: 'actor' as const, key: `${a.id}:actor`, attack: a }]
        : [];
    return [...targets, ...actor];
  });
}

/** Le personnage figure dans ce rapport : attaquant, cible, ou personnage réattribué. */
export function involves(a: Attack, characterId: string): boolean {
  return (
    a.attackerId === characterId ||
    a.targets.some((t) => t.characterId === characterId || t.applied?.redirectedTo === characterId)
  );
}

/** Attaques où figure ce personnage (null : toutes). */
export function filterByCharacter(
  attacks: readonly Attack[],
  characterId: string | null,
): Attack[] {
  return characterId ? attacks.filter((a) => involves(a, characterId)) : [...attacks];
}

/** Personnages des rapports (attaquants et cibles), pour le filtre, par ordre d'apparition. */
export function reportCharacters(attacks: readonly Attack[]): string[] {
  const seen = new Set<string>();
  for (const a of attacks) {
    seen.add(a.attackerId);
    for (const t of a.targets) seen.add(t.characterId);
  }
  return [...seen];
}

export interface ReportProgress {
  applied: number;
  skipped: number;
  /** Cibles qui attendent encore (décision, défense ou dés). */
  pending: number;
  total: number;
}

/**
 * « x/y appliqués » : cibles des rapports montrés, hors attaques abandonnées ou refusées et
 * cibles refusées par les règles.
 */
export function reportProgress(attacks: readonly Attack[]): ReportProgress {
  let applied = 0;
  let skipped = 0;
  let total = 0;
  for (const a of attacks) {
    if (a.status === 'cancelled' || a.status === 'failed') continue;
    for (const t of a.targets) {
      if (t.status === 'failed') continue;
      total += 1;
      if (t.decision === 'applied') applied += 1;
      else if (t.decision === 'skipped') skipped += 1;
    }
  }
  return { applied, skipped, pending: total - applied - skipped, total };
}

/** Cibles qui attendent la décision du MJ (carte « Cibles (n) »), par ordre d'apparition. */
export function pendingTargetIds(attacks: readonly Attack[]): string[] {
  const seen = new Set<string>();
  for (const a of attacks) for (const t of decidableTargets(a)) seen.add(t.characterId);
  return [...seen];
}

// ─── Valeurs et réductions d'une cible ───────────────────────────────────────

export type AttributeModification = Extract<AttackModification, { kind: 'attribute' }>;

/** Valeurs proposées pour la cible (dégâts, soins, stress…) : les cases en gros chiffres. */
export function targetAmounts(t: AttackTarget): AttributeModification[] {
  return (t.result?.modifications ?? []).filter(
    (m): m is AttributeModification =>
      m.entity === 'target' && m.kind === 'attribute' && m.operation !== 'set',
  );
}

/** Autres conséquences pour la cible (valeur fixée, état donné ou retiré). */
export function targetOthers(t: AttackTarget): AttackModification[] {
  return (t.result?.modifications ?? []).filter(
    (m) => m.entity === 'target' && !(m.kind === 'attribute' && m.operation !== 'set'),
  );
}

export interface ReductionLine {
  name: string;
  /** « −2 », « ×0,5 », « immunité ». */
  effect: string;
  /** Écartée : une réduction plus forte de la même famille s'applique. */
  ignored: boolean;
}

export interface ReductionDetail {
  /** Dégâts bruts, avant les réductions de la cible. */
  raw: number;
  damageType: string | null;
  lines: ReductionLine[];
  /** Valeur proposée, après les réductions. */
  result: number;
}

const NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/**
 * Détail des réductions de la cible sur une valeur (§ 5.7) : dégâts bruts, type, chaque
 * réduction nommée, résultat. Null s'il n'y a rien à détailler (aucune réduction, brut égal).
 */
export function reductionDetail(m: AttributeModification): ReductionDetail | null {
  const resistances = m.resistances ?? [];
  const raw = m.raw ?? m.value;
  if (!resistances.length && raw === m.value) return null;
  return {
    raw,
    damageType: m.damageType ?? null,
    lines: resistances.map((r) => ({
      name: r.name,
      effect: resistanceEffect(r.operation, r.value),
      ignored: r.ignored,
    })),
    result: m.value,
  };
}

// ─── Rapports récemment décidés ──────────────────────────────────────────────

/**
 * Rapports décidés sous les yeux du MJ (vus en attente dans cette session, décidés depuis) et
 * pas encore rangés : ils restent grisés dans la liste « En attente », avec « Annuler
 * l'application », jusqu'au passage de tour (comme l'ancienne app, qui les gardait jusqu'à
 * « Suivant »).
 */
export function recentlyDecided(
  decided: readonly Attack[],
  seenPending: ReadonlySet<string>,
  cleared: ReadonlySet<string>,
): Attack[] {
  return decided.filter((a) => isDecided(a) && seenPending.has(a.id) && !cleared.has(a.id));
}

/** Effet d'une résistance, lisible : immunité, ×2, −3. */
function resistanceEffect(operation: string, value: number): string {
  if (operation === 'cancel') return translate('combat.reports.immunity');
  if (operation === 'multiply') return `×${NUMBER.format(value)}`;
  return `−${NUMBER.format(value)}`;
}
