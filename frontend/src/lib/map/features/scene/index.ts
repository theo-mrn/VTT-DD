/**
 * Module « scène » du moteur (docs/carte.md § 10, Fond et scènes) : le point d'arrivée des
 * joueurs (`scene.spawn`), où arrivent les personnages qui rejoignent la carte ou le groupe
 * qui voyage.
 *
 * - Pour le MJ, c'est un élément comme les autres (sorte `spawn`, couche synthétique tirée de
 *   la scène) : drapeau « Arrivée des joueurs », glisser pour le déplacer (aimantation
 *   comprise), Suppr pour l'enlever, ⌘Z. Il est sous tout le reste (plan `grid`) : un token
 *   posé dessus reste prioritaire au clic.
 * - Clic droit dans le vide : « Arrivée des joueurs ici ».
 * - Outil `spawn` (hors de la barre, lancé depuis le panneau Scènes) : un clic pose le point.
 * - Les joueurs ne le voient pas.
 */
import { Flag, MapPin } from 'lucide-react';
import type { Container, Graphics, Text } from 'pixi.js';
import { isGm, type EntityKind, type RenderContext } from '@/lib/map/engine/entities/entity-kind';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { Point } from '@/lib/map/engine/geometry';
import type { MapEngine, MapModule } from '@/lib/map/engine/map-engine';
import type { MapPointer, Tool } from '@/lib/map/engine/tools/tool';
import { SELECT_TOOL_ID } from '@/lib/map/engine/tools/tool-manager';
import type { Persistence } from '@/lib/map/store/commands';
import { collectionOf, type MapDto, type SceneLike } from '@/lib/map/store/map-store';

export const SPAWN_TOOL_ID = 'spawn';
export const SPAWN_KIND = 'spawn';
export const SPAWN_COLLECTION = 'spawn';
const SPAWN_ID = 'spawn';
/** Rayon touchable autour du drapeau, en pixels d'écran. */
const HIT_PX = 16;
const LABEL = 'Arrivée des joueurs';

export interface SpawnData extends MapDto {
  x: number;
  y: number;
}

const round = (v: number) => Math.round(v);

/** Pose le point d'apparition (commande annulable). */
export function setSpawn(engine: MapEngine, p: Point | null) {
  return engine.updateScene('Point d’arrivée des joueurs', {
    spawn: p ? { x: round(p.x), y: round(p.y) } : null,
  });
}

function spawnOf(scene: SceneLike | null | undefined): SpawnData | null {
  const s = scene?.spawn as Point | null | undefined;
  return scene && s ? { id: SPAWN_ID, version: scene.version, x: s.x, y: s.y } : null;
}

/** Couche synthétique `spawn` alignée sur la scène (MJ seulement). */
function syncSpawn(engine: MapEngine) {
  const state = engine.store.getState();
  const next = spawnOf(state.scene);
  const current = collectionOf(state, SPAWN_COLLECTION).get(SPAWN_ID);
  if (next) {
    if (!current || current.x !== next.x || current.y !== next.y)
      state.upsert(SPAWN_COLLECTION, [next]);
  } else if (current && state.scene && state.scene.version >= current.version)
    state.remove(SPAWN_COLLECTION, [SPAWN_ID]);
}

/** Écritures : la scène (`PATCH /maps/:mapId { spawn }`), relue aussitôt dans le magasin. */
function spawnPersistence(engine: MapEngine): Persistence<MapDto> {
  const save = async (spawn: Point | null): Promise<MapDto[]> => {
    const backend = engine.backend;
    if (!backend) throw new Error('Carte hors ligne');
    const saved = await backend.updateScene({
      spawn: spawn ? { x: round(spawn.x), y: round(spawn.y) } : null,
    });
    engine.store.getState().setScene(saved);
    const data = spawnOf(saved);
    return data ? [data] : [];
  };
  return {
    create: (drafts) => save(drafts[0] as SpawnData),
    update: (updates) => save(updates[0]!.after as SpawnData),
    remove: async () => void (await save(null)),
  };
}

interface SpawnVisual {
  root: Container;
  flag: Graphics;
  label: Text;
  plate: Graphics;
  release: () => void;
  drawn: string;
}

const visuals = new WeakMap<MapEntity, SpawnVisual>();

/** Drapeau et étiquette, en pixels d'écran (conteneur à taille constante). */
function drawSpawn(e: MapEntity, ctx: RenderContext) {
  const v = visuals.get(e);
  if (!v) return;
  const { theme } = ctx;
  const key = `${e.state.hovered ? 1 : 0}${e.state.selected ? 1 : 0}`;
  if (key === v.drawn) return;
  v.drawn = key;
  const active = e.state.hovered || e.state.selected;
  const g = v.flag.clear();
  // Pied : un anneau au sol, au point exact d'arrivée
  g.ellipse(0, 0, 9, 4).fill({ color: 0x000000, alpha: 0.3 });
  g.ellipse(0, 0, 7, 3).stroke({ width: 1.5, color: theme.primary, alpha: 0.95 });
  // Mât et fanion
  g.moveTo(0, 0).lineTo(0, -26).stroke({ width: 2, color: theme.foreground, cap: 'round' });
  g.moveTo(0.5, -26)
    .lineTo(14, -21)
    .lineTo(0.5, -15)
    .closePath()
    .fill({ color: theme.primary })
    .stroke({ width: 1, color: theme.background, alpha: 0.6, join: 'round' });
  if (active)
    g.circle(0, -12, HIT_PX).stroke({
      width: e.state.selected ? 2 : 1.5,
      color: theme.primary,
      alpha: e.state.selected ? 1 : 0.6,
    });
  // Étiquette sous le pied
  const w = v.label.width + 12;
  const h = v.label.height + 4;
  v.plate
    .clear()
    .roundRect(-w / 2, 8, w, h, h / 2)
    .fill({ color: theme.background, alpha: 0.85 })
    .stroke({ width: 1, color: theme.primary, alpha: active ? 0.9 : 0.4 });
  v.label.position.set(0, 10);
}

function spawnKind(engine: MapEngine): EntityKind<MapDto> {
  return {
    id: SPAWN_KIND,
    label: LABEL,
    collection: SPAWN_COLLECTION,
    capabilities: ['select', 'move', 'delete'],
    // Sous tout le reste : un token posé sur le point reste prioritaire au clic
    plane: 'grid',
    selfOutline: true,
    showsName: true,
    geometry: (d) => {
      const s = d as SpawnData;
      return { x: s.x, y: s.y, width: 0, height: 0, rotation: 0 };
    },
    applyGeometry: (d, g) => ({ ...d, x: round(g.x), y: round(g.y) }),
    name: () => LABEL,
    can: (action, _e, viewer) => isGm(viewer) || action === 'view',
    hitTest: (e, p, tol) => {
      const zoom = engine.camera.zoom;
      // Le drapeau monte au-dessus du point : le centre touchable est un peu plus haut
      return Math.hypot(p.x - e.current.x, p.y - (e.current.y - 12 / zoom)) <= HIT_PX / zoom + tol;
    },
    bounds: (e) => {
      const r = Math.max(engine.kindContext().pixelsPerUnit, 60);
      return { x: e.current.x - r, y: e.current.y - r, width: 2 * r, height: 2 * r };
    },
    render: (e, ctx) => {
      const { pixi } = ctx;
      const root = new pixi.Container({ label: 'arrivee' });
      const flag = new pixi.Graphics({ label: 'drapeau' });
      const plate = new pixi.Graphics({ label: 'etiquette' });
      const label = new pixi.Text({
        text: LABEL,
        style: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 11,
          fontWeight: '600',
          fill: ctx.theme.foreground,
        },
        anchor: { x: 0.5, y: 0 },
        resolution: 2,
      });
      root.addChild(flag, plate, label);
      e.display!.addChild(root);
      visuals.set(e, {
        root,
        flag,
        label,
        plate,
        release: ctx.screenSpace.add(root, 1),
        drawn: '',
      });
      drawSpawn(e, ctx);
    },
    update: (e, ctx) => drawSpawn(e, ctx),
    dispose: (e) => {
      visuals.get(e)?.release();
      visuals.delete(e);
    },
    persistence: spawnPersistence(engine),
  };
}

/** Outil en un clic : `placing` jusqu'au clic, puis retour à la sélection. */
export class SpawnTool implements Tool {
  readonly id = SPAWN_TOOL_ID;
  state: 'idle' | 'placing' = 'idle';

  cursor() {
    return 'crosshair';
  }

  activate() {
    this.state = 'placing';
  }

  deactivate() {
    this.state = 'idle';
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0 || this.state !== 'placing') return false;
    void setSpawn(engine, e.world);
    engine.tools.activate(SELECT_TOOL_ID);
    return true;
  }
}

export const sceneModule: MapModule = {
  id: 'scene',
  register(engine) {
    const cleanups = [
      engine.registerTool({
        id: SPAWN_TOOL_ID,
        label: 'Point d’arrivée des joueurs',
        icon: MapPin,
        hidden: true,
        available: isGm,
        create: () => new SpawnTool(),
      }),
    ];
    if (isGm(engine.viewer)) {
      cleanups.push(
        engine.registerKind(spawnKind(engine)),
        // La couche suit la scène (et revient après une relecture complète)
        engine.store.subscribe((s, prev) => {
          if (
            s.scene !== prev.scene ||
            s.collections[SPAWN_COLLECTION] !== prev.collections[SPAWN_COLLECTION]
          )
            syncSpawn(engine);
        }),
        engine.registerMenuProvider(({ entities, world, viewer }) =>
          entities.length || !isGm(viewer)
            ? []
            : [
                {
                  id: 'scene:spawn-here',
                  label: 'Arrivée des joueurs ici',
                  icon: Flag,
                  run: () => void setSpawn(engine, world),
                },
              ],
        ),
      );
      syncSpawn(engine);
    }
    return () => {
      for (const c of cleanups.toReversed()) c();
    };
  },
};
