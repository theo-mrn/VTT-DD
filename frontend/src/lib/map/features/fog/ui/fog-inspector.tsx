'use client';

/**
 * Inspecteur des zones de brouillard (MJ) : ajouter ou retirer, forme.
 */
import { CloudFog, Eraser } from 'lucide-react';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { toggleZoneMode } from '../engine/kind';
import type { FogZoneData } from '../engine/model';
import { fogContextOf } from '../engine/register';
import { cn } from '@/lib/utils';

const SHAPES: Record<FogZoneData['shape'], string> = {
  circle: 'Cercle',
  rect: 'Rectangle',
  polygon: 'Main levée',
};

export function FogInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  const ctx = fogContextOf(engine);
  if (!ctx || !entities.length) return null;
  const zones = entities.map((e) => e.data as FogZoneData);
  const mode = zones.every((z) => z.mode === zones[0]!.mode) ? zones[0]!.mode : null;
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Mode" className="grid grid-cols-2 gap-1">
        {(['fog', 'clear'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              const targets = entities.filter((e) => (e.data as FogZoneData).mode !== m);
              if (targets.length) void toggleZoneMode(ctx, targets);
            }}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-xs text-muted-foreground transition-colors',
              'hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              mode === m && 'border-primary/50 bg-primary/10 text-foreground',
            )}
          >
            {m === 'fog' ? <CloudFog className="size-4" /> : <Eraser className="size-4" />}
            {m === 'fog' ? 'Brouillard' : 'Découvert'}
          </button>
        ))}
      </div>
      {zones.length === 1 && (
        <p className="text-xs text-muted-foreground">
          {SHAPES[zones[0]!.shape]}. Les zones s’appliquent dans l’ordre de leur création : la plus
          récente qui couvre un point décide.
        </p>
      )}
    </div>
  );
}
