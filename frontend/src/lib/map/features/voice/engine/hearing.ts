/**
 * Qui écoute et d'où parlent les autres, pour la voix de proximité (docs/voix.md § 4). Sans
 * React ; positions affichées (glisser compris).
 */
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { Point } from '@/lib/map/engine/geometry';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { MapDto } from '@/lib/map/store/map-store';
import { listenerOf } from '../../sounds/engine/hearing';
import { TOKEN_KIND } from '../../sounds/engine/model';
import type { Speaker } from './mix';

/**
 * Joueur : son token (comme pour les zones sonores). MJ : le token sélectionné, sinon le centre
 * de la vue. Spectateur, joueur sans token : personne (il entend tout le monde, comme un appel).
 */
export function voiceListener(engine: MapEngine): Point | null {
  if (!isGm(engine.viewer)) return listenerOf(engine);
  const selected = engine.entitiesOfKind(TOKEN_KIND).find((t) => engine.selection.has(t.id));
  if (selected) return { x: selected.current.x, y: selected.current.y };
  const { width, height } = engine.camera.viewport;
  if (!(width > 0 && height > 0)) return null;
  return engine.camera.screenToWorld({ x: width / 2, y: height / 2 });
}

/**
 * Où parle chaque participant : le token d'un personnage qu'il incarne, sur cette scène. Le MJ
 * et qui n'a pas de token : nulle part (entendu partout).
 */
export function speakersOf(engine: MapEngine, userIds: readonly string[]): Speaker[] {
  const players = engine.directory.players?.() ?? [];
  const tokens = engine.entitiesOfKind(TOKEN_KIND);
  return userIds.map((userId) => {
    const ids = players.find((p) => p.userId === userId)?.characterIds ?? [];
    if (!ids.length) return { userId, at: null };
    // Le personnage incarné d'abord (en tête de liste), puis les autres
    const rank = (t: (typeof tokens)[number]) =>
      ids.indexOf((t.data as MapDto).characterId as string);
    const mine = tokens.filter((t) => rank(t) >= 0).sort((a, b) => rank(a) - rank(b));
    const token = mine[0];
    return { userId, at: token ? { x: token.current.x, y: token.current.y } : null };
  });
}
