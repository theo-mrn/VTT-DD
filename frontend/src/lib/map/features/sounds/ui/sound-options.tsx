'use client';

/**
 * Barre contextuelle de l'outil Zones sonores (F) : son, rayon et volume des zones posées.
 */
import { translate } from '@/i18n/runtime';
import { useStore } from 'zustand';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { RADIUS_RANGE } from '../engine/model';
import { SoundTool } from '../engine/tool';
import { OptionSeparator, RangeField } from '@/lib/map/features/obstacles/ui/controls';
import { SoundPicker } from './sound-picker';

export function SoundOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const tool = engine.tools.active;
  if (!(tool instanceof SoundTool)) return null;
  return <Options engine={engine} tool={tool} />;
}

const percent = (v: number) => `${Math.round(v * 100)} %`;

function Options({ engine, tool }: Readonly<{ engine: MapEngine; tool: SoundTool }>) {
  const radius = useStore(tool.settings, (s) => s.radius);
  const volume = useStore(tool.settings, (s) => s.volume);
  const assetId = useStore(tool.settings, (s) => s.assetId);
  const unit = engine.kindContext().unitName;
  const set = tool.settings.setState;

  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
      <span className="px-1 text-xs text-muted-foreground">{translate('map.sounds.newZone')}</span>
      <SoundPicker
        campaignId={engine.store.getState().campaignId}
        value={assetId}
        onChange={(a) => set({ assetId: a.id, name: a.name })}
        className="w-56"
      />
      <OptionSeparator />
      <div className="w-40 px-1">
        <RangeField
          label={translate('map.lights.radius')}
          value={radius}
          min={RADIUS_RANGE.min}
          max={RADIUS_RANGE.slider}
          inputMax={RADIUS_RANGE.max}
          step={RADIUS_RANGE.step}
          format={(v) => `${v.toLocaleString('fr-FR')} ${unit}`}
          onCommit={(v) => set({ radius: v })}
        />
      </div>
      <div className="w-36 px-1">
        <RangeField
          label={translate('map.sounds.volume')}
          value={volume}
          min={0.05}
          max={1}
          step={0.05}
          format={percent}
          scale={100}
          onCommit={(v) => set({ volume: v })}
        />
      </div>
    </div>
  );
}
