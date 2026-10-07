'use client';

/**
 * Barre contextuelle de l'outil brouillard (G) : forme (touches 1 à 4), ajouter ou retirer (Alt
 * inverse le temps du geste), aimantation du rectangle à la grille, « Tout couvrir » et « Tout
 * découvrir » (annulables).
 */
import { translate } from '@/i18n/runtime';
import {
  Circle,
  Cloud,
  CloudFog,
  CloudOff,
  Eraser,
  Lasso,
  MousePointer2,
  RectangleHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { FOG_ZONES } from '../engine/model';
import { setFogFull } from '../engine/register';
import { FOG_SHAPES, FogTool, type FogShape } from '../engine/tool';
import { cn } from '@/lib/utils';
import { useMapState } from '@/components/map/engine-context';
import { focusMap, OptionButton, OptionSeparator } from '@/lib/map/features/obstacles/ui/controls';

const ICONS: Record<FogShape, LucideIcon> = {
  rect: RectangleHorizontal,
  circle: Circle,
  lasso: Lasso,
  select: MousePointer2,
};

export function FogOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const tool = engine.tools.active;
  if (!(tool instanceof FogTool)) return null;
  return <Options engine={engine} tool={tool} />;
}

function Options({ engine, tool }: Readonly<{ engine: MapEngine; tool: FogTool }>) {
  const shape = useStore(tool.settings, (s) => s.shape);
  const mode = useStore(tool.settings, (s) => s.mode);
  const fogFull = useMapState((s) => s.scene?.fogFull === true);
  const zones = useMapState((s) => s.collections[FOG_ZONES]?.size ?? 0);
  const info = FOG_SHAPES.find((s) => s.id === shape)!;

  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        <div
          role="group"
          aria-label={translate('map.fog.shape')}
          className="flex items-center gap-0.5"
        >
          {FOG_SHAPES.map((s) => {
            const Icon = ICONS[s.id];
            return (
              <OptionButton
                key={s.id}
                label={translate(`map.fog.shapes.${s.id}.label`)}
                shortcut={s.key}
                active={shape === s.id}
                onClick={() => {
                  tool.setShape(s.id);
                  focusMap(engine);
                }}
              >
                <Icon />
              </OptionButton>
            );
          })}
        </div>

        <OptionSeparator />
        <div
          role="radiogroup"
          aria-label={translate('map.fog.mode')}
          className="flex items-center rounded-lg border border-border p-0.5"
        >
          {(['fog', 'clear'] as const).map((m) => (
            <Info
              key={m}
              texte={
                m === 'fog' ? translate('map.fog.modes.fog') : translate('map.fog.modes.clear')
              }
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => tool.settings.setState({ mode: m })}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors',
                  'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  mode === m && 'bg-primary/15 text-primary',
                )}
              >
                {m === 'fog' ? <CloudFog className="size-3.5" /> : <Eraser className="size-3.5" />}
                {m === 'fog' ? translate('map.fog.add') : translate('map.fog.remove')}
              </button>
            </Info>
          ))}
        </div>

        <OptionSeparator />
        <Info texte={translate('map.fog.coverAllHint')}>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2"
            disabled={fogFull && !zones}
            onClick={() => void setFogFull(engine, true)}
          >
            <Cloud />
            {translate('map.fog.coverAll')}
          </Button>
        </Info>
        <Info texte={translate('map.fog.clearAllHint')}>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 px-2"
            disabled={!fogFull && !zones}
            onClick={() => void setFogFull(engine, false)}
          >
            <CloudOff />
            {translate('map.fog.clearAll')}
          </Button>
        </Info>
      </div>
      <p className="max-w-[36rem] px-2 text-center text-[11px] leading-snug text-muted-foreground">
        {translate(`map.fog.shapes.${info.id}.hint`)}
      </p>
    </div>
  );
}
