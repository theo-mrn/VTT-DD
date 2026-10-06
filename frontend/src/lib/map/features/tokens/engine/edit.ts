/**
 * Écritures des tokens depuis le menu et l'inspecteur : une commande annulable par geste
 * (toute la sélection), retrait de la carte, suppression des PNJ avec leur personnage.
 */
import type { MapTokenVisibility } from '@vtt/contracts';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { EntityKind } from '@/lib/map/engine/entities/entity-kind';
import { deleteCommand, updateCommand, type Persistence } from '@/lib/map/store/commands';
import { deleteNpcsCommand } from './commands';
import { isNpc, TOKENS_COLLECTION, withVisibility, type TokenData } from './model';
import type { TokensState } from './state';

export const TOKEN_KIND_ID = 'token';

type TokenEntity = MapEntity<TokenData>;

function tokenKind(tokens: TokensState): EntityKind<TokenData> | null {
  return (tokens.engine.kinds.get(TOKEN_KIND_ID) as EntityKind<TokenData> | undefined) ?? null;
}

function persistenceOf(tokens: TokensState): Persistence<TokenData> | null {
  return tokenKind(tokens)?.persistence ?? null;
}

/** Tokens réels (pas les brouillons d'une pose en cours). */
export const settled = (entities: readonly TokenEntity[]) =>
  entities.filter((e) => !e.data.draft && !e.id.startsWith('tmp-'));

/** Modifie des tokens en une commande annulable. */
export function patchTokens(
  tokens: TokensState,
  entities: readonly TokenEntity[],
  label: string,
  change: (data: TokenData) => TokenData,
): Promise<boolean> | null {
  const persistence = persistenceOf(tokens);
  if (!persistence) return null;
  const changes = settled(entities)
    .map((e) => ({ before: e.data, after: change(e.data) }))
    .filter((c) => c.after !== c.before);
  if (!changes.length) return null;
  return tokens.engine.execute(
    updateCommand({ label, collection: TOKENS_COLLECTION, persistence, changes }),
  );
}

export function setVisibility(
  tokens: TokensState,
  entities: readonly TokenEntity[],
  visibility: MapTokenVisibility,
  visibleTo: readonly string[] = [],
) {
  return patchTokens(tokens, entities, 'Visibilité', (d) =>
    d.visibility === visibility && (visibility !== 'custom' || sameIds(d.visibleTo, visibleTo))
      ? d
      : withVisibility(d, visibility, visibleTo),
  );
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * « Pour certains joueurs » : ajoute ou retire un personnage de ceux qui voient les tokens.
 * Plus personne : le token devient invisible (jamais révélé à tous par mégarde).
 */
export function toggleVisibleTo(
  tokens: TokensState,
  entities: readonly TokenEntity[],
  characterId: string,
) {
  const all = entities.every(
    (e) => e.data.visibility === 'custom' && e.data.visibleTo.includes(characterId),
  );
  return patchTokens(tokens, entities, 'Visible pour…', (d) => {
    const current = d.visibility === 'custom' ? d.visibleTo : [];
    const next = all
      ? current.filter((id) => id !== characterId)
      : [...new Set([...current, characterId])];
    return next.length ? withVisibility(d, 'custom', next) : withVisibility(d, 'invisible');
  });
}

export function setVisionRadius(
  tokens: TokensState,
  entities: readonly TokenEntity[],
  radius: number,
) {
  const r = Math.max(0, Math.min(100_000, Math.round(radius)));
  return patchTokens(tokens, entities, 'Rayon de vision', (d) =>
    d.visionRadius === r ? d : { ...d, visionRadius: r },
  );
}

export function setVisionBoost(tokens: TokensState, entities: readonly TokenEntity[], on: boolean) {
  return patchTokens(tokens, entities, on ? 'Vision augmentée' : 'Vision normale', (d) =>
    d.visionBoost === on ? d : { ...d, visionBoost: on },
  );
}

/** Retire les tokens de la carte ; les personnages restent engagés (annulable). */
export function removeFromMap(tokens: TokensState, entities: readonly TokenEntity[]) {
  const persistence = persistenceOf(tokens);
  const items = settled(entities).map((e) => e.data);
  if (!persistence || !items.length) return null;
  return tokens.engine.execute(
    deleteCommand({
      label: items.length > 1 ? `Retirer ${items.length} tokens` : 'Retirer de la carte',
      collection: TOKENS_COLLECTION,
      persistence,
      items,
    }),
  );
}

/**
 * Suppression commune (Suppr, « Supprimer ») : un PNJ disparaît avec son personnage, après
 * confirmation du moteur ; Ctrl+Z le restaure tel quel (`NPC_UNDO_HOURS`). Un personnage joueur
 * est seulement retiré de la carte. Les deux s'annulent.
 */
export async function removeTokens(
  tokens: TokensState,
  entities: readonly TokenEntity[],
): Promise<boolean> {
  const list = settled(entities);
  const npcs = list.filter((e) => isNpc(tokens.directory.get(e.data.characterId)));
  const others = list.filter((e) => !npcs.includes(e));
  const runs: Promise<boolean>[] = [];
  if (npcs.length) {
    const name = tokens.directory.get(npcs[0]!.data.characterId)?.name;
    runs.push(
      tokens.engine.execute(
        deleteNpcsCommand({
          label: npcs.length > 1 ? `Supprimer ${npcs.length} PNJ` : `Supprimer ${name ?? 'le PNJ'}`,
          api: tokens.api,
          items: npcs.map((e) => e.data),
          sideOf: (id) => tokens.directory.get(id)?.side,
        }),
      ),
    );
  }
  const removed = others.length ? removeFromMap(tokens, others) : null;
  if (removed) runs.push(removed);
  return (await Promise.all(runs)).every(Boolean);
}

/** Message de confirmation avant de supprimer des PNJ (null : aucun PNJ dans la sélection). */
export function confirmNpcDeletion(
  tokens: TokensState,
  entities: readonly TokenEntity[],
): string | null {
  const npcs = settled(entities).filter((e) => isNpc(tokens.directory.get(e.data.characterId)));
  if (!npcs.length) return null;
  const names = npcs.map((e) => tokens.directory.get(e.data.characterId)?.name ?? 'PNJ sans nom');
  const others = settled(entities).length - npcs.length;
  const suffix = others
    ? ` Les personnages joueurs sélectionnés sont seulement retirés de la carte.`
    : '';
  if (npcs.length === 1)
    return `Supprimer « ${names[0]} » de la carte ? Sa fiche de jeu (PV, état) disparaît avec lui ; son modèle reste dans « Mes PNJ ».${suffix}`;
  const shown = names.slice(0, 3).join(', ');
  const more = names.length > 3 ? ` et ${names.length - 3} autres` : '';
  return `Supprimer ${npcs.length} PNJ (${shown}${more}) de la carte ? Leurs fiches de jeu disparaissent avec eux ; leurs modèles restent dans « Mes PNJ ».${suffix}`;
}
