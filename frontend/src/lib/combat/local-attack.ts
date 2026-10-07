/**
 * Attaque calculée dans le navigateur de l'attaquant (décision de Théo, 2026-09-30 : « plus on
 * allège le serveur, mieux c'est ») : le moteur `@vtt/rules` tourne ici, sur les fiches de
 * l'attaquant et de ses cibles, avec des faces tirées dans le navigateur. Le serveur ne fait
 * qu'enregistrer le rapport (`DeclareAttack.resolved`) et appliquer ce que décide le MJ.
 *
 * Même découpage que la résolution de character (`backend/character/src/modules/interne/
 * actions.ts`) : le jet (TOUCHÉ ou RATÉ par cible), puis les paramètres choisis après le jet
 * (l'arme), puis les dégâts des seules cibles touchées, puis les tables. Chaque étape est une
 * exécution complète du moteur (déterministe) qui rejoue les faces déjà tirées : aucun appel
 * réseau entre les étapes, un seul à la fin.
 *
 * Défense active (paramètres `par: cible`, l'Esquive de Star Wars) : la cible choisit, ce
 * chemin ne s'applique pas (`needsReaction`) ; l'ancien chemin serveur reste pour elle.
 */
import { translate } from '@/i18n/runtime';
import {
  ROLL_STEP_DICE_MAX,
  type ActionParams,
  type Attack,
  type AttackCombatContext,
  type AttackModification,
  type AttackOrigin,
  type AttackRollMode,
  type AttackTargetResult,
  type AttackTargetView,
  type AttackVisibility,
  type CombatRulesParticipant,
  type CombatState,
  type ResolvedAttack,
  type RollAdjustments,
  type RollPhase,
  type RollStep,
} from '@vtt/contracts';
import {
  aleatoirePlanifie,
  executerMulticible,
  parametresReaction,
  premierePhase,
  type Ajustements,
  type ContexteCombatSaisi,
  type ContexteCombattantSaisi,
  type DeRequis,
  type Fiche,
  type PhaseDes,
  type SystemeCharge,
} from '@vtt/rules';
import { targetResult, targetView, toModification } from './report';

// ─── Entrées ─────────────────────────────────────────────────────────────────

export interface LocalAttackInput {
  systeme: SystemeCharge;
  actionId: string;
  /** Fiche calculée de l'attaquant (instantané pris au lancer). */
  actor: Fiche;
  /** Cibles dans l'ordre de la déclaration, avec leur fiche calculée. */
  targets: readonly { id: string; fiche: Fiche }[];
  /** Paramètres de l'attaquant (situation comprise), sans valeur vide. */
  params: ActionParams;
  rollMode: AttackRollMode;
  adjustments?: RollAdjustments;
  /** Contexte du combat (`@combat.*`), sans l'attaque en cours ; absent : hors combat. */
  combat?: AttackCombatContext;
}

/** Faces d'une étape : dé par dé, tirées dans le navigateur (`clientRunner`). */
export type DiceRoller = (
  step: RollStep,
) => Promise<{ id: string; value: number }[]> | { id: string; value: number }[];

/** Refus des règles (attaquant, paramètre, toutes les cibles) : l'attaque n'est pas lancée. */
export class LocalRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalRefusal';
  }
}

// ─── Contexte du combat ──────────────────────────────────────────────────────

const EMPTY_TALLY = { attacksMadeRound: 0, attacksMade: 0, targetedRound: 0, targeted: 0 };

/**
 * Contexte du combat d'une attaque (`@combat.*`, docs/combat.md § 5.7), depuis l'état du
 * combat déjà chargé : round, et pour l'attaquant et chaque cible qui participent, leur
 * décompte (`tally`), `hasActed` et `surprised`. Hors combat : absent.
 */
export function combatContextOf(
  combat: CombatState | null | undefined,
  attackerId: string,
  targetIds: readonly string[],
): AttackCombatContext | undefined {
  if (!combat) return undefined;
  const byId = new Map(combat.order.map((p) => [p.characterId, p]));
  const rules = (p: CombatState['order'][number]): CombatRulesParticipant => ({
    ...(p.tally ?? EMPTY_TALLY),
    hasActed: p.hasActed,
    surprised: p.surprised ?? false,
  });
  const actor = byId.get(attackerId);
  return {
    round: Math.max(1, combat.round),
    ...(actor ? { actor: rules(actor) } : {}),
    targets: [...new Set(targetIds)].flatMap((id) => {
      const p = byId.get(id);
      return p ? [{ characterId: id, ...rules(p) }] : [];
    }),
  };
}

const fighter = (p: CombatRulesParticipant | undefined): ContexteCombattantSaisi | undefined =>
  p && {
    attaques: p.attacksMade,
    attaquesRound: p.attacksMadeRound,
    vise: p.targeted,
    viseRound: p.targetedRound,
    aAgi: p.hasActed,
    surpris: p.surprised,
  };

function engineContext(
  c: AttackCombatContext | undefined,
  targetId: string,
): ContexteCombatSaisi | undefined {
  if (!c) return undefined;
  const acteur = fighter(c.actor);
  const cible = fighter(c.targets.find((t) => t.characterId === targetId));
  return { round: c.round, ...(acteur ? { acteur } : {}), ...(cible ? { cible } : {}) };
}

// ─── Défense active ──────────────────────────────────────────────────────────

/** Une cible a une réaction à choisir (défense active) : l'attaque passe par le serveur. */
export function needsReaction(
  systeme: SystemeCharge,
  actionId: string,
  targets: readonly { fiche: Fiche }[],
): boolean {
  return targets.some((t) => parametresReaction(systeme, actionId, t.fiche).length > 0);
}

// ─── Une exécution ───────────────────────────────────────────────────────────

/** Résultat d'une cible ; `awaiting_dice` : des dés lui restent à lancer. */
export interface LocalTarget {
  characterId: string;
  status: 'resolved' | 'failed' | 'awaiting_dice';
  error: string | null;
  result: AttackTargetResult | null;
  view: AttackTargetView | null;
}

export interface LocalRun {
  /** Étape suivante (dés, ou paramètres choisis après le jet) ; null : l'attaque est résolue. */
  step: RollStep | null;
  targets: LocalTarget[];
  /** Coûts de l'attaquant, comptés une fois (vides tant qu'un dé manque). */
  actor: AttackModification[];
}

const ROLL_MODE = { per_target: 'par-cible', shared: 'commun' } as const;

const PHASE_ROLL: Record<Exclude<PhaseDes, 'fin'>, RollPhase> = {
  jet: 'roll',
  apres: 'after',
  tables: 'table',
};

const messages = (e: { parametre?: string; message: string }[]) =>
  [...new Set(e.map((x) => (x.parametre ? `${x.parametre} : ${x.message}` : x.message)))].join(
    ' ; ',
  );

function adjustmentsOf(a: RollAdjustments | undefined): Ajustements | undefined {
  if (!a) return undefined;
  return {
    ...(a.dice ? { des: a.dice.map((d) => ({ de: d.die, nombre: d.count })) } : {}),
    ...(a.bonus !== undefined ? { bonus: a.bonus } : {}),
  };
}

/** Libellé d'une étape, tiré des données (l'action, les valeurs montrées, les tables). */
function stepLabel(systeme: SystemeCharge, actionId: string, phase: PhaseDes): string | null {
  const action = systeme.actions.get(actionId);
  if (!action) return null;
  if (phase === 'jet') return action.nom;
  if (phase === 'apres')
    return action.apres.find((v) => v.visibilite === 'acteur' && v.nom)?.nom ?? null;
  const tables = [
    ...new Set(action.tables.map((t) => systeme.tables.get(t.table)?.nom ?? t.table)),
  ];
  return tables.length ? tables.join(', ') : null;
}

function diceStep(
  systeme: SystemeCharge,
  actionId: string,
  required: DeRequis[],
  known: number,
): RollStep {
  const phase = premierePhase(required.map((d) => d.phase)) ?? 'jet';
  const rollPhase = PHASE_ROLL[phase === 'fin' ? 'tables' : phase];
  const label = stepLabel(systeme, actionId, phase);
  return {
    id: `${rollPhase}-${known}`,
    phase: rollPhase,
    ...(label ? { label } : {}),
    dice: required.slice(0, ROLL_STEP_DICE_MAX).map((d) => ({
      id: d.id,
      targetId: d.cible ?? null,
      faces: d.faces,
      ...(d.de ? { die: d.de } : {}),
    })),
  };
}

function paramsStep(
  systeme: SystemeCharge,
  actionId: string,
  params: string[],
  known: number,
): RollStep {
  const label = stepLabel(systeme, actionId, 'apres');
  return {
    id: `after-params-${known}`,
    phase: 'after',
    ...(label ? { label } : {}),
    dice: [],
    params,
  };
}

/**
 * Une exécution du moteur sur les faces connues : l'étape suivante, ou les résultats (rapport
 * complet et vue de l'attaquant par cible, coûts de l'attaquant). Déterministe.
 */
export function runLocal(
  input: LocalAttackInput,
  faces: Readonly<Record<string, number>>,
  params: ActionParams = input.params,
): LocalRun {
  const { systeme } = input;
  const plan = aleatoirePlanifie({ faces, commun: input.rollMode === 'shared' });
  const adjustments = adjustmentsOf(input.adjustments);
  const r = executerMulticible(systeme, {
    action: input.actionId,
    acteur: input.actor,
    cibles: input.targets.map((t) => {
      const combat = engineContext(input.combat, t.id);
      return { id: t.id, fiche: t.fiche, ...(combat ? { combat } : {}) };
    }),
    parametres: params,
    jet: ROLL_MODE[input.rollMode],
    ...(adjustments ? { ajustements: adjustments } : {}),
    aleatoire: plan,
  });
  if (!r.ok) throw new LocalRefusal(messages(r.erreurs));

  const known = Object.keys(faces).length;
  let step = null;
  if (r.parametres.length) step = paramsStep(systeme, input.actionId, r.parametres, known);
  else if (r.requis.length) step = diceStep(systeme, input.actionId, r.requis, known);
  const done = new Map(r.cibles.map((c) => [c.id, c]));
  const waiting = new Map(r.enAttente.map((c) => [c.id, c]));
  const targets = input.targets.map(({ id }): LocalTarget => {
    const w = waiting.get(id);
    if (w)
      return {
        characterId: id,
        status: 'awaiting_dice',
        error: null,
        result: w.partiel ? targetResult(systeme, w.partiel) : null,
        view: w.partiel ? targetView(systeme, w.partiel) : null,
      };
    const c = done.get(id);
    if (!c?.ok)
      return {
        characterId: id,
        status: 'failed',
        error: c && !c.ok ? messages(c.erreurs) : translate('combat.targetRefused'),
        result: null,
        view: null,
      };
    return {
      characterId: id,
      status: 'resolved',
      error: null,
      result: targetResult(systeme, c.resultat),
      view: targetView(systeme, c.resultat),
    };
  });
  // Toutes les cibles refusées par les règles : rien n'est lancé (comme le serveur, 422)
  if (targets.every((t) => t.status === 'failed'))
    throw new LocalRefusal([...new Set(targets.map((t) => t.error ?? ''))].join(' ; '));
  return { step, targets, actor: r.acteur.map(toModification) };
}

// ─── Déroulé : étapes jouées dans le navigateur ──────────────────────────────

export interface LocalSession {
  input: LocalAttackInput;
  /** Faces tirées jusqu'ici, par identifiant de dé. */
  faces: Record<string, number>;
  /** Paramètres de l'attaque, ceux choisis après le jet (l'arme) compris. */
  params: ActionParams;
  last: LocalRun;
}

/** Garde-fou : dés qui explosent sans fin, données incohérentes. */
const MAX_ROUNDS = 50;

/**
 * Lance les dés de la phase `phase` tant que le moteur en demande pour elle (une explosion en
 * demande un de plus), puis s'arrête sur l'étape suivante (autre phase, paramètres) ou le
 * résultat.
 */
async function advance(
  input: LocalAttackInput,
  start: { faces: Record<string, number>; params: ActionParams },
  phase: RollPhase,
  roll: DiceRoller,
): Promise<LocalSession> {
  const faces = { ...start.faces };
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const run = runLocal(input, faces, start.params);
    const step = run.step;
    if (!step?.dice.length || step.params?.length || step.phase !== phase)
      return { input, faces, params: start.params, last: run };
    const wanted = new Map(step.dice.map((d) => [d.id, d.faces]));
    for (const r of await roll(step)) {
      const max = wanted.get(r.id);
      if (max === undefined || !Number.isInteger(r.value) || r.value < 1 || r.value > max)
        throw new Error(`Face ${r.value} invalide pour le dé ${r.id}`);
      faces[r.id] = r.value;
    }
    if (step.dice.some((d) => faces[d.id] === undefined))
      throw new Error('Des dés de l’étape n’ont pas été lancés');
  }
  throw new Error('Trop de dés à lancer pour cette attaque');
}

/** « Lancer » : le jet (TOUCHÉ ou RATÉ par cible), ou tout le résultat s'il n'y a pas de suite. */
export function startLocal(input: LocalAttackInput, roll: DiceRoller): Promise<LocalSession> {
  return advance(input, { faces: {}, params: input.params }, 'roll', roll);
}

/**
 * Étape suivante lancée par l'attaquant : les paramètres qu'elle demande (l'arme, une fois
 * touché : tous et seulement eux), puis les dés de sa phase (les dégâts, la table).
 */
export function continueLocal(
  session: LocalSession,
  stepParams: ActionParams | undefined,
  roll: DiceRoller,
): Promise<LocalSession> {
  const step = session.last.step;
  if (!step) return Promise.resolve(session);
  const asked = step.params ?? [];
  const given = Object.keys(stepParams ?? {});
  if (given.some((k) => !asked.includes(k)) || asked.some((k) => !given.includes(k)))
    throw new LocalRefusal(
      translate('combat.paramsExpected', {
        params: asked.join(', ') || translate('common.states.none').toLowerCase(),
      }),
    );
  const params = asked.length ? { ...session.params, ...stepParams } : session.params;
  return advance(session.input, { faces: session.faces, params }, step.phase, roll);
}

/** L'attaque est entièrement résolue : le rapport peut partir. */
export const isFinished = (s: LocalSession) => s.last.step === null;

/** Rapport à envoyer (`DeclareAttack.resolved`), une fois l'attaque résolue. */
export function resolvedReport(s: LocalSession, actionName: string): ResolvedAttack {
  return {
    actionName,
    targets: s.last.targets.map((t) =>
      t.status === 'resolved'
        ? { characterId: t.characterId, status: 'resolved', result: t.result, view: t.view }
        : {
            characterId: t.characterId,
            status: 'failed',
            error: t.error ?? translate('combat.targetRefused'),
          },
    ),
    ...(s.last.actor.length ? { actor: { modifications: s.last.actor } } : {}),
  };
}

// ─── L'attaque en cours, pour le menu ────────────────────────────────────────

/** Préfixe des attaques calculées ici, pas encore envoyées (jamais lues au serveur). */
export const LOCAL_ATTACK_PREFIX = 'local-';

export const isLocalAttack = (a: Pick<Attack, 'id'> | null | undefined) =>
  Boolean(a?.id.startsWith(LOCAL_ATTACK_PREFIX));

export interface LocalAttackMeta {
  id: string;
  campaignId: string;
  combat: CombatState | null | undefined;
  attackerId: string;
  actionName: string;
  visibility: AttackVisibility;
  gm: boolean;
  userId: string;
  origin?: AttackOrigin;
  presetId?: string | null;
}

/**
 * L'attaque en cours sous la forme que le menu sait montrer (`Attack`) : entre deux étapes,
 * `awaiting_dice` avec l'étape suivante (l'arme, les dégâts) ; un joueur n'y voit que la vue
 * de l'attaquant, comme dans la réponse du serveur.
 */
export function localAttackOf(
  s: LocalSession,
  meta: LocalAttackMeta,
  status?: 'cancelled',
): Attack {
  const step = s.last.step;
  const a = s.input.adjustments;
  return {
    id: meta.id,
    campaignId: meta.campaignId,
    combatId: meta.combat?.id ?? null,
    round: meta.combat?.round ?? null,
    turn: meta.combat?.turn ?? null,
    attackerId: meta.attackerId,
    action: { id: s.input.actionId, name: meta.actionName },
    params: s.params,
    rollMode: s.input.rollMode,
    dice: 'server',
    visibility: meta.visibility,
    status: status ?? (step ? 'awaiting_dice' : 'pending'),
    outOfTurn: false,
    selfTarget: s.input.targets.some((t) => t.id === meta.attackerId),
    origin: meta.origin ?? null,
    presetId: meta.presetId ?? null,
    adjustments: a
      ? { ...(a.dice ? { dice: a.dice } : {}), ...(a.bonus ? { bonus: a.bonus } : {}) }
      : null,
    targets: s.last.targets.map((t) => ({
      characterId: t.characterId,
      status: t.status,
      decision: 'pending',
      view: t.view,
      ...(meta.gm ? { result: t.result } : {}),
      error: t.error,
    })),
    ...(meta.gm ? { actor: { modifications: s.last.actor, decision: 'pending' as const } } : {}),
    pendingSteps: step && !status ? [step] : [],
    createdBy: meta.userId,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    decidedAt: null,
    version: 0,
    redacted: !meta.gm,
  };
}
