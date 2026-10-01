'use client';

/**
 * Scène affichée (docs/carte.md § 11), en haut à gauche de la table : son nom, la couronne si
 * c'est celle du groupe. Pour le MJ, un sélecteur : ouvrir une autre scène pour soi (le groupe
 * ne bouge pas), ou le panneau Scènes (E). Rendue par la carte dans l'emplacement du HUD.
 */
import type { MapScene } from '@vtt/contracts';
import { Check, ChevronDown, Crown, EyeOff, MapPinned } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { HUD_BAR, HUD_CONTROL } from '@/components/combat/live-reports/look';
import { TABLE_HUD_LEFT } from '@/components/table/hud-slots';
import { usePanelStore } from '@/components/table/panels/store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';
import { useMapEngine, useMapState } from '../engine-context';
import { openScene } from '../use-table-map';
import { useScenesData } from './use-scenes';

/** Le sélecteur, rendu dans l'emplacement en haut à gauche du HUD de la table (s'il existe). */
export function ScenePillHost() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById(TABLE_HUD_LEFT)), []);
  return target ? createPortal(<ScenePill />, target) : null;
}

export function ScenePill() {
  const engine = useMapEngine();
  const gm = engine.viewer.role === 'gm';
  const scene = useMapState((s) => s.scene);
  const campaignId = useMapState((s) => s.campaignId);
  const partyMapId = useMapState(
    (s) => (s.settings as { partyMapId?: string | null } | null)?.partyMapId ?? null,
  );
  if (!scene) return null;
  const name = (scene.name as string | undefined) || 'Scène';
  const party = scene.id === partyMapId;

  const face = (
    <>
      <span
        className={cn(
          HUD_CONTROL,
          'grid shrink-0 place-items-center bg-surface-2/80',
          party ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {party ? (
          <Crown className="size-4" aria-hidden />
        ) : (
          <MapPinned className="size-4" aria-hidden />
        )}
      </span>
      <span className="ml-1 min-w-0 truncate font-display text-sm font-semibold">{name}</span>
    </>
  );

  if (!gm) return <div className={cn(HUD_BAR, 'max-w-[min(18rem,30vw)] pr-4')}>{face}</div>;
  return (
    <GmScenePill campaignId={campaignId} current={scene.id} partyMapId={partyMapId} face={face} />
  );
}

function GmScenePill({
  campaignId,
  current,
  partyMapId,
  face,
}: {
  campaignId: string;
  current: string;
  partyMapId: string | null;
  face: React.ReactNode;
}) {
  const { maps } = useScenesData(campaignId);
  const openPanel = usePanelStore((s) => s.open);
  const scenes = useMemo(
    () =>
      [...(maps.data ?? [])].sort((a: MapScene, b: MapScene) => a.name.localeCompare(b.name, 'fr')),
    [maps.data],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Changer de scène"
          className={cn(
            HUD_BAR,
            'group max-w-[min(18rem,30vw)] pr-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          )}
        >
          {face}
          <ChevronDown
            className="ml-1 size-4 shrink-0 text-subtle transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-64 overflow-y-auto">
        {scenes.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => openScene(s.id)} className="gap-2">
            <span className="grid size-4 shrink-0 place-items-center">
              {s.id === current && <Check className="size-4 text-primary" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            {s.id === partyMapId && (
              <Crown className="size-3.5 text-primary" aria-label="Scène du groupe" />
            )}
            {!s.visibleToPlayers && (
              <EyeOff className="size-3.5 text-subtle" aria-label="Cachée aux joueurs" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openPanel('scenes')} className="gap-2">
          <MapPinned className="size-4" aria-hidden />
          <span className="flex-1">Toutes les scènes</span>
          <Kbd>E</Kbd>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
