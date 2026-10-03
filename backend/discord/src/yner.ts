/**
 * Appels aux services Yner au nom du joueur. Le bot n'a aucun droit propre : identity lui
 * remet un jeton de 60 s pour le compte lié à l'identifiant Discord, puis chaque service
 * applique ses contrôles habituels (appartenance, visibilité, limites de débit).
 */
import { z } from 'zod';

const TIMEOUT_MS = 8_000;

/** Échec d'un service, avec son code d'erreur RFC 9457 s'il en donne un. */
export class YnerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | undefined,
    public readonly detail: string | undefined,
  ) {
    super(`yner : ${status}${code ? ` ${code}` : ''}`);
    this.name = 'YnerError';
  }
}

export const Campaign = z.object({
  id: z.string(),
  name: z.string(),
  system: z.object({ id: z.string() }),
  role: z.enum(['gm', 'player', 'spectator']).or(z.string()),
  playedCharacterId: z.string().nullable(),
});
export type Campaign = z.infer<typeof Campaign>;

const SymbolDie = z.object({ id: z.string(), nom: z.string() });
const NumericDie = z.object({ couleur: z.string().optional() });

export const GameSystem = z.object({
  systeme: z.object({
    nom: z.string(),
    des: z.object({ sortes: z.array(SymbolDie).optional() }).nullish(),
  }),
  presentation: z.object({
    des: z
      .object({
        sortes: z.record(z.string(), NumericDie.extend({ court: z.string().optional() })),
      })
      .optional(),
  }),
});
export type GameSystem = z.infer<typeof GameSystem>;

export const Roll = z.object({
  id: z.string(),
  userName: z.string(),
  total: z.number().nullable(),
  output: z.string(),
  symbolResult: z.string().nullable(),
  notation: z.string().nullable(),
  visibility: z.string(),
  label: z.string().nullable(),
  outcome: z.object({ critical: z.boolean().optional(), fumble: z.boolean().optional() }).nullish(),
  timestamp: z.number(),
});
export type Roll = z.infer<typeof Roll>;

export const PlayerStats = z.object({
  userName: z.string(),
  totalRolls: z.number(),
  averageRoll: z.number(),
  highestRoll: z.number().nullable(),
  lowestRoll: z.number().nullable(),
  criticalSuccesses: z.number(),
  criticalFailures: z.number(),
});
const Stats = z.object({ rollCount: z.number(), players: z.array(PlayerStats) });
export type Stats = z.infer<typeof Stats>;

export const Me = z.object({ name: z.string(), email: z.string().nullable() });
export type Me = z.infer<typeof Me>;

export interface RollInput {
  campaignId: string;
  systemId: string;
  characterId: string | null;
  notation?: string;
  pool?: { de: string; nombre: number }[];
  hidden: boolean;
}

/** Ce que le bot demande aux services, pour un joueur donné (par son jeton délégué). */
export interface YnerClient {
  /** Jeton délégué ; null si aucun compte n'est lié à cet identifiant Discord. */
  delegate(discordUserId: string): Promise<string | null>;
  /** Compte Yner lié (nom, e-mail). */
  me(token: string): Promise<Me>;
  myCampaigns(token: string): Promise<Campaign[]>;
  activeCampaign(token: string): Promise<Campaign | null>;
  setActiveCampaign(token: string, campaignId: string): Promise<Campaign | null>;
  roll(token: string, input: RollInput): Promise<Roll>;
  rolls(token: string, campaignId: string, limit: number): Promise<Roll[]>;
  stats(token: string, campaignId: string): Promise<Stats>;
  unlink(token: string): Promise<'unlinked' | 'not_linked' | 'last_login_method'>;
  /** Système de jeu, public (mis en cache). */
  gameSystem(systemId: string): Promise<GameSystem | null>;
}

export interface YnerUrls {
  identity: string;
  campaign: string;
  dice: string;
  character: string;
  internalSecret: string;
  fetch?: typeof fetch;
}

const SYSTEM_CACHE_MS = 5 * 60_000;

export function ynerClient(o: YnerUrls): YnerClient {
  const doFetch = o.fetch ?? fetch;
  const systems = new Map<string, { at: number; value: GameSystem | null }>();

  async function call(
    base: string,
    path: string,
    init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<Response> {
    const res = await doFetch(new URL(path, base), {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res;
  }

  async function failure(res: Response): Promise<YnerError> {
    const body = (await res.json().catch(() => ({}))) as { code?: string; detail?: string };
    return new YnerError(res.status, body.code, body.detail);
  }

  async function json<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
    if (!res.ok) throw await failure(res);
    return schema.parse(await res.json());
  }

  return {
    async delegate(discordUserId) {
      const res = await call(o.identity, '/internal/discord/delegate', {
        method: 'POST',
        body: { discordUserId },
        headers: { 'x-internal-secret': o.internalSecret },
      });
      if (res.status === 404) return null;
      return (await json(res, z.object({ accessToken: z.string() }))).accessToken;
    },

    async me(token) {
      return json(await call(o.identity, '/v1/users/me', { token }), Me);
    },

    async myCampaigns(token) {
      return json(await call(o.campaign, '/v1/campaigns', { token }), z.array(Campaign));
    },

    async activeCampaign(token) {
      const res = await call(o.campaign, '/v1/campaigns/active', { token });
      if (res.status === 404) return null;
      return json(res, Campaign);
    },

    async setActiveCampaign(token, campaignId) {
      const res = await call(o.campaign, '/v1/campaigns/active', {
        method: 'PUT',
        token,
        body: { campaignId },
      });
      if (res.status === 404 || res.status === 400) return null;
      return json(res, Campaign);
    },

    async roll(token, input) {
      return json(
        await call(o.dice, '/v1/dice/rolls', {
          method: 'POST',
          token,
          body: {
            campaignId: input.campaignId,
            systemId: input.systemId,
            ...(input.characterId ? { characterId: input.characterId } : {}),
            ...(input.notation ? { notation: input.notation } : { pool: input.pool }),
            visibility: input.hidden ? 'private' : 'public',
          },
        }),
        Roll,
      );
    },

    async rolls(token, campaignId, limit) {
      const query = new URLSearchParams({ campaignId, limit: String(limit) });
      return json(await call(o.dice, `/v1/dice/rolls?${query}`, { token }), z.array(Roll));
    },

    async stats(token, campaignId) {
      const query = new URLSearchParams({ campaignId });
      return json(await call(o.dice, `/v1/dice/stats?${query}`, { token }), Stats);
    },

    async unlink(token) {
      const res = await call(o.identity, '/v1/auth/discord/link', { method: 'DELETE', token });
      if (res.status === 204) return 'unlinked';
      if (res.status === 404) return 'not_linked';
      const err = await failure(res);
      if (err.code === 'last_login_method') return 'last_login_method';
      throw err;
    },

    async gameSystem(systemId) {
      const cached = systems.get(systemId);
      if (cached && Date.now() - cached.at < SYSTEM_CACHE_MS) return cached.value;
      const res = await call(o.character, `/v1/systems/${encodeURIComponent(systemId)}`, {});
      const value = res.status === 404 ? null : await json(res, GameSystem);
      systems.set(systemId, { at: Date.now(), value });
      return value;
    },
  };
}
