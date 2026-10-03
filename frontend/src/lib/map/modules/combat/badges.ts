/**
 * Badges d'états sur les tokens (docs/combat.md § 12.5) : l'icône que la présentation donne à
 * chaque état (`STATE_ICONS`, lucide), sa durée restante, et au survol du token le libellé de
 * tous ses états. Plan `adornments`, à taille constante à l'écran, en haut à gauche du portrait
 * (le badge de visibilité du MJ est en haut à droite) ; ils ne dépendent d'aucun réglage
 * d'affichage des tokens, comme les anneaux.
 *
 * Aucune fuite : les états viennent des fiches que je peux lire (MJ : toutes ; joueur : celles
 * des héros et des alliés, jamais celle d'un PNJ ennemi, Q4), et un token masqué pour moi
 * (vision, affichage) n'a pas de badge.
 */
import type { IconeEtat } from '@vtt/rules';
import type { Container, GraphicsContext } from 'pixi.js';
import { lucideSvg, STATE_ICONS } from '@/lib/combat/state-icons';
import type { MapEntity } from '../../engine/entities/entity';
import type { MapEngine } from '../../engine/map-engine';
import { TOKEN_KIND_ID } from '../tokens/edit';
import { TOKENS_COLLECTION } from '../tokens/model';
import { characterOf } from './model';

/** Un état posé sur un personnage, tel que la carte le montre. */
export interface MapStateBadge {
  icon: IconeEtat;
  name: string;
  /** Rounds restants ; null : jusqu'au retrait. */
  duration: number | null;
}

export interface BadgeSource {
  /** États par personnage (ceux que je peux lire). */
  snapshot(): ReadonlyMap<string, readonly MapStateBadge[]>;
  subscribe(listener: () => void): () => void;
}

/** Badges montrés sur un token, au plus ; les suivants sont comptés (« +2 »). */
export const MAX_BADGES = 4;
/** Rayon d'un badge et écart entre deux, en pixels d'écran. */
const RADIUS = 8;
const GAP = 3;
const ICON = 11;

/** Badges à dessiner, et combien restent sans badge. */
export function visibleBadges(
  states: readonly MapStateBadge[],
  max = MAX_BADGES,
): { shown: readonly MapStateBadge[]; more: number } {
  if (states.length <= max) return { shown: states, more: 0 };
  return { shown: states.slice(0, max - 1), more: states.length - (max - 1) };
}

/** Libellé au survol : « Aveuglé (2) · Étourdi ». */
export function badgeLabel(states: readonly MapStateBadge[]): string {
  return states
    .map((s) => (s.duration !== null ? `${s.name} (${s.duration})` : s.name))
    .join(' · ');
}

/** Fiches dont un joueur lit les états : les siennes, celles des héros et des alliés. */
export function readableSheets(
  characterIds: readonly string[],
  o: {
    gm: boolean;
    mine: readonly string[];
    sideOf: (id: string) => string | null | undefined;
  },
): string[] {
  if (o.gm) return [...characterIds];
  return characterIds.filter((id) => {
    const side = o.sideOf(id);
    return o.mine.includes(id) || side === 'players' || side === 'allies';
  });
}

/** Clé d'un dessin (redessiné seulement quand les états du token changent). */
const keyOf = (states: readonly MapStateBadge[]) =>
  states.map((s) => `${s.icon}:${s.name}:${s.duration ?? ''}`).join('|');

const shown = (e: MapEntity) => e.masks.size === 0 && e.display?.visible === true;

export function mountStateBadges(engine: MapEngine, source: BadgeSource): () => void {
  return engine.whenMounted(() => {
    const pixi = engine.pixi;
    const plane = engine.plane('adornments');
    const theme = engine.theme;
    if (!pixi || !plane || !theme) return;
    const root = new pixi.Container({ label: 'combat-states' });
    root.eventMode = 'none';
    plane.addChild(root);

    // Tracés de chaque icône, lus une fois et partagés par tous les badges
    const icons = new Map<IconeEtat, GraphicsContext>();
    const iconOf = (icon: IconeEtat) => {
      let c = icons.get(icon);
      if (!c) {
        c = new pixi.GraphicsContext();
        const svg = lucideSvg(STATE_ICONS[icon]);
        if (svg) c.svg(svg);
        icons.set(icon, c);
      }
      return c;
    };
    const text = (value: string, size: number, weight: '600' | '700', color: number) =>
      new pixi.Text({
        text: value,
        style: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: size,
          fontWeight: weight,
          fill: color,
        },
      });

    interface Group {
      entity: MapEntity;
      states: readonly MapStateBadge[];
      key: string;
      box: Container;
      release: () => void;
      label: Container | null;
    }
    const groups = new Map<string, Group>();
    let snap = source.snapshot();
    let stopFrames: (() => void) | null = null;

    const draw = (g: Group) => {
      for (const child of g.box.removeChildren()) child.destroy({ children: true });
      g.label = null;
      const { shown: list, more } = visibleBadges(g.states);
      list.forEach((s, i) => {
        const x = i * (2 * RADIUS + GAP);
        const disc = new pixi.Graphics();
        disc
          .circle(x, 0, RADIUS)
          .fill({ color: theme.background, alpha: 0.94 })
          .stroke({ width: 1.2, color: theme.primary, alpha: 0.9 });
        const icon = new pixi.Graphics(iconOf(s.icon));
        icon.scale.set(ICON / 24);
        icon.position.set(x - ICON / 2, -ICON / 2);
        icon.tint = theme.foreground;
        g.box.addChild(disc, icon);
        if (s.duration !== null) {
          const d = text(String(s.duration), 8, '700', theme.primary);
          d.anchor.set(0.5);
          d.position.set(x + RADIUS - 1, RADIUS - 1);
          g.box.addChild(d);
        }
      });
      if (more) {
        const m = text(`+${more}`, 10, '700', theme.foreground);
        m.anchor.set(0, 0.5);
        m.position.set(list.length * (2 * RADIUS + GAP) - RADIUS + 1, 0);
        g.box.addChild(m);
      }
    };

    const dropGroup = (id: string, g: Group) => {
      g.release();
      g.box.destroy({ children: true });
      groups.delete(id);
    };

    /** Groupe de badges du token (refait si l'entité a été remplacée). */
    const groupOf = (e: MapEntity, states: readonly MapStateBadge[]): Group => {
      let g = groups.get(e.id);
      if (g && g.entity !== e) {
        dropGroup(e.id, g);
        g = undefined;
      }
      if (g) return g;
      const box = new pixi.Container({ label: 'combat-states-token' });
      box.visible = false;
      root.addChild(box);
      g = {
        entity: e,
        states,
        key: '',
        box,
        release: engine.screenSpace.add(box, 1),
        label: null,
      };
      groups.set(e.id, g);
      return g;
    };

    /** Badges d'un token, redessinés si ses états ont changé. */
    const indexToken = (e: MapEntity, keep: Set<string>) => {
      const c = characterOf(e);
      const states = c ? snap.get(c) : undefined;
      if (!states?.length) return;
      keep.add(e.id);
      const key = keyOf(states);
      const g = groupOf(e, states);
      g.states = states;
      if (g.key !== key) {
        g.key = key;
        draw(g);
      }
    };

    /** La boucle d'images ne tourne que s'il y a des badges. */
    const syncFrames = () => {
      if (groups.size && !stopFrames) stopFrames = engine.onFrame(() => void frame());
      if (!groups.size && stopFrames) {
        stopFrames();
        stopFrames = null;
      }
    };

    const index = () => {
      const keep = new Set<string>();
      if (snap.size) for (const e of engine.entitiesOfKind(TOKEN_KIND_ID)) indexToken(e, keep);
      for (const [id, g] of groups) if (!keep.has(id)) dropGroup(id, g);
      syncFrames();
      frame();
      engine.invalidate();
    };

    const frame = () => {
      for (const g of groups.values()) {
        const e = g.entity;
        const visible = shown(e);
        g.box.visible = visible;
        if (!visible) continue;
        // En haut à gauche du portrait (sur le bord, à 45° pour un rond)
        const k = (Math.max(e.current.width, e.current.height) / 2) * Math.SQRT1_2;
        g.box.position.set(e.current.x - k, e.current.y - k);
        // Au survol du token : le libellé de tous ses états, sous les badges
        const hovered = engine.tooltipId === e.id;
        if (hovered && !g.label) {
          const label = new pixi.Container({ label: 'combat-states-label' });
          const t = text(badgeLabel(g.states), 11, '600', theme.foreground);
          t.position.set(6, 3);
          const back = new pixi.Graphics();
          back
            .roundRect(0, 0, t.width + 12, t.height + 6, 6)
            .fill({ color: theme.background, alpha: 0.88 })
            .stroke({ width: 1, color: theme.muted, alpha: 0.5 });
          label.addChild(back, t);
          label.position.set(-RADIUS, RADIUS + 4);
          g.box.addChild(label);
          g.label = label;
        } else if (!hovered && g.label) {
          g.label.destroy({ children: true });
          g.label = null;
        }
      }
    };

    const unsubscribe = source.subscribe(() => {
      snap = source.snapshot();
      index();
    });
    // Tokens ajoutés, retirés ou remplacés : badges recalculés
    const unwatch = engine.store.subscribe((s, prev) => {
      if (s.collections[TOKENS_COLLECTION] !== prev.collections[TOKENS_COLLECTION]) index();
    });
    index();

    return () => {
      unsubscribe();
      unwatch();
      stopFrames?.();
      for (const g of groups.values()) g.release();
      groups.clear();
      root.destroy({ children: true });
      for (const c of icons.values()) c.destroy();
      icons.clear();
    };
  });
}
