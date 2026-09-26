/**
 * Clients des fournisseurs OAuth : construction de l'URL d'autorisation et
 * échange du code contre le profil de l'utilisateur. Tous les appels réseau
 * passent par `fetch` et le résolveur de clés injectés : les tests fournissent
 * un faux fournisseur, sans réseau.
 *
 * Les erreurs levées (ErreurFournisseur) ne contiennent jamais le code, les
 * jetons, ni l'e-mail : elles peuvent être journalisées telles quelles.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import type { IdentityConfig } from '../../config.js';
import { defiPkce, type Fournisseur } from './etat.js';

/** Profil normalisé renvoyé par un fournisseur après l'échange du code. */
export interface ProfilFournisseur {
  providerAccountId: string;
  email: string | null;
  /** L'adresse a été vérifiée par le fournisseur. */
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

export interface ClientFournisseur {
  urlAutorisation(p: {
    state: string;
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
  }): string;
  echangerCode(p: {
    code: string;
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
  }): Promise<ProfilFournisseur>;
}

export type ClientsFournisseurs = Partial<Record<Fournisseur, ClientFournisseur>>;

/** Cause d'échec sans donnée sensible, destinée aux journaux. */
export class ErreurFournisseur extends Error {
  constructor(
    public readonly raison: string,
    public readonly statut?: number,
  ) {
    super(`fournisseur OAuth : ${raison}`);
    this.name = 'ErreurFournisseur';
  }
}

type Fetch = typeof fetch;

export interface OptionsClient {
  clientId: string;
  clientSecret: string;
  /** Par défaut le fetch global ; remplacé par un faux fournisseur en test. */
  fetch?: Fetch;
  /** Délai maximal de chaque appel réseau. */
  delaiMs?: number;
}

export const GOOGLE = {
  autorisation: 'https://accounts.google.com/o/oauth2/v2/auth',
  jeton: 'https://oauth2.googleapis.com/token',
  cles: 'https://www.googleapis.com/oauth2/v3/certs',
  emetteurs: ['accounts.google.com', 'https://accounts.google.com'],
} as const;

export const DISCORD = {
  autorisation: 'https://discord.com/oauth2/authorize',
  jeton: 'https://discord.com/api/oauth2/token',
  utilisateur: 'https://discord.com/api/users/@me',
} as const;

async function lireJson(
  fetcher: Fetch,
  url: string,
  init: RequestInit,
  etape: string,
  delaiMs: number,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetcher(url, { ...init, signal: AbortSignal.timeout(delaiMs) });
  } catch {
    throw new ErreurFournisseur(`${etape} : réseau`);
  }
  // Le corps d'une réponse en erreur n'est jamais journalisé (il peut refléter le code)
  if (!res.ok) throw new ErreurFournisseur(`${etape} : réponse ${res.status}`, res.status);
  try {
    return await res.json();
  } catch {
    throw new ErreurFournisseur(`${etape} : réponse illisible`);
  }
}

function echangeFormulaire(
  o: OptionsClient,
  p: { code: string; codeVerifier: string; redirectUri: string },
) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: p.code,
      redirect_uri: p.redirectUri,
      client_id: o.clientId,
      client_secret: o.clientSecret,
      code_verifier: p.codeVerifier,
    }).toString(),
  } satisfies RequestInit;
}

/** URL https d'image uniquement (affichée telle quelle par le front). */
function avatarSur(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > 2048) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

const ReponseJetonGoogle = z.object({ id_token: z.string().min(1).max(8192) });

const RevendicationsGoogle = z.object({
  sub: z.string().min(1).max(255),
  nonce: z.string().optional(),
  email: z.string().max(254).optional(),
  // Google envoie un booléen ; d'anciens jetons portaient la chaîne "true"
  email_verified: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

/**
 * Google, OpenID Connect : l'identité vient de l'id_token, vérifié localement
 * (signature par les clés publiques de Google, émetteur, audience, nonce).
 */
export function clientGoogle(o: OptionsClient & { cles?: JWTVerifyGetKey }): ClientFournisseur {
  const fetcher = o.fetch ?? fetch;
  const delaiMs = o.delaiMs ?? 10_000;
  // Jeu de clés distant, mis en cache par jose et rechargé à la rotation
  const cles = o.cles ?? createRemoteJWKSet(new URL(GOOGLE.cles));

  return {
    urlAutorisation({ state, codeVerifier, nonce, redirectUri }) {
      const url = new URL(GOOGLE.autorisation);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: o.clientId,
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: defiPkce(codeVerifier),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      return url.toString();
    },

    async echangerCode({ code, codeVerifier, nonce, redirectUri }) {
      const brut = await lireJson(
        fetcher,
        GOOGLE.jeton,
        echangeFormulaire(o, { code, codeVerifier, redirectUri }),
        'jeton google',
        delaiMs,
      );
      const jeton = ReponseJetonGoogle.safeParse(brut);
      if (!jeton.success) throw new ErreurFournisseur('jeton google : id_token absent');

      let revendications: unknown;
      try {
        ({ payload: revendications } = await jwtVerify(jeton.data.id_token, cles, {
          issuer: [...GOOGLE.emetteurs],
          audience: o.clientId,
          algorithms: ['RS256'],
          clockTolerance: 30,
        }));
      } catch (err) {
        // Le code jose (ex. ERR_JWT_CLAIM_VALIDATION_FAILED) et la revendication en cause suffisent
        const e = err as { code?: string; claim?: string };
        throw new ErreurFournisseur(
          `id_token google invalide (${e.code ?? 'inconnu'}${e.claim ? ` : ${e.claim}` : ''})`,
        );
      }

      const r = RevendicationsGoogle.safeParse(revendications);
      if (!r.success) throw new ErreurFournisseur('id_token google : revendications invalides');
      if (r.data.nonce !== nonce) throw new ErreurFournisseur('id_token google : nonce différent');

      return {
        providerAccountId: r.data.sub,
        email: r.data.email ?? null,
        emailVerified: r.data.email_verified === true || r.data.email_verified === 'true',
        name: r.data.name ?? null,
        avatarUrl: avatarSur(r.data.picture),
      };
    },
  };
}

const ReponseJetonDiscord = z.object({
  access_token: z.string().min(1).max(4096),
  token_type: z.string(),
});

const UtilisateurDiscord = z.object({
  id: z.string().regex(/^\d{1,32}$/),
  username: z.string().max(100),
  global_name: z.string().max(100).nullish(),
  avatar: z.string().nullish(),
  email: z.string().max(254).nullish(),
  verified: z.boolean().nullish(),
});

/** Discord, OAuth2 : l'identité vient de GET /users/@me avec le jeton obtenu. */
export function clientDiscord(o: OptionsClient): ClientFournisseur {
  const fetcher = o.fetch ?? fetch;
  const delaiMs = o.delaiMs ?? 10_000;

  return {
    urlAutorisation({ state, codeVerifier, redirectUri }) {
      const url = new URL(DISCORD.autorisation);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: o.clientId,
        redirect_uri: redirectUri,
        scope: 'identify email',
        state,
        code_challenge: defiPkce(codeVerifier),
        code_challenge_method: 'S256',
      }).toString();
      return url.toString();
    },

    async echangerCode({ code, codeVerifier, redirectUri }) {
      const brutJeton = await lireJson(
        fetcher,
        DISCORD.jeton,
        echangeFormulaire(o, { code, codeVerifier, redirectUri }),
        'jeton discord',
        delaiMs,
      );
      const jeton = ReponseJetonDiscord.safeParse(brutJeton);
      if (!jeton.success || jeton.data.token_type.toLowerCase() !== 'bearer') {
        throw new ErreurFournisseur('jeton discord : réponse inattendue');
      }

      const brutUtilisateur = await lireJson(
        fetcher,
        DISCORD.utilisateur,
        {
          headers: {
            authorization: `Bearer ${jeton.data.access_token}`,
            accept: 'application/json',
          },
        },
        'profil discord',
        delaiMs,
      );
      const u = UtilisateurDiscord.safeParse(brutUtilisateur);
      if (!u.success) throw new ErreurFournisseur('profil discord : réponse inattendue');

      const { id, avatar } = u.data;
      const avatarUrl =
        avatar && /^(a_)?[0-9a-f]{32}$/.test(avatar)
          ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.${avatar.startsWith('a_') ? 'gif' : 'png'}`
          : null;

      return {
        providerAccountId: id,
        email: u.data.email ?? null,
        emailVerified: u.data.verified === true,
        name: u.data.global_name || u.data.username || null,
        avatarUrl,
      };
    },
  };
}

/** Clients réels, uniquement pour les fournisseurs dont l'identifiant et le secret sont configurés. */
export function clientsDepuisConfig(config: IdentityConfig): ClientsFournisseurs {
  const clients: ClientsFournisseurs = {};
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    clients.google = clientGoogle({
      clientId: config.GOOGLE_CLIENT_ID,
      clientSecret: config.GOOGLE_CLIENT_SECRET,
    });
  }
  if (config.DISCORD_CLIENT_ID && config.DISCORD_CLIENT_SECRET) {
    clients.discord = clientDiscord({
      clientId: config.DISCORD_CLIENT_ID,
      clientSecret: config.DISCORD_CLIENT_SECRET,
    });
  }
  return clients;
}
