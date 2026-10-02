'use client';

/**
 * Choix du son d'une zone (MJ) : la bibliothèque de la campagne, par type, avec recherche ; à
 * côté, la préécoute du son choisi. Les sons YouTube n'y figurent pas (ni direction ni
 * étouffement possibles hors de Web Audio).
 */
import type { Asset, AssetKind } from '@vtt/contracts';
import { Check, ChevronsUpDown, Pause, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { useAudioLibrary, usePreview } from '@/lib/audio';
import { cn } from '@/lib/utils';

const GROUPS: { kind: AssetKind; label: string }[] = [
  { kind: 'ambience', label: 'Ambiance' },
  { kind: 'music', label: 'Musique' },
  { kind: 'sfx', label: 'Effets' },
];

/** Sons qu'une zone peut jouer : ni YouTube, ni refusés, ni supprimés. */
export const zoneSounds = (assets: readonly Asset[]) =>
  assets.filter((a) => a.source !== 'youtube' && a.status !== 'rejected' && !a.deleted);

export function SoundPicker({
  campaignId,
  value,
  onChange,
  className,
}: {
  campaignId: string;
  value: string | null;
  onChange(asset: Asset): void;
  className?: string;
}) {
  const library = useAudioLibrary(campaignId);
  const preview = usePreview();
  const [open, setOpen] = useState(false);
  const sounds = useMemo(() => zoneSounds(library.assets), [library.assets]);
  const current = library.assets.find((a) => a.id === value) ?? null;
  const playing = !!current && preview.playingId === current.id;

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Son de la zone"
            className="min-w-0 flex-1 justify-between gap-2"
          >
            <span className={cn('truncate', !current && 'text-muted-foreground')}>
              {current?.name ?? (value ? 'Son introuvable' : 'Choisir un son')}
            </span>
            <ChevronsUpDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Rechercher" />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {library.loading ? 'Chargement…' : 'Aucun son dans la bibliothèque.'}
              </CommandEmpty>
              {GROUPS.map((g) => {
                const items = sounds.filter((a) => a.kind === g.kind);
                if (!items.length) return null;
                return (
                  <CommandGroup key={g.kind} heading={g.label}>
                    {items.map((a) => (
                      <CommandItem
                        key={a.id}
                        value={`${a.name} ${a.id}`}
                        onSelect={() => {
                          onChange(a);
                          setOpen(false);
                        }}
                      >
                        <Check className={cn(a.id === value ? 'opacity-100' : 'opacity-0')} />
                        <span className="truncate">{a.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Info texte={playing ? 'Arrêter l’écoute' : 'Écouter'}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={playing ? 'Arrêter l’écoute' : 'Écouter'}
          disabled={!current?.url}
          onClick={() => (playing ? preview.stop() : current && preview.play(current))}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
      </Info>
    </div>
  );
}
