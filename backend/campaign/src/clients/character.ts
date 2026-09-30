/**
 * Appels de campaign au service character, par ses routes /internal (secret
 * partagé INTERNAL_API_SECRET, jamais relayées par la gateway) :
 *  - résumé d'un personnage (propriétaire, système) avant de l'engager ;
 *  - action d'initiative d'un participant (clés de tri renvoyées ; jet caché pour un PNJ) ;
 *  - décompte des durées en fin de round (idempotent par `tickId`, annulable) ;
 *  - attaques (docs/combat.md § 11.2) : préparer, résoudre, appliquer les décisions du MJ,
 *    annuler une application ;
 *  - instances de PNJ posées sur la carte (création, suppression) et butin d'un objet.
 *
 * Le contrat de ces routes appartient à character (champs en français) : ce
 * client le traduit en types anglais pour le reste du service.
 */
import {
  type AttackCombatContext,
  AttackModification,
  AttackTargetResult,
  AttackTargetView,
  Change,
  RollStep,
  type ActionParams,
  type AttackModificationInput,
  type AttackRollMode,
  type AttackVisibility,
  type RollAdjustments,
  type RollDiceMode,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { z } from 'zod';
import { INTERNAL_SECRET_HEADER } from '../internal/secret.js';

const TIMEOUT_MS = 5_000;

const SummaryResponse = z.object({
  id: z.string(),
  ownerId: z.string(),
  nom: z.string(),
  avatarUrl: z.string().nullable(),
  /** Token du Studio du portrait ; absent des anciennes versions de character. */
  tokenUrl: z.string().nullable().default(null),
  systeme: z.object({ id: z.string(), version: z.string() }),
  type: z.string(),
  /** Personnage joueur ou PNJ ; absent des anciennes versions de character : inconnu. */
  kind: z.enum(['pc', 'npc']).nullable().default(null),
  /**
   * Création en cours (`etat.creation` de character) : le personnage vient
   * d'être créé et sa fiche n'est pas terminée. Absent des anciennes versions
   * de character : vaut alors false.
   */
  creation: z.boolean().default(false),
  /** Résumé des listes (entrées uniques, valeurs clés) ; absent des anciennes versions. */
  summary: z
    .object({
      tagline: z.string(),
      highlights: z.array(z.object({ label: z.string(), value: z.string() })),
    })
    .nullable()
    .default(null),
});

/** Résumé d'un personnage pour les listes : « Elfe · Magicien », « Niveau 3 »… */
export interface CharacterListSummary {
  tagline: string;
  highlights: { label: string; value: string }[];
}

export interface CharacterSummary {
  id: string;
  ownerId: string;
  name: string;
  avatarUrl: string | null;
  /** Token du Studio du portrait ; null : le portrait sert de token. */
  tokenUrl: string | null;
  system: { id: string; version: string };
  type: string;
  /** Personnage joueur (`pc`) ou PNJ (`npc`) ; null si character ne le dit pas. */
  kind: CharacterKind | null;
  inCreation: boolean;
  summary: CharacterListSummary | null;
}

export type CharacterKind = 'pc' | 'npc';

const ActionResponse = z.object({ resultat: z.unknown(), cles: z.array(z.number()).optional() });

export interface PlayedAction {
  result: unknown;
  sortKeys?: number[];
}

const DurationsResponse = z.object({
  modifie: z.boolean(),
  retirees: z.array(z.string()),
  version: z.number(),
  replayed: z.boolean().optional(),
});

export interface DurationsTick {
  changed: boolean;
  /** Entrées (états temporaires) arrivées à expiration. */
  expired: string[];
  version: number;
  /** Même `tickId` déjà décompté : réponse d'origine, rien de plus. */
  replayed: boolean;
}

// ─── Attaques (docs/combat.md § 11.2, forme fixée par le lot 2) ─────────────

/** Jet transmis à l'historique des dés (service dice) par character. */
export interface DiceHistory {
  campaignId: string;
  authorId: string;
  visibility: AttackVisibility;
}

/**
 * Résultat d'une cible ; `awaiting_dice` : des dés lui restent à lancer, `result` et `view`
 * portent ce qui est déjà exact (le jet et son issue), ou null avant le jet.
 */
const ResolutionTarget = z.object({
  characterId: z.string(),
  status: z.enum(['resolved', 'failed', 'awaiting_dice']),
  error: z.string().nullable().default(null),
  result: AttackTargetResult.nullable().default(null),
  view: AttackTargetView.nullable().default(null),
});

const ActionResolution = z.object({
  targets: z.array(ResolutionTarget),
  actor: z.object({ modifications: z.array(AttackModification) }).default({ modifications: [] }),
});
/** Résultats d'une attaque, cible par cible, et coûts de l'attaquant (comptés une fois). */
export type ActionResolution = z.infer<typeof ActionResolution>;

const PrepareResponse = z.object({
  snapshot: z.unknown(),
  action: z.object({ id: z.string(), name: z.string() }),
  rollMode: z.enum(['per_target', 'shared']),
  dice: z.enum(['physical', 'server']).default('server'),
  targets: z.array(
    z.object({
      characterId: z.string(),
      error: z.string().nullable().default(null),
      reactionParams: z.array(z.string()).default([]),
    }),
  ),
  step: RollStep.nullable().default(null),
  resolution: ActionResolution.nullable().default(null),
});
export type PreparedAction = z.infer<typeof PrepareResponse>;

export interface PrepareInput {
  actorId: string;
  action: string;
  params?: ActionParams;
  targetIds: string[];
  rollMode?: AttackRollMode;
  adjustments?: RollAdjustments;
  dice?: RollDiceMode;
  userId: string;
  campaignId: string;
  diceHistory?: DiceHistory;
  /** Contexte du combat figé à la déclaration (`@combat.*`), sans l'attaque en cours. */
  combat?: AttackCombatContext;
}

/** Face connue d'un dé d'une attaque : lue sur un dé 3D ou tirée par le serveur. */
const KnownFace = z.object({
  id: z.string(),
  value: z.number().int(),
  source: z.enum(['physical', 'server']).optional(),
});
export type KnownFace = z.infer<typeof KnownFace>;

const ResolveResponse = z.object({
  /** Étape de dés suivante ; null : `resolution` est complète. */
  step: RollStep.nullable().default(null),
  resolution: ActionResolution.nullable().default(null),
  /** Faces connues après cet appel, à garder pour l'appel suivant. */
  faces: z.array(KnownFace).default([]),
});
export type ResolvedAction = z.infer<typeof ResolveResponse>;

export interface ResolveInput {
  snapshot: unknown;
  params?: ActionParams;
  rollMode: AttackRollMode;
  adjustments?: RollAdjustments;
  dice?: RollDiceMode;
  reactions?: { characterId: string; params?: ActionParams; skipped?: boolean }[];
  /** Faces des étapes passées. */
  faces?: KnownFace[];
  /** Étape soumise : ses dés absents de `results` sont tirés par character. */
  step?: RollStep;
  /** Faces lues sur les dés 3D pour cette étape. */
  results?: { id: string; value: number }[];
  /** Paramètres que l'étape demande (`step.params` : l'arme, une fois une cible touchée). */
  stepParams?: ActionParams;
  /** Tout le reste est tiré par character, jusqu'aux résultats. */
  serverFallback?: boolean;
  diceHistory?: DiceHistory;
}

/** Jet d'une attaque calculée par le navigateur, pour l'historique des dés. */
export interface AttackRollsInput {
  campaignId: string;
  authorId: string;
  characterId: string;
  visibility: AttackVisibility;
  action: string;
  rollMode: AttackRollMode;
  views: AttackTargetView[];
}

/** Modifications décidées pour une fiche, et tables appliquées (entrée de la ligne). */
export interface ApplicationItem {
  characterId: string;
  modifications: AttackModificationInput[];
  tables?: { table: string; entry: string | null }[];
}

export interface ApplicationInput {
  applicationId: string;
  userId?: string;
  campaignId: string;
  items: ApplicationItem[];
}

const AppliedItem = z.object({
  characterId: z.string(),
  version: z.number(),
  changes: z.array(Change).default([]),
  defeated: z.boolean().default(false),
});

const ApplyResponse = z.object({
  applications: z.array(
    z.object({
      applicationId: z.string(),
      replayed: z.boolean().default(false),
      items: z.array(AppliedItem),
    }),
  ),
});
export type AppliedModifications = z.infer<typeof ApplyResponse>;

const RevertResponse = z.object({
  applicationId: z.string(),
  items: z.array(
    z.object({
      characterId: z.string(),
      status: z.enum(['reverted', 'already_reverted', 'missing']),
      version: z.number().nullable().optional(),
      changes: z.array(Change).default([]),
      defeated: z.boolean().optional(),
    }),
  ),
});
export type RevertedModifications = z.infer<typeof RevertResponse>;

/** Chemins en conflit d'une annulation refusée (409 `revert_conflict`). */
export interface RevertConflict {
  characterId: string;
  paths: string[];
}

/** Origine d'un appel : MJ déclencheur, campagne, corrélation (reprise dans les événements). */
export interface CallOrigin {
  userId?: string;
  campaignId?: string;
  correlationId?: string;
}

/** Refus de character (4xx) ou panne (status 0 : injoignable, 5xx). */
export class CharacterError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    /** Corps du problème renvoyé par character (`errors`, `conflicts`…). */
    public readonly problem: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CharacterError';
  }
  get rejected() {
    return this.status >= 400 && this.status < 500;
  }
}

const NpcsResponse = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      nom: z.string(),
      avatarUrl: z.string().nullable(),
      tokenUrl: z.string().nullable(),
      templateId: z.string().nullable(),
    }),
  ),
});

/** Instance de PNJ créée par character pour la carte. */
export interface NpcInstance {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Image du token (modèle) ; null : l'avatar. */
  tokenUrl: string | null;
  templateId: string | null;
}

/** Origine d'une instance : modèle, bestiaire, création rapide ou copie d'une instance. */
export type NpcSourceInput =
  | { templateId: string }
  | { bestiary: { systemeId: string; key: string } }
  | {
      quick: {
        name: string;
        imageUrl?: string | null;
        type: string;
        valeurs?: Record<string, number | string | boolean>;
      };
    }
  | { characterId: string };

const ReceiveResponse = z.object({
  version: z.number(),
  entree: z.string(),
  exemplaire: z.string().optional(),
});

export interface CharacterClient {
  /** Résumé d'un personnage actif ; `null` s'il n'existe pas (ou plus). */
  summary(id: string, origin?: CallOrigin): Promise<CharacterSummary | null>;
  action(
    id: string,
    action: string,
    body: {
      params?: Record<string, unknown>;
      apply?: boolean;
      /** Visibilité du jet dans l'historique des dés (PNJ : `gm`). */
      visibility?: AttackVisibility;
    },
    origin?: CallOrigin,
  ): Promise<PlayedAction>;
  /**
   * Décompte des durées ; `tickId` : une seule fois par passage (idempotent, annulable) ;
   * `clear` : tout ce qui a une durée est retiré (fin de combat).
   */
  tickDurations(
    id: string,
    origin?: CallOrigin,
    tickId?: string,
    options?: { clear?: boolean },
  ): Promise<DurationsTick>;
  /** Vérifie une attaque, fige l'instantané, propose les réactions (ou résout tout de suite). */
  prepareAction(input: PrepareInput, origin?: CallOrigin): Promise<PreparedAction>;
  /** Résout (ou avance d'une étape de dés) une attaque préparée. */
  resolveAction(input: ResolveInput, origin?: CallOrigin): Promise<ResolvedAction>;
  /**
   * Jet d'une attaque calculée par le navigateur de l'attaquant, relayé par character à
   * l'historique des dés depuis les vues de l'attaquant (jamais le rapport complet).
   */
  forwardAttackRolls(input: AttackRollsInput, origin?: CallOrigin): Promise<void>;
  /** Applique des décisions, sans aucun dé ; une transaction, idempotent par applicationId. */
  applyModifications(
    applications: ApplicationInput[],
    origin?: CallOrigin,
  ): Promise<AppliedModifications>;
  /** Rend les valeurs d'avant une application (ou un décompte : `applicationId = tickId`). */
  revertModifications(
    input: { applicationId: string; characterIds?: string[]; force?: boolean; userId?: string },
    origin?: CallOrigin,
  ): Promise<RevertedModifications>;
  /** Crée `count` personnages PNJ du MJ (`origin.userId`) pour la campagne (`origin.campaignId`). */
  createNpcs(
    input: { systemId: string; count: number; source: NpcSourceInput },
    origin: Required<Pick<CallOrigin, 'userId' | 'campaignId'>> & CallOrigin,
  ): Promise<NpcInstance[]>;
  /** Supprime des instances de PNJ (compensation, suppression avec le token) ; renvoie les supprimées. */
  deleteNpcs(
    ids: string[],
    origin: Required<Pick<CallOrigin, 'userId' | 'campaignId'>> & CallOrigin,
  ): Promise<string[]>;
  /** Ajoute à l'inventaire d'un personnage un objet pris sur la carte. */
  receiveItem(
    characterId: string,
    body: {
      item: { ref?: string; name: string; description?: string; quantity: number };
      playerId: string | null;
    },
    origin: Required<Pick<CallOrigin, 'userId' | 'campaignId'>> & CallOrigin,
  ): Promise<{ version: number; entree: string; exemplaire?: string }>;
}

/** Sans CHARACTER_URL ou sans secret : toute demande répond 503. */
export const characterUnavailable: CharacterClient = {
  summary: async () => {
    throw unavailable();
  },
  action: async () => {
    throw unavailable();
  },
  tickDurations: async () => {
    throw unavailable();
  },
  prepareAction: async () => {
    throw unavailable();
  },
  resolveAction: async () => {
    throw unavailable();
  },
  forwardAttackRolls: async () => {
    throw unavailable();
  },
  applyModifications: async () => {
    throw unavailable();
  },
  revertModifications: async () => {
    throw unavailable();
  },
  createNpcs: async () => {
    throw unavailable();
  },
  deleteNpcs: async () => {
    throw unavailable();
  },
  receiveItem: async () => {
    throw unavailable();
  },
};

function unavailable() {
  return new HttpError(
    503,
    'Service indisponible',
    'character_unavailable',
    'Le service des personnages n’est pas configuré',
  );
}

export function characterClient(o: {
  url: string;
  secret: string;
  fetch?: typeof globalThis.fetch;
}): CharacterClient {
  const doFetch = o.fetch ?? globalThis.fetch;

  async function request<S extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    origin: CallOrigin | undefined,
    body?: object,
  ): Promise<z.output<S>> {
    let res: Response;
    try {
      res = await doFetch(new URL(path, o.url), {
        method,
        headers: {
          [INTERNAL_SECRET_HEADER]: o.secret,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(origin?.correlationId ? { 'x-correlation-id': origin.correlationId } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new CharacterError(0, `character injoignable : ${(e as Error).message}`);
    }
    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new CharacterError(
        res.status,
        typeof problem.detail === 'string' ? problem.detail : `character a répondu ${res.status}`,
        typeof problem.code === 'string' ? problem.code : undefined,
        problem,
      );
    }
    return schema.parse(await res.json());
  }

  // `roomId` : nom du champ dans le contrat de character (enveloppe d'événement commune)
  const originBody = (origin?: CallOrigin) => ({
    ...(origin?.userId ? { userId: origin.userId } : {}),
    ...(origin?.campaignId ? { roomId: origin.campaignId } : {}),
  });
  const id = (v: string) => encodeURIComponent(v);

  return {
    async summary(characterId, origin) {
      try {
        const r = await request(
          'GET',
          `/internal/characters/${id(characterId)}`,
          SummaryResponse,
          origin,
        );
        return {
          id: r.id,
          ownerId: r.ownerId,
          name: r.nom,
          avatarUrl: r.avatarUrl,
          tokenUrl: r.tokenUrl,
          system: r.systeme,
          type: r.type,
          kind: r.kind,
          inCreation: r.creation,
          summary: r.summary,
        };
      } catch (e) {
        if (e instanceof CharacterError && e.status === 404) return null;
        throw e;
      }
    },
    async action(characterId, action, body, origin) {
      const r = await request(
        'POST',
        `/internal/characters/${id(characterId)}/actions/${id(action)}`,
        ActionResponse,
        origin,
        {
          ...(body.apply !== undefined ? { appliquer: body.apply } : {}),
          ...(body.params ? { parametres: body.params } : {}),
          ...(body.visibility ? { visibility: body.visibility } : {}),
          ...originBody(origin),
        },
      );
      return { result: r.resultat, ...(r.cles ? { sortKeys: r.cles } : {}) };
    },
    async tickDurations(characterId, origin, tickId, options) {
      const r = await request(
        'POST',
        `/internal/characters/${id(characterId)}/durees/decompter`,
        DurationsResponse,
        origin,
        {
          ...originBody(origin),
          ...(tickId ? { tickId } : {}),
          ...(options?.clear ? { clear: true } : {}),
        },
      );
      return {
        changed: r.modifie,
        expired: r.retirees,
        version: r.version,
        replayed: r.replayed ?? false,
      };
    },
    prepareAction(input, origin) {
      return request('POST', '/internal/actions/prepare', PrepareResponse, origin, input);
    },
    resolveAction(input, origin) {
      return request('POST', '/internal/actions/resolve', ResolveResponse, origin, input);
    },
    async forwardAttackRolls(input, origin) {
      await request('POST', '/internal/actions/rolls', z.unknown(), origin, input);
    },
    applyModifications(applications, origin) {
      return request('POST', '/internal/modifications/apply', ApplyResponse, origin, {
        applications,
      });
    },
    revertModifications(input, origin) {
      return request('POST', '/internal/modifications/revert', RevertResponse, origin, input);
    },
    async createNpcs(input, origin) {
      const r = await request('POST', '/internal/npcs', NpcsResponse, origin, {
        ownerId: origin.userId,
        campaignId: origin.campaignId,
        ...input,
      });
      return r.items.map((c) => ({
        id: c.id,
        name: c.nom,
        avatarUrl: c.avatarUrl,
        tokenUrl: c.tokenUrl,
        templateId: c.templateId,
      }));
    },
    async deleteNpcs(ids, origin) {
      const r = await request(
        'POST',
        '/internal/npcs/delete',
        z.object({ deleted: z.array(z.string()) }),
        origin,
        { ids, userId: origin.userId, roomId: origin.campaignId },
      );
      return r.deleted;
    },
    async receiveItem(characterId, body, origin) {
      return request(
        'POST',
        `/internal/characters/${id(characterId)}/possessions/receive`,
        ReceiveResponse,
        origin,
        { ...body, userId: origin.userId, roomId: origin.campaignId },
      );
    },
  };
}
