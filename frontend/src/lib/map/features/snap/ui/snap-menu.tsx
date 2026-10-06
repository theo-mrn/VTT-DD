'use client';

/**
 * « Aimantation » : où se posent jetons, objets, murs et zones pendant un geste. Libre par
 * défaut ; Alt inverse le réglage le temps du geste. Les extrémités des murs restent aimantées.
 */
import { Check } from 'lucide-react';
import { SNAP_STEPS, type MapEngine, type SnapStep } from '@/lib/map/engine/map-engine';
import { cn } from '@/lib/utils';
import { useMapUi } from '@/components/map/engine-context';

export const SNAP_LABELS: Record<`${SnapStep}`, { label: string; hint: string }> = {
  off: { label: 'Libre', hint: 'Posé exactement sous le pointeur' },
  '1': { label: 'Grille : une case', hint: 'Centré dans la case' },
  '0.5': { label: 'Grille : demi-case', hint: 'Deux crans par case' },
  '0.25': { label: 'Grille : quart de case', hint: 'Quatre crans par case' },
};

export function SnapMenu({ engine }: Readonly<{ engine: MapEngine }>) {
  const snap = useMapUi((s) => s.snap);
  return (
    <>
      <p className="px-2 pb-1 pt-1 text-sm font-semibold">Aimantation</p>
      <div role="radiogroup" aria-label="Aimantation" className="space-y-0.5">
        {SNAP_STEPS.map((step) => {
          const t = SNAP_LABELS[`${step}`];
          const on = step === snap;
          return (
            <button
              key={step}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => engine.setSnap(step)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                on && 'text-primary',
              )}
            >
              <Check className={cn('size-3.5 shrink-0', !on && 'invisible')} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{t.label}</span>
                <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">
        Alt pendant le geste inverse le réglage. Les extrémités des murs s’aimantent toujours.
      </p>
    </>
  );
}
