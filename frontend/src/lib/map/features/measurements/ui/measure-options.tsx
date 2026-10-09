'use client';

/**
 * Barre contextuelle de l'outil Mesurer (Z, docs/carte.md § 10, Mesures) : forme (1 à 4),
 * couleur, options du cône, effet animé, « Épingler au lâcher », « Visible des joueurs » (MJ),
 * comptage des cases, effacement des gabarits, et rappel des gestes. Réglages gardés dans le
 * navigateur.
 */
import { translate } from '@/i18n/runtime';
import {
  Circle,
  Eye,
  EyeOff,
  Flame,
  Minus,
  Palette,
  Pin,
  PinOff,
  Square,
  Trash2,
  Triangle,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { MeasureModule } from '../engine/context';
import {
  measureColorOptions,
  MEASURE_SHAPES,
  measureShapeLabel,
  type ConeOptions,
  type MeasureShape,
} from '../engine/model';
import { clearTemplates } from '../engine/operations';
import { measureModuleOf } from '../engine/register';
import { skinFor } from '../engine/settings';
import { skinnable } from '../engine/skins';
import { MeasureTool } from '../engine/tool';
import { cn } from '@/lib/utils';
import {
  focusMap,
  OptionButton,
  OptionSeparator,
  Swatches,
} from '@/lib/map/features/obstacles/ui/controls';
import { ConeSettings, SkinPicker } from './measure-controls';
import { formatDistance, type DistanceScale } from '@/lib/map/engine/distance';

const SHAPE_ICONS: Record<MeasureShape, ComponentType<{ className?: string }>> = {
  line: Minus,
  cone: Triangle,
  circle: Circle,
  cube: Square,
};

export function MeasureOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const ctx = measureModuleOf(engine);
  if (!(engine.tools.active instanceof MeasureTool) || !ctx) return null;
  return <Options engine={engine} ctx={ctx} />;
}

function Options({ engine, ctx }: Readonly<{ engine: MapEngine; ctx: MeasureModule }>) {
  const s = useStore(ctx.settings);
  const set = ctx.settings.setState;
  const gm = engine.viewer.role === 'gm';
  const scale = engine.kindContext();
  const skin = skinFor(s, s.shape);

  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        {MEASURE_SHAPES.map((shape) => {
          const Icon = SHAPE_ICONS[shape.value];
          return (
            <OptionButton
              key={shape.value}
              label={measureShapeLabel(shape.value)}
              shortcut={shape.key}
              active={s.shape === shape.value}
              onClick={() => {
                set({ shape: shape.value });
                focusMap(engine);
              }}
            >
              <Icon />
            </OptionButton>
          );
        })}
        <OptionSeparator />

        <Popover>
          <Info texte={translate('map.lights.color')}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 px-2"
                aria-label={translate('map.lights.color')}
              >
                <span
                  aria-hidden
                  className="size-4 rounded-full border border-border-strong"
                  style={{ backgroundColor: s.color }}
                />
                <Palette />
              </Button>
            </PopoverTrigger>
          </Info>
          <PopoverContent side="top" className="w-72 p-3">
            <Swatches
              value={s.color}
              options={measureColorOptions()}
              onChange={(c) => c && set({ color: c })}
            />
          </PopoverContent>
        </Popover>

        {s.shape === 'cone' && (
          <Popover>
            <Info texte={translate('map.measurements.shapes.cone')}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 px-2"
                  aria-label={translate('map.measurements.shapes.cone')}
                >
                  <Triangle />
                  <span className="text-xs tabular-nums">{coneLabel(s.cone, scale)}</span>
                </Button>
              </PopoverTrigger>
            </Info>
            <PopoverContent side="top" className="w-72 p-3">
              <ConeSettings value={s.cone} scale={scale} onChange={(cone) => set({ cone })} />
            </PopoverContent>
          </Popover>
        )}

        {skinnable(s.shape) && (
          <Popover>
            <Info
              texte={
                skin
                  ? translate('map.measurements.effect')
                  : translate('map.measurements.effectNone')
              }
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('map.measurements.effect')}
                  className={cn(skin && 'text-primary')}
                >
                  <Flame />
                </Button>
              </PopoverTrigger>
            </Info>
            <PopoverContent side="top" className="w-80 p-3">
              <p className="mb-2 text-sm font-semibold">{translate('map.measurements.effect')}</p>
              <SkinPicker
                engine={engine}
                shape={s.shape}
                value={skin}
                onChange={(v) =>
                  set({
                    skins: { ...s.skins, [s.shape === 'circle' ? 'circle' : 'cone']: v },
                  })
                }
              />
            </PopoverContent>
          </Popover>
        )}
        <OptionSeparator />

        <OptionButton
          label={
            s.pinOnRelease
              ? translate('map.measurements.pinOnRelease')
              : translate('map.measurements.ephemeral')
          }
          active={s.pinOnRelease}
          onClick={() => set({ pinOnRelease: !s.pinOnRelease })}
        >
          {s.pinOnRelease ? <Pin /> : <PinOff />}
        </OptionButton>
        {gm && (
          <OptionButton
            label={
              s.shared
                ? translate('map.measurements.visibleToPlayers')
                : translate('map.measurements.gmOnly')
            }
            active={s.shared}
            onClick={() => set({ shared: !s.shared })}
          >
            {s.shared ? <Eye /> : <EyeOff />}
          </OptionButton>
        )}

        <Popover>
          <Info texte={translate('map.measurements.clearSome')}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={translate('map.measurements.clearSome')}
              >
                <Trash2 />
              </Button>
            </PopoverTrigger>
          </Info>
          <PopoverContent side="top" className="w-60 space-y-1 p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => void clearTemplates(ctx, false)}
            >
              {translate('map.measurements.clearMine')}
            </Button>
            {gm && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full justify-start"
                onClick={() => void clearTemplates(ctx, true)}
              >
                {translate('map.measurements.clearAll')}
              </Button>
            )}
            <p className="px-2 pt-1 text-[11px] text-muted-foreground">
              {translate('map.measurements.undoHint')}
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <p className="max-w-[36rem] px-2 text-center text-[11px] leading-snug text-muted-foreground">
        {translate('map.measurements.toolHint')}
      </p>
    </div>
  );
}

/** Réglage du cône affiché : son angle, sa largeur, ou « Dim. » sans largeur fixée. */
function coneLabel(cone: ConeOptions, scale: DistanceScale): string {
  if (cone.mode === 'angle') return `${Math.round(cone.angle)}°`;
  return cone.width
    ? formatDistance(cone.width, scale)
    : translate('map.measurements.dimensionsShort');
}
