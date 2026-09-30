/**
 * Contrat du combat (docs/combat.md) : état du combat (tours, rounds, initiative), participants,
 * attaques et rapports d'attaque, étapes de dés (l'animation 3D fait foi), entrées des routes,
 * charges des événements `combat.*` et message éphémère `combat.aim`. Partagé par le service
 * campaign (validation des routes) et le front (client typé).
 *
 * Rétrocompatible avec l'API combat existante (docs/api-campaign.md, « Combat ») : les champs
 * historiques gardent leur forme et leur sens, tout ajout est facultatif dans les réponses.
 *
 * Aucune clé de jeu : actions, paramètres, attributs, entrées du catalogue, sortes de dés,
 * tables et types de dégâts sont des identifiants du système de la campagne (`SystemRef`).
 *
 * Conventions :
 *  - les schémas d'entrée (`Start…`, `Declare…`, `Apply…`) décrivent les corps de requête,
 *    stricts pour les nouvelles routes (une clé inconnue est refusée) ; ceux des routes
 *    existantes restent tolérants, comme aujourd'hui ;
 *  - les identifiants reçus sont des UUID, rangés en minuscules ;
 *  - `version` : verrou optimiste (409 `version_conflict` si elle a changé).
 *
 * Tout ce qui est ici fonctionne dans Node comme dans le navigateur.
 */
import { z } from 'zod';
import { CampaignSide } from './map.js';

// ─── Bases ───────────────────────────────────────────────────────────────────

/** Identifiant reçu dans une requête (UUID, rangé en minuscules comme en base). */
const InputId = (message = 'Identifiant invalide') =>
  z.uuid(message).transform((s) => s.toLowerCase());
/** Identifiant renvoyé par le service. */
const Id = z.string();
const Timestamp = z.string();
/** Version lue, renvoyée avec une écriture. */
const ExpectedVersion = z.number().int().positive();

/**
 * Identifiant d'un élément du système de la campagne : action, paramètre, attribut, entrée du
 * catalogue, sorte de dé, table, type de dégâts. Une donnée, jamais une clé en dur.
 */
export const SystemRef = z.string().trim().min(1).max(200);

/**
 * Valeur d'un paramètre d'action : nombre, booléen ou texte (entrée `id` ou `id#exemplaire`,
 * clé d'attribut). Même forme que les paramètres des actions du service character.
 */
export const ActionParamValue = z.union([z.number().finite(), z.string().max(10_000), z.boolean()]);
export type ActionParamValue = z.infer<typeof ActionParamValue>;
export const ActionParams = z.record(z.string().min(1).max(100), ActionParamValue);
export type ActionParams = z.infer<typeof ActionParams>;

/** Participants d'un combat, au plus. */
export const COMBAT_PARTICIPANTS_MAX = 100;
/** Cibles d'une attaque, au plus (une zone peut en toucher beaucoup). */
export const ATTACK_TARGETS_MAX = 50;
/** Attaques déclarées d'un coup (PNJ à la suite), au plus. */
export const ATTACK_BATCH_MAX = 20;
/** Rapports appliqués d'un coup (« Tout appliquer »), au plus. */
export const ATTACK_APPLY_BATCH_MAX = 50;
/** Dés d'une étape de jet, au plus (toutes cibles confondues). */
export const ROLL_STEP_DICE_MAX = 400;
/** Clés de tri d'une initiative, au plus. */
export const SORT_KEYS_MAX = 8;
/** Note du MJ sur une décision, en caractères. */
export const ATTACK_NOTE_MAX = 500;
/** Modifications corrigées par cible, au plus. */
export const ATTACK_MODIFICATIONS_MAX = 50;

const uniqueIds = (ids: readonly string[]) => new Set(ids).size === ids.length;

// ─── Énumérations ────────────────────────────────────────────────────────────

/**
 * `individual` : chaque participant agit à son tour, dans l'ordre d'initiative.
 * `slots` : l'ordre donne une suite de créneaux par camp ; pendant un créneau, un participant
 * du camp qui n'a pas encore agi agit (Star Wars). Par défaut : le mode déclaré par le système.
 */
export const CombatMode = z.enum(['individual', 'slots']);
export type CombatMode = z.infer<typeof CombatMode>;

/** Cause d'un changement de tour (`combat.turn_changed`). Les quatre premières existent déjà. */
export const CombatTurnReason = z.enum([
  'initiative',
  'next',
  'new_round',
  'participants_removed',
  /** Retour au passage précédent (journal des tours), durées de fin de round rendues. */
  'previous',
  'participants_added',
  /** Initiative relancée ou saisie, visibilité ou état « hors de combat » d'un participant. */
  'participant_updated',
  /** Ordre changé à la main par le MJ. */
  'reordered',
  /** Le MJ donne le tour à un participant (ou un créneau). */
  'turn_set',
  /** Participant désigné pour agir pendant le créneau courant (mode `slots`). */
  'slot_actor',
]);
export type CombatTurnReason = z.infer<typeof CombatTurnReason>;

/**
 * Qui lance les dés d'un jet : `physical`, les dés 3D du client (faces lues à l'arrêt, le
 * serveur calcule avec elles) ; `server`, le serveur tire (3D coupée, PNJ en masse, repli).
 */
export const RollDiceMode = z.enum(['physical', 'server']);
export type RollDiceMode = z.infer<typeof RollDiceMode>;

/** Origine d'une face : lue sur un dé 3D, ou tirée par le serveur (repli). */
export const DieSource = z.enum(['physical', 'server']);
export type DieSource = z.infer<typeof DieSource>;

/**
 * Phase d'une action où des dés sont lancés : `roll` (le jet : toucher, pool), `after`
 * (valeurs après le jet : dégâts), `table` (tirage sur une table : blessure critique).
 */
export const RollPhase = z.enum(['roll', 'after', 'table']);
export type RollPhase = z.infer<typeof RollPhase>;

/**
 * Plusieurs cibles : `per_target`, une résolution et un jet par cible ; `shared`, un jet
 * commun (zone) : les dés de chaque phase sont partagés, un dé propre à une cible est lancé
 * pour elle seule. Par défaut : ce que déclare l'action (`multicible`), sinon `per_target`.
 */
export const AttackRollMode = z.enum(['per_target', 'shared']);
export type AttackRollMode = z.infer<typeof AttackRollMode>;

/**
 * Visibilité d'une attaque pour la table (jet, annonce) : `public` (tous voient le jet et
 * l'issue), `private` (le jet va à l'auteur et au MJ, l'issue n'est pas annoncée), `gm`
 * (jet caché du MJ : les joueurs ne voient rien). Le rapport, lui, reste au MJ et à l'auteur.
 */
export const AttackVisibility = z.enum(['public', 'private', 'gm']);
export type AttackVisibility = z.infer<typeof AttackVisibility>;

/**
 * Cycle de vie d'une attaque : `awaiting_reactions` (défense active des cibles), puis
 * `awaiting_dice` (dés physiques à lancer), `pending` (rapport au MJ, rien appliqué), puis
 * `applied` (au moins une décision d'appliquer, toutes les cibles décidées) ou `dismissed`
 * (rien appliqué). `cancelled` : abandonnée avant sa résolution ; `failed` : refusée par les
 * règles à la résolution.
 */
export const AttackStatus = z.enum([
  'awaiting_reactions',
  'awaiting_dice',
  'pending',
  'applied',
  'dismissed',
  'cancelled',
  'failed',
]);
export type AttackStatus = z.infer<typeof AttackStatus>;

/** État de la résolution d'une cible. */
export const AttackTargetStatus = z.enum([
  'awaiting_reaction',
  'awaiting_dice',
  'resolved',
  'failed',
]);
export type AttackTargetStatus = z.infer<typeof AttackTargetStatus>;

/** Décision du MJ pour une cible (ou pour les coûts de l'attaquant). */
export const AttackDecision = z.enum(['pending', 'applied', 'skipped', 'reverted']);
export type AttackDecision = z.infer<typeof AttackDecision>;

/** D'où l'attaque a été lancée (statistiques, historique). */
export const AttackOrigin = z.enum(['map', 'selection', 'measurement', 'sheet', 'turns']);
export type AttackOrigin = z.infer<typeof AttackOrigin>;

// ─── Réglages du combat ──────────────────────────────────────────────────────

/** Réglages du MJ pour le combat en cours. */
export const CombatSettings = z.object({
  /**
   * Les joueurs agissent hors du tour de leur personnage (réactions, attaques d'opportunité),
   * comme dans l'ancienne app ; une telle attaque est marquée `outOfTurn`. Faux : 409
   * `not_their_turn`.
   */
  playersActOutsideTurn: z.boolean().default(true),
  /** Jets d'attaque du MJ cachés aux joueurs par défaut (visibilité `gm`), bascule par attaque. */
  gmRollsHidden: z.boolean().default(true),
  /** Dés physiques (3D) permis ; faux : le serveur tire tous les dés du combat. */
  physicalDice: z.boolean().default(true),
});
export type CombatSettings = z.infer<typeof CombatSettings>;
export const DEFAULT_COMBAT_SETTINGS: CombatSettings = CombatSettings.parse({});

const CombatSettingsFields = {
  playersActOutsideTurn: z.boolean().optional(),
  gmRollsHidden: z.boolean().optional(),
  physicalDice: z.boolean().optional(),
};
const hasSetting = (v: Partial<Record<keyof typeof CombatSettingsFields, unknown>>) =>
  Object.keys(CombatSettingsFields).some(
    (k) => v[k as keyof typeof CombatSettingsFields] !== undefined,
  );

/** Réglages choisis au démarrage (les absents gardent leur défaut). */
export const CombatSettingsInput = z.strictObject(CombatSettingsFields);
export type CombatSettingsInput = z.input<typeof CombatSettingsInput>;

/** `PATCH …/combat/settings` (MJ). */
export const UpdateCombatSettings = z
  .strictObject({ ...CombatSettingsFields, version: ExpectedVersion.optional() })
  .refine(hasSetting, { message: 'Aucun réglage à changer' });
export type UpdateCombatSettings = z.input<typeof UpdateCombatSettings>;

// ─── Participants et état du combat ──────────────────────────────────────────

/** Initiative d'un participant : ce qui a été tiré, avec quoi, et comment. */
export const CombatInitiative = z.object({
  /** Détail lisible (« 17 (d20 : 14 + 3) », « 2 Succès, 1 Avantage »), l'ancien `initDetails`. */
  summary: z.string(),
  /** Paramètres de l'action d'initiative retenus (compétence choisie…), gardés pour la relance. */
  params: ActionParams,
  /** `manual` : clés saisies par le MJ ; `mixed` : dés 3D complétés par le serveur. */
  source: z.enum(['server', 'physical', 'mixed', 'manual']),
  rolledAt: Timestamp,
  /** Jet enregistré dans l'historique des dés (service dice), s'il y en a un. */
  rollId: Id.nullable().optional(),
});
export type CombatInitiative = z.infer<typeof CombatInitiative>;

/**
 * Ce que le combat a compté pour un participant (§ 5.7) : attaques non annulées de ce combat.
 * Montré par le menu d'attaque (« première attaque », « déjà visé ce round ») et fourni aux
 * règles à la résolution (`@combat.*`). Vue d'un joueur : seules les attaques publiques comptent.
 */
export const CombatTally = z.object({
  /** Attaques qu'il a déclarées ce round. */
  attacksMadeRound: z.number().int().nonnegative(),
  /** Attaques qu'il a déclarées depuis le début du combat (0 : sa première est à venir). */
  attacksMade: z.number().int().nonnegative(),
  /** Attaques qui l'ont visé ce round. */
  targetedRound: z.number().int().nonnegative(),
  /** Attaques qui l'ont visé depuis le début du combat. */
  targeted: z.number().int().nonnegative(),
});
export type CombatTally = z.infer<typeof CombatTally>;

/**
 * Ce que les règles lisent d'un participant sous `@combat.acteur.*` et `@combat.cible.*`
 * (§ 5.7, docs/regles.md « Contexte du combat ») : son décompte sur toutes les attaques du
 * combat (vue du MJ), sans l'attaque en cours, a agi ce round, surpris.
 */
export const CombatRulesParticipant = CombatTally.extend({
  hasActed: z.boolean(),
  surprised: z.boolean(),
});
export type CombatRulesParticipant = z.infer<typeof CombatRulesParticipant>;

/**
 * Contexte du combat figé par campaign à la déclaration d'une attaque et envoyé à character
 * (`combat` de `POST /internal/actions/prepare`) : gardé dans l'instantané, il sert à toute la
 * résolution. Un participant absent (attaquant ou cible hors du combat) : valeurs neutres.
 */
export const AttackCombatContext = z.object({
  round: z.number().int().positive(),
  actor: CombatRulesParticipant.optional(),
  targets: z.array(CombatRulesParticipant.extend({ characterId: Id })).max(50),
});
export type AttackCombatContext = z.infer<typeof AttackCombatContext>;

/**
 * Participant du combat. Les quatre premiers champs existent déjà ; les suivants sont
 * facultatifs (absents des réponses d'avant ce contrat).
 */
export const CombatParticipant = z.object({
  characterId: Id,
  side: CampaignSide,
  /** Clés de tri de l'initiative (ordre de `initiative.tri` du système) ; vide : pas tirée. */
  sortKeys: z.array(z.number()),
  hasActed: z.boolean(),
  /** Faux : caché aux joueurs (absent de leur vue du combat). Défaut : vrai. */
  visibleToPlayers: z.boolean().optional(),
  initiative: CombatInitiative.nullable().optional(),
  /** Initiative demandée au joueur (dés physiques), pas encore lancée. */
  initiativePending: z.boolean().optional(),
  /** Round où il a rejoint le combat. */
  joinedRound: z.number().int().positive().optional(),
  /** Hors de combat (règle `horsCombat` du système, ou décision du MJ) : grisé, gardé. */
  defeated: z.boolean().optional(),
  /** Surpris (embuscade) : marqué par le MJ, lu par les règles (`@combat.*`, § 5.7). */
  surprised: z.boolean().optional(),
  tally: CombatTally.optional(),
});
export type CombatParticipant = z.infer<typeof CombatParticipant>;

/** Créneau du mode `slots` : le camp qui agit. */
export const CombatSlot = z.object({ side: CampaignSide });
export type CombatSlot = z.infer<typeof CombatSlot>;

/**
 * État du combat (`GET …/combat`, réponse des routes du combat, `combat` du détail de la
 * campagne). Les huit premiers champs existent déjà.
 *
 * Vue d'un joueur ou d'un spectateur (`redacted: true`) : les participants cachés sont retirés,
 * les clés de tri et le détail d'initiative des camps autres que `players` sont vidés ;
 * `currentIndex` est alors l'index dans cette liste, ou -1 quand le participant dont c'est le
 * tour est caché. Les créneaux (`slots`) ne sont jamais retirés.
 */
export const CombatState = z.object({
  id: Id,
  round: z.number().int(),
  mode: CombatMode,
  order: z.array(CombatParticipant),
  /** Index du participant (individual) ou du créneau (slots) dont c'est le tour. */
  currentIndex: z.number().int(),
  slots: z.array(CombatSlot).optional(),
  /** Vrai une fois l'initiative tirée. */
  initiativeRolled: z.boolean(),
  version: z.number().int(),
  /**
   * Participant qui agit maintenant : celui de `currentIndex` en mode individual ; en mode
   * slots, celui désigné pour le créneau (ou qui y a attaqué le premier), sinon null.
   */
  currentActorId: Id.nullable().optional(),
  /** Compteur des passages de tour (journal), croissant pendant tout le combat. */
  turn: z.number().int().nonnegative().optional(),
  /** Un passage peut être annulé par « Précédent » (MJ). */
  canGoBack: z.boolean().optional(),
  settings: CombatSettings.optional(),
  startedAt: Timestamp.optional(),
  redacted: z.boolean().optional(),
});
export type CombatState = z.infer<typeof CombatState>;

/** Durées décomptées en fin de round (réponse de `…/next`, `…/previous`), déjà existant. */
export const CombatDurationUpdate = z.object({
  characterId: Id,
  /** Entrées (`entree`, `entree#exemplaire`, `bonus:<id>`) arrivées à 0, ou rendues. */
  expired: z.array(z.string()),
});
export type CombatDurationUpdate = z.infer<typeof CombatDurationUpdate>;

export const CombatTurnResponse = CombatState.extend({
  durationUpdates: z.array(CombatDurationUpdate).optional(),
  /** Personnages injoignables pendant le décompte (ou sa restitution). */
  durationFailures: z.array(z.string()).optional(),
});
export type CombatTurnResponse = z.infer<typeof CombatTurnResponse>;

// ─── Entrées : combat, tours, participants ───────────────────────────────────

/** Paramètres d'initiative par camp (compétence d'un camp surpris…). */
export const SideParams = z.strictObject({
  players: ActionParams.optional(),
  enemies: ActionParams.optional(),
  allies: ActionParams.optional(),
});
export type SideParams = z.input<typeof SideParams>;

/**
 * `POST …/combat` (MJ, existant). `participants` et `mode` gardent leur sens ; sans `mode`,
 * celui que déclare le système (`initiative.mode`). Doublons refusés par le service
 * (400 `duplicate_participant`).
 */
export const StartCombat = z.object({
  participants: z
    .array(InputId('Identifiant de personnage invalide'))
    .min(1)
    .max(COMBAT_PARTICIPANTS_MAX),
  mode: CombatMode.optional(),
  /** Participants cachés aux joueurs dès le départ (embuscade). */
  hidden: z
    .array(InputId('Identifiant de personnage invalide'))
    .max(COMBAT_PARTICIPANTS_MAX)
    .optional(),
  /** Participants surpris dès le départ (§ 5.7). */
  surprised: z
    .array(InputId('Identifiant de personnage invalide'))
    .max(COMBAT_PARTICIPANTS_MAX)
    .optional(),
  settings: CombatSettingsInput.optional(),
  /** Tirer tout de suite l'initiative de tous (serveur), avec ces paramètres par camp. */
  rollInitiative: z.boolean().optional(),
  paramsBySide: SideParams.optional(),
});
export type StartCombat = z.input<typeof StartCombat>;

/**
 * `POST …/combat/initiative` (MJ, existant) : l'action d'initiative du système pour chaque
 * participant (ou ceux de `participants`), triés selon ses clés. Paramètres : ceux du camp
 * (`paramsBySide`), remplacés par ceux du personnage (`params`, indexés par identifiant).
 */
export const RollCombatInitiative = z.object({
  params: z.record(z.string(), ActionParams).optional(),
  paramsBySide: SideParams.optional(),
  /** Seulement ceux-ci (les autres gardent leur initiative) ; absent : tous. */
  participants: z
    .array(InputId('Identifiant de personnage invalide'))
    .min(1)
    .max(COMBAT_PARTICIPANTS_MAX)
    .optional(),
  /** Les joueurs lancent eux-mêmes leur initiative (dés 3D) ; le serveur tire pour les autres. */
  askPlayers: z.boolean().optional(),
});
export type RollCombatInitiative = z.input<typeof RollCombatInitiative>;

/**
 * `POST …/combat/participants/:characterId/initiative` : relance individuelle (MJ), ou jet du
 * joueur qui incarne le personnage quand son initiative lui est demandée.
 */
export const RollParticipantInitiative = z.strictObject({
  params: ActionParams.optional(),
  dice: RollDiceMode.optional(),
});
export type RollParticipantInitiative = z.input<typeof RollParticipantInitiative>;

/** Initiative d'un participant qui rejoint : tirée, demandée au joueur, aucune, ou saisie. */
export const ParticipantInitiativeChoice = z.union([
  z.enum(['roll', 'ask', 'none']),
  z.strictObject({ sortKeys: z.array(z.number().finite()).min(1).max(SORT_KEYS_MAX) }),
]);
export type ParticipantInitiativeChoice = z.input<typeof ParticipantInitiativeChoice>;

/** `POST …/combat/participants` (MJ) : des personnages engagés rejoignent le combat. */
export const AddCombatParticipants = z.strictObject({
  participants: z
    .array(
      z.strictObject({
        characterId: InputId('Identifiant de personnage invalide'),
        visibleToPlayers: z.boolean().optional(),
        /** Défaut : `roll` si l'initiative est déjà tirée, sinon `none`. */
        initiative: ParticipantInitiativeChoice.optional(),
        params: ActionParams.optional(),
      }),
    )
    .min(1)
    .max(COMBAT_PARTICIPANTS_MAX)
    .refine((ps) => uniqueIds(ps.map((p) => p.characterId)), {
      message: 'Participant en double',
    }),
  version: ExpectedVersion.optional(),
});
export type AddCombatParticipants = z.input<typeof AddCombatParticipants>;

/** `PATCH …/combat/participants/:characterId` (MJ). */
export const UpdateCombatParticipant = z
  .strictObject({
    /** Initiative saisie (dés lancés à la table) : le participant est replacé dans l'ordre. */
    sortKeys: z.array(z.number().finite()).min(1).max(SORT_KEYS_MAX).optional(),
    visibleToPlayers: z.boolean().optional(),
    defeated: z.boolean().optional(),
    surprised: z.boolean().optional(),
    version: ExpectedVersion.optional(),
  })
  .refine(
    (v) =>
      v.sortKeys !== undefined ||
      v.visibleToPlayers !== undefined ||
      v.defeated !== undefined ||
      v.surprised !== undefined,
    { message: 'Rien à changer' },
  );
export type UpdateCombatParticipant = z.input<typeof UpdateCombatParticipant>;

/** `PUT …/combat/order` (MJ) : nouvel ordre, tous les participants une fois chacun. */
export const ReorderCombat = z.strictObject({
  order: z
    .array(InputId('Identifiant de personnage invalide'))
    .min(1)
    .max(COMBAT_PARTICIPANTS_MAX)
    .refine(uniqueIds, { message: 'Participant en double' }),
  version: ExpectedVersion.optional(),
});
export type ReorderCombat = z.input<typeof ReorderCombat>;

/** `POST …/combat/next` (existant) : `characterId` obligatoire pour un joueur en mode slots. */
export const NextTurn = z.object({
  characterId: InputId('Identifiant de personnage invalide').optional(),
  version: ExpectedVersion.optional(),
});
export type NextTurn = z.input<typeof NextTurn>;

/** `POST …/combat/previous` (MJ) : annule le dernier passage de tour. */
export const PreviousTurn = z.strictObject({ version: ExpectedVersion.optional() });
export type PreviousTurn = z.input<typeof PreviousTurn>;

/** `POST …/combat/turn` (MJ) : donner le tour à un participant (individual) ou un créneau (slots). */
export const SetTurn = z
  .strictObject({
    characterId: InputId('Identifiant de personnage invalide').optional(),
    slotIndex: z.number().int().nonnegative().optional(),
    version: ExpectedVersion.optional(),
  })
  .refine((v) => (v.characterId === undefined) !== (v.slotIndex === undefined), {
    message: 'Un participant ou un créneau, pas les deux',
  });
export type SetTurn = z.input<typeof SetTurn>;

/**
 * `POST …/combat/slot-actor` (mode slots) : qui agit pendant le créneau courant. Un joueur
 * désigne le personnage qu'il incarne ; le MJ, n'importe quel participant du camp. `force`
 * (MJ) : un participant qui a déjà agi ce round rejoue, comme dans l'ancienne app.
 */
export const ChooseSlotActor = z.strictObject({
  characterId: InputId('Identifiant de personnage invalide'),
  force: z.boolean().optional(),
  version: ExpectedVersion.optional(),
});
export type ChooseSlotActor = z.input<typeof ChooseSlotActor>;

/** `POST …/combat/end` (MJ, existant) : corps facultatif. */
export const EndCombat = z.object({
  /** Rapports encore en attente : gardés (défaut) ou écartés. */
  pendingAttacks: z.enum(['keep', 'dismiss']).optional(),
  /** Retirer les états et bonus à durée des participants. */
  clearTimedStates: z.boolean().optional(),
});
export type EndCombat = z.input<typeof EndCombat>;

// ─── Étapes de dés (l'animation fait foi) ────────────────────────────────────

/** Un dé à lancer : numérique (`faces`) ou à symboles (`die` : sorte du système). */
export const RollDieRequest = z.object({
  /** Identifiant stable du dé dans le jet, renvoyé avec sa face. */
  id: z.string(),
  /** Cible pour qui ce dé est lancé ; null : dé commun (jet commun, initiative). */
  targetId: Id.nullable(),
  faces: z.number().int().min(2).max(1000),
  /** Dé à symboles : sorte du système (skin et symboles par la présentation). */
  die: z.string().optional(),
});
export type RollDieRequest = z.infer<typeof RollDieRequest>;

/**
 * Qui lance une étape : l'auteur du jet (défaut), ou le joueur qui incarne la cible (jet de
 * sauvegarde, brique à venir : docs/combat.md § 14). Le MJ peut toujours lancer à sa place.
 */
export const RollStepRoller = z.enum(['author', 'target']);
export type RollStepRoller = z.infer<typeof RollStepRoller>;

/**
 * Dés à lancer maintenant, tous ensemble. Le client les anime, lit la face du dessus de
 * chacun à l'arrêt et la renvoie (`SubmitRollDice`) ; il ne corrige jamais l'animation.
 *
 * Une attaque avance par étapes, une par phase de l'action qui demande des dés : le jet
 * (`roll` : d20 de chaque cible, ou la réserve), puis `after` (dégâts des seules cibles
 * touchées ; une explosion ajoute une étape de la même phase), puis `table` (blessure
 * critique). L'attaquant voit l'issue d'une étape avant de lancer la suivante.
 */
export const RollStep = z.object({
  id: z.string(),
  phase: RollPhase,
  /**
   * Ce que l'étape lance, tiré des données du système : l'action (`roll`), le nom des valeurs
   * montrées à l'attaquant (`after` : « Dégâts », « Soins »), la table (`table`).
   */
  label: z.string().optional(),
  /** Absent : `author`. */
  roller: RollStepRoller.optional(),
  /** Pour `roller: target` : la cible dont le joueur lance. */
  targetId: Id.nullable().optional(),
  dice: z.array(RollDieRequest).min(1).max(ROLL_STEP_DICE_MAX),
});
export type RollStep = z.infer<typeof RollStep>;

/**
 * Ajustements libres d'un jet, hors des règles (l'ancien compteur de pool « forcé ») : dés à
 * symboles ajoutés ou retirés par sorte, bonus au total d'un jet numérique. Appliqués après
 * les effets, marqués dans le rapport.
 */
export const RollAdjustments = z
  .strictObject({
    dice: z
      .array(
        z.strictObject({
          die: SystemRef,
          count: z
            .number()
            .int()
            .min(-20)
            .max(20)
            .refine((n) => n !== 0, { message: 'Nombre de dés non nul attendu' }),
        }),
      )
      .max(10)
      .refine((ds) => uniqueIds(ds.map((d) => d.die)), { message: 'Sorte de dé en double' })
      .optional(),
    bonus: z.number().int().min(-100).max(100).optional(),
  })
  .refine((a) => (a.dice?.length ?? 0) > 0 || a.bonus !== undefined, {
    message: 'Ajustement vide',
  });
export type RollAdjustments = z.input<typeof RollAdjustments>;

/**
 * Réponse d'un jet d'initiative individuel (`…/participants/:characterId/initiative` et
 * `…/initiative/dice`) : l'état du combat, et les dés à lancer s'il en reste (dés physiques).
 */
export const ParticipantInitiativeResult = z.object({
  combat: CombatState,
  pendingStep: RollStep.nullable(),
});
export type ParticipantInitiativeResult = z.infer<typeof ParticipantInitiativeResult>;

/**
 * `POST …/attacks/:attackId/dice` et `…/initiative/dice` : faces lues sur les dés 3D.
 * Un dé de l'étape absent des résultats (pas de forme 3D, au-delà de la limite, dé resté en
 * l'air) est tiré par le serveur : `results: []` fait tirer toute l'étape par le serveur, et
 * l'étape suivante (s'il y en a une) est rendue. `serverFallback` : tout le reste du jet aussi,
 * jusqu'au rapport (auteur parti, repli du MJ).
 */
export const SubmitRollDice = z.strictObject({
  stepId: z.string().min(1).max(100),
  results: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(100),
        /** Face lue : valeur du dé numérique, numéro de face déclarée (1 = première) sinon. */
        value: z.number().int().min(1).max(1000),
      }),
    )
    .max(ROLL_STEP_DICE_MAX)
    .refine((rs) => uniqueIds(rs.map((r) => r.id)), { message: 'Dé en double' }),
  serverFallback: z.boolean().optional(),
});
export type SubmitRollDice = z.input<typeof SubmitRollDice>;

// ─── Résultat d'une résolution ───────────────────────────────────────────────

/** Un dé numérique lancé : gardé ou écarté (`4d6k3`), relancé par explosion, et sa source. */
export const RolledDie = z.object({
  value: z.number().int(),
  kept: z.boolean(),
  exploded: z.boolean(),
  source: DieSource,
});
export type RolledDie = z.infer<typeof RolledDie>;

/** Groupe de dés numériques de même taille. */
export const RolledDiceGroup = z.object({ faces: z.number().int(), values: z.array(RolledDie) });
export type RolledDiceGroup = z.infer<typeof RolledDiceGroup>;

/** Côté d'où vient un effet : l'action elle-même, l'attaquant, ou la cible (défense active). */
export const EffectSide = z.enum(['action', 'actor', 'target']);
export type EffectSide = z.infer<typeof EffectSide>;

/** Bonus ajouté au total d'un jet numérique par un effet. */
export const RollBonus = z.object({
  source: z.string(),
  name: z.string(),
  value: z.number(),
  side: EffectSide,
});
export type RollBonus = z.infer<typeof RollBonus>;

/** Jet numérique (`1d20 + valeur(score)`), comparé par la formule de réussite du système. */
export const NumericRoll = z.object({
  kind: z.literal('numeric'),
  formula: z.string(),
  dice: z.array(RolledDiceGroup),
  /** Valeur de la formule, avant les bonus des effets. */
  value: z.number(),
  bonuses: z.array(RollBonus),
  total: z.number(),
  /** Somme des dés gardés seuls. */
  natural: z.number(),
});
export type NumericRoll = z.infer<typeof NumericRoll>;

/** Étape de construction d'un pool de dés à symboles. */
export const PoolStep = z.object({
  source: z.string(),
  name: z.string(),
  operation: z.enum(['add', 'upgrade', 'downgrade', 'remove']),
  die: z.string(),
  to: z.string().optional(),
  count: z.number().int(),
  side: EffectSide,
});
export type PoolStep = z.infer<typeof PoolStep>;

/** Un dé à symboles lancé : sa sorte, sa face et les symboles qu'elle porte. */
export const SymbolDieResult = z.object({
  die: z.string(),
  face: z.number().int(),
  symbols: z.record(z.string(), z.number()),
  source: DieSource,
});
export type SymbolDieResult = z.infer<typeof SymbolDieResult>;

/** Pool de dés à symboles : construction, dés lancés, symboles et résultats du système. */
export const SymbolRoll = z.object({
  kind: z.literal('symbols'),
  pool: z.array(z.object({ die: z.string(), count: z.number().int() })),
  construction: z.array(PoolStep),
  dice: z.array(SymbolDieResult),
  /** Total de chaque symbole déclaré. */
  symbols: z.record(z.string(), z.number()),
  /** Résultats déclarés par le système (succès nets…), par clé. */
  results: z.record(z.string(), z.number()),
});
export type SymbolRoll = z.infer<typeof SymbolRoll>;

export const AttackRoll = z.discriminatedUnion('kind', [NumericRoll, SymbolRoll]);
export type AttackRoll = z.infer<typeof AttackRoll>;

/** Issue d'une résolution : réussite (règle du système), critique, échec critique. */
export const AttackOutcome = z.object({
  success: z.boolean(),
  critical: z.boolean(),
  fumble: z.boolean(),
});
export type AttackOutcome = z.infer<typeof AttackOutcome>;

/** Résistance, immunité ou vulnérabilité de la cible appliquée à des dégâts typés. */
export const ResistanceLine = z.object({
  source: z.string(),
  name: z.string(),
  operation: z.enum(['cancel', 'multiply', 'reduce']),
  value: z.number(),
  /** Écartée : une résistance plus forte de la même famille s'applique. */
  ignored: z.boolean(),
});
export type ResistanceLine = z.infer<typeof ResistanceLine>;

const ModificationEntity = z.enum(['actor', 'target']);

const AttributeModificationFields = {
  kind: z.literal('attribute'),
  /** Attribut de base ou ressource du système (clé). */
  attribute: SystemRef,
  operation: z.enum(['add', 'subtract', 'set']),
  value: z.number().finite(),
  /** Type de dégâts du système, s'il y en a un. */
  damageType: SystemRef.optional(),
};

const EntryModificationFields = {
  kind: z.literal('entry'),
  /** Entrée du catalogue donnée ou retirée (état, blessure critique…). */
  entry: SystemRef,
  operation: z.enum(['give', 'remove']),
  /** Rangs d'une entrée à rangs, unités d'une sorte à quantités ; ignoré sinon. */
  ranks: z.number().int().min(0).max(100),
  /** Durée en rounds, décomptée en fin de round ; absente : jusqu'au retrait. */
  duration: z.number().int().min(1).max(10_000).optional(),
  /** Exemplaire visé (sorte à exemplaires). */
  instance: z.string().trim().min(1).max(100).optional(),
};

/**
 * Modification d'état proposée par la résolution (conséquence de l'action) : attribut
 * (dégâts, soins, stress…) ou entrée (état, blessure). `entity` : l'attaquant ou la cible.
 */
export const AttackModification = z.discriminatedUnion('kind', [
  z.object({
    ...AttributeModificationFields,
    entity: ModificationEntity,
    /** Dégâts avant les résistances de la cible (dégâts typés). */
    raw: z.number().optional(),
    resistances: z.array(ResistanceLine).optional(),
    /** Minimum qui a relevé les dégâts après les résistances (« au moins 1 DM »). */
    minimum: z.number().optional(),
  }),
  z.object({ ...EntryModificationFields, entity: ModificationEntity }),
]);
export type AttackModification = z.infer<typeof AttackModification>;

/**
 * Modification décidée par le MJ (valeur corrigée, moitié, état ajouté…) : le bloc où elle
 * est envoyée (cible ou attaquant) dit qui elle touche.
 */
export const AttackModificationInput = z.discriminatedUnion('kind', [
  z.strictObject(AttributeModificationFields),
  z.strictObject(EntryModificationFields),
]);
export type AttackModificationInput = z.input<typeof AttackModificationInput>;

/** Tirage sur une table du système (blessure critique…) fait pendant la résolution. */
export const AttackTableDraw = z.object({
  table: z.string(),
  name: z.string().optional(),
  modifier: z.number(),
  value: z.number(),
  dice: z.array(RolledDiceGroup),
  line: z
    .object({
      min: z.number().int(),
      max: z.number().int(),
      name: z.string(),
      description: z.string().optional(),
      /** Entrée donnée par la ligne (état, blessure). */
      entry: z.string().optional(),
    })
    .nullable(),
  /** Valeur hors de la table, ramenée à une ligne extrême. */
  outOfRange: z.boolean(),
});
export type AttackTableDraw = z.infer<typeof AttackTableDraw>;

/** Résultat complet d'une cible (MJ seul) : jet, issue, variables, conséquences, tables. */
export const AttackTargetResult = z.object({
  outcome: AttackOutcome,
  roll: AttackRoll,
  /** Toutes les variables de l'action, dans leur ordre de calcul (valeurs de la cible comprises). */
  variables: z.record(z.string(), ActionParamValue),
  modifications: z.array(AttackModification),
  tables: z.array(AttackTableDraw),
  /** Déroulé lisible de la résolution. */
  explanations: z.array(z.string()),
  /** Formules en échec, remplacées par une valeur par défaut. */
  errors: z.array(z.object({ where: z.string(), message: z.string() })),
});
export type AttackTargetResult = z.infer<typeof AttackTargetResult>;

/** Valeur montrée à l'attaquant (déclarée `visibilite: acteur` par le système : dégâts lancés…). */
export const AttackVisibleValue = z.object({
  key: z.string(),
  name: z.string().optional(),
  value: ActionParamValue,
});
export type AttackVisibleValue = z.infer<typeof AttackVisibleValue>;

/**
 * Ce que voit l'attaquant (joueur) : ses dés et leur total, l'issue, les valeurs que le système
 * lui montre. Les lignes venues de la cible sont anonymisées (« Défense de la cible »), ses
 * attributs et ses résistances n'y figurent jamais.
 */
export const AttackTargetView = z.object({
  outcome: AttackOutcome,
  roll: AttackRoll,
  values: z.array(AttackVisibleValue),
  explanations: z.array(z.string()),
});
export type AttackTargetView = z.infer<typeof AttackTargetView>;

/** Ce qui a été appliqué à une cible (ou à l'attaquant) par une décision du MJ. */
export const AttackAppliedTarget = z.object({
  applicationId: Id,
  modifications: z.array(AttackModification),
  /** Tables appliquées : l'entrée donnée (la ligne tirée, ou celle choisie par le MJ). */
  tables: z.array(z.object({ table: z.string(), entry: z.string().nullable() })),
  /** Appliqué à un autre personnage que la cible (MJ), valeurs inchangées. */
  redirectedTo: Id.nullable(),
  /** Le personnage touché est hors de combat après l'application (règle du système). */
  defeated: z.boolean(),
  appliedBy: Id,
  appliedAt: Timestamp,
});
export type AttackAppliedTarget = z.infer<typeof AttackAppliedTarget>;

/** Une cible d'une attaque. `result` et `applied` ne sont donnés qu'au MJ. */
export const AttackTarget = z.object({
  characterId: Id,
  status: AttackTargetStatus,
  decision: AttackDecision,
  /** Paramètres `par: cible` que cette cible peut choisir (défense active) ; vide : aucun. */
  reactionParams: z.array(z.string()).optional(),
  reaction: z
    .object({ params: ActionParams, skipped: z.boolean(), answeredBy: Id.nullable() })
    .nullable()
    .optional(),
  view: AttackTargetView.nullable().optional(),
  result: AttackTargetResult.nullable().optional(),
  applied: AttackAppliedTarget.nullable().optional(),
  /** Refus des règles pour cette cible (type d'entité, portée…). */
  error: z.string().nullable().optional(),
});
export type AttackTarget = z.infer<typeof AttackTarget>;

/**
 * Coûts de l'attaquant (stress, munitions, ressource dépensée) : proposés avec le rapport,
 * comptés une seule fois pour un jet commun. MJ seul.
 */
export const AttackActor = z.object({
  modifications: z.array(AttackModification),
  decision: AttackDecision,
  applied: AttackAppliedTarget.nullable().optional(),
});
export type AttackActor = z.infer<typeof AttackActor>;

/**
 * Attaque et son rapport. Vue d'un joueur (`redacted: true`) : `view` de chaque cible, sans
 * `result`, `applied` ni `actor` ; cibles qu'il ne voit pas retirées.
 */
export const Attack = z.object({
  id: Id,
  campaignId: Id,
  /** Combat en cours à la déclaration ; null : attaque hors combat. */
  combatId: Id.nullable(),
  round: z.number().int().nullable(),
  turn: z.number().int().nullable(),
  attackerId: Id,
  action: z.object({ id: z.string(), name: z.string() }),
  params: ActionParams,
  rollMode: AttackRollMode,
  dice: RollDiceMode,
  visibility: AttackVisibility,
  status: AttackStatus,
  /** Déclarée hors du tour de l'attaquant. */
  outOfTurn: z.boolean(),
  /** L'attaquant est aussi une cible (l'ancienne « auto-attaque »). */
  selfTarget: z.boolean(),
  origin: AttackOrigin.nullable().optional(),
  presetId: z.string().nullable().optional(),
  /** Ajustements libres du jet (hors règles), montrés au MJ et à l'auteur. */
  adjustments: z
    .object({
      dice: z.array(z.object({ die: z.string(), count: z.number().int() })).optional(),
      bonus: z.number().optional(),
    })
    .nullable()
    .optional(),
  targets: z.array(AttackTarget),
  actor: AttackActor.nullable().optional(),
  /**
   * Dés physiques à lancer maintenant, chaque étape par son lanceur (`roller`) ; vide sinon.
   * Une vue de joueur ne garde que les étapes qu'il doit lancer.
   */
  pendingSteps: z.array(RollStep),
  /**
   * Résolution en cours chez le serveur (réactions reçues, ou étape de dés envoyée) : ni dés
   * à lancer, ni rapport pour l'instant. Absent : faux.
   */
  resolving: z.boolean().optional(),
  /** Note du MJ sur sa décision. */
  note: z.string().nullable().optional(),
  createdBy: Id,
  createdAt: Timestamp,
  resolvedAt: Timestamp.nullable(),
  decidedAt: Timestamp.nullable(),
  version: z.number().int(),
  redacted: z.boolean(),
});
export type Attack = z.infer<typeof Attack>;

/** `GET …/attacks` : les plus récentes d'abord. */
export const AttackPage = z.object({ attacks: z.array(Attack), hasMore: z.boolean() });
export type AttackPage = z.infer<typeof AttackPage>;

// ─── Entrées : attaques ──────────────────────────────────────────────────────

/**
 * `POST …/attacks` : déclarer une attaque. L'action doit déclarer une cible (`cible`) ; ses
 * paramètres sont ceux de l'attaquant (les paramètres `par: cible` viennent des réactions).
 */
export const DeclareAttack = z.strictObject({
  attackerId: InputId('Identifiant de l’attaquant invalide'),
  action: SystemRef,
  params: ActionParams.optional(),
  targets: z
    .array(InputId('Identifiant de cible invalide'))
    .min(1)
    .max(ATTACK_TARGETS_MAX)
    .refine(uniqueIds, { message: 'Cible en double' }),
  rollMode: AttackRollMode.optional(),
  /** Défaut : `physical` si le combat le permet, sinon `server`. */
  dice: RollDiceMode.optional(),
  /** Défaut : `public`, ou `gm` pour le MJ si `gmRollsHidden`. */
  visibility: AttackVisibility.optional(),
  /** Attaque enregistrée du personnage d'où viennent l'action et ses paramètres. */
  presetId: z.string().trim().min(1).max(200).optional(),
  adjustments: RollAdjustments.optional(),
  origin: AttackOrigin.optional(),
});
export type DeclareAttack = z.input<typeof DeclareAttack>;

/** `POST …/attacks/batch` : plusieurs attaques d'un coup (PNJ à la suite). */
export const DeclareAttacks = z.strictObject({
  attacks: z.array(DeclareAttack).min(1).max(ATTACK_BATCH_MAX),
});
export type DeclareAttacks = z.input<typeof DeclareAttacks>;

/**
 * `POST …/attacks/:attackId/reactions` : défense active d'une cible (joueur qui l'incarne, ou
 * MJ). `skip` : aucune réaction (valeurs par défaut).
 */
export const AttackReaction = z
  .strictObject({
    characterId: InputId('Identifiant de cible invalide'),
    params: ActionParams.optional(),
    skip: z.boolean().optional(),
    version: ExpectedVersion.optional(),
  })
  .refine((v) => (v.params !== undefined) !== (v.skip === true), {
    message: 'Des paramètres, ou « skip », pas les deux',
  });
export type AttackReaction = z.input<typeof AttackReaction>;

/** `POST …/attacks/:attackId/cancel` : abandon avant la résolution (auteur ou MJ). */
export const CancelAttack = z.strictObject({ version: ExpectedVersion.optional() });
export type CancelAttack = z.input<typeof CancelAttack>;

/** Table tirée : appliquée ou non, avec la ligne tirée ou une autre entrée choisie par le MJ. */
export const AttackTableChoice = z.strictObject({
  table: SystemRef,
  apply: z.boolean(),
  entry: SystemRef.optional(),
});
export type AttackTableChoice = z.input<typeof AttackTableChoice>;

const ApplyAttackFields = {
  version: ExpectedVersion,
  targets: z
    .array(
      z.strictObject({
        characterId: InputId('Identifiant de cible invalide'),
        apply: z.boolean(),
        /** À la place de celles du rapport (valeurs corrigées) ; absentes : celles du rapport. */
        modifications: z.array(AttackModificationInput).max(ATTACK_MODIFICATIONS_MAX).optional(),
        /** Absentes : les tables tirées sont appliquées telles quelles. */
        tables: z.array(AttackTableChoice).max(10).optional(),
        /** Appliquer à un autre personnage engagé (MJ), valeurs inchangées. */
        redirectTo: InputId('Identifiant de personnage invalide').optional(),
      }),
    )
    .max(ATTACK_TARGETS_MAX)
    .refine((ts) => uniqueIds(ts.map((t) => t.characterId)), { message: 'Cible en double' }),
  actor: z
    .strictObject({
      apply: z.boolean(),
      modifications: z.array(AttackModificationInput).max(ATTACK_MODIFICATIONS_MAX).optional(),
    })
    .optional(),
  note: z.string().trim().max(ATTACK_NOTE_MAX).optional(),
};
const decidesSomething = (v: { targets: readonly unknown[]; actor?: unknown }) =>
  v.targets.length > 0 || v.actor !== undefined;

/**
 * `POST …/attacks/:attackId/apply` (MJ) : décision par cible (appliquer, ne pas appliquer,
 * appliquer autre chose) et pour les coûts de l'attaquant. Les dés ne sont jamais relancés :
 * ce sont les modifications du rapport, ou celles corrigées ici, qui sont appliquées. Les
 * cibles absentes restent en attente.
 */
export const ApplyAttack = z
  .strictObject(ApplyAttackFields)
  .refine(decidesSomething, { message: 'Aucune décision' });
export type ApplyAttack = z.input<typeof ApplyAttack>;

/** `POST …/attacks/apply` (MJ) : « Tout appliquer », une décision par rapport. */
export const ApplyAttacks = z.strictObject({
  items: z
    .array(
      z
        .strictObject({ attackId: InputId('Identifiant d’attaque invalide'), ...ApplyAttackFields })
        .refine(decidesSomething, { message: 'Aucune décision' }),
    )
    .min(1)
    .max(ATTACK_APPLY_BATCH_MAX)
    .refine((items) => uniqueIds(items.map((i) => i.attackId)), { message: 'Rapport en double' }),
});
export type ApplyAttacks = z.input<typeof ApplyAttacks>;

/** `POST …/attacks/:attackId/dismiss` (MJ) : rien n'est appliqué. */
export const DismissAttack = z.strictObject({
  version: ExpectedVersion,
  note: z.string().trim().max(ATTACK_NOTE_MAX).optional(),
});
export type DismissAttack = z.input<typeof DismissAttack>;

/**
 * `POST …/attacks/:attackId/revert` (MJ) : annule l'application (valeurs d'avant rendues).
 * Refus 409 `revert_conflict` si une valeur a changé depuis ; `force` la rend quand même.
 */
export const RevertAttack = z.strictObject({
  version: ExpectedVersion,
  /** Seulement ces cibles ; absent : toute l'application. */
  targets: z.array(InputId('Identifiant de cible invalide')).max(ATTACK_TARGETS_MAX).optional(),
  actor: z.boolean().optional(),
  force: z.boolean().optional(),
});
export type RevertAttack = z.input<typeof RevertAttack>;

/**
 * `POST …/attacks/:attackId/override` (MJ) : corriger l'issue d'une cible (« c'est un
 * critique ») sans relancer les dés du jet ; les dés en plus (dégâts du critique) suivent le
 * mode `dice` (serveur par défaut).
 */
export const OverrideAttackOutcome = z.strictObject({
  version: ExpectedVersion,
  targets: z
    .array(
      z
        .strictObject({
          characterId: InputId('Identifiant de cible invalide'),
          success: z.boolean().optional(),
          critical: z.boolean().optional(),
        })
        .refine((t) => t.success !== undefined || t.critical !== undefined, {
          message: 'Issue à corriger',
        }),
    )
    .min(1)
    .max(ATTACK_TARGETS_MAX),
  dice: RollDiceMode.optional(),
});
export type OverrideAttackOutcome = z.input<typeof OverrideAttackOutcome>;

/** `GET …/attacks` : filtres (chaîne de requête). */
export const ListAttacksQuery = z.object({
  /** `open` : en cours (réactions, dés) ; `pending` : à décider ; `decided` ; `all` (défaut). */
  status: z.enum(['open', 'pending', 'decided', 'all']).optional(),
  combatId: InputId().optional(),
  attackerId: InputId().optional(),
  /** Page suivante : attaques plus anciennes que celle-ci. */
  before: InputId().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ListAttacksQuery = z.input<typeof ListAttacksQuery>;

// ─── Événements (outbox, sujet vtt.<campaignId>.combat.<action>) ─────────────

/** `combat.started` (existant, public). */
export const CombatStartedPayload = z.object({
  mode: CombatMode,
  participants: z.array(Id),
  round: z.number().int(),
});
export type CombatStartedPayload = z.infer<typeof CombatStartedPayload>;

/**
 * `combat.turn_changed` : public, sauf `order`, `added` et `removed`, qui ne partent qu'aux MJ
 * (un second événement de même version, sans eux, part aux joueurs).
 */
export const CombatTurnChangedPayload = z.object({
  reason: CombatTurnReason,
  round: z.number().int(),
  currentIndex: z.number().int(),
  version: z.number().int(),
  acted: Id.nullable().optional(),
  currentActorId: Id.nullable().optional(),
  turn: z.number().int().optional(),
  order: z.array(z.object({ characterId: Id, sortKeys: z.array(z.number()) })).optional(),
  added: z.array(Id).optional(),
  removed: z.array(Id).optional(),
});
export type CombatTurnChangedPayload = z.infer<typeof CombatTurnChangedPayload>;

/** `combat.ended` (existant, public). */
export const CombatEndedPayload = z.object({ round: z.number().int() });
export type CombatEndedPayload = z.infer<typeof CombatEndedPayload>;

/** `combat.settings_updated` (public). */
export const CombatSettingsUpdatedPayload = z.object({
  settings: CombatSettings,
  version: z.number().int(),
});
export type CombatSettingsUpdatedPayload = z.infer<typeof CombatSettingsUpdatedPayload>;

/** `combat.participant_defeated` (MJ seul) : hors de combat après une application. */
export const CombatParticipantDefeatedPayload = z.object({
  characterId: Id,
  attackId: Id.nullable(),
  version: z.number().int(),
});
export type CombatParticipantDefeatedPayload = z.infer<typeof CombatParticipantDefeatedPayload>;

/** Étape du cycle de vie signalée par `combat.attack_updated`. */
export const AttackChange = z.enum([
  'declared',
  'reaction_requested',
  'reaction_received',
  'dice_requested',
  /** Une étape de dés a été lancée ; la suivante attend (issue de l'étape visible). */
  'dice_rolled',
  'resolved',
  'failed',
  'cancelled',
  'decided',
  'reverted',
]);
export type AttackChange = z.infer<typeof AttackChange>;

/**
 * `combat.attack_updated` : signal sans contenu (MJ, plus `visibleToUsers` : l'auteur et les
 * joueurs dont une cible doit réagir). Le client relit l'attaque (REST), filtrée pour lui.
 */
export const AttackUpdatedPayload = z.object({
  attackId: Id,
  change: AttackChange,
  status: AttackStatus,
  version: z.number().int(),
});
export type AttackUpdatedPayload = z.infer<typeof AttackUpdatedPayload>;

/** `combat.attack_resolved` (MJ seul) : le rapport complet, pour la chronique du MJ. */
export const AttackResolvedPayload = z.object({ attack: Attack });
export type AttackResolvedPayload = z.infer<typeof AttackResolvedPayload>;

/**
 * `combat.attack_announced` (public ; jamais pour une attaque `private` ou `gm`) : qui attaque
 * qui, et l'issue. Un attaquant ou une cible caché aux joueurs n'y figure pas (attaquant null).
 */
export const AttackAnnouncedPayload = z.object({
  attackId: Id,
  version: z.number().int(),
  attackerId: Id.nullable(),
  action: z.object({ id: z.string(), name: z.string() }),
  targets: z.array(z.object({ characterId: Id, outcome: AttackOutcome })),
});
export type AttackAnnouncedPayload = z.infer<typeof AttackAnnouncedPayload>;

/** `combat.attack_decided` (MJ seul) : décision complète (appliqué, corrigé, écarté). */
export const AttackDecidedPayload = z.object({
  attackId: Id,
  version: z.number().int(),
  /** Null pour un rapport écarté sans application. */
  applicationId: Id.nullable(),
  targets: z.array(
    z.object({
      characterId: Id,
      decision: AttackDecision,
      applied: AttackAppliedTarget.nullable(),
    }),
  ),
  actor: AttackActor.nullable().optional(),
  note: z.string().nullable().optional(),
});
export type AttackDecidedPayload = z.infer<typeof AttackDecidedPayload>;

/**
 * `combat.attack_concluded` (public, pour une attaque `public`) : la décision, sans rien de la
 * cible ; les montants appliqués ne sont donnés que pour les personnages du camp des joueurs.
 */
export const AttackConcludedPayload = z.object({
  attackId: Id,
  version: z.number().int(),
  attackerId: Id.nullable(),
  targets: z.array(
    z.object({
      characterId: Id,
      decision: AttackDecision,
      amounts: z
        .array(
          z.object({
            attribute: z.string(),
            value: z.number(),
            damageType: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
});
export type AttackConcludedPayload = z.infer<typeof AttackConcludedPayload>;

/** `combat.attack_reverted` (MJ seul) : application annulée. */
export const AttackRevertedPayload = z.object({
  attackId: Id,
  applicationId: Id,
  version: z.number().int(),
  targetIds: z.array(Id),
  actor: z.boolean(),
  forced: z.boolean(),
});
export type AttackRevertedPayload = z.infer<typeof AttackRevertedPayload>;

/** Charge de chaque événement du combat (agrégat `combat` ou `attack`). */
export const CombatEventPayloads = {
  'combat.started': CombatStartedPayload,
  'combat.turn_changed': CombatTurnChangedPayload,
  'combat.ended': CombatEndedPayload,
  'combat.settings_updated': CombatSettingsUpdatedPayload,
  'combat.participant_defeated': CombatParticipantDefeatedPayload,
  'combat.attack_updated': AttackUpdatedPayload,
  'combat.attack_resolved': AttackResolvedPayload,
  'combat.attack_announced': AttackAnnouncedPayload,
  'combat.attack_decided': AttackDecidedPayload,
  'combat.attack_concluded': AttackConcludedPayload,
  'combat.attack_reverted': AttackRevertedPayload,
} as const;
export type CombatEventType = keyof typeof CombatEventPayloads;
export type CombatEventPayload<T extends CombatEventType> = z.infer<
  (typeof CombatEventPayloads)[T]
>;

// ─── Direct (canal éphémère du service realtime) ─────────────────────────────

/** Visée en cours : l'attaquant choisit ses cibles sur la carte (MJ seulement). */
export const COMBAT_AIM_KIND = 'combat.aim';

/**
 * `combat.aim` : attaquant et cibles pendant le choix, envoyé aux MJ (`gmOnly`) à chaque
 * changement, puis `end` à la déclaration ou à l'abandon. Relayé, jamais stocké.
 */
export const CombatAimMessage = z.object({
  /** Attaquant. */
  a: z.string().max(64),
  /** Cibles choisies. */
  t: z.array(z.string().max(64)).max(ATTACK_TARGETS_MAX),
  end: z.literal(true).optional(),
});
export type CombatAimMessage = z.infer<typeof CombatAimMessage>;
