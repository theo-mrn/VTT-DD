/**
 * Sorte d'entité `token` (docs/carte.md § 6, § 10) : un personnage engagé posé sur la carte,
 * PNJ ou personnage joueur, rangé dans les calques du MJ (calque par défaut « Personnages »).
 *
 * Le moteur fournit les gestes communs (clic, glisser et son direct, poignées de taille,
 * ordre, calque, clavier, menu, annuler) ; la sorte dit ce qu'elle sait faire, qui a le droit
 * (miroir du service campaign), comment se dessiner, et comment s'écrire au serveur :
 * `/tokens/move` pour un glisser, `PATCH` sinon, `/duplicate` pour copier un PNJ, et la
 * suppression d'un PNJ avec son personnage.
 */
import type { MapEntity } from '../../engine/entities/entity';
import { field, type EntityKind, type LiveAudience } from '../../engine/entities/entity-kind';
import type { Persistence } from '../../store/commands';
import type { MapDto } from '../../store/map-store';
import { npcAwarePersistence } from './commands';
import { confirmNpcDeletion, removeTokens, TOKEN_KIND_ID } from './edit';
import { tokenMenu } from './menu';
import {
  applyTokenGeometry,
  ownsToken,
  TOKENS_COLLECTION,
  tokenCan,
  tokenContains,
  tokenGeometry,
  withVisibility,
  type TokenData,
} from './model';
import { disposeToken, renderToken, updateToken, type TokenLook } from './render';
import type { TokensState } from './state';

/** Persistance absente (moteur sans serveur) : toute écriture échoue proprement. */
const offline: Persistence<MapDto> = {
  create: () => Promise.reject(new Error('Carte hors ligne')),
  update: () => Promise.reject(new Error('Carte hors ligne')),
  remove: () => Promise.reject(new Error('Carte hors ligne')),
};

export function createTokenKind(tokens: TokensState): EntityKind<TokenData> {
  const { engine, directory } = tokens;
  const info = (d: TokenData) => directory.get(d.characterId);

  const lookOf = (e: MapEntity<TokenData>): TokenLook => {
    const d = e.data;
    const c = info(d);
    const gm = engine.viewer.role === 'gm';
    return {
      size: e.geometry.width,
      shape: d.shape,
      imageUrl: d.imageUrl ?? c?.portraitUrl ?? d.draft?.imageUrl ?? null,
      side: c?.side ?? d.draft?.side ?? null,
      name: c?.name ?? d.draft?.name ?? null,
      resource: c?.resource ?? null,
      pending: !!d.draft || d.id.startsWith('tmp-'),
      badge:
        gm && d.visibility === 'hidden'
          ? 'hidden'
          : gm && d.visibility === 'custom'
            ? 'custom'
            : null,
      hovered: e.state.hovered,
      selected: e.state.selected || e.state.dragging,
      locked: e.state.locked,
    };
  };

  const liveAudience = (e: MapEntity<TokenData>): LiveAudience => {
    const d = e.data;
    const c = info(d);
    const player = c?.side === 'players';
    // Calque masqué aux joueurs : réservé au MJ (le joueur voit toujours ses propres tokens)
    if (e.layerId && engine.layer(e.layerId)?.visibleToPlayers === false)
      return player ? { users: directory.usersOf([d.characterId]) } : 'gm';
    if (player) return 'public';
    switch (d.visibility) {
      case 'visible':
      case 'ally':
        return 'public';
      case 'custom':
        return { users: directory.usersOf(d.visibleTo) };
      default:
        return 'gm';
    }
  };

  return {
    id: TOKEN_KIND_ID,
    label: 'Personnage',
    collection: TOKENS_COLLECTION,
    capabilities: ['select', 'move', 'resize', 'duplicate', 'delete', 'inspect', 'order'],
    plane: 'content',
    stacking: {
      arrangeKind: 'token',
      layerId: field<TokenData, string | null>('layerId'),
      z: field<TokenData, number>('z'),
      defaultRole: 'tokens',
    },
    display: 'characters',
    selfOutline: true,
    geometry: tokenGeometry,
    applyGeometry: applyTokenGeometry,
    keepAspectRatio: true,
    minSize: 8,
    // « Invisible » : le MJ le voit hachuré, à 50 % (la visibilité fine est dans le menu)
    hidden: {
      get: (d) => d.visibility === 'invisible',
      set: (d, h) => withVisibility(d, h ? 'invisible' : 'visible'),
    },
    isOwn: ownsToken,
    name: (d) => info(d)?.name ?? d.draft?.name ?? null,
    can: (action, e, viewer) => tokenCan(action, e.data, viewer, info(e.data)),
    hitTest: (e, p, tolerance) => tokenContains(e.data.shape, e.current, p, tolerance),
    render: (e, ctx) => renderToken(e, ctx, lookOf),
    update: (e, ctx) => updateToken(e, ctx),
    dispose: disposeToken,
    actions: (entities) => tokenMenu(tokens, entities),
    duplicate: (d, offset) => {
      const copy: TokenData = {
        ...d,
        pos: { x: d.pos.x + offset.x, y: d.pos.y + offset.y },
        duplicateOf: d.id,
        npcInstance: true,
      };
      delete copy.draft;
      return copy;
    },
    confirmDelete: (entities) => confirmNpcDeletion(tokens, entities),
    remove: (entities) => removeTokens(tokens, entities),
    liveAudience,
    persistence: npcAwarePersistence(
      engine.backend?.collection(TOKENS_COLLECTION) ?? offline,
      tokens.api,
    ),
  };
}

/**
 * Un personnage a changé dans l'annuaire (nom, portrait, camp, ressource) : ses tokens, et eux
 * seuls, sont redessinés. Renvoie le désabonnement.
 */
export function watchDirectory(tokens: TokensState): () => void {
  const { engine } = tokens;
  return tokens.directory.subscribe((changed) => {
    const list = engine
      .entitiesOfKind(TOKEN_KIND_ID)
      .filter((e) => changed.has((e.data as TokenData).characterId));
    if (list.length) engine.setEntityState(list, {});
  });
}
