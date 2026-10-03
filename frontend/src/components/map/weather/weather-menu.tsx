'use client';

/**
 * « Météo » (barre d'outils, docs/carte.md § 10, Météo).
 * - MJ : l'effet (vignettes), l'intensité et le vent de la scène, les mêmes pour toute la table.
 *   Chaque changement est une commande annulable (`PATCH /maps/:mapId { weather }`) ; les
 *   curseurs montrent un aperçu local pendant le geste et n'écrivent qu'au lâcher.
 * - Joueurs : le bouton n'apparaît que quand la scène a une météo (son nom, son intensité).
 * - Tous : préférences de confort, sur son écran seulement (animation, éclairs).
 */
import type { MapWeather } from '@vtt/contracts';
import {
  ArrowRight,
  Ban,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Flame,
  Leaf,
  RadioTower,
  Siren,
  Snowflake,
  Tornado,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EditableValue } from '@/components/ui/editable-value';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { MapStoreState } from '@/lib/map/store/map-store';
import {
  DEFAULT_INTENSITY,
  WEATHER_EFFECT_LIST,
  type WeatherEffect,
  type WeatherType,
} from '@/lib/map/modules/weather/effects';
import { clampIntensity, effectOf, MAX_INTENSITY, windOf } from '@/lib/map/modules/weather/model';
import {
  saveWeather,
  setWeatherAnimated,
  setWeatherFlashes,
  setWeatherPreview,
  weatherPrefs,
} from '@/lib/map/modules/weather/state';
import { cn } from '@/lib/utils';
import { useMapState } from '../engine-context';

const ICONS: Record<WeatherType, LucideIcon> = {
  rain: CloudRain,
  storm: CloudLightning,
  snow: Snowflake,
  blizzard: CloudSnow,
  fog: CloudFog,
  leaves: Leaf,
  embers: Flame,
  sandstorm: Tornado,
  alert: Siren,
  static: RadioTower,
};

/** Rose des vents : où va le vent (degrés, 0 vers l'est, sens horaire), en grille 3 × 3. */
const ROSE: readonly (readonly [number, string] | null)[] = [
  [225, 'nord-ouest'],
  [270, 'nord'],
  [315, 'nord-est'],
  [180, 'ouest'],
  null,
  [0, 'est'],
  [135, 'sud-ouest'],
  [90, 'sud'],
  [45, 'sud-est'],
];

/** Force donnée au vent quand le MJ choisit une direction depuis « sans vent ». */
const DEFAULT_WIND_STRENGTH = 0.4;

const readWeather = (s: MapStoreState) =>
  (s.scene?.weather as MapWeather | null | undefined) ?? null;

/**
 * Curseur d'intensité, de 0 à 100 % : 50 % est l'intensité 1 (l'ancien maximum), 100 % la plus
 * forte (2) ; l'échelle enregistrée ne change pas.
 */
const toSlider = (intensity: number) => Math.round((intensity / MAX_INTENSITY) * 100);
const fromSlider = (v: number) => (v / 100) * MAX_INTENSITY;
const percent = (intensity: number) => `${toSlider(intensity)} %`;

export function WeatherControls({ engine }: Readonly<{ engine: MapEngine }>) {
  const gm = engine.viewer.role === 'gm';
  const weather = useMapState(readWeather);
  const effect = effectOf(weather);
  const active = !!effect && clampIntensity(weather?.intensity) > 0;
  if (!gm && !active) return null;
  const Icon = active ? ICONS[effect.id] : CloudSun;
  const label = active ? `Météo : ${effect.label.toLowerCase()}` : 'Météo';

  return (
    <Popover>
      <Info texte={label}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={cn(
              active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
            )}
          >
            <Icon />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent
        side="top"
        className="max-h-[75vh] w-80 overflow-y-auto p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {gm ? (
          <GmWeather engine={engine} weather={weather} />
        ) : (
          <p className="mb-3 text-sm">
            <span className="font-semibold">{effect!.label}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              {percent(clampIntensity(weather!.intensity))}
            </span>
          </p>
        )}
        <ComfortPrefs engine={engine} />
      </PopoverContent>
    </Popover>
  );
}

function GmWeather({
  engine,
  weather,
}: Readonly<{ engine: MapEngine; weather: MapWeather | null }>) {
  const effect = effectOf(weather);
  const intensity = effect ? clampIntensity(weather!.intensity) : 0;
  // Un aperçu ne survit pas au menu
  useEffect(() => () => setWeatherPreview(engine, undefined), [engine]);

  const pick = (type: WeatherType | null) => {
    if (!type) return void saveWeather(engine, null);
    if (type === effect?.id) return;
    const next: MapWeather = { type, intensity: effect ? intensity : DEFAULT_INTENSITY };
    // Le vent choisi par le MJ reste d'un effet à l'autre
    if (weather?.wind) next.wind = weather.wind;
    void saveWeather(engine, next);
  };

  const nature = WEATHER_EFFECT_LIST.filter((e) => e.group === 'nature');
  const scifi = WEATHER_EFFECT_LIST.filter((e) => e.group === 'scifi');

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Météo</p>
        <p className="text-xs text-muted-foreground">
          La même pour toute la table. Chaque changement s’annule (⌘Z).
        </p>
      </div>
      <div role="radiogroup" aria-label="Météo de la scène" className="space-y-2">
        <div className="grid grid-cols-3 gap-1.5">
          <Tile label="Aucune" icon={Ban} on={!effect} onClick={() => pick(null)} />
          {nature.map((e) => (
            <EffectTile key={e.id} effect={e} on={effect?.id === e.id} onPick={pick} />
          ))}
        </div>
        <p className="pt-1 text-[11px] text-muted-foreground">Science-fiction</p>
        <div className="grid grid-cols-3 gap-1.5">
          {scifi.map((e) => (
            <EffectTile key={e.id} effect={e} on={effect?.id === e.id} onPick={pick} />
          ))}
        </div>
      </div>

      {effect && weather && (
        <SliderRow
          label="Intensité"
          value={toSlider(intensity)}
          min={5}
          max={100}
          step={5}
          format={(v) => `${v} %`}
          onPreview={(v) => setWeatherPreview(engine, { ...weather, intensity: fromSlider(v) })}
          onCommit={(v) =>
            void saveWeather(
              engine,
              { ...weather, intensity: fromSlider(v) },
              'Intensité de la météo',
            )
          }
        />
      )}
      {effect?.wind && weather && (
        <WindControls engine={engine} weather={weather} effect={effect} />
      )}
    </div>
  );
}

function EffectTile({
  effect,
  on,
  onPick,
}: Readonly<{
  effect: WeatherEffect;
  on: boolean;
  onPick: (type: WeatherType) => void;
}>) {
  return (
    <Tile label={effect.label} icon={ICONS[effect.id]} on={on} onClick={() => onPick(effect.id)} />
  );
}

function Tile({
  label,
  icon: Icon,
  on,
  onClick,
}: Readonly<{
  label: string;
  icon: LucideIcon;
  on: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-center text-[11px] leading-tight transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        on
          ? 'border-primary/60 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-border-strong hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </button>
  );
}

/** Rose des vents (où va le vent) et force ; « Vent de l’effet » revient au vent par défaut. */
function WindControls({
  engine,
  weather,
  effect,
}: Readonly<{
  engine: MapEngine;
  weather: MapWeather;
  effect: WeatherEffect;
}>) {
  const wind = windOf(effect, weather.wind);
  const stored = weather.wind;
  const calm = (stored?.strength ?? wind.strength) === 0;
  const direction = Math.round(wind.direction / 45) % 8;
  const save = (next: MapWeather['wind'], label = 'Vent') => {
    const w: MapWeather = { type: weather.type, intensity: weather.intensity };
    if (next) w.wind = next;
    void saveWeather(engine, w, label);
  };
  const strength = stored?.strength ?? effect.wind?.strength ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Vent</span>
        {stored && (
          <button
            type="button"
            onClick={() => save(undefined, 'Vent de l’effet')}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Vent de l’effet
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div role="radiogroup" aria-label="Direction du vent" className="grid grid-cols-3 gap-0.5">
          {ROSE.map((cell, i) => {
            if (!cell) {
              return (
                <Info key="calme" texte="Sans vent">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={calm}
                    aria-label="Sans vent"
                    onClick={() => save({ direction: wind.direction, strength: 0 })}
                    className={cn(
                      'grid size-7 place-items-center rounded-md transition-colors',
                      'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      calm && 'bg-primary/15 text-primary',
                    )}
                  >
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  </button>
                </Info>
              );
            }
            const [deg, name] = cell;
            const on = !calm && Math.round(deg / 45) % 8 === direction;
            return (
              <Info key={i} texte={`Vers le ${name}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`Vent vers le ${name}`}
                  onClick={() =>
                    save({
                      direction: deg,
                      strength: strength > 0 ? strength : DEFAULT_WIND_STRENGTH,
                    })
                  }
                  className={cn(
                    'grid size-7 place-items-center rounded-md text-muted-foreground transition-colors',
                    'hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    on && 'bg-primary/15 text-primary hover:text-primary',
                  )}
                >
                  {/* Flèche tournée vers où va le vent (sens horaire à l'écran) */}
                  <ArrowRight
                    className="size-3.5"
                    style={{ transform: `rotate(${deg}deg)` }}
                    aria-hidden
                  />
                </button>
              </Info>
            );
          })}
        </div>
        <div className="min-w-0 flex-1">
          <SliderRow
            label="Force"
            value={Math.round(strength * 100)}
            min={0}
            max={100}
            step={5}
            format={(v) => (v === 0 ? 'calme' : `${v} %`)}
            onPreview={(v) =>
              setWeatherPreview(engine, {
                ...weather,
                wind: { direction: wind.direction, strength: v / 100 },
              })
            }
            onCommit={(v) =>
              save({ direction: wind.direction, strength: v / 100 }, 'Force du vent')
            }
          />
          {effect.minWind !== undefined && (
            <p className="text-[11px] text-muted-foreground">
              Toujours un peu de vent : l’effet en a besoin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Curseur : aperçu local pendant le geste, une seule écriture au lâcher. */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onPreview,
  onCommit,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onPreview: (v: number) => void;
  onCommit: (v: number) => void;
}>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
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
            setDraft(v);
            onPreview(v);
            onCommit(v);
          }}
          className="tabular-nums"
        />
      </div>
      <Slider
        aria-label={label}
        value={[draft]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => {
          setDraft(v!);
          onPreview(v!);
        }}
        onValueCommit={([v]) => onCommit(v!)}
      />
    </div>
  );
}

/** Confort de chacun, sur son écran seulement (gardé dans le navigateur). */
function ComfortPrefs({ engine }: Readonly<{ engine: MapEngine }>) {
  const animate = useStore(weatherPrefs(engine), (s) => s.animate);
  const flashes = useStore(weatherPrefs(engine), (s) => s.flashes);
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-[11px] text-muted-foreground">Sur votre écran</p>
      <PrefRow
        id="weather-animate"
        label="Animer la météo"
        hint={animate ? undefined : 'Image fixe et discrète'}
        checked={animate}
        onChange={(on) => setWeatherAnimated(engine, on)}
      />
      <PrefRow
        id="weather-flashes"
        label="Éclairs et clignotements"
        checked={flashes}
        onChange={(on) => setWeatherFlashes(engine, on)}
      />
    </div>
  );
}

function PrefRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (on: boolean) => void;
}>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-[13px]">
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-muted-foreground">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
