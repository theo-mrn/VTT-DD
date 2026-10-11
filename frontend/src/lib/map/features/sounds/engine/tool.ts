/**
 * Outil Zones sonores (F) (docs/carte.md § 10, Zones sonores) : la machine à états commune des
 * points à rayon (`RadiusTool`), testée sans rendu ; le rayon d'une zone est enregistré en pixels.
 *
 * | État       | Entrée                                        | Sortie                                    |
 * | ---------- | --------------------------------------------- | ----------------------------------------- |
 * | `idle`     | bouton sur la poignée de rayon → `radius`     | bouton sur une lumière : gestes communs   |
 * |            | bouton dans le vide → `pressing`              |                                           |
 * | `pressing` | +4 px : lasso (gestes communs)                | lâcher : une zone posée et sélectionnée   |
 * | `radius`   | rayon en unités (pas d'une demi-case ; Alt : libre), affiché | lâcher : une commande ; Échap : rien |
 * | `select`   | clic, glisser, lasso (gestes communs, zones seulement) | lâcher                             |
 *
 * La pose s'aimante au centre de la case, comme le glisser commun (Alt : libre). Sans son choisi
 * dans la barre contextuelle, la zone posée ouvre son inspecteur pour en choisir un.
 */
import { translate } from '@/i18n/runtime';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { RadiusTool, type RadiusToolState } from '@/lib/map/engine/tools/radius-tool';
import type { MapPointer } from '@/lib/map/engine/tools/tool';
import { radiusFromDistance } from '@/lib/map/features/lights/engine/tool';
import { patchZones, placeZone, type SoundContext, type SoundZoneView } from './kind';
import {
  DEFAULT_SOUND,
  SOUND_ZONE_KIND,
  SOUNDS_TOOL_ID,
  type SoundDefaults,
  type SoundZoneData,
} from './model';

export type SoundToolState = RadiusToolState;

const isZone = (e: MapEntity) => e.kind.id === SOUND_ZONE_KIND;

export class SoundTool extends RadiusTool<SoundDefaults> {
  readonly id = SOUNDS_TOOL_ID;

  constructor(
    private readonly ctx: SoundContext,
    private readonly view: SoundZoneView,
  ) {
    super(DEFAULT_SOUND, 'sounds-tool');
  }

  protected isTarget(e: MapEntity) {
    return isZone(e);
  }
  protected radiusOf(e: MapEntity, ppu: number) {
    return this.view.radiusOf(e) / ppu;
  }
  protected storedRadius(e: MapEntity, ppu: number) {
    return (e.data as SoundZoneData).radius / ppu;
  }
  protected radiusFromDistance(px: number, ppu: number, free: boolean) {
    return radiusFromDistance(px, ppu, free);
  }
  protected previewRadius(p: { id: string; radius: number } | null, ppu: number) {
    this.view.setRadiusPreview(p && { id: p.id, radius: p.radius * ppu });
  }
  protected commitRadius(entity: MapEntity, radius: number, ppu: number) {
    const px = Math.round(radius * ppu * 100) / 100;
    if (px === (entity.data as SoundZoneData).radius) return;
    void patchZones(this.ctx, [entity], () => ({ radius: px }), translate('map.sounds.zoneRadius'));
  }
  protected engineOf() {
    return this.ctx.engine;
  }

  /**
   * Pose une zone au point (aimantation de la carte, Alt l'inverse) et la sélectionne ; sans son
   * choisi, son inspecteur s'ouvre pour en choisir un.
   */
  protected place(engine: MapEngine, e: MapPointer) {
    const d = this.settings.getState();
    const id = placeZone(this.ctx, e.world, { ...d, free: e.alt });
    if (!d.assetId) engine.openInspector([id]);
  }
}
