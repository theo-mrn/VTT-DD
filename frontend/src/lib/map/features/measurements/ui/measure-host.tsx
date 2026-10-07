'use client';

/**
 * Présence du module « mesures » à la table (surcouche sans emplacement) : au bout de ma mesure
 * récente, « Épingler » (Entrée avec l'outil Z), « Attaquer la zone (n) » et « Effacer », tant
 * qu'elle est là (6 s). La
 * barre suit la mesure sans re-rendre React : sa position est écrite dans le DOM quand la caméra
 * ou sa taille changent (`trackOverlay`).
 */
import { translate } from '@/i18n/runtime';
import { Pin, Target, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { clearLocal, pin, tokensInZone } from '../engine/operations';
import { openAttackMenu } from '@/lib/combat/attack-menu-store';
import { charactersOf } from '@/lib/map/features/combat/engine/model';
import { measureModuleOf } from '../engine/register';
import { labelAnchor } from '../engine/render';
import type { LocalMeasure, MeasureModule } from '../engine/context';
import { trackOverlay, type OverlaySizes } from '@/components/map/overlay-tracker';

export function MeasureHost({ engine }: Readonly<{ engine: MapEngine }>) {
  const ctx = measureModuleOf(engine);
  if (!ctx) return null;
  return <PinBar ctx={ctx} />;
}

function PinBar({ ctx }: Readonly<{ ctx: MeasureModule }>) {
  const { engine } = ctx;
  const recent = useStore(ctx.local, (s) => (s.measure?.phase === 'recent' ? s.measure : null));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!recent || !el || !host) return;
    let last = '';
    const place = ({ w, h, hostW, hostH }: OverlaySizes) => {
      const at = engine.camera.worldToScreen(labelAnchor(recent.spec));
      const x = Math.round(Math.min(Math.max(at.x + 12, 8), hostW - w - 8));
      const y = Math.round(Math.min(Math.max(at.y + 14, 8), hostH - h - 8));
      const key = `${x}:${y}`;
      if (key === last) return;
      last = key;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.visibility = 'visible';
    };
    return trackOverlay(engine, el, host, place);
  }, [engine, recent]);

  if (!recent) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={translate('map.measurements.measure')}
      className="pointer-events-auto absolute left-0 top-0 z-20 flex items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-elevated"
      style={{ visibility: 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button size="xs" onClick={() => void pin(ctx)}>
        <Pin />
        {translate('map.measurements.pinShort')}
      </Button>
      <AttackZone ctx={ctx} spec={recent.spec} />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={translate('map.measurements.clearMeasure')}
        onClick={() => clearLocal(ctx)}
      >
        <X />
      </Button>
    </div>
  );
}

/** « Attaquer la zone (n) » (docs/combat.md § 12.1) : les personnages vus dans la forme. */
function AttackZone({ ctx, spec }: Readonly<{ ctx: MeasureModule; spec: LocalMeasure['spec'] }>) {
  const { engine } = ctx;
  if (spec.shape === 'line' || engine.viewer.role === 'spectator') return null;
  const targets = charactersOf(tokensInZone(engine, spec));
  if (!targets.length) return null;
  return (
    <Button
      size="xs"
      variant="secondary"
      onClick={() =>
        openAttackMenu({
          campaignId: engine.store.getState().campaignId,
          origin: 'measurement',
          targetIds: targets,
        })
      }
    >
      <Target />
      Attaquer la zone ({targets.length})
    </Button>
  );
}
