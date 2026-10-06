'use client';

/**
 * Barre contextuelle de l'outil lumières (L) : réglages des lumières posées (rayon, couleur,
 * intensité, dégradé) et rappel des gestes.
 */
import { Palette } from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { LIGHT_COLORS, RADIUS_RANGE } from '../engine/model';
import { LightTool } from '../engine/tool';
import { OptionSeparator, RangeField, Swatches } from '@/lib/map/features/obstacles/ui/controls';

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
  const unit = engine.kindContext().unitName;
  const set = tool.settings.setState;

  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        <span className="px-1 text-xs text-muted-foreground">Nouvelle lumière</span>
        <Popover>
          <Info texte="Couleur, intensité et dégradé">
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 px-2" aria-label="Couleur">
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
              options={LIGHT_COLORS}
              onChange={(c) => c && set({ color: c })}
            />
            <RangeField
              label="Intensité"
              value={intensity}
              min={0.05}
              max={1}
              step={0.05}
              format={percent}
              scale={100}
              onCommit={(v) => set({ intensity: v })}
            />
            <RangeField
              label="Dégradé"
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
            label="Rayon"
            value={radius}
            min={RADIUS_RANGE.min}
            max={RADIUS_RANGE.slider}
            inputMax={RADIUS_RANGE.max}
            step={RADIUS_RANGE.step}
            format={(v) => `${v.toLocaleString('fr-FR')} ${unit}`}
            onCommit={(v) => set({ radius: v })}
          />
        </div>
      </div>
      <p className="max-w-[36rem] px-2 text-center text-[11px] leading-snug text-muted-foreground">
        Clic : poser une lumière (Alt : sans aimantation). Glisser une lumière la déplace ; sa
        poignée règle le rayon. Clic droit : allumer, éteindre, attacher à un token.
      </p>
    </div>
  );
}
