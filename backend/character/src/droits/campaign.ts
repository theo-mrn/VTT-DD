/**
 * Droits d'un utilisateur sur un personnage qu'il ne possède pas, décidés par
 * les campagnes du service campaign :
 *  - lecture : l'utilisateur est membre d'une campagne où le personnage est engagé ;
 *  - écriture : il y est MJ.
 *
 * character interroge campaign (GET /internal/characters/:id/campaigns-of?userId=)
 * et garde la réponse quelques secondes en mémoire. Une panne de campaign
 * n'ouvre aucun droit : seul le propriétaire garde l'accès.
 */
import { z } from 'zod';
import { EN_TETE_SECRET_INTERNE } from '../interne/secret.js';

export interface Droits {
  lecture: boolean;
  ecriture: boolean;
}

export interface DroitsCampagnes {
  /** Droits de `userId` sur le personnage `characterId`, qu'il ne possède pas. */
  de(characterId: string, userId: string): Promise<Droits>;
}

export const AUCUN_DROIT: Droits = Object.freeze({ lecture: false, ecriture: false });

/** Sans campaign configuré : aucun droit en dehors du propriétaire. */
export const sansCampagnes: DroitsCampagnes = { de: async () => AUCUN_DROIT };

/** Réponse de campaign (contrat en anglais : read, write, campaigns). */
const Reponse = z.object({ read: z.boolean(), write: z.boolean() });

/** Borne du cache : au-delà, les entrées les plus anciennes sont évincées. */
const TAILLE_MAX_CACHE = 10_000;
const DELAI_MS = 3_000;

export interface OptionsCampaign {
  url: string;
  secret: string;
  /** Durée de vie d'une réponse en cache (0 : pas de cache). */
  cacheMs: number;
  fetch?: typeof globalThis.fetch;
  maintenant?: () => number;
  /** Journal des pannes de campaign (jamais d'identifiant de secret). */
  signaler?: (erreur: unknown) => void;
}

export function droitsCampaign(o: OptionsCampaign): DroitsCampagnes {
  const appel = o.fetch ?? globalThis.fetch;
  const maintenant = o.maintenant ?? Date.now;
  const cache = new Map<string, { droits: Droits; jusqua: number }>();

  return {
    async de(characterId, userId) {
      const cle = `${characterId}:${userId}`;
      const entree = cache.get(cle);
      if (entree && entree.jusqua > maintenant()) return entree.droits;
      cache.delete(cle);

      let droits: Droits;
      try {
        const url = new URL(
          `/internal/characters/${encodeURIComponent(characterId)}/campaigns-of`,
          o.url,
        );
        url.searchParams.set('userId', userId);
        const res = await appel(url, {
          headers: { [EN_TETE_SECRET_INTERNE]: o.secret, accept: 'application/json' },
          signal: AbortSignal.timeout(DELAI_MS),
        });
        if (!res.ok) throw new Error(`campaign a répondu ${res.status}`);
        const r = Reponse.parse(await res.json());
        droits = { lecture: r.read, ecriture: r.write };
      } catch (erreur) {
        // Pas de mise en cache d'une panne : la prochaine requête réessaie
        o.signaler?.(erreur);
        return AUCUN_DROIT;
      }

      if (o.cacheMs > 0) {
        if (cache.size >= TAILLE_MAX_CACHE) cache.delete(cache.keys().next().value!);
        cache.set(cle, { droits, jusqua: maintenant() + o.cacheMs });
      }
      return droits;
    },
  };
}
