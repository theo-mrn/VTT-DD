/**
 * Surcouches du combat sur la carte (docs/combat.md § 12.5), dans le plan `adornments`, sous
 * les contours : elles ne dépendent d'aucun réglage d'affichage des tokens (anneaux et badges
 * coupés, toujours visibles).
 *
 * - Anneau du tour : sur le token du participant qui agit, pour tous s'il est vu ; doublé
 *   quand c'est mon personnage.
 * - Anneau des cibles : cibles des attaques ouvertes (MJ : toutes ; joueur : les siennes) et
 *   de celle que je compose ; réticule à quatre branches.
 * - Traits de visée : attaquant → cibles, en direct (MJ), et le mien pendant la composition.
 *
 * Un token masqué pour moi (vision, affichage) n'a ni anneau ni trait : rien n'est révélé.
 * Chaque anneau est un `Graphics` redessiné seulement quand le rayon ou le palier de zoom
 * change ; à chaque image, seule sa position suit le token (glisser, direct des autres).
 */
import type { Graphics } from 'pixi.js';
import type { MapEntity } from '../../engine/entities/entity';
import type { MapTheme } from '../../engine/entities/entity-kind';
import type { MapEngine } from '../../engine/map-engine';
import { dashedPolyline, unitAt } from '../obstacles/overlay';
import { TOKEN_KIND_ID } from '../tokens/edit';
import { TOKENS_COLLECTION } from '../tokens/model';
import { characterOf } from './model';

export interface RingSnapshot {
  turnCharacterId: string | null;
  /** Mes personnages (anneau du tour doublé). */
  mine: readonly string[];
  targets: ReadonlySet<string>;
  lines: readonly { attackerId: string; targetIds: readonly string[] }[];
}

export interface RingSource {
  snapshot(): RingSnapshot;
  subscribe(listener: () => void): () => void;
}

type RingKind = 'turn' | 'target';

function drawRing(
  g: Graphics,
  kind: RingKind,
  r: number,
  unit: number,
  mine: boolean,
  theme: MapTheme,
) {
  g.clear();
  if (kind === 'turn') {
    g.circle(0, 0, r + 4 * unit).stroke({ width: 8 * unit, color: theme.primary, alpha: 0.2 });
    g.circle(0, 0, r + 3 * unit).stroke({ width: 2.5 * unit, color: theme.primary, alpha: 0.95 });
    if (mine)
      g.circle(0, 0, r + 9 * unit).stroke({ width: 1.5 * unit, color: theme.primary, alpha: 0.7 });
    return;
  }
  const rr = r + 6 * unit;
  g.circle(0, 0, rr).stroke({ width: 2.5 * unit, color: theme.destructive, alpha: 0.95 });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 - Math.PI / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    g.moveTo(cos * (rr - 3 * unit), sin * (rr - 3 * unit)).lineTo(
      cos * (rr + 7 * unit),
      sin * (rr + 7 * unit),
    );
  }
  g.stroke({ width: 2.5 * unit, color: theme.destructive, alpha: 0.95, cap: 'round' });
}

const radiusOf = (e: MapEntity) => Math.max(e.current.width, e.current.height) / 2;
const shown = (e: MapEntity) => e.masks.size === 0 && e.display?.visible === true;

export function mountCombatRings(engine: MapEngine, source: RingSource): () => void {
  return engine.whenMounted(() => {
    const pixi = engine.pixi;
    const plane = engine.plane('adornments');
    const theme = engine.theme;
    if (!pixi || !plane || !theme) return;
    const root = new pixi.Container({ label: 'combat-rings' });
    plane.addChildAt(root, 0);
    const lines = new pixi.Graphics({ label: 'combat-aim-lines' });
    root.addChild(lines);

    interface Ring {
      entity: MapEntity;
      kind: RingKind;
      mine: boolean;
      g: Graphics;
      /** Rayon et palier dessinés. */
      r: number;
      unit: number;
    }
    const rings = new Map<string, Ring>();
    let snap = source.snapshot();
    /** Tokens par personnage concerné (recalculé quand les tokens ou la source changent). */
    let byCharacter = new Map<string, MapEntity[]>();
    let stopFrames: (() => void) | null = null;
    // Positions des traits déjà dessinés (aucune allocation par image pour comparer)
    let drawnLines: number[] = [];
    let linesUnit = NaN;

    const index = () => {
      const wanted = new Set<string>([
        ...(snap.turnCharacterId ? [snap.turnCharacterId] : []),
        ...snap.targets,
        ...snap.lines.flatMap((l) => [l.attackerId, ...l.targetIds]),
      ]);
      byCharacter = new Map();
      if (wanted.size)
        for (const e of engine.entitiesOfKind(TOKEN_KIND_ID)) {
          const c = characterOf(e);
          if (c && wanted.has(c)) byCharacter.set(c, [...(byCharacter.get(c) ?? []), e]);
        }
      // Anneaux voulus : ceux qui manquent sont créés, les autres détruits
      const keep = new Set<string>();
      const want = (e: MapEntity, kind: RingKind, mine: boolean) => {
        const id = `${kind}:${e.id}`;
        keep.add(id);
        const ring = rings.get(id);
        if (ring && ring.entity === e && ring.mine === mine) return;
        ring?.g.destroy();
        const g = new pixi.Graphics({ label: `combat-${kind}` });
        g.visible = false;
        root.addChildAt(g, 0);
        rings.set(id, { entity: e, kind, mine, g, r: NaN, unit: NaN });
      };
      const turn = snap.turnCharacterId;
      for (const e of turn ? (byCharacter.get(turn) ?? []) : [])
        want(e, 'turn', snap.mine.includes(turn!));
      for (const c of snap.targets)
        for (const e of byCharacter.get(c) ?? []) want(e, 'target', false);
      for (const [id, ring] of rings)
        if (!keep.has(id)) {
          ring.g.destroy();
          rings.delete(id);
        }
      drawnLines = [];
      const busy = rings.size > 0 || snap.lines.length > 0;
      if (busy && !stopFrames) stopFrames = engine.onFrame(() => void frame());
      if (!busy && stopFrames) {
        stopFrames();
        stopFrames = null;
        lines.clear();
      }
      frame();
      engine.invalidate();
    };

    const frame = () => {
      const unit = unitAt(engine.camera.zoom);
      for (const ring of rings.values()) {
        const e = ring.entity;
        const visible = shown(e);
        ring.g.visible = visible;
        if (!visible) continue;
        const r = radiusOf(e);
        if (ring.r !== r || ring.unit !== unit) {
          ring.r = r;
          ring.unit = unit;
          drawRing(ring.g, ring.kind, r, unit, ring.mine, theme);
        }
        ring.g.position.set(e.current.x, e.current.y);
      }
      drawLines(unit);
    };

    const drawLines = (unit: number) => {
      // Segments visibles : de l'attaquant à chaque cible, tous deux vus
      let n = 0;
      const pts = drawnLines;
      let changed = unit !== linesUnit;
      const push = (v: number) => {
        if (pts[n] !== v) {
          pts[n] = v;
          changed = true;
        }
        n++;
      };
      for (const l of snap.lines) {
        const from = (byCharacter.get(l.attackerId) ?? []).find(shown);
        if (!from) continue;
        for (const t of l.targetIds) {
          const to = (byCharacter.get(t) ?? []).find(shown);
          if (!to || to === from) continue;
          push(from.current.x);
          push(from.current.y);
          push(radiusOf(from));
          push(to.current.x);
          push(to.current.y);
          push(radiusOf(to));
        }
      }
      if (pts.length !== n) {
        pts.length = n;
        changed = true;
      }
      if (!changed) return;
      linesUnit = unit;
      lines.clear();
      for (let i = 0; i < n; i += 6) {
        const ax = pts[i]!;
        const ay = pts[i + 1]!;
        const ar = pts[i + 2]!;
        const bx = pts[i + 3]!;
        const by = pts[i + 4]!;
        const br = pts[i + 5]!;
        const len = Math.hypot(bx - ax, by - ay);
        const start = ar + 4 * unit;
        const end = len - br - 10 * unit;
        if (end <= start) continue;
        const ux = (bx - ax) / len;
        const uy = (by - ay) / len;
        dashedPolyline(
          lines,
          [
            { x: ax + ux * start, y: ay + uy * start },
            { x: ax + ux * end, y: ay + uy * end },
          ],
          8 * unit,
          6 * unit,
        );
      }
      lines.stroke({ width: 2 * unit, color: theme.destructive, alpha: 0.75, cap: 'round' });
    };

    const unsubscribe = source.subscribe(() => {
      snap = source.snapshot();
      index();
    });
    // Tokens ajoutés, retirés ou changés (un PNJ posé, un token remplacé) : index refait
    const unwatch = engine.store.subscribe((s, prev) => {
      if (s.collections[TOKENS_COLLECTION] !== prev.collections[TOKENS_COLLECTION]) index();
    });
    index();

    return () => {
      unsubscribe();
      unwatch();
      stopFrames?.();
      for (const ring of rings.values()) ring.g.destroy();
      rings.clear();
      root.destroy({ children: true });
    };
  });
}
