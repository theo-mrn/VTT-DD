/**
 * Mesures éphémères à l'écran (docs/carte.md § 10, Mesures) : la mienne (en cours, récente,
 * aperçu d'une poignée) et celles des autres (direct), dans le plan `live`. Un `MeasureVisual`
 * par mesure, créé à son arrivée et libéré à son départ ; redessiné seulement si elle change ;
 * l'effacement ne touche que l'opacité.
 */
import type * as Pixi from 'pixi.js';
import type { MapTheme } from '@/lib/map/engine/entities/entity-kind';
import { unitContext } from './click-distance';
import type { MeasureModule } from './context';
import { releasedAlpha, type ShownMeasure } from './live-measures';
import { measureLabel, type MeasureSpec } from './model';
import { MeasureVisual } from './render';
import { SkinSlot, type SkinTextures } from './skins';

const LOCAL_KEY = 'local';

export class MeasureLayer {
  private readonly visuals = new Map<string, MeasureVisual>();
  private readonly skinSlots = new Map<string, SkinSlot>();
  private readonly shown: ShownMeasure[] = [];
  private readonly seen = new Set<string>();
  private readonly local: ShownMeasure = {
    key: LOCAL_KEY,
    spec: { shape: 'line', start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, options: {} },
    color: '',
    skin: null,
    alpha: 1,
    fading: false,
  };
  /** Étiquettes gardées par mesure : refaites seulement si la forme ou les unités changent. */
  private readonly labels = new Map<string, { spec: MeasureSpec; deps: unknown[]; text: string }>();

  constructor(
    private readonly ctx: MeasureModule,
    private readonly pixi: typeof Pixi,
    private readonly theme: MapTheme,
    private readonly plane: Pixi.Container,
    private readonly skins: SkinTextures,
  ) {}

  /** Mesures à montrer à l'instant `now` (tests : sans rendu). */
  collect(now: number): ShownMeasure[] {
    const list = this.ctx.remote.shown(now, this.shown);
    const m = this.ctx.local.getState().measure;
    if (m) {
      const alpha = m.phase === 'recent' ? releasedAlpha(now - m.releasedAt) : 1;
      if (alpha !== null) {
        const l = this.local;
        l.spec = m.spec;
        l.color = m.color;
        l.skin = m.skin;
        l.alpha = alpha;
        l.fading = alpha < 1;
        list.push(l);
      }
    }
    return list;
  }

  /** Dessine ; renvoie vrai si une image de plus est nécessaire (effacement en cours). */
  sync(now: number, zoom: number): boolean {
    const list = this.collect(now);
    if (!list.length && !this.visuals.size) return false;
    const engine = this.ctx.engine;
    const kind = engine.kindContext();
    const prefs = this.ctx.prefs.getState();
    let again = false;
    this.seen.clear();
    for (const m of list) {
      this.seen.add(m.key);
      let v = this.visuals.get(m.key);
      let slot = this.skinSlots.get(m.key);
      if (!v || !slot) {
        v = new MeasureVisual(this.pixi, this.theme, this.plane);
        slot = new SkinSlot(this.pixi, v.skinSlot, this.skins);
        this.visuals.set(m.key, v);
        this.skinSlots.set(m.key, slot);
      }
      const skinned = slot.set(m.skin, m.spec, kind.pixelsPerUnit);
      let label = this.labels.get(m.key);
      if (!label || label.spec !== m.spec || label.deps[0] !== kind || label.deps[1] !== prefs) {
        label = {
          spec: m.spec,
          deps: [kind, prefs],
          text: measureLabel(m.spec, unitContext(engine)),
        };
        this.labels.set(m.key, label);
      }
      v.draw({
        spec: m.spec,
        color: m.color,
        pixelsPerUnit: kind.pixelsPerUnit,
        zoom,
        label: label.text,
        fill: !skinned,
      });
      v.root.alpha = m.alpha;
      if (m.fading) again = true;
    }
    for (const [key, v] of this.visuals) {
      if (this.seen.has(key)) continue;
      this.skinSlots.get(key)?.release();
      this.skinSlots.delete(key);
      v.destroy();
      this.visuals.delete(key);
      this.labels.delete(key);
    }
    return again;
  }

  /** Visuel d'une mesure affichée (effets animés). */
  visual(key: string): MeasureVisual | undefined {
    return this.visuals.get(key);
  }

  destroy() {
    for (const slot of this.skinSlots.values()) slot.release();
    for (const v of this.visuals.values()) v.destroy();
    this.skinSlots.clear();
    this.visuals.clear();
    this.labels.clear();
  }
}
