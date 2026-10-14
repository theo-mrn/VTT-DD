/**
 * Automatismes de la table (docs/automatismes.md) : des réglages complets (musique, ambiance
 * sonore, météo, écran, temps du monde) que le MJ prépare, lance d'un clic, ou fait lancer par
 * un déclencheur (arrivée du groupe sur une scène, début ou fin de combat, horloge pleine,
 * minuteur écoulé). Chaque paramètre absent n'est pas touché à l'application.
 *
 * Le service campaign les garde (MJ seulement) ; c'est le client du MJ qui les applique.
 */
import { z } from 'zod';
import { ExpectedVersion, MapWeather } from './map.js';

const InputId = z.uuid('Identifiant invalide').transform((s) => s.toLowerCase());

/** Un canal du son : une playlist ou une piste ; null : silence (le canal s'arrête). */
export const AutomationTrack = z.union([
  z.strictObject({ playlistId: InputId, assetId: z.null() }),
  z.strictObject({ playlistId: z.null(), assetId: InputId }),
]);
export type AutomationTrack = z.infer<typeof AutomationTrack>;

/** Ambiances d'écran qui durent, effets ponctuels (le front sait les jouer). */
export const AutomationMood = z.enum(['dark', 'danger', 'cold', 'dream']);
export const AutomationEffect = z.enum(['shake', 'quake', 'flash', 'heartbeat']);

/**
 * Paramètres d'un réglage. Absent : ce paramètre n'est pas touché. Pour le son et l'ambiance
 * d'écran, `null` veut dire « couper » ; pour la météo, « temps clair ».
 */
export const AutomationParams = z.strictObject({
  music: AutomationTrack.nullable().optional(),
  ambience: AutomationTrack.nullable().optional(),
  weather: MapWeather.nullable().optional(),
  mood: AutomationMood.nullable().optional(),
  /** Effet joué une fois, à l'application. */
  effect: AutomationEffect.optional(),
  /** Temps du monde : heure à laquelle passer (prochaine occurrence), vitesse d'écoulement. */
  time: z
    .strictObject({
      hour: z.number().int().min(0).max(23).optional(),
      rate: z.number().min(0).max(3600).optional(),
    })
    .optional(),
});
export type AutomationParams = z.infer<typeof AutomationParams>;

/** Ce qui lance un réglage tout seul. */
export const AutomationTrigger = z.discriminatedUnion('type', [
  /** Le groupe arrive sur cette scène (elle devient la scène du groupe). */
  z.strictObject({ type: z.literal('scene.enter'), mapId: InputId }),
  z.strictObject({ type: z.literal('combat.start') }),
  z.strictObject({ type: z.literal('combat.end') }),
  /** Une horloge de progression se remplit. */
  z.strictObject({ type: z.literal('clock.full') }),
  /** Le minuteur arrive à zéro. */
  z.strictObject({ type: z.literal('timer.end') }),
]);
export type AutomationTrigger = z.infer<typeof AutomationTrigger>;
export type AutomationTriggerType = AutomationTrigger['type'];

export const Automation = z.object({
  id: z.string(),
  name: z.string(),
  params: AutomationParams,
  triggers: z.array(AutomationTrigger),
  /** Scènes où ce réglage est proposé d'un clic (thèmes de la scène). */
  sceneIds: z.array(z.string()),
  sortOrder: z.number().int(),
  version: z.number().int(),
  updatedAt: z.string(),
});
export type Automation = z.infer<typeof Automation>;

const AutomationFields = z.strictObject({
  name: z.string().trim().min(1, 'Nom requis').max(80),
  params: AutomationParams,
  triggers: z.array(AutomationTrigger).max(20),
  sceneIds: z.array(InputId).max(100),
  sortOrder: z.number().int().min(0).max(1_000_000),
});

export const CreateAutomation = AutomationFields.partial().required({ name: true });
export type CreateAutomation = z.input<typeof CreateAutomation>;

export const UpdateAutomation = AutomationFields.partial().extend({ version: ExpectedVersion });
export type UpdateAutomation = z.input<typeof UpdateAutomation>;

// ─── Règles : quand… si… alors… (docs/automatismes.md § 2) ─────────────────────

const Side = z.enum(['players', 'enemies', 'allies']);

/** Ce qui lance une règle ; un filtre absent veut dire « n'importe lequel ». */
export const RuleTrigger = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('scene.enter'), mapId: InputId.optional() }),
  z.strictObject({ type: z.literal('scene.leave'), mapId: InputId.optional() }),
  z.strictObject({ type: z.literal('combat.start') }),
  z.strictObject({ type: z.literal('combat.end') }),
  /** Nouveau round ; `every` : un round sur N (2 : les rounds pairs). */
  z.strictObject({
    type: z.literal('combat.round'),
    every: z.number().int().min(1).max(20).optional(),
  }),
  /** Début d'un tour ; `side` : d'un camp ; `userId` : du personnage de ce joueur. */
  z.strictObject({
    type: z.literal('combat.turn'),
    side: Side.optional(),
    userId: z.uuid().optional(),
  }),
  /** L'heure du monde atteint `hour` h. */
  z.strictObject({ type: z.literal('time.hour'), hour: z.number().int().min(0).max(23) }),
  /** Une horloge gagne un segment, ou se remplit ; `clock` : son nom (absent : n'importe laquelle). */
  z.strictObject({ type: z.literal('clock.segment'), clock: z.string().trim().max(60).optional() }),
  z.strictObject({ type: z.literal('clock.full'), clock: z.string().trim().max(60).optional() }),
  z.strictObject({ type: z.literal('timer.end') }),
  z.strictObject({ type: z.literal('fate.spent') }),
]);
export type RuleTrigger = z.infer<typeof RuleTrigger>;
export type RuleTriggerType = RuleTrigger['type'];

/** Conditions : toutes vraies pour que la règle s'applique. */
export const RuleCondition = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('scene.is'), mapId: InputId }),
  z.strictObject({ type: z.literal('combat.active'), value: z.boolean() }),
  /** Heure du monde entre `from` (compris) et `to` (exclu), à cheval sur minuit possible. */
  z.strictObject({
    type: z.literal('time.between'),
    from: z.number().int().min(0).max(23),
    to: z.number().int().min(0).max(24),
  }),
  z.strictObject({ type: z.literal('chance'), percent: z.number().int().min(1).max(99) }),
]);
export type RuleCondition = z.infer<typeof RuleCondition>;
export type RuleConditionType = RuleCondition['type'];

/**
 * À qui s'adresse une action personnelle (écran, message) : absent, toute la table ; un joueur
 * (son userId) ; `actor`, le joueur concerné par le déclencheur (celui dont c'est le tour, celui
 * qui a dépensé le jeton).
 */
export const RuleTarget = z.union([z.literal('actor'), z.uuid()]);
export type RuleTarget = z.infer<typeof RuleTarget>;

/** Actions, dans l'ordre ; `delayMs` : attente avant celle-ci (depuis le déclenchement). */
const delay = { delayMs: z.number().int().min(0).max(600_000).optional() };
const to = { to: RuleTarget.optional() };
export const RuleAction = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('preset.apply'), automationId: InputId, ...delay }),
  z.strictObject({ type: z.literal('audio.music'), track: AutomationTrack.nullable(), ...delay }),
  z.strictObject({
    type: z.literal('audio.ambience'),
    track: AutomationTrack.nullable(),
    ...delay,
  }),
  z.strictObject({ type: z.literal('weather.set'), weather: MapWeather.nullable(), ...delay }),
  z.strictObject({
    type: z.literal('screen.mood'),
    mood: AutomationMood.nullable(),
    ...to,
    ...delay,
  }),
  z.strictObject({ type: z.literal('screen.fx'), effect: AutomationEffect, ...to, ...delay }),
  z.strictObject({
    type: z.literal('time.set'),
    hour: z.number().int().min(0).max(23).optional(),
    rate: z.number().min(0).max(3600).optional(),
    ...delay,
  }),
  z.strictObject({
    type: z.literal('timer.start'),
    seconds: z.number().int().min(1).max(86_400),
    label: z.string().trim().max(80).default(''),
    ...delay,
  }),
  z.strictObject({ type: z.literal('timer.stop'), ...delay }),
  /** Avance (ou recule) une horloge, désignée par son nom. */
  z.strictObject({
    type: z.literal('clock.advance'),
    clock: z.string().trim().min(1).max(60),
    by: z.number().int().min(-12).max(12),
    ...delay,
  }),
  z.strictObject({
    type: z.literal('fate.give'),
    count: z.number().int().min(-20).max(20),
    ...delay,
  }),
  z.strictObject({ type: z.literal('table.pause'), paused: z.boolean(), ...delay }),
  /** Message à l'écran : à toute la table, au MJ seul, ou à un joueur (`to`). */
  z.strictObject({
    type: z.literal('notice'),
    text: z.string().trim().min(1).max(280),
    gmOnly: z.boolean().default(false),
    ...to,
    ...delay,
  }),
]);
export type RuleAction = z.infer<typeof RuleAction>;
export type RuleActionType = RuleAction['type'];

export const AutomationRule = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  trigger: RuleTrigger,
  conditions: z.array(RuleCondition),
  actions: z.array(RuleAction),
  /** Délai minimal entre deux exécutions (s) ; 0 : aucun. */
  cooldownSec: z.number().int(),
  /** Une seule exécution (puis la règle se coupe). */
  once: z.boolean(),
  sortOrder: z.number().int(),
  lastRunAt: z.string().nullable(),
  version: z.number().int(),
  updatedAt: z.string(),
});
export type AutomationRule = z.infer<typeof AutomationRule>;

const RuleFields = z.strictObject({
  name: z.string().trim().min(1, 'Nom requis').max(80),
  enabled: z.boolean(),
  trigger: RuleTrigger,
  conditions: z.array(RuleCondition).max(10),
  actions: z.array(RuleAction).min(1).max(20),
  cooldownSec: z.number().int().min(0).max(86_400),
  once: z.boolean(),
  sortOrder: z.number().int().min(0).max(1_000_000),
});

export const CreateAutomationRule = RuleFields.partial().required({
  name: true,
  trigger: true,
  actions: true,
});
export type CreateAutomationRule = z.input<typeof CreateAutomationRule>;

export const UpdateAutomationRule = RuleFields.partial().extend({ version: ExpectedVersion });
export type UpdateAutomationRule = z.input<typeof UpdateAutomationRule>;

/** Une exécution, pour le journal du MJ. */
export const AutomationRun = z.object({
  id: z.string(),
  ruleId: z.string().nullable(),
  ruleName: z.string(),
  trigger: z.string(),
  ok: z.boolean(),
  error: z.string().nullable(),
  at: z.string(),
});
export type AutomationRun = z.infer<typeof AutomationRun>;

/**
 * Demande de son d'un automatisme (`automation.audio`), exécutée par le service audio comme une
 * commande du MJ : lancer une playlist ou une piste, ou arrêter le canal.
 */
export const AUTOMATION_AUDIO = 'automation.audio';
export const AutomationAudioPayload = z.object({
  channel: z.enum(['music', 'ambience']),
  track: z.object({ playlistId: z.string().nullable(), assetId: z.string().nullable() }).nullable(),
});
export type AutomationAudioPayload = z.infer<typeof AutomationAudioPayload>;
