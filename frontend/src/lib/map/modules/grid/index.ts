/**
 * Module « quadrillage » (docs/carte.md § 4) : les quadrillages de la scène, dessinés dans le
 * plan `grid` (au-dessus du fond, sous les calques), et leur calibrage sur l'image.
 *
 * - Dessin en pixels du monde, trait d'épaisseur constante à l'écran : seules les lignes dans
 *   la vue sont tracées, et seulement quand la caméra ou les quadrillages changent. Trop dense
 *   (case de moins de 6 px à l'écran), il s'efface.
 * - Joueurs : les quadrillages montrés aux joueurs. MJ : tous (ceux cachés aux joueurs à moitié).
 * - Outil de calibrage (MJ, lancé du menu Quadrillage) : glisser sur `cells` × `cells` cases
 *   dessinées dans le fond ; la case et l'origine du quadrillage visé s'y alignent (une
 *   commande annulable). Échap annule.
 */
import type { MapGrid } from '@vtt/contracts';
import { Ruler } from 'lucide-react';
import type { Container, Graphics } from 'pixi.js';
import type { StoreApi } from 'zustand/vanilla';
import { GridMenu } from '@/components/map/grid/grid-menu';
import { isGm, type RenderContext } from '../../engine/entities/entity-kind';
import { destroyDisplay } from '../../engine/destroy-display';
import type { Point } from '../../engine/geometry';
import type { MapEngine, MapModule } from '../../engine/map-engine';
import type { MapPointer, Tool } from '../../engine/tools/tool';
import { SELECT_TOOL_ID } from '../../engine/tools/tool-manager';
import {
  calibrate,
  densityFade,
  GRID_CALIBRATE_TOOL_ID,
  linePositions,
  visibleGrids,
  withGrid,
} from './model';
import { calibrateSettings, gridsOf, saveGrids, type CalibrateSettings } from './state';

/** Calibrage : `idle` → `dragging` (glisser sur les cases) → retour à la sélection. */
export class CalibrateTool implements Tool {
  readonly id = GRID_CALIBRATE_TOOL_ID;
  state: 'idle' | 'dragging' = 'idle';
  private start: Point | null = null;
  private end: Point | null = null;
  private gfx: Graphics | null = null;

  constructor(private readonly settings: StoreApi<CalibrateSettings>) {}

  cursor() {
    return 'crosshair';
  }

  deactivate(engine: MapEngine) {
    this.reset(engine);
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0) return false;
    this.state = 'dragging';
    this.start = e.world;
    this.end = e.world;
    engine.invalidate();
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    if (this.state !== 'dragging') return;
    this.end = e.world;
    engine.invalidate();
  }

  up(e: MapPointer, engine: MapEngine) {
    if (this.state !== 'dragging' || !this.start) return;
    const { gridId, cells } = this.settings.getState();
    const fit = calibrate(this.start, e.world, cells);
    this.reset(engine);
    if (!fit || !gridId) return;
    const grids = gridsOf(engine);
    if (!grids.some((g) => g.id === gridId)) return;
    void saveGrids(engine, 'Ajuster le quadrillage', withGrid(grids, gridId, fit));
    engine.tools.activate(SELECT_TOOL_ID);
  }

  cancel(engine: MapEngine): boolean {
    if (this.state === 'idle') return false;
    this.reset(engine);
    return true;
  }

  renderPreview(layer: Container, rc: RenderContext) {
    if (!this.gfx) this.gfx = new rc.pixi.Graphics({ label: 'grid-calibrate' });
    if (this.gfx.parent !== layer) layer.addChild(this.gfx);
    const g = this.gfx;
    g.clear();
    if (this.state !== 'dragging' || !this.start || !this.end) return;
    const x = Math.min(this.start.x, this.end.x);
    const y = Math.min(this.start.y, this.end.y);
    const w = Math.abs(this.end.x - this.start.x);
    const h = Math.abs(this.end.y - this.start.y);
    const px = 1 / rc.zoom;
    const cells = this.settings.getState().cells;
    g.rect(x, y, w, h).fill({ color: rc.theme.primary, alpha: 0.08 });
    // Les cases que le glisser couvre, pour caler sur celles de l'image
    for (let i = 1; i < cells; i++) {
      g.moveTo(x + (w * i) / cells, y).lineTo(x + (w * i) / cells, y + h);
      g.moveTo(x, y + (h * i) / cells).lineTo(x + w, y + (h * i) / cells);
    }
    g.stroke({ width: px, color: rc.theme.primary, alpha: 0.6 });
    g.rect(x, y, w, h).stroke({ width: 2 * px, color: rc.theme.primary, alpha: 0.95 });
  }

  private reset(engine: MapEngine) {
    this.state = 'idle';
    this.start = null;
    this.end = null;
    this.gfx?.clear();
    engine.invalidate();
  }
}

/** Dessine les quadrillages dans `plane` ; renvoie le nettoyage. */
function mountGridRenderer(engine: MapEngine, plane: Container): () => void {
  const pixi = engine.pixi!;
  const root = new pixi.Container({ label: 'grids' });
  plane.addChild(root);
  const pool: Graphics[] = [];
  let lastKey = '';

  const draw = () => {
    const scene = engine.store.getState().scene;
    const gm = isGm(engine.viewer);
    const grids = visibleGrids(scene?.grids as MapGrid[] | undefined, gm);
    const cam = engine.camera;
    const view = cam.visibleRect();
    const key = [
      cam.x.toFixed(1),
      cam.y.toFixed(1),
      cam.zoom.toFixed(4),
      cam.viewport.width,
      cam.viewport.height,
      scene?.width,
      scene?.height,
      JSON.stringify(grids),
    ].join('|');
    if (key === lastKey) return;
    lastKey = key;

    // Limites : la carte (taille du fond), sinon la vue
    const w = typeof scene?.width === 'number' ? scene.width : null;
    const h = typeof scene?.height === 'number' ? scene.height : null;
    const x0 = w !== null ? Math.max(view.x, 0) : view.x;
    const y0 = h !== null ? Math.max(view.y, 0) : view.y;
    const x1 = w !== null ? Math.min(view.x + view.width, w) : view.x + view.width;
    const y1 = h !== null ? Math.min(view.y + view.height, h) : view.y + view.height;

    grids.forEach((grid, i) => {
      let g = pool[i];
      if (!g) {
        g = new pixi.Graphics({ label: `grid:${i}` });
        pool.push(g);
        root.addChild(g);
      }
      g.clear();
      const fade = densityFade(grid.size * cam.zoom);
      if (!fade || x1 <= x0 || y1 <= y0) return;
      const xs = linePositions(grid.offsetX, grid.size, x0, x1);
      const ys = linePositions(grid.offsetY, grid.size, y0, y1);
      if (!xs || !ys) return;
      for (const x of xs) g.moveTo(x, y0).lineTo(x, y1);
      for (const y of ys) g.moveTo(x0, y).lineTo(x1, y);
      const hiddenForPlayers = gm && !grid.visibleToPlayers;
      g.stroke({
        width: grid.thickness / cam.zoom,
        color: grid.color,
        alpha: grid.opacity * fade * (hiddenForPlayers ? 0.5 : 1),
      });
    });
    for (let i = grids.length; i < pool.length; i++) pool[i]!.clear();
  };

  draw();
  const unsubscribe = engine.store.subscribe((s, prev) => {
    if (s.scene !== prev.scene) {
      draw();
      engine.invalidate();
    }
  });
  const unCamera = engine.camera.onChange(draw);
  return () => {
    unsubscribe();
    unCamera();
    root.removeFromParent();
    destroyDisplay(root);
  };
}

export const gridModule: MapModule = {
  id: 'grid',
  register(engine) {
    const settings = calibrateSettings(engine);
    const cleanups = [
      engine.registerTool({
        id: GRID_CALIBRATE_TOOL_ID,
        label: 'Ajuster le quadrillage',
        icon: Ruler,
        hidden: true,
        available: isGm,
        create: () => new CalibrateTool(settings),
      }),
      engine.registerToolbarItem({
        id: 'grid:menu',
        slot: 'view',
        order: 20,
        available: isGm,
        component: GridMenu,
      }),
      engine.whenMounted(() => {
        const plane = engine.plane('grid');
        if (!plane || !engine.pixi) return;
        return mountGridRenderer(engine, plane);
      }),
    ];
    return () => {
      for (const c of cleanups.reverse()) c();
    };
  },
};
