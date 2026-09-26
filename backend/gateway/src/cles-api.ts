/**
 * Accès par clé d'API (« Authorization: ApiKey vtt_… ») : la gateway échange
 * la clé contre un jeton d'accès court auprès d'identity (route interne
 * protégée par un secret partagé), garde ce jeton en mémoire jusqu'à 30 s
 * avant son expiration, puis la requête continue comme avec « Bearer <jeton> ».
 *
 * La clé ne quitte jamais la gateway ailleurs que vers identity, et n'est
 * jamais journalisée ; le cache est indexé par son SHA-256.
 */
import { createHash } from 'node:crypto';
import { HttpError } from '@vtt/platform';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

export const EN_TETE_SECRET_INTERNE = 'x-internal-secret';

/** Marge avant expiration : un jeton en cache ne sert plus dans ses 30 dernières secondes. */
export const MARGE_EXPIRATION_MS = 30_000;

/** Borne du cache : au-delà, les entrées les plus anciennes sont évincées. */
const TAILLE_MAX_CACHE = 10_000;

const DELAI_ECHANGE_MS = 5_000;

/** Forme d'une clé : nouvelles (base64url) et importées de l'ancienne app (hexadécimal). */
const FORME_CLE = /^vtt_[A-Za-z0-9_-]{16,200}$/;

const ReponseEchange = z.object({
  userId: z.string().min(1),
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
});

interface Entree {
  jeton: string;
  valableJusqua: number;
}

export interface EchangeurOptions {
  /** URL d'identity (UPSTREAM_IDENTITY_URL). */
  identityUrl: string | undefined;
  /** Secret partagé avec identity ; sans lui, les clés d'API sont refusées. */
  secret: string | undefined;
  fetch?: typeof globalThis.fetch;
  maintenant?: () => number;
}

export function creerEchangeurCles(opts: EchangeurOptions) {
  const cache = new Map<string, Entree>();
  const enCours = new Map<string, Promise<string>>();
  const fetcher = opts.fetch ?? globalThis.fetch;
  const maintenant = opts.maintenant ?? Date.now;

  async function echanger(cle: string, empreinte: string): Promise<string> {
    let res: Response;
    try {
      res = await fetcher(new URL('/internal/api-keys/exchange', opts.identityUrl).toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [EN_TETE_SECRET_INTERNE]: opts.secret!,
        },
        body: JSON.stringify({ key: cle }),
        signal: AbortSignal.timeout(DELAI_ECHANGE_MS),
      });
    } catch {
      throw new HttpError(503, 'Service indisponible', 'identity_unavailable');
    }
    if (res.status === 401) throw HttpError.unauthorized("Clé d'API invalide ou révoquée");
    if (!res.ok) throw new HttpError(502, 'Passerelle en erreur', 'identity_error');

    const corps = ReponseEchange.safeParse(await res.json().catch(() => null));
    if (!corps.success) throw new HttpError(502, 'Passerelle en erreur', 'identity_error');

    const valableJusqua = maintenant() + corps.data.expiresIn * 1000 - MARGE_EXPIRATION_MS;
    if (valableJusqua > maintenant()) {
      if (cache.size >= TAILLE_MAX_CACHE) {
        // Map garde l'ordre d'insertion : la première clé est la plus ancienne
        cache.delete(cache.keys().next().value!);
      }
      cache.set(empreinte, { jeton: corps.data.accessToken, valableJusqua });
    }
    return corps.data.accessToken;
  }

  /** Jeton d'accès pour cette clé, depuis le cache ou échangé auprès d'identity. */
  async function jetonPour(cle: string): Promise<string> {
    if (!opts.secret || !opts.identityUrl) {
      throw HttpError.unauthorized("Clés d'API non acceptées");
    }
    if (!FORME_CLE.test(cle)) throw HttpError.unauthorized("Clé d'API invalide ou révoquée");

    const empreinte = createHash('sha256').update(cle, 'utf8').digest('hex');
    const entree = cache.get(empreinte);
    if (entree && entree.valableJusqua > maintenant()) return entree.jeton;
    if (entree) cache.delete(empreinte);

    // Requêtes simultanées avec la même clé : un seul échange
    let promesse = enCours.get(empreinte);
    if (!promesse) {
      promesse = echanger(cle, empreinte).finally(() => enCours.delete(empreinte));
      enCours.set(empreinte, promesse);
    }
    return promesse;
  }

  /**
   * Remplace « ApiKey <clé> » par « Bearer <jeton> » dans la requête ; ne
   * touche à rien pour un autre schéma d'authentification.
   */
  async function convertir(req: FastifyRequest): Promise<void> {
    const h = req.headers.authorization;
    if (!h || !/^ApiKey /i.test(h)) return;
    const jeton = await jetonPour(h.slice(7).trim());
    req.headers.authorization = `Bearer ${jeton}`;
  }

  return { convertir, jetonPour, taille: () => cache.size };
}
