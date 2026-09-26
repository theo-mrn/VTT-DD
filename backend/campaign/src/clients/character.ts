/**
 * Appels de campaign au service character, par ses routes /internal (secret
 * partagé INTERNAL_API_SECRET, jamais relayées par la gateway) :
 *  - résumé d'un personnage (propriétaire, système) avant de l'engager ;
 *  - action d'initiative d'un participant (clés de tri renvoyées) ;
 *  - décompte des durées en fin de round.
 */
import { HttpError } from '@vtt/platform';
import { z } from 'zod';
import { EN_TETE_SECRET_INTERNE } from '../interne/secret.js';

const DELAI_MS = 5_000;

const Resume = z.object({
  id: z.string(),
  ownerId: z.string(),
  nom: z.string(),
  avatarUrl: z.string().nullable(),
  systeme: z.object({ id: z.string(), version: z.string() }),
  type: z.string(),
});
export type ResumePersonnage = z.infer<typeof Resume>;

const Action = z.object({ resultat: z.unknown(), cles: z.array(z.number()).optional() });
export type ActionJouee = z.infer<typeof Action>;

const Decompte = z.object({
  modifie: z.boolean(),
  retirees: z.array(z.string()),
  version: z.number(),
});
export type Decompte = z.infer<typeof Decompte>;

/** Origine d'un appel : MJ déclencheur, salle, corrélation (reprise dans les événements). */
export interface Origine {
  userId?: string;
  roomId?: string;
  correlationId?: string;
}

/** Refus de character (4xx) ou panne (status 0 : injoignable, 5xx). */
export class ErreurCharacter extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ErreurCharacter';
  }
  get refus() {
    return this.status >= 400 && this.status < 500;
  }
}

export interface ClientCharacter {
  /** Résumé d'un personnage actif ; `null` s'il n'existe pas (ou plus). */
  resume(id: string, origine?: Origine): Promise<ResumePersonnage | null>;
  action(
    id: string,
    action: string,
    corps: { parametres?: Record<string, unknown>; appliquer?: boolean },
    origine?: Origine,
  ): Promise<ActionJouee>;
  decompterDurees(id: string, origine?: Origine): Promise<Decompte>;
}

/** Sans CHARACTER_URL ou sans secret : toute demande répond 503. */
export const characterAbsent: ClientCharacter = {
  resume: async () => {
    throw indisponible();
  },
  action: async () => {
    throw indisponible();
  },
  decompterDurees: async () => {
    throw indisponible();
  },
};

function indisponible() {
  return new HttpError(
    503,
    'Service indisponible',
    'character_indisponible',
    'Le service des personnages n’est pas configuré',
  );
}

export function clientCharacter(o: {
  url: string;
  secret: string;
  fetch?: typeof globalThis.fetch;
}): ClientCharacter {
  const appel = o.fetch ?? globalThis.fetch;

  async function requete<S extends z.ZodType>(
    methode: 'GET' | 'POST',
    chemin: string,
    schema: S,
    origine: Origine | undefined,
    corps?: object,
  ): Promise<z.output<S>> {
    let res: Response;
    try {
      res = await appel(new URL(chemin, o.url), {
        method: methode,
        headers: {
          [EN_TETE_SECRET_INTERNE]: o.secret,
          accept: 'application/json',
          ...(corps ? { 'content-type': 'application/json' } : {}),
          ...(origine?.correlationId ? { 'x-correlation-id': origine.correlationId } : {}),
        },
        ...(corps ? { body: JSON.stringify(corps) } : {}),
        signal: AbortSignal.timeout(DELAI_MS),
      });
    } catch (e) {
      throw new ErreurCharacter(0, `character injoignable : ${(e as Error).message}`);
    }
    if (!res.ok) {
      const probleme = (await res.json().catch(() => ({}))) as { detail?: string; code?: string };
      throw new ErreurCharacter(
        res.status,
        probleme.detail ?? `character a répondu ${res.status}`,
        probleme.code,
      );
    }
    return schema.parse(await res.json());
  }

  const origineCorps = (origine?: Origine) => ({
    ...(origine?.userId ? { userId: origine.userId } : {}),
    ...(origine?.roomId ? { roomId: origine.roomId } : {}),
  });
  const id = (v: string) => encodeURIComponent(v);

  return {
    async resume(personnage, origine) {
      try {
        return await requete('GET', `/internal/characters/${id(personnage)}`, Resume, origine);
      } catch (e) {
        if (e instanceof ErreurCharacter && e.status === 404) return null;
        throw e;
      }
    },
    action: (personnage, action, corps, origine) =>
      requete(
        'POST',
        `/internal/characters/${id(personnage)}/actions/${id(action)}`,
        Action,
        origine,
        { ...corps, ...origineCorps(origine) },
      ),
    decompterDurees: (personnage, origine) =>
      requete(
        'POST',
        `/internal/characters/${id(personnage)}/durees/decompter`,
        Decompte,
        origine,
        origineCorps(origine),
      ),
  };
}
