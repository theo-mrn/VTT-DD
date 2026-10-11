/**
 * Outil lumières (L) (docs/carte.md § 10, Lumières) : la machine à états commune des points à
 * rayon (`RadiusTool`), testée sans rendu.
 *
 * | État       | Entrée                                        | Sortie                                    |
 * | ---------- | --------------------------------------------- | ----------------------------------------- |
 * | `idle`     | bouton sur la poignée de rayon → `radius`     | bouton sur une lumière : gestes communs   |
 * |            | bouton dans le vide → `pressing`              |                                           |
 * | `pressing` | +4 px : lasso (gestes communs)                | lâcher : une lumière posée et sélectionnée |
 * | `radius`   | rayon en unités (pas d'une demi-case ; Alt : libre), affiché | lâcher : une commande ; Échap : rien |
 * | `select`   | clic, glisser, lasso (gestes communs, lumières seulement) | lâcher                          |
 *
 * La pose s'aimante au centre de la case, comme le glisser commun (Alt : libre).
 */
import { translate } from '@/i18n/runtime';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import { snapToCellCenter } from '@/lib/map/engine/interaction/snapping';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { RadiusTool, type RadiusToolState } from '@/lib/map/engine/tools/radius-tool';
import type { MapPointer } from '@/lib/map/engine/tools/tool';
import { createCommand } from '@/lib/map/store/commands';
import { patchLights, type LightContext, type LightView } from './kind';
import {
  DEFAULT_LIGHT,
  LIGHT_KIND,
  lightDraft,
  LIGHTS,
  LIGHTS_TOOL_ID,
  RADIUS_RANGE,
  type LightData,
  type LightDefaults,
} from './model';

export { RADIUS_HANDLE_PX } from '@/lib/map/engine/tools/radius-tool';
export type LightState = RadiusToolState;

const isLight = (e: MapEntity) => e.kind.id === LIGHT_KIND;

/** Rayon en unités depuis une distance en pixels du monde (pas d'une demi-case, sauf `free`). */
export function radiusFromDistance(px: number, ppu: number, free: boolean): number {
  const raw = px / (ppu || 50);
  const v = free
    ? Math.round(raw * 100) / 100
    : Math.round(raw / RADIUS_RANGE.step) * RADIUS_RANGE.step;
  return Math.min(RADIUS_RANGE.max, Math.max(free ? 0.1 : RADIUS_RANGE.min, v));
}

export class LightTool extends RadiusTool<LightDefaults> {
  readonly id = LIGHTS_TOOL_ID;

  constructor(
    private readonly ctx: LightContext,
    private readonly view: LightView,
  ) {
    super(DEFAULT_LIGHT, 'lights-tool');
  }

  protected isTarget(e: MapEntity) {
    return isLight(e);
  }
  protected radiusOf(e: MapEntity) {
    return this.view.radiusOf(e);
  }
  protected storedRadius(e: MapEntity) {
    return (e.data as LightData).radius;
  }
  protected radiusFromDistance(px: number, ppu: number, free: boolean) {
    return radiusFromDistance(px, ppu, free);
  }
  protected previewRadius(p: { id: string; radius: number } | null) {
    this.view.setRadiusPreview(p);
  }
  protected commitRadius(entity: MapEntity, radius: number) {
    if (radius === (entity.data as LightData).radius) return;
    void patchLights(this.ctx, [entity], () => ({ radius }), translate('map.lights.lightRadius'));
  }
  protected engineOf() {
    return this.ctx.engine;
  }

  /** Pose une lumière au point (aimantation de la carte, Alt l'inverse) et la sélectionne. */
  protected place(engine: MapEngine, e: MapPointer) {
    const grid = engine.snapGrid(e.alt);
    const p = grid ? snapToCellCenter(e.world, grid) : e.world;
    const pos = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
    const s = engine.store.getState();
    const draft = lightDraft(s.mapId, pos, this.settings.getState());
    void engine.execute(
      createCommand({
        label: translate('map.lights.place'),
        collection: LIGHTS,
        persistence: this.ctx.persistence,
        items: [draft],
      }),
    );
    engine.selection.replace([draft.id]);
  }
}
