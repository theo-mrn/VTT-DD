/**
 * Fiche d'un personnage, demandée au service character
 * (GET /internal/characters/:id/sheet?userId=, secret partagé) : ses valeurs
 * calculées servent de variables aux notations (`1d20 + @FOR`). character
 * vérifie que l'utilisateur peut agir avec ce personnage (propriétaire, ou MJ
 * d'une campagne où il est engagé), comme pour ses propres actions.
 *
 * Le contrat de cette route appartient à character (champs en français) : ce
 * client le traduit pour le reste du service.
 */
import { HttpError } from '@vtt/platform';
import { z } from 'zod';
import type { SheetValues } from '../engine/roll.js';
import { INTERNAL_SECRET_HEADER } from '../internal/secret.js';
import { unavailable } from './campaign.js';

export interface CharacterSheet {
  id: string;
  ownerId: string;
  name: string;
  avatarUrl: string | null;
  systemId: string;
  values: SheetValues;
}

export interface CharacterClient {
  /** Fiche de `characterId` pour `userId` : 404 introuvable, 403 sans droit d'agir. */
  sheet(characterId: string, userId: string): Promise<CharacterSheet>;
}

const Response = z.object({
  id: z.string(),
  ownerId: z.string(),
  nom: z.string(),
  avatarUrl: z.string().nullable().default(null),
  systeme: z.object({ id: z.string(), version: z.string() }),
  valeurs: z.record(
    z.string(),
    z.object({
      valeur: z.union([z.number(), z.boolean(), z.string()]),
      modificateur: z.number().optional(),
    }),
  ),
});

const TIMEOUT_MS = 3_000;

/** Sans character configuré : aucun jet avec un personnage. */
export const noCharacters: CharacterClient = {
  sheet: async () => {
    throw unavailable('character');
  },
};

export function characterClient(o: {
  url: string;
  secret: string;
  fetch?: typeof globalThis.fetch;
  onError?: (error: unknown) => void;
}): CharacterClient {
  const doFetch = o.fetch ?? globalThis.fetch;
  return {
    async sheet(characterId, userId) {
      let res: Response;
      try {
        const url = new URL(`/internal/characters/${encodeURIComponent(characterId)}/sheet`, o.url);
        url.searchParams.set('userId', userId);
        res = await doFetch(url, {
          headers: { [INTERNAL_SECRET_HEADER]: o.secret, accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        o.onError?.(error);
        throw unavailable('character');
      }
      if (res.status === 404) {
        throw new HttpError(
          404,
          'Ressource introuvable',
          'character_not_found',
          'Personnage introuvable',
        );
      }
      if (res.status === 403) {
        throw new HttpError(
          403,
          'Accès refusé',
          'character_forbidden',
          'Réservé au propriétaire du personnage ou au MJ de sa campagne',
        );
      }
      let body: z.output<typeof Response>;
      try {
        if (!res.ok) throw new Error(`character a répondu ${res.status}`);
        body = Response.parse(await res.json());
      } catch (error) {
        o.onError?.(error);
        throw unavailable('character');
      }
      const values: SheetValues = {};
      for (const [key, v] of Object.entries(body.valeurs)) {
        values[key] = {
          value: v.valeur,
          ...(v.modificateur !== undefined ? { modifier: v.modificateur } : {}),
        };
      }
      return {
        id: body.id,
        ownerId: body.ownerId,
        name: body.nom,
        avatarUrl: body.avatarUrl,
        systemId: body.systeme.id,
        values,
      };
    },
  };
}
