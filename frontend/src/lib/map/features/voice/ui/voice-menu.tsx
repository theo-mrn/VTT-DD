'use client';

/**
 * « Voix de la scène » (barre d'outils, MJ seulement, docs/voix.md § 4) : Table (tout le monde
 * s'entend) ou Proximité (distance et murs), et ses deux portées en cases. Chaque changement est
 * une commande annulable (`PATCH /maps/:mapId { voice }`) ; les curseurs n'écrivent qu'au lâcher.
 */
import { translate } from '@/i18n/runtime';
import { DEFAULT_MAP_VOICE, type MapVoice } from '@vtt/contracts';
import { Ear, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EditableValue } from '@/components/ui/editable-value';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import { useMapState } from '@/components/map/engine-context';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { cn } from '@/lib/utils';

const RANGE_MAX = 60;

export function VoiceControls({ engine }: Readonly<{ engine: MapEngine }>) {
  const voice = useMapState((s) => (s.scene?.voice as MapVoice | undefined) ?? DEFAULT_MAP_VOICE);
  const hasScene = useMapState((s) => !!s.scene);
  if (engine.viewer.role !== 'gm' || !hasScene) return null;
  const proximity = voice.mode === 'proximity';
  const save = (next: MapVoice) =>
    void engine.updateScene(translate('map.voice.change'), { voice: next });
  const label = translate('map.voice.title');

  return (
    <Popover>
      <Info texte={label}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={cn(
              proximity && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
            )}
          >
            {proximity ? <Ear /> : <Users />}
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent side="top" className="w-72 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="mb-2 text-sm font-semibold">{label}</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ModeButton
            active={!proximity}
            icon={<Users />}
            label={translate('map.voice.table')}
            hint={translate('map.voice.tableHint')}
            onClick={() => proximity && save({ ...voice, mode: 'table' })}
          />
          <ModeButton
            active={proximity}
            icon={<Ear />}
            label={translate('map.voice.proximity')}
            hint={translate('map.voice.proximityHint')}
            onClick={() => !proximity && save({ ...voice, mode: 'proximity' })}
          />
        </div>
        {proximity && (
          <div className="mt-3 space-y-3">
            <RangeRow
              label={translate('map.voice.clearRange')}
              value={voice.clearRange}
              min={0}
              max={RANGE_MAX - 1}
              onCommit={(clearRange) =>
                save({ ...voice, clearRange, maxRange: Math.max(voice.maxRange, clearRange + 1) })
              }
            />
            <RangeRow
              label={translate('map.voice.maxRange')}
              value={voice.maxRange}
              min={1}
              max={RANGE_MAX}
              onCommit={(maxRange) =>
                save({ ...voice, maxRange, clearRange: Math.min(voice.clearRange, maxRange - 1) })
              }
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ModeButton({
  active,
  icon,
  label,
  hint,
  onClick,
}: Readonly<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}>) {
  return (
    <Info texte={hint}>
      <Button
        variant={active ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={active}
        className={cn('justify-start gap-1.5', active && 'ring-1 ring-primary/40')}
        onClick={onClick}
      >
        {icon}
        {label}
      </Button>
    </Info>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  onCommit,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const format = (v: number) => translate('map.voice.cells', { count: v });
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <EditableValue
          label={label}
          value={draft}
          format={format}
          min={min}
          max={max}
          onCommit={(v) => {
            const n = Math.round(v);
            setDraft(n);
            onCommit(n);
          }}
          className="tabular-nums"
        />
      </div>
      <Slider
        aria-label={label}
        value={[draft]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => setDraft(v!)}
        onValueCommit={([v]) => onCommit(v!)}
      />
    </div>
  );
}
