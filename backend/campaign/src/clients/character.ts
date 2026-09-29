/**
 * Appels de campaign au service character, par ses routes /internal (secret
 * partagé INTERNAL_API_SECRET, jamais relayées par la gateway) :
 *  - résumé d'un personnage (propriétaire, système) avant de l'engager ;
 *  - action d'initiative d'un participant (clés de tri renvoyées) ;
 *  - décompte des durées en fin de round ;
 *  - instances de PNJ posées sur la carte (création, suppression) et butin d'un objet.
 *
 * Le contrat de ces routes appartient à character (champs en français) : ce
 * client le traduit en types anglais pour le reste du service.
 */
import { HttpError } from '@vtt/platform';
import { z } from 'zod';
import { INTERNAL_SECRET_HEADER } from '../internal/secret.js';

const TIMEOUT_MS = 5_000;

const SummaryResponse = z.object({
  id: z.string(),
  ownerId: z.string(),
  nom: z.string(),
  avatarUrl: z.string().nullable(),
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
});

export interface DurationsTick {
  changed: boolean;
  /** Entrées (états temporaires) arrivées à expiration. */
  expired: string[];
  version: number;
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
    body: { params?: Record<string, unknown>; apply?: boolean },
    origin?: CallOrigin,
  ): Promise<PlayedAction>;
  tickDurations(id: string, origin?: CallOrigin): Promise<DurationsTick>;
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
      const problem = (await res.json().catch(() => ({}))) as { detail?: string; code?: string };
      throw new CharacterError(
        res.status,
        problem.detail ?? `character a répondu ${res.status}`,
        problem.code,
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
          ...originBody(origin),
        },
      );
      return { result: r.resultat, ...(r.cles ? { sortKeys: r.cles } : {}) };
    },
    async tickDurations(characterId, origin) {
      const r = await request(
        'POST',
        `/internal/characters/${id(characterId)}/durees/decompter`,
        DurationsResponse,
        origin,
        originBody(origin),
      );
      return { changed: r.modifie, expired: r.retirees, version: r.version };
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
