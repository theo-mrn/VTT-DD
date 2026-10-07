/**
 * Traînées des glisser (docs/exploration.md § 5.3) : le serveur n'apprend que la position
 * finale d'un token ; pour qu'un couloir traversé d'un seul glisser soit exploré, le chemin
 * suivi est retenu ici (un point par case parcourue, à la position affichée) et envoyé au lâcher
 * (`POST …/exploration/trail`), une requête pour toute la sélection, après la réponse du
 * déplacement. Le serveur n'en garde que les tokens qui sont des observateurs du groupe.
 */
import {
  MAP_EXPLORATION_TRAIL_POINTS,
  MAP_EXPLORATION_TRAIL_TOKENS,
  type MapExplorationTrail,
} from '@vtt/contracts';
import type { Vec } from '@vtt/vision';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { MapEngine, MovedEntity } from '@/lib/map/engine/map-engine';
import type { ExplorationApi } from './api';
import type { ExplorationModel } from './model';

const TOKENS = 'tokens';

/** Garde au plus `max` points, répartis le long du chemin (le premier et le dernier compris). */
export function decimate(points: readonly Vec[], max: number): Vec[] {
  if (points.length <= max) return [...points];
  if (max <= 1) return points.slice(-1);
  const out: Vec[] = [];
  for (let k = 0; k < max; k++)
    out.push(points[Math.round((k * (points.length - 1)) / (max - 1))]!);
  return out;
}

/** Un glisser vu il y a plus longtemps est fini ou abandonné (Échap) : sa traînée repart. */
const STALE_MS = 500;

interface Trail {
  points: Vec[];
  /** Dernière image où le token était glissé. */
  seen: number;
}

export class TrailRecorder {
  /** Points retenus par token glissé. */
  private readonly trails = new Map<string, Trail>();

  constructor(
    private readonly engine: MapEngine,
    private readonly model: ExplorationModel,
    private readonly api: ExplorationApi | null,
  ) {}

  /**
   * Ce viewer envoie-t-il la traînée de ce token ? Même droit que le déplacer (un joueur : ses
   * personnages ; le MJ : tous), et seulement pour un observateur possible du groupe (personnage
   * d'un joueur, allié) : le serveur ignorerait les autres.
   */
  private mayTrail(e: MapEntity): boolean {
    if (e.kind.collection !== TOKENS) return false;
    const data = e.data as { characterId?: unknown; visibility?: unknown };
    const characterId = typeof data.characterId === 'string' ? data.characterId : null;
    if (!characterId || data.visibility === 'invisible') return false;
    const viewer = this.engine.viewer;
    if (viewer.role === 'player') return viewer.characterIds.includes(characterId);
    if (viewer.role !== 'gm') return false;
    if (data.visibility === 'ally') return true;
    const players = this.engine.directory.players?.() ?? [];
    return players.some((p) => p.characterIds.includes(characterId));
  }

  /** À chaque image : un point de plus par token glissé, dès qu'il a parcouru une case. */
  frame(now: number) {
    if (!this.model.enabled) {
      if (this.trails.size) this.trails.clear();
      return;
    }
    const step = this.engine.kindContext().pixelsPerUnit;
    for (const e of this.engine.entities()) {
      if (!e.state.dragging || !this.mayTrail(e)) continue;
      const x = e.current.x;
      const y = e.current.y;
      let trail = this.trails.get(e.id);
      if (!trail || now - trail.seen > STALE_MS) {
        trail = { points: [], seen: now };
        this.trails.set(e.id, trail);
      }
      trail.seen = now;
      const last = trail.points.at(-1);
      if (last && Math.hypot(x - last.x, y - last.y) < step) continue;
      trail.points.push({ x, y });
    }
  }

  /**
   * Lâcher : les traînées des tokens déplacés partent après la réponse du déplacement. Sans
   * point en dehors de l'arrivée (un pas de flèche), rien ne part : l'arrivée est explorée par
   * le déplacement lui-même.
   */
  moved(moves: readonly MovedEntity[], done: Promise<boolean>, now: number) {
    const body: MapExplorationTrail['trails'] = [];
    const step = this.engine.kindContext().pixelsPerUnit;
    for (const m of moves) {
      const trail = this.trails.get(m.entity.id);
      this.trails.delete(m.entity.id);
      const points = trail && now - trail.seen <= 2 * STALE_MS ? trail.points : null;
      if (!points?.length || !this.mayTrail(m.entity)) continue;
      // L'arrivée est explorée par le déplacement : les points tout près d'elle sont inutiles
      const path = points.filter((p) => Math.hypot(p.x - m.to.x, p.y - m.to.y) >= step / 2);
      if (!path.length) continue;
      body.push({
        tokenId: m.entity.id,
        points: decimate(path, MAP_EXPLORATION_TRAIL_POINTS).map((p) => ({
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
        })),
      });
    }
    if (!body.length || !this.api || !this.model.enabled) return;
    const api = this.api;
    void done.then(async (ok) => {
      if (!ok) return;
      for (let i = 0; i < body.length; i += MAP_EXPLORATION_TRAIL_TOKENS) {
        try {
          await api.trail({ trails: body.slice(i, i + MAP_EXPLORATION_TRAIL_TOKENS) });
        } catch {
          // Au mieux : l'arrivée est explorée quoi qu'il arrive
        }
      }
    });
  }
}
