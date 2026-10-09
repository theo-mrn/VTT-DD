/**
 * Distance au clic (docs/carte.md § 10, Mesures) : un clic simple de l'outil sélection montre
 * la distance depuis le personnage du joueur (ou, ⌘/Ctrl + clic, depuis le token sélectionné)
 * jusqu'au point visé. Locale : rien ne part aux autres.
 *
 * - Origine : ⌘/Ctrl + clic → le token sélectionné seul ; sinon (joueur) le personnage qu'il
 *   incarne (en tête de `viewer.characterIds`) s'il est sur la carte, sinon son token le plus
 *   proche du clic. Le MJ et les spectateurs n'ont de mesure qu'au ⌘/Ctrl + clic.
 * - Cible : le centre d'un token ou d'un objet (hors décor) cliqué et **vu** (aucun masque) ;
 *   sinon le point cliqué. Aucune fuite : on ne mesure que vers un point choisi ou vers un
 *   élément déjà montré.
 * - Elle suit les tokens s'ils bougent, reste `CLICK_HOLD_MS`, puis s'efface en
 *   `CLICK_FADE_MS` ; le clic suivant la remplace.
 *
 * Sans Pixi : le rendu (`render.ts`) lit `resolve(now)` à chaque image.
 */
import { playGridOf, type MapGrid } from '@vtt/contracts';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { Point } from '@/lib/map/engine/geometry';
import { HIT_TOLERANCE_PX, type MapClick, type MapEngine } from '@/lib/map/engine/map-engine';
import type { StoreApi } from 'zustand/vanilla';
import { distanceText, unitsBetween, type GridLike, type UnitContext } from './model';
import type { MeasurePrefs } from './prefs';

/** Durée pleine de la mesure, puis son effacement. */
export const CLICK_HOLD_MS = 2_500;
export const CLICK_FADE_MS = 500;
/** En dessous (unités), le clic est sur place : pas de mesure. */
export const MIN_UNITS = 0.25;

const TOKEN_KIND = 'token';
/** Sortes dont on vise le centre (le décor, lui, n'est jamais masqué par la vision). */
const CENTER_KINDS: ReadonlySet<string> = new Set([TOKEN_KIND, 'object']);

const characterOf = (e: MapEntity) => {
  const id = (e.data as { characterId?: unknown }).characterId;
  return typeof id === 'string' ? id : null;
};

/**
 * Token d'où mesurer pour un joueur : celui qu'il incarne s'il est sur la carte, sinon son
 * token le plus proche du point ; null s'il n'en a aucun.
 */
export function ownToken(engine: MapEngine, near: Point): MapEntity | null {
  const ids = engine.viewer.characterIds;
  if (!ids.length) return null;
  const mine = engine
    .entitiesOfKind(TOKEN_KIND)
    .filter((e) => !e.masks.size && ids.includes(characterOf(e) ?? ''));
  const played = mine.find((e) => characterOf(e) === ids[0]);
  if (played) return played;
  let best: MapEntity | null = null;
  let bestD = Infinity;
  for (const e of mine) {
    const d = Math.hypot(e.current.x - near.x, e.current.y - near.y);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Origine de la mesure d'un clic, ou null (pas de mesure). */
export function pickOrigin(engine: MapEngine, click: MapClick): MapEntity | null {
  if (click.measure && click.selectionBefore.length === 1) {
    const e = engine.entity(click.selectionBefore[0]!);
    if (e?.kind.id === TOKEN_KIND && !e.masks.size) return e;
  }
  if (engine.viewer.role !== 'player') return null;
  return ownToken(engine, click.world);
}

/** Élément dont on vise le centre : token ou objet vu, le plus haut sous le point. */
export function pickTarget(engine: MapEngine, world: Point, origin: MapEntity): MapEntity | null {
  const tol = engine.camera.screenToWorldLength(HIT_TOLERANCE_PX);
  let best: MapEntity | null = null;
  for (const e of engine.entities()) {
    if (e === origin || e.masks.size || !CENTER_KINDS.has(e.kind.id)) continue;
    if (!e.hitTest(world, tol)) continue;
    if (!best || engine.compareStack(e, best) > 0) best = e;
  }
  return best;
}

/** Grille de jeu de la scène (cases), null sans elle. */
export function playGrid(engine: MapEngine): GridLike | null {
  const grid = playGridOf(engine.kindContext().scene as { grids?: MapGrid[] } | null);
  return grid && grid.size > 0
    ? { size: grid.size, offsetX: grid.offsetX, offsetY: grid.offsetY }
    : null;
}

/**
 * Ce qu'il faut pour écrire une distance sur cette carte : la case, la distance par case et
 * l'unité de la scène, la règle des diagonales de la table.
 */
export function unitContext(engine: MapEngine): UnitContext {
  const k = engine.kindContext();
  return {
    pixelsPerUnit: k.pixelsPerUnit,
    unitName: k.unitName,
    unitsPerCell: k.unitsPerCell,
    grid: playGrid(engine),
    counting: k.diagonals,
  };
}

interface Current {
  originId: string;
  targetId: string | null;
  point: Point;
  at: number;
}

/** Ce que le rendu dessine. */
export interface ClickMeasure {
  from: Point;
  to: Point;
  label: string;
  /** Opacité (1, puis vers 0 pendant l'effacement). */
  alpha: number;
  /** L'effacement est en cours : une image de plus est nécessaire. */
  fading: boolean;
}

export class ClickDistance {
  private current: Current | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly engine: MapEngine,
    private readonly prefs: StoreApi<MeasurePrefs>,
  ) {}

  /** Mesure en cours (tests, diagnostic). */
  get active(): Readonly<Current> | null {
    return this.current;
  }

  /** Un clic simple de l'outil sélection. */
  onClick(click: MapClick) {
    const had = this.current !== null;
    this.clear();
    const next = this.measure(click);
    if (next) {
      this.current = next;
      // L'effacement commence plus tard : une image à ce moment-là (rendu à la demande)
      this.timer = setTimeout(() => {
        this.timer = null;
        this.engine.invalidate();
      }, CLICK_HOLD_MS);
    }
    if (had || next) this.engine.invalidate();
  }

  private measure(click: MapClick): Current | null {
    if (!this.prefs.getState().clickDistance || click.alt) return null;
    const origin = pickOrigin(this.engine, click);
    if (!origin) return null;
    const engine = this.engine;
    // Clic sur son propre token : rien
    if (origin.hitTest(click.world, engine.camera.screenToWorldLength(HIT_TOLERANCE_PX)))
      return null;
    const target = pickTarget(engine, click.world, origin);
    const point = target ? { x: target.current.x, y: target.current.y } : { ...click.world };
    if (unitsBetween(origin.current, point, engine.kindContext().pixelsPerUnit) < MIN_UNITS)
      return null;
    return { originId: origin.id, targetId: target?.id ?? null, point, at: engine.now() };
  }

  /** Efface la mesure. */
  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.current) return;
    this.current = null;
    this.engine.invalidate();
  }

  /** Résultat réutilisé d'une image à l'autre (aucune allocation par image). */
  private readonly out: ClickMeasure = {
    from: { x: Number.NaN, y: Number.NaN },
    to: { x: Number.NaN, y: Number.NaN },
    label: '',
    alpha: 1,
    fading: false,
  };
  /** Ce dont l'étiquette dépend en plus des points (réglages de la carte, préférences). */
  private labelDeps: readonly unknown[] = [];

  /**
   * Mesure à dessiner à l'instant `now` (positions affichées : elle suit les tokens) ; null si
   * aucune, expirée, ou si son origine a disparu. L'objet rendu est réutilisé.
   */
  resolve(now: number): ClickMeasure | null {
    const c = this.current;
    if (!c) return null;
    const age = now - c.at;
    const origin = this.engine.entity(c.originId);
    if (age >= CLICK_HOLD_MS + CLICK_FADE_MS || !origin || origin.masks.size) {
      this.clear();
      return null;
    }
    const target = c.targetId ? this.engine.entity(c.targetId) : undefined;
    // Cible disparue ou masquée : on garde son dernier point connu
    if (target && !target.masks.size) {
      c.point.x = target.current.x;
      c.point.y = target.current.y;
    }
    const out = this.out;
    const o = origin.current;
    const kind = this.engine.kindContext();
    const prefs = this.prefs.getState();
    const deps = this.labelDeps;
    if (
      out.from.x !== o.x ||
      out.from.y !== o.y ||
      out.to.x !== c.point.x ||
      out.to.y !== c.point.y ||
      deps[0] !== kind ||
      deps[1] !== prefs
    ) {
      out.from.x = o.x;
      out.from.y = o.y;
      out.to.x = c.point.x;
      out.to.y = c.point.y;
      out.label = distanceText(out.from, out.to, unitContext(this.engine));
      this.labelDeps = [kind, prefs];
    }
    out.fading = age >= CLICK_HOLD_MS;
    out.alpha = 1 - Math.min(1, Math.max(0, age - CLICK_HOLD_MS) / CLICK_FADE_MS);
    return out;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
  }
}
