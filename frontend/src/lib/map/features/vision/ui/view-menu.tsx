'use client';

/**
 * « Vue » de la barre d'outils (docs/carte.md § 9) : le MJ choisit « Vue du MJ » (tout visible,
 * ombre des joueurs en voile léger) ou « Vue de <joueur> » (rendu exact de ce joueur, entités
 * non vues masquées). Chacun peut figer la brume, montrer les rayons de vision et la distance au
 * clic (préférences locales).
 */
import { translate } from '@/i18n/runtime';
import { CircleDashed, Cloudy, Eye, Film, Ruler, ScanEye } from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info } from '@/components/ui/tooltip';
import {
  backgroundPrefs,
  isVideoUrl,
  setBackgroundAnimation,
} from '@/lib/map/engine/background-prefs';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { measurePrefs, setClickDistance } from '@/lib/map/features/measurements/engine/prefs';
import { setFogAnimation, setVisionRadiusShown, visionPrefs } from '../engine/prefs';
import { cn } from '@/lib/utils';

const GM_VIEW = '__mj__';

export function VisionViewMenu({ engine }: Readonly<{ engine: MapEngine }>) {
  const gm = engine.viewer.role === 'gm';
  const viewAs = useStore(engine.ui, (s) => s.viewAs);
  const fogAnimation = useStore(visionPrefs(engine), (s) => s.fogAnimation);
  const backgroundAnimation = useStore(backgroundPrefs(engine), (s) => s.animate);
  const videoBackground = useStore(engine.store, (s) => isVideoUrl(s.scene?.backgroundUrl ?? ''));
  const radius = useStore(visionPrefs(engine), (s) => s.visionRadius);
  const clickDistance = useStore(measurePrefs(engine), (s) => s.clickDistance);
  const players = gm ? (engine.directory.players?.() ?? []) : [];
  const current = players.find((p) => p.userId === viewAs);
  let label = gm ? translate('map.vision.gmView') : translate('map.vision.view');
  if (current) label = translate('map.vision.viewOf', { name: current.name });
  const Icon = current ? ScanEye : Eye;

  return (
    <DropdownMenu>
      <Info texte={label}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={cn(
              current && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
            )}
          >
            <Icon />
          </Button>
        </DropdownMenuTrigger>
      </Info>
      <DropdownMenuContent side="top" className="w-60">
        {gm && (
          <>
            <DropdownMenuLabel>{translate('map.vision.view')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={viewAs ?? GM_VIEW}
              onValueChange={(v) => engine.setViewAs(v === GM_VIEW ? null : v)}
            >
              <DropdownMenuRadioItem value={GM_VIEW}>
                <span className="flex flex-col">
                  {translate('map.vision.gmView')}
                  <span className="text-xs text-muted-foreground">
                    {translate('map.vision.gmViewHint')}
                  </span>
                </span>
              </DropdownMenuRadioItem>
              {players.map((p) => (
                <DropdownMenuRadioItem key={p.userId} value={p.userId}>
                  {translate('map.vision.viewOf', { name: p.name })}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {!players.length && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {translate('map.vision.noPlayers')}
              </p>
            )}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuCheckboxItem
          checked={radius}
          onCheckedChange={(on) => setVisionRadiusShown(engine, on === true)}
        >
          <CircleDashed className="size-4 text-muted-foreground" />
          {gm ? translate('map.vision.playersRadius') : translate('map.vision.myRadius')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fogAnimation}
          onCheckedChange={(on) => setFogAnimation(engine, on === true)}
        >
          <Cloudy className="size-4 text-muted-foreground" />
          {translate('map.vision.animateMist')}
        </DropdownMenuCheckboxItem>
        {videoBackground && (
          <DropdownMenuCheckboxItem
            checked={backgroundAnimation}
            onCheckedChange={(on) => setBackgroundAnimation(engine, on === true)}
          >
            <Film className="size-4 text-muted-foreground" />
            {translate('map.vision.animateBackground')}
          </DropdownMenuCheckboxItem>
        )}
        <DropdownMenuCheckboxItem
          checked={clickDistance}
          onCheckedChange={(on) => setClickDistance(engine, on === true)}
        >
          <Ruler className="size-4 text-muted-foreground" />
          <span className="flex flex-col">
            {translate('map.vision.clickDistance')}
            <span className="text-xs text-muted-foreground">
              {gm
                ? translate('map.vision.clickDistanceGm')
                : translate('map.vision.clickDistancePlayer')}
            </span>
          </span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
