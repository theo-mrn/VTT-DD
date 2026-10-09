'use client';

/**
 * Barre contextuelle de l'outil lumières (L) : réglages des lumières posées (rayon, couleur,
 * intensité, dégradé) et rappel des gestes.
 */
import { translate } from '@/i18n/runtime';
import { Palette } from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { lightColorOptions, RADIUS_RANGE } from '../engine/model';
import { LightTool } from '../engine/tool';
import { OptionSeparator, RangeField, Swatches } from '@/lib/map/features/obstacles/ui/controls';
import { formatDistance } from '@/lib/map/engine/distance';

export function LightOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const tool = engine.tools.active;
  if (!(tool instanceof LightTool)) return null;
  return <Options engine={engine} tool={tool} />;
}

const percent = (v: number) => `${Math.round(v * 100)} %`;

function Options({ engine, tool }: Readonly<{ engine: MapEngine; tool: LightTool }>) {
  const radius = useStore(tool.settings, (s) => s.radius);
  const color = useStore(tool.settings, (s) => s.color);
  const intensity = useStore(tool.settings, (s) => s.intensity);
  const falloff = useStore(tool.settings, (s) => s.falloff);
  const distance = engine.kindContext();
  const set = tool.settings.setState;

  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        <span className="px-1 text-xs text-muted-foreground">{translate('map.lights.new')}</span>
        <Popover>
          <Info texte={translate('map.lights.colorIntensityFalloff')}>
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
                  style={{ backgroundColor: color }}
                />
                <Palette />
              </Button>
            </PopoverTrigger>
          </Info>
          <PopoverContent side="top" className="w-72 space-y-4 p-3">
            <Swatches
              value={color}
              options={lightColorOptions()}
              onChange={(c) => c && set({ color: c })}
            />
            <RangeField
              label={translate('map.lights.intensity')}
              value={intensity}
              min={0.05}
              max={1}
              step={0.05}
              format={percent}
              scale={100}
              onCommit={(v) => set({ intensity: v })}
            />
            <RangeField
              label={translate('map.lights.falloff')}
              value={falloff}
              min={0}
              max={1}
              step={0.05}
              format={(v) => (v === 0 ? 'bord net' : percent(v))}
              scale={100}
              onCommit={(v) => set({ falloff: v })}
            />
          </PopoverContent>
        </Popover>
        <OptionSeparator />
        <div className="w-44 px-1">
          <RangeField
            label={translate('map.lights.radius')}
            value={radius}
            min={RADIUS_RANGE.min}
            max={RADIUS_RANGE.slider}
            inputMax={RADIUS_RANGE.max}
            step={RADIUS_RANGE.step}
            format={(v) => formatDistance(v, distance)}

            scale={distance.unitsPerCell}
            onCommit={(v) => set({ radius: v })}
          />
        </div>
      </div>
      <p className="max-w-[36rem] px-2 text-center text-[11px] leading-snug text-muted-foreground">
        {translate('map.lights.toolHint')}
      </p>
    </div>
  );
}
