/**
 * Rendu PixiJS d'un token (docs/carte.md § 5, § 10). Tout est dessiné en coordonnées locales,
 * centrées sur le token ; le moteur place le conteneur (`entity.display`).
 *
 * - Portrait rond ou carré : un `Graphics` rempli par la texture (cadrage « couvrir »), sans
 *   masque, donc regroupé avec les autres tokens en un seul appel de dessin. Texture chargée
 *   une fois par URL et partagée (`ctx.texture`). En attendant, ou sans image : une silhouette.
 * - Anneau à la couleur du camp (thème : joueurs `primary`, alliés `success`, ennemis
 *   `destructive`), anneau de survol et de sélection (la sorte dessine son propre contour).
 * - Sous le token, à taille constante à l'écran : la jauge de la ressource principale (si
 *   l'annuaire la donne à ce viewer) et le nom (`BitmapText`, police partagée).
 * - MJ : pastille de visibilité (caché, pour certains joueurs).
 * - Aucune recréation : chaque partie n'est redessinée que si ce qui la décrit a changé.
 */
import type * as Pixi from 'pixi.js';
import type { BitmapText, Container, Graphics, Texture } from 'pixi.js';
import type { MapTheme, RenderContext } from '../../engine/entities/entity-kind';
import type { MapEntity } from '../../engine/entities/entity';
import type { CharacterInfo, TokenData } from './model';

/** Police des noms : installée une fois pour la page (atlas partagé, glyphes à la demande). */
export const NAME_FONT = 'vtt-token-name';
const NAME_SIZE = 12;
/** Jauge sous le token, en pixels d'écran. */
const BAR_WIDTH = 44;
const BAR_HEIGHT = 5;

function ensureNameFont(pixi: typeof Pixi) {
  if (pixi.Cache.has(`${NAME_FONT}-bitmap`)) return;
  pixi.BitmapFont.install({
    name: NAME_FONT,
    style: {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: NAME_SIZE,
      fontWeight: '600',
      fill: 0xffffff,
    },
    chars: [['a', 'z'], ['A', 'Z'], ['0', '9'], " -’'.()"],
    resolution: 2,
    dynamicFill: true,
  });
}

/** Couleur d'un camp, prise dans le thème (jamais en dur). */
export function sideColor(theme: MapTheme, side: CharacterInfo['side']): number {
  switch (side) {
    case 'players':
      return theme.primary;
    case 'allies':
      return theme.success;
    case 'enemies':
      return theme.destructive;
    default:
      return theme.muted;
  }
}

/** Ce que le rendu lit d'un token : donnée, personnage, état. */
export interface TokenLook {
  size: number;
  shape: TokenData['shape'];
  imageUrl: string | null;
  side: CharacterInfo['side'];
  name: string | null;
  resource: CharacterInfo['resource'];
  /** Brouillon ou écriture optimiste pas encore confirmée. */
  pending: boolean;
  /** Pastille de visibilité du MJ. */
  badge: 'hidden' | 'custom' | null;
  hovered: boolean;
  selected: boolean;
  locked: boolean;
}

interface TokenVisual {
  /** Apparence courante (donnée, annuaire, état), relue à chaque mise à jour. */
  lookOf: (e: MapEntity<TokenData>) => TokenLook;
  body: Graphics;
  outline: Graphics;
  badge: Graphics;
  label: Container;
  bar: Graphics;
  plate: Graphics;
  name: BitmapText;
  releaseLabel: () => void;
  texture: Texture | null;
  textureUrl: string | null;
  loading: string | null;
  keys: Record<'body' | 'outline' | 'badge' | 'label', string>;
}

const visualOf = (e: Pick<MapEntity, 'renderState'>) =>
  e.renderState.token as TokenVisual | undefined;

export function renderToken(
  entity: MapEntity<TokenData>,
  ctx: RenderContext,
  lookOf: (e: MapEntity<TokenData>) => TokenLook,
) {
  const display = entity.display;
  if (!display) return;
  const { pixi } = ctx;
  ensureNameFont(pixi);
  const body = new pixi.Graphics({ label: 'portrait' });
  const outline = new pixi.Graphics({ label: 'contour' });
  const badge = new pixi.Graphics({ label: 'visibilite' });
  const label = new pixi.Container({ label: 'etiquette' });
  const bar = new pixi.Graphics({ label: 'jauge' });
  const plate = new pixi.Graphics({ label: 'plaque' });
  const name = new pixi.BitmapText({
    text: '',
    style: { fontFamily: NAME_FONT, fontSize: NAME_SIZE },
    anchor: { x: 0.5, y: 0 },
  });
  name.tint = ctx.theme.foreground;
  label.addChild(bar, plate, name);
  display.addChild(body, outline, badge, label);
  const visual: TokenVisual = {
    lookOf,
    body,
    outline,
    badge,
    label,
    bar,
    plate,
    name,
    releaseLabel: ctx.screenSpace.add(label, 1),
    texture: null,
    textureUrl: null,
    loading: null,
    keys: { body: '', outline: '', badge: '', label: '' },
  };
  entity.renderState.token = visual;
  updateToken(entity, ctx);
}

export function updateToken(entity: MapEntity<TokenData>, ctx: RenderContext) {
  const v = visualOf(entity);
  if (!v || v.body.destroyed) return;
  const look = v.lookOf(entity);
  loadTexture(entity, v, ctx, look.imageUrl);

  const texture = v.textureUrl === look.imageUrl ? v.texture : null;
  const bodyKey = [
    look.size,
    look.shape,
    texture ? look.imageUrl : '',
    look.side ?? '',
    look.pending ? 1 : 0,
  ].join('|');
  if (bodyKey !== v.keys.body) {
    v.keys.body = bodyKey;
    drawBody(ctx, v.body, look, texture);
  }

  const outlineKey = [
    look.size,
    look.shape,
    look.hovered ? 1 : 0,
    look.selected ? 1 : 0,
    look.locked ? 1 : 0,
    look.hovered || look.selected ? ctx.zoom.toFixed(3) : '',
  ].join('|');
  if (outlineKey !== v.keys.outline) {
    v.keys.outline = outlineKey;
    drawOutline(ctx, v.outline, look);
  }

  const badgeKey = `${look.size}|${look.badge ?? ''}`;
  if (badgeKey !== v.keys.badge) {
    v.keys.badge = badgeKey;
    drawBadge(ctx.theme, v.badge, look);
  }

  const r = look.resource;
  const labelKey = [
    look.name ?? '',
    r ? `${r.value}/${r.max}/${r.color ?? ''}/${r.rising ? 1 : 0}` : '',
  ].join('|');
  if (labelKey !== v.keys.label) {
    v.keys.label = labelKey;
    drawLabel(ctx.theme, v, look);
  }
  // Le nom suit le bas du token (sa taille peut changer sans que le texte change)
  v.label.position.set(0, look.size / 2);
  v.label.alpha = look.pending ? 0.6 : 1;
}

export function disposeToken(entity: MapEntity<TokenData>) {
  const v = visualOf(entity);
  if (!v) return;
  v.releaseLabel();
  // Les textures sont partagées (cache du moteur) : jamais détruites ici
  v.texture = null;
  delete entity.renderState.token;
}

// ─── Texture du portrait ─────────────────────────────────────────────────────

function loadTexture(
  entity: MapEntity<TokenData>,
  v: TokenVisual,
  ctx: RenderContext,
  url: string | null,
) {
  if (!url) {
    v.texture = null;
    v.textureUrl = null;
    v.loading = null;
    return;
  }
  if (v.textureUrl === url || v.loading === url) return;
  v.loading = url;
  ctx.texture(url).then(
    (texture) => {
      if (v.loading !== url || v.body.destroyed) return;
      v.loading = null;
      v.texture = texture;
      v.textureUrl = url;
      v.keys.body = '';
      if (entity.display) {
        updateToken(entity, ctx);
        ctx.invalidate();
      }
    },
    () => {
      // Image illisible (CORS, format) : la silhouette reste
      if (v.loading === url) v.loading = null;
      v.textureUrl = url;
      v.texture = null;
    },
  );
}

// ─── Dessin ──────────────────────────────────────────────────────────────────

function shapePath(g: Graphics, shape: TokenData['shape'], r: number) {
  if (shape === 'square') g.roundRect(-r, -r, r * 2, r * 2, r * 0.18);
  else g.circle(0, 0, r);
}

function drawBody(ctx: RenderContext, g: Graphics, look: TokenLook, texture: Texture | null) {
  const { theme, pixi } = ctx;
  const r = look.size / 2;
  const ring = Math.max(look.size * 0.07, 0.5);
  g.clear();
  if (texture && texture.width > 0 && texture.height > 0) {
    // Cadrage « couvrir » : la texture est placée (en pixels) centrée, à l'échelle du token
    const s = look.size / Math.min(texture.width, texture.height);
    const matrix = new pixi.Matrix()
      .scale(s, s)
      .translate((-texture.width * s) / 2, (-texture.height * s) / 2);
    shapePath(g, look.shape, r);
    g.fill({ texture, matrix, textureSpace: 'global' });
  } else {
    shapePath(g, look.shape, r);
    g.fill({ color: theme.background, alpha: 0.92 });
    // Silhouette : tête et épaules, nettes à toutes les tailles
    g.circle(0, -look.size * 0.1, look.size * 0.16).fill({ color: theme.muted, alpha: 0.7 });
    g.ellipse(0, look.size * 0.27, look.size * 0.26, look.size * 0.15).fill({
      color: theme.muted,
      alpha: 0.7,
    });
  }
  shapePath(g, look.shape, r - ring / 2);
  g.stroke({ width: ring, color: sideColor(theme, look.side), alpha: look.pending ? 0.5 : 1 });
  g.alpha = look.pending ? 0.55 : 1;
}

function drawOutline(ctx: RenderContext, g: Graphics, look: TokenLook) {
  g.clear();
  if (!look.hovered && !look.selected) return;
  const px = 1 / Math.max(ctx.zoom, 1e-6);
  const r = look.size / 2 + 3 * px;
  shapePath(g, look.shape, r);
  g.stroke({
    width: 2 * px,
    color: look.locked ? ctx.theme.muted : ctx.theme.primary,
    alpha: look.selected ? 1 : 0.6,
  });
}

function drawBadge(theme: MapTheme, g: Graphics, look: TokenLook) {
  g.clear();
  if (!look.badge) return;
  const r = look.size / 2;
  const b = Math.max(look.size * 0.15, 1);
  const x = -r * 0.72;
  const y = -r * 0.72;
  g.circle(x, y, b)
    .fill({ color: theme.background, alpha: 0.92 })
    .stroke({
      width: b * 0.14,
      color: theme.muted,
    });
  if (look.badge === 'hidden') {
    // Croissant : vu seulement de près ou éclairé
    g.circle(x, y, b * 0.55).fill({ color: theme.foreground });
    g.circle(x + b * 0.3, y - b * 0.2, b * 0.48).fill({ color: theme.background });
  } else {
    // Deux silhouettes : vu de certains joueurs
    for (const dx of [-0.32, 0.32]) {
      g.circle(x + dx * b, y - b * 0.22, b * 0.2).fill({ color: theme.foreground });
      g.ellipse(x + dx * b, y + b * 0.3, b * 0.28, b * 0.2).fill({ color: theme.foreground });
    }
  }
}

function drawLabel(theme: MapTheme, v: TokenVisual, look: TokenLook) {
  let y = 4;
  const r = look.resource;
  v.bar.clear();
  if (r && r.max > 0) {
    const part = Math.max(0, Math.min(1, r.value / r.max));
    const x = -BAR_WIDTH / 2;
    v.bar
      .roundRect(x, y, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2)
      .fill({ color: theme.background, alpha: 0.85 })
      .stroke({ width: 1, color: theme.muted, alpha: 0.6 });
    if (part > 0)
      v.bar
        .roundRect(x + 1, y + 1, (BAR_WIDTH - 2) * part, BAR_HEIGHT - 2, (BAR_HEIGHT - 2) / 2)
        .fill({ color: r.color ?? (r.rising ? theme.destructive : theme.success) });
    y += BAR_HEIGHT + 3;
  }
  v.plate.clear();
  const text = look.name ?? '';
  if (v.name.text !== text) v.name.text = text;
  v.name.visible = text.length > 0;
  if (!text) return;
  v.name.position.set(0, y + 2);
  const w = v.name.width + 12;
  const h = NAME_SIZE + 6;
  v.plate
    .roundRect(-w / 2, y, w, h, h / 2)
    .fill({ color: theme.background, alpha: 0.78 })
    .stroke({ width: 1, color: theme.muted, alpha: 0.35 });
}
