'use client';

/**
 * « Vue » de la barre d'outils (docs/carte.md § 9) : le MJ choisit « Vue du MJ » (tout visible,
 * ombre des joueurs en voile léger) ou « Vue de <joueur> » (rendu exact de ce joueur, entités
 * non vues masquées). Chacun peut figer la brume et montrer les rayons de vision (préférences
 * locales).
 */
import { CircleDashed, Cloudy, Eye, ScanEye } from 'lucide-react';
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
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { setFogAnimation, setVisionRadiusShown, visionPrefs } from '@/lib/map/modules/vision/prefs';
import { cn } from '@/lib/utils';

const GM_VIEW = '__mj__';

export function VisionViewMenu({ engine }: { engine: MapEngine }) {
  const gm = engine.viewer.role === 'gm';
  const viewAs = useStore(engine.ui, (s) => s.viewAs);
  const fogAnimation = useStore(visionPrefs(engine), (s) => s.fogAnimation);
  const radius = useStore(visionPrefs(engine), (s) => s.visionRadius);
  const players = gm ? (engine.directory.players?.() ?? []) : [];
  const current = players.find((p) => p.userId === viewAs);
  const label = current ? `Vue de ${current.name}` : gm ? 'Vue du MJ' : 'Vue';
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
            <DropdownMenuLabel>Vue</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={viewAs ?? GM_VIEW}
              onValueChange={(v) => engine.setViewAs(v === GM_VIEW ? null : v)}
            >
              <DropdownMenuRadioItem value={GM_VIEW}>
                <span className="flex flex-col">
                  Vue du MJ
                  <span className="text-xs text-muted-foreground">
                    Tout visible, ombre des joueurs en voile
                  </span>
                </span>
              </DropdownMenuRadioItem>
              {players.map((p) => (
                <DropdownMenuRadioItem key={p.userId} value={p.userId}>
                  Vue de {p.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {!players.length && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Aucun joueur dans la campagne.
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
          {gm ? 'Rayons de vision des joueurs' : 'Mon rayon de vision'}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={fogAnimation}
          onCheckedChange={(on) => setFogAnimation(engine, on === true)}
        >
          <Cloudy className="size-4 text-muted-foreground" />
          Animer la brume
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
