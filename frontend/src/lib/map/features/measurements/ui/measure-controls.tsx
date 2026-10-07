'use client';

/**
 * Briques des réglages des mesures, partagées par la barre de l'outil Mesurer et l'inspecteur
 * d'un gabarit : options du cône (angle ou dimensions, bout arrondi ou plat), choix d'un effet
 * animé (vignettes de la bibliothèque), animation des effets.
 */
import { translate } from '@/i18n/runtime';
import { Ban } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAssets } from '@/lib/assets';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import {
  CONE_ANGLE_PRESETS,
  CONE_ANGLE_RANGE,
  DEFAULT_CONE_ANGLE,
  type ConeOptions,
  type MeasureShape,
} from '../engine/model';
import { measurePrefs, setAnimateSkins } from '../engine/prefs';
import { skinLabel, skinOptions } from '../engine/skins';
import { cn } from '@/lib/utils';
import { RangeField } from '@/lib/map/features/obstacles/ui/controls';

/** Deux à quatre choix exclusifs, en boutons. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: Readonly<{
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(v: T): void;
  label: string;
}>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            o.value === value
              ? 'bg-surface-3 text-foreground shadow-surface'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Nombre positif facultatif (vide : aucun), validé à la sortie du champ ou par Entrée. */
function OptionalNumber({
  label,
  value,
  placeholder,
  unit,
  onCommit,
}: Readonly<{
  label: string;
  value: number | null;
  placeholder: string;
  unit: string;
  onCommit(v: number | null): void;
}>) {
  const id = useId();
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => setText(value ? String(value) : ''), [value]);
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    const next = text.trim() && Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : null;
    if (next !== value) onCommit(next);
  };
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label} ({unit})
      </label>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        className="h-8"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </div>
  );
}

const ANGLE_LABEL = (a: number) => (a === DEFAULT_CONE_ANGLE ? '53° (1:1)' : `${Math.round(a)}°`);

/** Options d'un cône : angle ou dimensions, bout arrondi ou plat. */
export function ConeSettings({
  value,
  unit,
  onChange,
}: Readonly<{
  value: ConeOptions;
  unit: string;
  onChange(next: ConeOptions): void;
}>) {
  const set = (patch: Partial<ConeOptions>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <Segmented
        label={translate('map.measurements.coneDefinition')}
        value={value.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'angle', label: translate('map.measurements.angle') },
          { value: 'dimensions', label: translate('map.measurements.dimensions') },
        ]}
      />
      {value.mode === 'angle' ? (
        <>
          <div className="flex flex-wrap gap-1">
            {CONE_ANGLE_PRESETS.map((a) => (
              <Button
                key={a}
                size="xs"
                variant={Math.abs(value.angle - a) < 0.01 ? 'secondary' : 'ghost'}
                onClick={() => set({ angle: a })}
              >
                {ANGLE_LABEL(a)}
              </Button>
            ))}
          </div>
          <RangeField
            label={translate('map.measurements.opening')}
            value={Math.round(value.angle)}
            min={CONE_ANGLE_RANGE.min}
            max={CONE_ANGLE_RANGE.max}
            step={1}
            format={(v) => `${v}°`}
            onCommit={(angle) => set({ angle })}
          />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <OptionalNumber
            label={translate('map.measurements.endWidth')}
            value={value.width}
            placeholder={translate('map.measurements.byAngle')}
            unit={unit}
            onCommit={(width) => set({ width })}
          />
          <OptionalNumber
            label={translate('map.measurements.fixedLength')}
            value={value.length}
            placeholder={translate('map.measurements.free')}
            unit={unit}
            onCommit={(length) => set({ length })}
          />
        </div>
      )}
      <Segmented
        label={translate('map.measurements.coneEnd')}
        value={value.rounded ? 'rounded' : 'flat'}
        onChange={(v) => set({ rounded: v === 'rounded' })}
        options={[
          { value: 'rounded', label: translate('map.measurements.rounded') },
          { value: 'flat', label: translate('map.measurements.flat') },
        ]}
      />
    </div>
  );
}

/** Choix d'un effet animé pour un cercle ou un cône (vignettes), et son animation. */
export function SkinPicker({
  engine,
  shape,
  value,
  onChange,
}: Readonly<{
  engine: MapEngine;
  shape: MeasureShape;
  value: string | null;
  onChange(v: string | null): void;
}>) {
  const assets = useAssets();
  const animate = useStore(measurePrefs(engine), (p) => p.animateSkins);
  const options = skinOptions(assets.data ?? [], shape);
  const tile =
    'relative flex aspect-square flex-col items-center justify-end overflow-hidden rounded-lg border text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60';
  return (
    <div className="space-y-2">
      <div className="grid max-h-56 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className={cn(
            tile,
            'justify-center gap-1 text-muted-foreground',
            value === null
              ? 'border-primary text-foreground'
              : 'border-border hover:border-border-strong',
          )}
        >
          <Ban className="size-4" />
          {translate('map.measurements.none')}
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.label}
            onClick={() => onChange(o.value)}
            aria-pressed={o.value === value}
            className={cn(
              tile,
              'bg-surface-2',
              o.value === value ? 'border-primary' : 'border-border hover:border-border-strong',
            )}
          >
            {o.thumbnail && (
              <img src={o.thumbnail} alt="" className="absolute inset-0 size-full object-cover" />
            )}
            <span className="relative w-full truncate bg-background/75 px-1 py-0.5">{o.label}</span>
          </button>
        ))}
      </div>
      {assets.isLoading && (
        <p className="text-xs text-muted-foreground">
          {translate('map.measurements.loadingEffects')}
        </p>
      )}
      {value && !options.some((o) => o.value === value) && !assets.isLoading && (
        <p className="text-xs text-muted-foreground">
          {translate('map.measurements.skinMissing', { name: skinLabel(value) })}
        </p>
      )}
      <label className="flex items-center justify-between gap-3 text-[13px]">
        {translate('map.measurements.animateEffects')}
        <Switch checked={animate} onCheckedChange={(on) => setAnimateSkins(engine, on)} />
      </label>
    </div>
  );
}
