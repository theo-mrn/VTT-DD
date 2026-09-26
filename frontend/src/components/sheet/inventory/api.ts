/**
 * Écritures de l'inventaire, en complément de `@/lib/characters` : la mise à
 * jour d'une possession y accepte aussi `effets`, les effets propres à
 * l'exemplaire (voir docs/api-character.md). Chaque écriture a son aperçu
 * local, rejoué par `useCharacter().write` en attendant le serveur.
 */
import { copier, nouvellePossession, type Effet, type EtatEntite } from '@vtt/rules';
import { api } from '@/lib/api';
import type { Character, Preview, Write } from '@/lib/characters';

/** Ajout ou mise à jour d'une possession : seuls les champs fournis changent. */
export interface ItemUpdate {
  entree: string;
  actif?: boolean;
  champs?: Record<string, number | string | boolean>;
  /** Effets propres à l'exemplaire : remplacent les précédents. */
  effets?: Effet[];
}

const path = (id: string) => `/v1/characters/${encodeURIComponent(id)}/possessions`;

/** POST /v1/characters/:id/possessions */
export const itemWrite =
  (update: ItemUpdate): Write =>
  (id, version) =>
    api<Character>(path(id), { method: 'POST', body: JSON.stringify({ version, ...update }) });

/** Même changement appliqué localement, pour l'affichage immédiat. */
export const itemPreview =
  (update: ItemUpdate): Preview =>
  (state: EtatEntite) => {
    try {
      const next = copier(state);
      let p = next.possessions.find((x) => x.entree === update.entree);
      if (!p) next.possessions.push((p = nouvellePossession(update.entree)));
      if (update.actif !== undefined) p.actif = update.actif;
      if (update.champs) p.champs = { ...p.champs, ...update.champs };
      if (update.effets) p.effets = [...update.effets];
      return next;
    } catch {
      return null;
    }
  };
