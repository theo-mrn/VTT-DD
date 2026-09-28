/**
 * Droits d'un utilisateur sur un personnage, décidés par les campagnes du
 * service campaign. Un seul personnage actif, pas de possession :
 *  - lecture : l'utilisateur est membre d'une campagne où le personnage est engagé ;
 *  - écriture : il y est MJ, ou il y incarne le personnage (`played_by`).
 * Le propriétaire d'un personnage le lit toujours ; il l'écrit hors campagne
 * (jamais engagé) et pendant la création (voir `acces` dans le dépôt des
 * personnages). La réponse dit donc aussi si le personnage est engagé quelque
 * part (`engage`) et si un autre membre l'incarne (`autreIncarnateur`).
 *
 * character interroge campaign (GET /internal/characters/:id/campaigns-of?userId=)
 * et garde la réponse quelques secondes en mémoire (`DROITS_CACHE_MS`, 5 s par
 * défaut). character ne lit pas le bus : un changement d'incarnation
 * (`campaign.character_played`) compte au plus tard à l'expiration ; la lecture
 * d'une fiche (`frais`) relit campaign pour renvoyer des `permissions` à jour.
 * Une panne de campaign n'ouvre aucun droit (`indisponible`) : seul le
 * propriétaire garde la lecture, ses écritures échouent (503).
 *
 * Rôle d'un utilisateur dans une campagne (modèles de PNJ et d'objets, réservés
 * au MJ) : GET /internal/campaigns/:id/rights?userId=, même cache. Une panne de
 * campaign fait échouer la requête (503) au lieu de passer pour un refus.
 *
 * Règles optionnelles de la campagne d'un personnage (encombrement…), pour
 * calculer sa fiche : GET /internal/characters/:id/rules, même durée de cache
 * (character ne lit pas le bus : un réglage du MJ compte au plus tard à
 * l'expiration). Une panne de campaign donne les défauts du système, sans cache.
 */
import { HttpError } from '@vtt/platform';
import { z } from 'zod';
import { EN_TETE_SECRET_INTERNE } from '../interne/secret.js';

export interface Droits {
  /** Membre d'une campagne où le personnage est engagé. */
  lecture: boolean;
  /** MJ d'une de ces campagnes, ou il y incarne le personnage. */
  ecriture: boolean;
  /** Engagé dans au moins une campagne, dont l'utilisateur soit membre ou non. */
  engage?: boolean;
  /** L'utilisateur incarne le personnage dans une de ces campagnes. */
  incarne?: boolean;
  /** Un autre membre incarne le personnage, dans n'importe quelle campagne. */
  autreIncarnateur?: boolean;
  /**
   * Campagnes où l'utilisateur est MJ et le personnage engagé : ses écritures y
   * sont annoncées en direct (événement de la campagne, voir `enregistrer`).
   */
  campagnesMj?: string[];
  /**
   * Toutes les campagnes où l'utilisateur est membre et le personnage engagé :
   * la mise en page de la fiche y est annoncée à la table.
   */
  campagnes?: string[];
  /** Membre qui incarne le personnage, par campagne de `campagnes` (absent : personne). */
  incarnateurs?: Record<string, string>;
  /** campaign n'a pas répondu : aucun droit n'est connu. */
  indisponible?: boolean;
}

/** Rôle dans une campagne (contrat de campaign). */
export type RoleCampagne = 'gm' | 'player' | 'spectator';

export interface DroitsCampagnes {
  /**
   * Droits de `userId` sur le personnage `characterId` (voir `Droits`). `frais` :
   * relit campaign sans passer par le cache (la réponse y est gardée).
   */
  de(characterId: string, userId: string, o?: { frais?: boolean }): Promise<Droits>;
  /**
   * Rôle de `userId` dans `campaignId` ; `null` s'il n'en est pas membre (ou
   * si elle n'existe pas). Lève une erreur 503 si campaign ne répond pas.
   */
  role(campaignId: string, userId: string): Promise<RoleCampagne | null>;
  /**
   * Règles optionnelles réglées dans la campagne du personnage (écarts au défaut du
   * système) ; `{}` hors campagne, ou si campaign ne répond pas.
   */
  options(characterId: string): Promise<Record<string, boolean>>;
}

export const AUCUN_DROIT: Droits = Object.freeze({ lecture: false, ecriture: false });

/** Réponse d'une panne de campaign : aucun droit, et on le sait. */
const INDISPONIBLE: Droits = Object.freeze({
  lecture: false,
  ecriture: false,
  indisponible: true,
});

export function campaignIndisponible(): HttpError {
  return new HttpError(
    503,
    'Service indisponible',
    'campaign_unavailable',
    'Le service campaign ne répond pas',
  );
}

/** Sans campaign configuré : aucun droit en dehors du propriétaire, aucun rôle vérifiable. */
export const sansCampagnes: DroitsCampagnes = {
  de: async () => AUCUN_DROIT,
  role: async () => {
    throw campaignIndisponible();
  },
  options: async () => ({}),
};

/** Réponse de campaign (contrat en anglais : read, write, engaged…). */
const Reponse = z.object({
  read: z.boolean(),
  write: z.boolean(),
  engaged: z.boolean(),
  plays: z.boolean(),
  playedByOther: z.boolean(),
  campaigns: z
    .array(
      z.object({
        campaignId: z.string(),
        role: z.string(),
        playedBy: z.string().nullable().default(null),
      }),
    )
    .default([]),
});
/** Réponse de GET /internal/campaigns/:id/rights. */
const ReponseRole = z.object({
  member: z.boolean(),
  role: z.enum(['gm', 'player', 'spectator']).nullable(),
});
/** Réponse de GET /internal/characters/:id/rules. */
const ReponseRegles = z.object({
  campaignId: z.string().nullable(),
  options: z.record(z.string(), z.boolean()),
});

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
  const roles = new Map<string, { role: RoleCampagne | null; jusqua: number }>();
  const reglages = new Map<string, { options: Record<string, boolean>; jusqua: number }>();

  return {
    async options(characterId) {
      const entree = reglages.get(characterId);
      if (entree && entree.jusqua > maintenant()) return entree.options;
      reglages.delete(characterId);

      let options: Record<string, boolean>;
      try {
        const url = new URL(`/internal/characters/${encodeURIComponent(characterId)}/rules`, o.url);
        const res = await appel(url, {
          headers: { [EN_TETE_SECRET_INTERNE]: o.secret, accept: 'application/json' },
          signal: AbortSignal.timeout(DELAI_MS),
        });
        if (!res.ok) throw new Error(`campaign a répondu ${res.status}`);
        options = ReponseRegles.parse(await res.json()).options;
      } catch (erreur) {
        // Défauts du système, sans mise en cache : la prochaine requête réessaie
        o.signaler?.(erreur);
        return {};
      }

      if (o.cacheMs > 0) {
        if (reglages.size >= TAILLE_MAX_CACHE) reglages.delete(reglages.keys().next().value!);
        reglages.set(characterId, { options, jusqua: maintenant() + o.cacheMs });
      }
      return options;
    },

    async role(campaignId, userId) {
      const cle = `${campaignId}:${userId}`;
      const entree = roles.get(cle);
      if (entree && entree.jusqua > maintenant()) return entree.role;
      roles.delete(cle);

      let role: RoleCampagne | null;
      try {
        const url = new URL(`/internal/campaigns/${encodeURIComponent(campaignId)}/rights`, o.url);
        url.searchParams.set('userId', userId);
        const res = await appel(url, {
          headers: { [EN_TETE_SECRET_INTERNE]: o.secret, accept: 'application/json' },
          signal: AbortSignal.timeout(DELAI_MS),
        });
        if (!res.ok) throw new Error(`campaign a répondu ${res.status}`);
        const r = ReponseRole.parse(await res.json());
        role = r.member ? r.role : null;
      } catch (erreur) {
        // Pas de mise en cache d'une panne : la prochaine requête réessaie
        o.signaler?.(erreur);
        throw campaignIndisponible();
      }

      if (o.cacheMs > 0) {
        if (roles.size >= TAILLE_MAX_CACHE) roles.delete(roles.keys().next().value!);
        roles.set(cle, { role, jusqua: maintenant() + o.cacheMs });
      }
      return role;
    },

    async de(characterId, userId, { frais = false } = {}) {
      const cle = `${characterId}:${userId}`;
      const entree = cache.get(cle);
      if (!frais && entree && entree.jusqua > maintenant()) return entree.droits;
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
        droits = {
          lecture: r.read,
          ecriture: r.write,
          engage: r.engaged,
          incarne: r.plays,
          autreIncarnateur: r.playedByOther,
          campagnesMj: r.campaigns.filter((c) => c.role === 'gm').map((c) => c.campaignId),
          campagnes: r.campaigns.map((c) => c.campaignId),
          incarnateurs: Object.fromEntries(
            r.campaigns.flatMap((c) => (c.playedBy ? [[c.campaignId, c.playedBy]] : [])),
          ),
        };
      } catch (erreur) {
        // Pas de mise en cache d'une panne : la prochaine requête réessaie
        o.signaler?.(erreur);
        return INDISPONIBLE;
      }

      if (o.cacheMs > 0) {
        if (cache.size >= TAILLE_MAX_CACHE) cache.delete(cache.keys().next().value!);
        cache.set(cle, { droits, jusqua: maintenant() + o.cacheMs });
      }
      return droits;
    },
  };
}
