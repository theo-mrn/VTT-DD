/**
 * Gabarits épinglés (docs/carte.md § 10, Mesures) : sorte `measurement`, couche
 * `measurements`, plan `annotations` (au-dessus de l'ombre).
 *
 * - Géométrie commune : centre = origine (`start`), taille = 2 × la longueur, rotation = la
 *   direction (degrés). Glisser déplace l'origine et l'extrémité ensemble ; le direct d'une
 *   poignée (`transform`) porte la longueur et la direction.
 * - Toucher : le contour (ou le trait de la règle) et l'origine seulement, à 6 px d'écran : un
 *   personnage dans un cercle reste cliquable.
 * - Droits : l'auteur ou le MJ (`authorOrGm`, miroir du service campaign) ; les autres regardent.
 * - Dessin en coordonnées du monde (`transformDisplay: false`), redessiné quand la donnée,
 *   l'état (survol, sélection : étiquette) ou le palier de zoom change.
 */
import { translate } from '@/i18n/runtime';
import { Palette, Users } from 'lucide-react';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import {
  authorOrGm,
  type EntityKind,
  type MenuItem,
  type RenderContext,
} from '@/lib/map/engine/entities/entity-kind';
import { inflateRect, type EntityGeometry } from '@/lib/map/engine/geometry';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { Persistence } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';
import { OverlayRedraw } from '@/lib/map/features/obstacles/engine/overlay';
import { unitContext } from './click-distance';
import type { MeasureModule } from './context';
import {
  MEASURE_COLORS,
  MEASURE_SHAPES,
  measureShapeLabel,
  MEASUREMENT_KIND,
  MEASUREMENTS,
  measureLabel,
  outlineBounds,
  placedSpec,
  reach,
  specOf,
  touchesOutline,
  type MeasureSpec,
  type MeasurementData,
} from './model';
import { editable, tokensInZone, updateTemplates } from './operations';
import { MeasureVisual } from './render';
import { SkinSlot, type SkinTextures } from './skins';

/** Masque d'un gabarit pendant sa poignée : l'aperçu de l'outil le montre à sa place. */
export const RESHAPE_MASK = 'measure:reshape';

const templateOf = (e: MapEntity) => e.data as MeasurementData;

/** Géométrie commune d'un gabarit. */
export function templateGeometry(m: Pick<MeasurementData, 'start' | 'end'>): EntityGeometry {
  const { length, angle } = reach(m);
  return {
    x: m.start.x,
    y: m.start.y,
    width: 2 * length,
    height: 2 * length,
    rotation: (angle * 180) / Math.PI,
  };
}

/** Forme affichée d'un gabarit (aperçu d'un glisser, direct d'une poignée compris). */
export function specOfEntity(e: MapEntity): MeasureSpec {
  const spec = specOf(templateOf(e));
  const c = e.current;
  const { length } = reach(spec);
  const scaled = c.width / 2;
  const base = placedSpec(spec, { x: c.x, y: c.y }, c.rotation);
  if (Math.abs(scaled - length) < 1e-6) return base;
  const a = (c.rotation * Math.PI) / 180;
  return {
    ...base,
    end: { x: c.x + Math.cos(a) * scaled, y: c.y + Math.sin(a) * scaled },
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Dessin des gabarits : un `MeasureVisual` par entité, dans son conteneur. */
export class TemplateView {
  private readonly redraw: OverlayRedraw;
  private readonly visuals = new Map<string, MeasureVisual>();
  private readonly skinSlots = new Map<string, SkinSlot>();

  constructor(
    private readonly ctx: MeasureModule,
    private readonly skins: SkinTextures,
  ) {
    this.redraw = new OverlayRedraw(ctx.engine, (e) => this.draw(e));
  }

  mount(e: MapEntity, rc: RenderContext) {
    if (!e.display) return;
    const v = new MeasureVisual(rc.pixi, rc.theme, e.display);
    this.visuals.set(e.id, v);
    this.skinSlots.set(e.id, new SkinSlot(rc.pixi, v.skinSlot, this.skins));
    this.redraw.track(e);
    this.draw(e);
  }

  unmount(e: MapEntity) {
    // Le conteneur (et le dessin) est libéré par le moteur avec l'entité
    this.skinSlots.get(e.id)?.release();
    this.skinSlots.delete(e.id);
    this.visuals.delete(e.id);
    this.redraw.untrack(e);
  }

  /** Visuel d'une entité (effets animés). */
  visual(id: string): MeasureVisual | undefined {
    return this.visuals.get(id);
  }

  draw(e: MapEntity) {
    const v = this.visuals.get(e.id);
    if (!v) return;
    const engine = this.ctx.engine;
    const m = templateOf(e);
    const spec = specOf(m);
    const shown = e.state.selected || e.state.hovered;
    const ppu = engine.kindContext().pixelsPerUnit;
    const skinned = this.skinSlots.get(e.id)?.set(m.skin, spec, ppu) ?? false;
    v.draw({
      spec,
      color: m.color,
      pixelsPerUnit: ppu,
      zoom: 1 / this.redraw.unit,
      fill: !skinned,
      label: shown ? measureLabel(spec, unitContext(engine)) : null,
      emphasis: emphasisOf(e.state),
    });
  }

  /** Préférences changées (comptage des cases) : étiquettes refaites. */
  refreshAll() {
    for (const e of this.ctx.engine.entitiesOfKind(MEASUREMENT_KIND)) this.draw(e);
  }

  dispose() {
    this.redraw.dispose();
    for (const slot of this.skinSlots.values()) slot.release();
    this.skinSlots.clear();
    this.visuals.clear();
  }
}

/** Entrées du menu d'un gabarit : personnages dans la zone, couleur. */
function templateActions(
  ctx: MeasureModule,
  entities: readonly MapEntity[],
  engine: MapEngine,
): MenuItem[] {
  const items: MenuItem[] = [];
  const single = entities.length === 1 ? entities[0]! : null;
  if (single && templateOf(single).shape !== 'line') {
    const tokens = tokensInZone(engine, specOfEntity(single));
    items.push({
      id: 'measure:zone',
      label: translate('map.measurements.selectInZone', { count: tokens.length }),
      icon: Users,
      disabled: !tokens.length,
      run: () => engine.selection.replace(tokens.map((t) => t.id)),
    });
  }
  const mine = editable(engine, entities);
  if (mine.length)
    items.push({
      id: 'measure:color',
      label: translate('map.lights.color'),
      icon: Palette,
      children: MEASURE_COLORS.map((c) => ({
        id: `measure:color:${c.value}`,
        label: translate(`map.measurements.colors.${c.name}`),
        checked: mine.every((e) => templateOf(e).color.toLowerCase() === c.value),
        run: () =>
          void updateTemplates(ctx, translate('map.measurements.templateColor'), mine, (d) =>
            d.color === c.value ? d : { ...d, color: c.value },
          ),
      })),
    });
  return items;
}

export function measurementKind(ctx: MeasureModule, view: TemplateView): EntityKind<MapDto> {
  const ppu = () => ctx.engine.kindContext().pixelsPerUnit;
  const data = (d: MapDto) => d as MeasurementData;
  return {
    id: MEASUREMENT_KIND,
    label: translate('map.measurements.template'),
    collection: MEASUREMENTS,
    capabilities: ['select', 'move', 'duplicate', 'delete', 'inspect'],
    plane: 'annotations',
    selfOutline: true,
    transformDisplay: false,
    geometry: (m) => templateGeometry(data(m)),
    applyGeometry: (m, g) => {
      const a = (g.rotation * Math.PI) / 180;
      const l = g.width / 2;
      return {
        ...data(m),
        start: { x: round(g.x), y: round(g.y) },
        end: { x: round(g.x + Math.cos(a) * l), y: round(g.y + Math.sin(a) * l) },
      };
    },
    // Contour et origine, à 6 px d'écran (`tolerance` : 4 px d'écran)
    hitTest: (e, p, tolerance) => touchesOutline(specOfEntity(e), p, tolerance * 1.5, ppu()),
    bounds: (e) => inflateRect(outlineBounds(specOfEntity(e), ppu()), 2),
    name: (m) =>
      MEASURE_SHAPES.some((s) => s.value === data(m).shape)
        ? measureShapeLabel(data(m).shape)
        : translate('map.measurements.template'),
    can: authorOrGm('createdBy'),
    render: (e, rc) => view.mount(e, rc),
    update: (e) => view.draw(e),
    dispose: (e) => view.unmount(e),
    actions: (entities, a) => templateActions(ctx, entities, a.engine as MapEngine),
    duplicate: (d, offset) => {
      const m = data(d);
      return {
        ...m,
        start: { x: m.start.x + offset.x, y: m.start.y + offset.y },
        end: { x: m.end.x + offset.x, y: m.end.y + offset.y },
        createdBy: ctx.engine.viewer.userId,
      };
    },
    liveAudience: () => 'public',
    persistence: ctx.persistence as unknown as Persistence<MapDto>,
  };
}

/** Mise en avant d'une entité : sélectionnée, survolée, ou rien. */
function emphasisOf(state: { selected?: boolean; hovered?: boolean }) {
  if (state.selected) return 'selected' as const;
  return state.hovered ? ('hover' as const) : null;
}
