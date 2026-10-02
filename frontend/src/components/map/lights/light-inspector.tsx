'use client';

/**
 * Inspecteur des lumières (MJ) : nom, allumée, rayon (unités), couleur, intensité, dégradé,
 * token suivi (torche). Chaque réglage est une commande annulable.
 */
import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { patchLights } from '@/lib/map/modules/lights/kind';
import {
  LIGHT_COLORS,
  lightPosition,
  RADIUS_RANGE,
  TOKEN_KIND,
  tokenName,
  type LightData,
} from '@/lib/map/modules/lights/model';
import { lightContextOf } from '@/lib/map/modules/lights/register';
import { useMapState } from '../engine-context';
import { FieldRow, RangeField, Swatches } from '../obstacles/controls';

const percent = (v: number) => `${Math.round(v * 100)} %`;
const NONE = '';

export function LightInspector({ engine, entities }: InspectorSectionProps) {
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
  const unit = engine.kindContext().unitName;
  const attached = same((l) => l.attachedTokenId);
  const tokens = engine
    .entitiesOfKind(TOKEN_KIND)
    .map((t) => ({ valeur: t.id, nom: tokenName(engine, t.id) }))
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));

  const commitName = () => {
    const next = name.trim().slice(0, 200);
    if (next && next !== first.name) patch('Renommer la lumière', () => ({ name: next }));
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

      <FieldRow
        label="Allumée"
        htmlFor={`${id}-on`}
        hint="Éteinte, elle n’éclaire pas et les joueurs ne la reçoivent pas."
      >
        <Switch
          id={`${id}-on`}
          checked={lights.every((l) => l.visible)}
          onCheckedChange={(on) =>
            patch(on ? 'Allumer la lumière' : 'Éteindre la lumière', () => ({ visible: on }))
          }
        />
      </FieldRow>

      <RangeField
        label="Rayon"
        value={same((l) => l.radius) ?? first.radius}
        min={RADIUS_RANGE.min}
        max={RADIUS_RANGE.slider}
        inputMax={RADIUS_RANGE.max}
        step={RADIUS_RANGE.step}
        format={(v) => `${v.toLocaleString('fr-FR')} ${unit}`}
        onCommit={(v) => patch('Rayon de la lumière', () => ({ radius: v }))}
      />

      <div className="space-y-2">
        <span className="text-[13px] text-foreground">Couleur</span>
        <Swatches
          value={same((l) => l.color) ?? ''}
          options={LIGHT_COLORS}
          onChange={(c) => c && patch('Couleur de la lumière', () => ({ color: c }))}
        />
      </div>

      <RangeField
        label="Intensité"
        value={same((l) => l.intensity) ?? first.intensity}
        min={0}
        max={1}
        step={0.05}
        format={percent}
        scale={100}
        onCommit={(v) => patch('Intensité de la lumière', () => ({ intensity: v }))}
      />
      <RangeField
        label="Dégradé"
        value={same((l) => l.falloff) ?? first.falloff}
        min={0}
        max={1}
        step={0.05}
        format={(v) => (v === 0 ? 'bord net' : percent(v))}
        scale={100}
        onCommit={(v) => patch('Dégradé de la lumière', () => ({ falloff: v }))}
      />

      <div className="space-y-1.5">
        <span className="text-[13px] text-foreground">Suit un token (torche)</span>
        <SelectField
          aria-label="Token suivi"
          value={attached ?? NONE}
          onValueChange={(v) =>
            patch(v ? 'Attacher la lumière' : 'Détacher la lumière', (l) =>
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
          options={[{ valeur: NONE, nom: 'Aucun (fixe)' }, ...tokens]}
        />
        <p className="text-xs text-muted-foreground">
          La lumière est là où est le token, pendant ses déplacements aussi.
        </p>
      </div>
    </div>
  );
}
