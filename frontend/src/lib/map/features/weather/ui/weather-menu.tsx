'use client';

/**
 * « Météo » (barre d'outils, docs/carte.md § 10, Météo).
 * - MJ : l'effet (vignettes), l'intensité et le vent de la scène, les mêmes pour toute la table.
 *   Chaque changement est une commande annulable (`PATCH /maps/:mapId { weather }`) ; les
 *   curseurs montrent un aperçu local pendant le geste et n'écrivent qu'au lâcher.
 * - Joueurs : le bouton n'apparaît que quand la scène a une météo (son nom, son intensité).
 * - Tous : préférences de confort, sur son écran seulement (animation, éclairs).
 */
import { formatter, translate } from '@/i18n/runtime';

type WindDirection =
  'north' | 'northEast' | 'east' | 'southEast' | 'south' | 'southWest' | 'west' | 'northWest';
import type { MapWeather } from '@vtt/contracts';
import {
  ArrowRight,
  Ban,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  Check,
  Map as MapIcon,
  RotateCcw,
  Flame,
  Leaf,
  RadioTower,
  Siren,
  Snowflake,
  Tornado,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
  weatherName,
} from '../engine/effects';
import { clampIntensity, effectOf, MAX_INTENSITY, windOf } from '../engine/model';
import {
  personalWeather,
  saveWeather,
  setWeatherAnimated,
  setWeatherFlashes,
  setWeatherPreview,
  weatherPrefs,
} from '../engine/state';
import { cn } from '@/lib/utils';
import { useMapState } from '@/components/map/engine-context';
import {
  AmbienceSection,
  AmbienceTile,
  EffectGrid,
  MoodGrid,
  useCharacterTargets,
  useScreenMood,
} from '@/components/table/features/screenFx/ui/screen-fx-controls';
import { personalMoods, personalWeathers } from '@/components/table/features/screenFx/state';

const ICONS: Record<WeatherType, LucideIcon> = {
  rain: CloudRain,
  storm: CloudLightning,
  snow: Snowflake,
  blizzard: CloudSnow,
  fog: CloudFog,
  clouds: Cloudy,
  leaves: Leaf,
  embers: Flame,
  sandstorm: Tornado,
  alert: Siren,
  static: RadioTower,
};

/** Rose des vents : où va le vent (degrés, 0 vers l'est, sens horaire), en grille 3 × 3. */
const ROSE: readonly (readonly [number, WindDirection] | null)[] = [
  [225, 'northWest'],
  [270, 'north'],
  [315, 'northEast'],
  [180, 'west'],
  null,
  [0, 'east'],
  [135, 'southWest'],
  [90, 'south'],
  [45, 'southEast'],
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
  const scene = useMapState(readWeather);
  const perso = useStore(personalWeather, (s) => s.weather);
  // Joueur : la sienne (personnage) passe devant celle de la scène
  const weather = !gm && perso !== undefined ? perso : scene;
  const effect = effectOf(weather);
  const active = !!effect && clampIntensity(weather?.intensity) > 0;
  const mood = useScreenMood();
  if (!gm && !active) return null;
  const Icon = active ? ICONS[effect.id] : CloudSun;
  const lit = active || (gm && !!mood);
  const label = active
    ? translate('map.weather.current', { name: weatherName(effect.id).toLowerCase() })
    : translate('map.weather.title');

  return (
    <Popover>
      <Info texte={label}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            className={cn(
              lit && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
            )}
          >
            <Icon />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent
        side="top"
        align="center"
        className={cn('overflow-hidden p-0', gm ? 'w-[min(54rem,calc(100vw-1.5rem))]' : 'w-72')}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {gm ? (
          <GmPanel engine={engine} weather={scene} />
        ) : (
          <div className="flex items-center gap-3 p-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Icon className="size-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{weatherName(effect!.id)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {percent(clampIntensity(weather!.intensity))}
              </span>
            </span>
          </div>
        )}
        <ComfortPrefs engine={engine} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * MJ : à gauche, qui (la table, ou un personnage, chez qui le joue) ; à droite, tout ce qu'on
 * lui applique — météo, ambiance, effets — d'un coup d'œil. Un personnage suit la table tant
 * qu'on ne lui donne rien ; ses réglages passent devant ceux de la table.
 */
function GmPanel({ engine, weather }: Readonly<{ engine: MapEngine; weather: MapWeather | null }>) {
  const targets = useCharacterTargets();
  const [choix, setChoix] = useState<readonly string[]>([]);
  const choisis = targets.filter((c) => choix.includes(c.id));
  const persoW = useStore(personalWeathers.store, (s) => s.value) ?? {};
  const persoM = useStore(personalMoods.store, (s) => s.value) ?? {};
  const uids = choisis.map((c) => c.userId);
  const ontLeursReglages = uids.some((u) => u in persoW || !!persoM[u]);
  const basculer = (id: string) =>
    setChoix((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  // Un aperçu ne survit pas au menu
  useEffect(() => () => setWeatherPreview(engine, undefined), [engine]);

  // Météo dont on règle la force et le vent : celle de la scène, ou la première des personnages
  const reglee = choisis.length
    ? (uids.map((u) => persoW[u]).find((w): w is MapWeather => !!w && !!effectOf(w)) ?? null)
    : effectOf(weather) && weather && clampIntensity(weather.intensity) > 0
      ? weather
      : null;
  const enregistrer = (w: MapWeather, label: string) => {
    if (!choisis.length) return void saveWeather(engine, w, label);
    // Personnages : leur effet garde le sien, la force et le vent sont ceux réglés
    const out = { ...persoW };
    for (const u of uids) {
      const avant = persoW[u];
      if (!avant) continue;
      const { wind: _vent, ...sans } = avant;
      out[u] = { ...sans, intensity: w.intensity, ...(w.wind ? { wind: w.wind } : {}) };
    }
    personalWeathers.set(out);
  };

  const remettre = () => {
    const w = { ...persoW };
    const m = { ...persoM };
    for (const u of uids) {
      delete w[u];
      delete m[u];
    }
    personalWeathers.set(w);
    personalMoods.set(m);
  };

  return (
    <div className="flex max-h-[min(36rem,75vh)] flex-col sm:flex-row">
      {/* Pour qui : la table, ou un ou plusieurs personnages */}
      {targets.length > 0 && (
        <div className="flex shrink-0 flex-col border-b border-border bg-surface-2/30 sm:w-48 sm:border-b-0 sm:border-r">
          <div
            role="group"
            aria-label={translate('table.screenFx.target')}
            className="flex min-h-0 flex-1 gap-1 overflow-auto p-2 [scrollbar-width:thin] sm:flex-col"
          >
            <TargetChip
              on={!choisis.length}
              onClick={() => setChoix([])}
              label={translate('map.weather.wholeTable')}
              avatar={<MapIcon className="size-3.5" aria-hidden />}
            />
            {targets.map((c) => (
              <TargetChip
                key={c.id}
                on={choix.includes(c.id)}
                onClick={() => basculer(c.id)}
                label={c.name}
                marked={c.userId in persoW || !!persoM[c.userId]}
                avatar={
                  c.portrait ? (
                    <img src={c.portrait} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-semibold">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                  )
                }
              />
            ))}
          </div>
          {ontLeursReglages && (
            <div className="hidden border-t border-border p-2 sm:block">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={remettre}>
                <RotateCcw />
                {translate('map.weather.resetCharacter')}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-5 overflow-y-auto p-4">
        {choisis.length ? (
          <CharacterWeather userIds={uids} weathers={persoW} />
        ) : (
          <GmWeather engine={engine} weather={weather} />
        )}
        <div className={cn('grid gap-5', !reglee && 'sm:grid-cols-2')}>
          <MoodGrid userIds={uids} />
          <EffectGrid userIds={uids} />
        </div>
      </div>

      {/* Réglages de la météo choisie : seulement quand il y en a une */}
      {reglee && (
        <div className="shrink-0 overflow-y-auto border-t border-border bg-surface-2/30 p-4 sm:w-60 sm:border-l sm:border-t-0">
          <WeatherSettings
            weather={reglee}
            onSave={enregistrer}
            onPreview={choisis.length ? undefined : (w) => setWeatherPreview(engine, w)}
          />
        </div>
      )}
    </div>
  );
}

/** Une cible de la colonne : avatar, nom ; un point quand le personnage a ses propres réglages. */
function TargetChip({
  on,
  onClick,
  label,
  avatar,
  marked,
}: Readonly<{
  on: boolean;
  onClick(): void;
  label: string;
  avatar: React.ReactNode;
  marked?: boolean;
}>) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={label}
      className={cn(
        'flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-1.5 text-left text-[13px] font-medium transition-colors sm:w-full',
        on
          ? 'bg-primary/15 text-foreground ring-1 ring-inset ring-primary/50'
          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'relative grid size-7 shrink-0 place-items-center rounded-full',
          on ? 'bg-primary text-primary-foreground' : 'bg-surface-3',
        )}
      >
        <span className="grid size-full place-items-center overflow-hidden rounded-full">
          {avatar}
        </span>
        {marked && (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary ring-2 ring-popover" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate pr-1">{label}</span>
    </button>
  );
}

function WeatherTiles({
  current,
  onPick,
  follow,
}: Readonly<{
  /** Type choisi ; null : aucune ; undefined : suit la scène ; `mixed` : personnages différents. */
  current: WeatherType | null | undefined | 'mixed';
  onPick(type: WeatherType | null | undefined): void;
  /** Tuile « Comme la scène » (personnage). */
  follow?: boolean;
}>) {
  const nature = WEATHER_EFFECT_LIST.filter((e) => e.group === 'nature');
  const scifi = WEATHER_EFFECT_LIST.filter((e) => e.group === 'scifi');
  const grille = 'grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-1.5';
  return (
    <div role="radiogroup" aria-label={translate('map.weather.sceneWeather')} className="space-y-3">
      <div className={grille}>
        {follow && (
          <AmbienceTile
            icon={MapIcon}
            label={translate('map.weather.followScene')}
            on={current === undefined}
            onClick={() => onPick(undefined)}
          />
        )}
        <AmbienceTile
          icon={Ban}
          label={translate('map.weather.clearSky')}
          on={current === null}
          onClick={() => onPick(null)}
        />
        {nature.map((e) => (
          <AmbienceTile
            key={e.id}
            icon={ICONS[e.id]}
            label={weatherName(e.id)}
            on={current === e.id}
            onClick={() => onPick(e.id)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2" aria-hidden>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">
          {translate('map.weather.scifi')}
        </span>
        <span className="h-px flex-1 bg-border/60" />
      </div>
      <div className={grille}>
        {scifi.map((e) => (
          <AmbienceTile
            key={e.id}
            icon={ICONS[e.id]}
            label={weatherName(e.id)}
            on={current === e.id}
            onClick={() => onPick(e.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Météo de la scène (toute la table) : effet, intensité, vent ; commandes annulables. */
function GmWeather({
  engine,
  weather,
}: Readonly<{ engine: MapEngine; weather: MapWeather | null }>) {
  const effect = effectOf(weather);
  const intensity = effect ? clampIntensity(weather!.intensity) : 0;

  const pick = (type: WeatherType | null | undefined) => {
    if (!type) return void saveWeather(engine, null);
    if (type === effect?.id) return;
    const next: MapWeather = { type, intensity: effect ? intensity : DEFAULT_INTENSITY };
    // Le vent choisi par le MJ reste d'un effet à l'autre
    if (weather?.wind) next.wind = weather.wind;
    void saveWeather(engine, next);
  };

  return (
    <AmbienceSection title={translate('map.weather.title')}>
      <WeatherTiles current={effect?.id ?? null} onPick={pick} />
    </AmbienceSection>
  );
}

/** Météo de personnages : la leur, ou celle de la scène ; leur intensité (commune). */
function CharacterWeather({
  userIds,
  weathers,
}: Readonly<{ userIds: readonly string[]; weathers: Record<string, MapWeather | null> }>) {
  const leurs = userIds.map((u) => (u in weathers ? (weathers[u] ?? null) : undefined));
  const types = leurs.map((w) => (w === undefined ? undefined : (effectOf(w)?.id ?? null)));
  // Tuile allumée si tous ont la même ; sinon aucune
  const commun = types.every((x) => x === types[0]) ? types[0] : ('mixed' as const);
  const ecrire = (
    next: (avant: MapWeather | null | undefined) => MapWeather | null | undefined,
  ) => {
    const out = { ...weathers };
    for (const u of userIds) {
      const w = next(u in weathers ? (weathers[u] ?? null) : undefined);
      if (w === undefined) delete out[u];
      else out[u] = w;
    }
    personalWeathers.set(out);
  };
  const pick = (type: WeatherType | null | undefined) =>
    ecrire((avant) =>
      type === undefined || type === null
        ? type
        : {
            type,
            intensity: avant ? clampIntensity(avant.intensity) : DEFAULT_INTENSITY,
            ...(avant?.wind ? { wind: avant.wind } : {}),
          },
    );
  return (
    <AmbienceSection title={translate('map.weather.title')}>
      <WeatherTiles current={commun} onPick={pick} follow />
    </AmbienceSection>
  );
}

/**
 * Colonne des réglages de la météo choisie : son nom, sa force, son vent (direction, force) quand
 * l'effet en a un. Pour la table, aperçu pendant le geste et commande annulable au lâcher ; pour
 * des personnages, écrit chez chacun.
 */
function WeatherSettings({
  weather,
  onSave,
  onPreview,
}: Readonly<{
  weather: MapWeather;
  onSave(w: MapWeather, label: string): void;
  onPreview?(w: MapWeather): void;
}>) {
  const effect = effectOf(weather);
  if (!effect) return null;
  const Icon = ICONS[effect.id];
  const intensity = clampIntensity(weather.intensity);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="truncate text-[14px] font-semibold">{weatherName(effect.id)}</span>
      </div>
      <SliderRow
        label={translate('map.weather.intensity')}
        value={toSlider(intensity)}
        min={5}
        max={100}
        step={5}
        format={(v) => formatter().number(v / 100, 'percent')}
        onPreview={(v) => onPreview?.({ ...weather, intensity: fromSlider(v) })}
        onCommit={(v) =>
          onSave(
            { ...weather, intensity: fromSlider(v) },
            translate('map.weather.weatherIntensity'),
          )
        }
      />
      {effect.wind && (
        <WindControls weather={weather} effect={effect} onSave={onSave} onPreview={onPreview} />
      )}
    </div>
  );
}

/** Rose des vents (où va le vent) et force ; « Vent de l’effet » revient au vent par défaut. */
function WindControls({
  weather,
  effect,
  onSave,
  onPreview,
}: Readonly<{
  weather: MapWeather;
  effect: WeatherEffect;
  onSave(w: MapWeather, label: string): void;
  onPreview?(w: MapWeather): void;
}>) {
  const wind = windOf(effect, weather.wind);
  const stored = weather.wind;
  const calm = (stored?.strength ?? wind.strength) === 0;
  const direction = Math.round(wind.direction / 45) % 8;
  const save = (next: MapWeather['wind'], label = translate('map.weather.wind')) => {
    const w: MapWeather = { type: weather.type, intensity: weather.intensity };
    if (next) w.wind = next;
    onSave(w, label);
  };
  const strength = stored?.strength ?? effect.wind?.strength ?? 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{translate('map.weather.wind')}</span>
        {stored && (
          <button
            type="button"
            onClick={() => save(undefined, translate('map.weather.effectWind'))}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {translate('map.weather.effectWind')}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div
          role="radiogroup"
          aria-label={translate('map.weather.windDirection')}
          className="grid grid-cols-3 gap-0.5"
        >
          {ROSE.map((cell, i) => {
            if (!cell) {
              return (
                <Info key={translate('map.weather.calm')} texte={translate('map.weather.noWind')}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={calm}
                    aria-label={translate('map.weather.noWind')}
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
              <Info key={i} texte={translate(`map.weather.directions.${name}`)}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={translate('map.weather.windTowards', {
                    direction: translate(`map.weather.directions.${name}`),
                  })}
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
        <div
          className="min-w-0 flex-1"
          title={effect.minWind !== undefined ? translate('map.weather.minWind') : undefined}
        >
          <SliderRow
            label={translate('map.weather.strength')}
            value={Math.round(strength * 100)}
            min={0}
            max={100}
            step={5}
            format={(v) =>
              v === 0 ? translate('map.weather.calm') : formatter().number(v / 100, 'percent')
            }
            onPreview={(v) =>
              onPreview?.({ ...weather, wind: { direction: wind.direction, strength: v / 100 } })
            }
            onCommit={(v) =>
              save(
                { direction: wind.direction, strength: v / 100 },
                translate('map.weather.windStrength'),
              )
            }
          />
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

/** Confort de chacun, sur son écran seulement (gardé dans le navigateur) : une ligne en pied. */
function ComfortPrefs({ engine }: Readonly<{ engine: MapEngine }>) {
  const animate = useStore(weatherPrefs(engine), (s) => s.animate);
  const flashes = useStore(weatherPrefs(engine), (s) => s.flashes);
  return (
    <div className="flex items-center gap-3 border-t border-border bg-surface-2/30 px-3 py-2 text-[12px] text-muted-foreground">
      <span className="mr-auto">{translate('map.weather.onYourScreen')}</span>
      <label
        className="flex items-center gap-1.5"
        title={animate ? undefined : translate('map.weather.still')}
      >
        <Switch
          checked={animate}
          onCheckedChange={(on) => setWeatherAnimated(engine, on)}
          className="scale-90"
        />
        {translate('map.weather.animate')}
      </label>
      <label className="flex items-center gap-1.5">
        <Switch
          checked={flashes}
          onCheckedChange={(on) => setWeatherFlashes(engine, on)}
          className="scale-90"
        />
        {translate('map.weather.flashes')}
      </label>
    </div>
  );
}
