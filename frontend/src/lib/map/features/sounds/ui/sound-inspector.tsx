'use client';

/**
 * Inspecteur des zones sonores (MJ) : nom, lancée, son, volume, rayon (unités). Chaque réglage
 * est une commande annulable.
 */
import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { patchZones } from '../engine/kind';
import { RADIUS_RANGE, type SoundZoneData } from '../engine/model';
import { soundContextOf } from '../engine/register';
import { FieldRow, RangeField } from '@/lib/map/features/obstacles/ui/controls';
import { SoundPicker } from './sound-picker';

const percent = (v: number) => `${Math.round(v * 100)} %`;

export function SoundInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  const ctx = soundContextOf(engine);
  const id = useId();
  const first = entities[0]?.data as SoundZoneData | undefined;
  const [name, setName] = useState(first?.name ?? '');
  useEffect(() => setName(first?.name ?? ''), [first?.name]);
  if (!ctx || !first) return null;

  const zones = entities.map((e) => e.data as SoundZoneData);
  const same = <T,>(pick: (z: SoundZoneData) => T): T | null =>
    zones.every((z) => pick(z) === pick(first)) ? pick(first) : null;
  const patch = (label: string, fn: (z: SoundZoneData) => Partial<SoundZoneData>) =>
    void patchZones(ctx, entities, fn, label);
  const { unitName, pixelsPerUnit } = engine.kindContext();
  const ppu = pixelsPerUnit || 50;
  const campaignId = engine.store.getState().campaignId;

  const commitName = () => {
    const next = name.trim().slice(0, 200);
    if (next && next !== first.name) patch('Renommer la zone sonore', () => ({ name: next }));
  };

  return (
    <div className="space-y-4">
      {entities.length === 1 && (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className="text-[13px] text-foreground">
            Nom
          </label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitName();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>
      )}

      <FieldRow label="Lancée" htmlFor={`${id}-on`}>
        <Switch
          id={`${id}-on`}
          checked={zones.every((z) => z.active)}
          onCheckedChange={(on) =>
            patch(on ? 'Lancer la zone sonore' : 'Arrêter la zone sonore', () => ({ active: on }))
          }
        />
      </FieldRow>

      <div className="space-y-1.5">
        <span className="text-[13px] text-foreground">Son</span>
        <SoundPicker
          campaignId={campaignId}
          value={same((z) => z.assetId)}
          onChange={(a) =>
            patch('Son de la zone', (z) => ({
              assetId: a.id,
              url: null,
              // Nom par défaut : il suit le son
              ...(!z.name || z.name === 'Zone sonore' ? { name: a.name.slice(0, 200) } : {}),
            }))
          }
        />
      </div>

      <RangeField
        label="Volume"
        value={same((z) => z.volume) ?? first.volume}
        min={0.05}
        max={1}
        step={0.05}
        format={percent}
        scale={100}
        onCommit={(v) => patch('Volume de la zone sonore', () => ({ volume: v }))}
      />
      <RangeField
        label="Rayon"
        value={Math.round(((same((z) => z.radius) ?? first.radius) / ppu) * 100) / 100}
        min={RADIUS_RANGE.min}
        max={RADIUS_RANGE.slider}
        inputMax={RADIUS_RANGE.max}
        step={RADIUS_RANGE.step}
        format={(v) => `${v.toLocaleString('fr-FR')} ${unitName}`}
        onCommit={(v) =>
          patch('Rayon de la zone sonore', () => ({ radius: Math.round(v * ppu * 100) / 100 }))
        }
      />
    </div>
  );
}
