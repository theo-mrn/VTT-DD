/**
 * Rendu Pixi d'un objet de carte (docs/carte.md § 5, § 10), dans le conteneur de l'entité,
 * en coordonnées locales centrées sur l'objet (le moteur place, tourne et met à l'échelle le
 * conteneur pendant les gestes).
 *
 * - Image : un `Sprite` dont la texture vient du cache du moteur (`ctx.texture`, une seule
 *   texture par adresse, partagée par tous les objets) ; jamais recréé, seulement retexturé
 *   quand l'adresse change et redimensionné quand la taille change.
 * - Sans image (« zone à fouiller » posée sur un coffre peint dans le fond) : un cadre pour le
 *   MJ seulement ; les joueurs ne voient que le repère de fouille.
 * - Image en chargement : un cadre discret ; image illisible : cadre barré (pour tous), et un
 *   avertissement en console une fois par adresse.
 * - Repères à taille constante à l'écran : cadenas (MJ, objet verrouillé) en haut à gauche,
 *   loupe (objet à fouiller) en bas à droite. Le masquage aux joueurs (hachures, œil barré) est
 *   dessiné par le moteur.
 *
 * Aucun import de `pixi.js` ici : le module arrive par `ctx.pixi` (le fichier reste testable).
 */
import type { Graphics, GraphicsContext, Sprite, Texture } from 'pixi.js';
import type { MapEntity } from '../../engine/entities/entity';
import type { MapTheme, RenderContext } from '../../engine/entities/entity-kind';
import type { MapDto } from '../../store/map-store';

type Status = 'none' | 'loading' | 'ready' | 'error';

interface ObjectView {
  sprite: Sprite;
  frame: Graphics;
  /** Repères créés au premier besoin (la plupart des objets n'en ont pas). */
  lock: Graphics | null;
  search: Graphics | null;
  url: string;
  status: Status;
  width: number;
  height: number;
  gm: boolean;
  /** Dernier chargement demandé : une réponse plus ancienne est ignorée. */
  loads: number;
  disposed: boolean;
  releases: (() => void)[];
}

interface ObjectLike extends MapDto {
  imageUrl?: string;
  width: number;
  height: number;
  rotation: number;
  isLocked?: boolean;
  searchable?: boolean;
}

const VIEW_KEY = 'objectView';
/** Rayon d'un repère (cadenas, loupe), en pixels d'écran. */
const BADGE_RADIUS = 9;

const warned = new Set<string>();

const viewOf = (entity: MapEntity): ObjectView | undefined =>
  entity.renderState[VIEW_KEY] as ObjectView | undefined;

/** Proportions naturelles de l'image affichée (largeur / hauteur), ou null. */
export function imageAspect(entity: MapEntity): number | null {
  const view = viewOf(entity);
  if (view?.status !== 'ready') return null;
  const t: Texture = view.sprite.texture;
  const w = t.orig?.width ?? t.width;
  const h = t.orig?.height ?? t.height;
  return w > 0 && h > 0 ? w / h : null;
}

/** Cadenas dans un disque, centré sur (0, 0), en pixels d'écran. */
function drawLock(g: GraphicsContext, theme: MapTheme) {
  g.circle(0, 0, BADGE_RADIUS)
    .fill({ color: theme.background, alpha: 0.9 })
    .stroke({ width: 1, color: theme.muted, alpha: 0.9 })
    .roundRect(-3.8, -0.8, 7.6, 5.6, 1.2)
    .fill({ color: theme.foreground })
    .moveTo(-2.4, -0.8)
    .lineTo(-2.4, -2.6)
    .arc(0, -2.6, 2.4, Math.PI, 0)
    .lineTo(2.4, -0.8)
    .stroke({ width: 1.4, color: theme.foreground });
}

/** Loupe dans un disque, centrée sur (0, 0), en pixels d'écran. */
function drawSearch(g: GraphicsContext, theme: MapTheme) {
  g.circle(0, 0, BADGE_RADIUS)
    .fill({ color: theme.background, alpha: 0.9 })
    .stroke({ width: 1, color: theme.primary, alpha: 0.9 })
    .circle(-1.2, -1.2, 3.3)
    .stroke({ width: 1.5, color: theme.primary })
    .moveTo(1.3, 1.3)
    .lineTo(4.2, 4.2)
    .stroke({ width: 1.8, color: theme.primary, cap: 'round' });
}

type BadgeKind = 'lock' | 'search';

/**
 * Dessins des repères, tracés une fois par thème et partagés par tous les objets (un seul
 * `GraphicsContext` par repère : la géométrie n'est pas dupliquée sur le GPU).
 */
const badgeContexts = new WeakMap<MapTheme, Record<BadgeKind, GraphicsContext>>();

function badgeContext(ctx: RenderContext, kind: BadgeKind): GraphicsContext {
  let shared = badgeContexts.get(ctx.theme);
  if (!shared) {
    const lock = new ctx.pixi.GraphicsContext();
    const search = new ctx.pixi.GraphicsContext();
    drawLock(lock, ctx.theme);
    drawSearch(search, ctx.theme);
    shared = { lock, search };
    badgeContexts.set(ctx.theme, shared);
  }
  return shared[kind];
}

/** Repère de l'objet, créé au premier besoin (taille constante à l'écran). */
function badge(
  view: ObjectView,
  kind: BadgeKind,
  ctx: RenderContext,
  display: MapEntity['display'],
) {
  const existing = view[kind];
  if (existing || !display) return existing;
  const g = new ctx.pixi.Graphics({ context: badgeContext(ctx, kind), label: kind });
  display.addChild(g);
  view[kind] = g;
  view.releases.push(ctx.screenSpace.add(g));
  return g;
}

/** Cadre de l'objet : zone sans image (MJ), chargement, image illisible. */
function drawFrame(view: ObjectView, theme: MapTheme) {
  const g = view.frame;
  g.clear();
  const w = view.width;
  const h = view.height;
  const x = -w / 2;
  const y = -h / 2;
  const line = Math.min(6, Math.max(1.5, Math.min(w, h) * 0.04));
  const r = Math.min(w, h) * 0.08;
  switch (view.status) {
    case 'ready':
      g.visible = false;
      return;
    case 'none':
      // Zone à fouiller : seul le MJ la voit
      if (!view.gm) {
        g.visible = false;
        return;
      }
      g.roundRect(x, y, w, h, r)
        .fill({ color: theme.primary, alpha: 0.08 })
        .stroke({ width: line, color: theme.primary, alpha: 0.7 });
      break;
    case 'loading':
      g.roundRect(x, y, w, h, r).fill({ color: theme.muted, alpha: 0.12 });
      break;
    case 'error':
      g.roundRect(x, y, w, h, r)
        .fill({ color: theme.muted, alpha: 0.2 })
        .stroke({ width: line, color: theme.destructive, alpha: 0.6 })
        .moveTo(x + w * 0.3, y + h * 0.3)
        .lineTo(x + w * 0.7, y + h * 0.7)
        .moveTo(x + w * 0.7, y + h * 0.3)
        .lineTo(x + w * 0.3, y + h * 0.7)
        .stroke({ width: line, color: theme.destructive, alpha: 0.6 });
      break;
  }
  g.visible = true;
}

/** Place les repères aux coins et les garde droits (ils ne tournent pas avec l'objet). */
function placeBadges(view: ObjectView, o: ObjectLike, ctx: RenderContext, entity: MapEntity) {
  const hw = view.width / 2;
  const hh = view.height / 2;
  const locked = view.gm && o.isLocked === true;
  const lock = locked ? badge(view, 'lock', ctx, entity.display) : view.lock;
  if (lock) {
    lock.visible = locked;
    lock.position.set(-hw, -hh);
    lock.angle = -(o.rotation || 0);
  }
  const searchable = o.searchable === true;
  const search = searchable ? badge(view, 'search', ctx, entity.display) : view.search;
  if (search) {
    search.visible = searchable;
    search.position.set(hw, hh);
    search.angle = -(o.rotation || 0);
  }
}

function loadImage(view: ObjectView, url: string, ctx: RenderContext) {
  view.url = url;
  view.sprite.visible = false;
  const token = ++view.loads;
  if (!url) {
    view.status = 'none';
    drawFrame(view, ctx.theme);
    return;
  }
  view.status = 'loading';
  drawFrame(view, ctx.theme);
  const theme = ctx.theme;
  const invalidate = ctx.invalidate;
  ctx.texture(url).then(
    (texture) => {
      if (view.disposed || token !== view.loads || view.sprite.destroyed) return;
      view.status = 'ready';
      view.sprite.texture = texture;
      view.sprite.setSize(view.width, view.height);
      view.sprite.visible = true;
      drawFrame(view, theme);
      invalidate();
    },
    (err: unknown) => {
      if (view.disposed || token !== view.loads || view.frame.destroyed) return;
      view.status = 'error';
      drawFrame(view, theme);
      invalidate();
      if (!warned.has(url)) {
        warned.add(url);
        console.warn('[carte] image d’objet illisible', url, err);
      }
    },
  );
}

/** Premier rendu : sprite et cadre, créés une fois pour toute la vie de l'entité. */
export function renderObject(entity: MapEntity, ctx: RenderContext) {
  const display = entity.display;
  if (!display) return;
  const o = entity.data as ObjectLike;
  const { pixi } = ctx;
  const sprite = new pixi.Sprite();
  sprite.anchor.set(0.5);
  sprite.visible = false;
  const frame = new pixi.Graphics({ label: 'frame' });
  display.addChild(frame, sprite);
  const view: ObjectView = {
    sprite,
    frame,
    lock: null,
    search: null,
    url: '',
    status: 'none',
    width: o.width,
    height: o.height,
    gm: ctx.viewer.role === 'gm',
    loads: 0,
    disposed: false,
    releases: [],
  };
  entity.renderState[VIEW_KEY] = view;
  loadImage(view, o.imageUrl ?? '', ctx);
  placeBadges(view, o, ctx, entity);
}

/** Mise à jour incrémentale : seulement ce que la donnée a changé. */
export function updateObject(entity: MapEntity, ctx: RenderContext, change: { previous?: MapDto }) {
  const view = viewOf(entity);
  if (!view || view.disposed) {
    renderObject(entity, ctx);
    return;
  }
  // Survol, sélection, fantôme : le moteur s'en charge
  if (change.previous === undefined) return;
  const o = entity.data as ObjectLike;
  const gm = ctx.viewer.role === 'gm';
  const resized = view.width !== o.width || view.height !== o.height;
  let redraw = gm !== view.gm;
  view.gm = gm;
  if (resized) {
    view.width = o.width;
    view.height = o.height;
    if (view.status === 'ready') view.sprite.setSize(o.width, o.height);
    redraw = true;
  }
  const url = o.imageUrl ?? '';
  if (url !== view.url) loadImage(view, url, ctx);
  else if (redraw) drawFrame(view, ctx.theme);
  placeBadges(view, o, ctx, entity);
}

/** L'entité disparaît : plus de repères à taille constante, plus de chargement attendu. */
export function disposeObject(entity: MapEntity) {
  const view = viewOf(entity);
  if (!view) return;
  view.disposed = true;
  for (const release of view.releases.splice(0)) release();
  delete entity.renderState[VIEW_KEY];
}
