'use client';

/**
 * Inspecteur des lumières (MJ) : nom, allumée, rayon (unités), couleur, intensité, dégradé,
 * token suivi (torche). Chaque réglage est une commande annulable.
 */
import { translate } from '@/i18n/runtime';
import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { patchLights } from '../engine/kind';
import {
  lightColorOptions,
  lightPosition,
  RADIUS_RANGE,
  TOKEN_KIND,
  tokenName,
  type LightData,
} from '../engine/model';
import { lightContextOf } from '../engine/register';
import { useMapState } from '@/components/map/engine-context';
import { FieldRow, RangeField, Swatches } from '@/lib/map/features/obstacles/ui/controls';
import { formatDistance } from '@/lib/map/engine/distance';

const percent = (v: number) => `${Math.round(v * 100)} %`;
const NONE = '';

export function LightInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  const ctx = lightContextOf(engine);
  const id = useId();
  const first = entities[0]?.data as LightData | undefined;
  const [name, setName] = useState(first?.name ?? '');
  useEffect(() => setName(first?.name ?? ''), [first?.name]);
  // Relu quand les tokens de la carte changent (liste « Suit »)
  useMapState((s) => s.collections.tokens);
  if (!ctx || !first) return null;

  const lights = entities.map((e) => e.data as LightData);
  const same = <T,>(pick: (l: LightData) => T): T | null =>
    lights.every((l) => pick(l) === pick(first)) ? pick(first) : null;
  const patch = (label: string, fn: (l: LightData) => Partial<LightData>) =>
    void patchLights(ctx, entities, fn, label);
  const distance = engine.kindContext();
  const attached = same((l) => l.attachedTokenId);
  const tokens = engine
    .entitiesOfKind(TOKEN_KIND)
    .map((t) => ({ valeur: t.id, nom: tokenName(engine, t.id) }))
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));

  const commitName = () => {
    const next = name.trim().slice(0, 200);
    if (next && next !== first.name) patch(translate('map.lights.rename'), () => ({ name: next }));
  };

  return (
    <div className="space-y-4">
      {entities.length === 1 && (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className="text-[13px] text-foreground">
            {translate('map.lights.name')}
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

      <FieldRow
        label={translate('map.lights.on')}
        htmlFor={`${id}-on`}
        hint={translate('map.lights.offHint')}
      >
        <Switch
          id={`${id}-on`}
          checked={lights.every((l) => l.visible)}
          onCheckedChange={(on) =>
            patch(
              on ? translate('map.lights.turnOnLight') : translate('map.lights.turnOffLight'),
              () => ({ visible: on }),
            )
          }
        />
      </FieldRow>

      <RangeField
        label={translate('map.lights.radius')}
        value={same((l) => l.radius) ?? first.radius}
        min={RADIUS_RANGE.min}
        max={RADIUS_RANGE.slider}
        inputMax={RADIUS_RANGE.max}
        step={RADIUS_RANGE.step}
        format={(v) => formatDistance(v, distance)}

        scale={distance.unitsPerCell}
        onCommit={(v) => patch(translate('map.lights.lightRadius'), () => ({ radius: v }))}
      />

      <div className="space-y-2">
        <span className="text-[13px] text-foreground">{translate('map.lights.color')}</span>
        <Swatches
          value={same((l) => l.color) ?? ''}
          options={lightColorOptions()}
          onChange={(c) => c && patch(translate('map.lights.lightColor'), () => ({ color: c }))}
        />
      </div>

      <RangeField
        label={translate('map.lights.intensity')}
        value={same((l) => l.intensity) ?? first.intensity}
        min={0}
        max={1}
        step={0.05}
        format={percent}
        scale={100}
        onCommit={(v) => patch(translate('map.lights.lightIntensity'), () => ({ intensity: v }))}
      />
      <RangeField
        label={translate('map.lights.falloff')}
        value={same((l) => l.falloff) ?? first.falloff}
        min={0}
        max={1}
        step={0.05}
        format={(v) => (v === 0 ? 'bord net' : percent(v))}
        scale={100}
        onCommit={(v) => patch(translate('map.lights.lightFalloff'), () => ({ falloff: v }))}
      />

      <div className="space-y-1.5">
        <span className="text-[13px] text-foreground">Suit un token (torche)</span>
        <SelectField
          aria-label={translate('map.lights.followedToken')}
          value={attached ?? NONE}
          onValueChange={(v) =>
            patch(v ? translate('map.lights.attach') : translate('map.lights.detach'), (l) =>
              v
                ? { attachedTokenId: v }
                : {
                    attachedTokenId: null,
                    pos: (() => {
                      const p = lightPosition(engine, l);
                      return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
                    })(),
                  },
            )
          }
          options={[{ valeur: NONE, nom: translate('map.lights.noneFixed') }, ...tokens]}
        />
        <p className="text-xs text-muted-foreground">{translate('map.lights.followsToken')}</p>
      </div>
    </div>
  );
}
