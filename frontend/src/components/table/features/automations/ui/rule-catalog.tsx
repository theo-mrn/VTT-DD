'use client';

/**
 * Catalogue des blocs d'une règle, côté éditeur (docs/automatismes.md § 6) : pour chaque
 * déclencheur, condition et action, sa valeur par défaut et son petit formulaire. En ajouter un :
 * son schéma dans le contrat, son exécution au serveur, une entrée ici, ses libellés
 * (`table.automations.rules.<famille>.<type>`).
 */
import type {
  Automation,
  AutomationTrack,
  MapScene,
  RuleAction,
  RuleActionType,
  RuleCondition,
  RuleConditionType,
  RuleTarget,
  RuleTrigger,
  RuleTriggerType,
} from '@vtt/contracts';
import {
  ChartPie,
  CircleCheckBig,
  Clock4,
  CloudRain,
  Dices,
  DoorClosed,
  DoorOpen,
  Flag,
  Gem,
  MapPinned,
  MessageSquareText,
  Moon,
  Music,
  Pause,
  Repeat,
  Sunrise,
  SunMoon,
  Swords,
  Timer,
  TimerOff,
  UserRound,
  Waves,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { useAudioLibrary } from '@/lib/audio';
import { WEATHER_TYPES, weatherName } from '@/lib/map/features/weather/engine/effects';
import { MOODS, ONE_SHOTS } from '../../screenFx/state';
import { SPEEDS } from '../../worldTime/state';

/** Ce que les formulaires doivent connaître de la campagne. */
export interface CatalogContext {
  campaignId: string;
  scenes: readonly MapScene[];
  presets: readonly Automation[];
  clocks: readonly string[];
  /** Joueurs de la campagne (cibles des actions personnelles, filtre du tour). */
  players: readonly { userId: string; name: string }[];
  /** Déclencheur de la règle en cours d'édition (cible « joueur concerné »). */
  trigger?: RuleTrigger | null;
}

/** Déclencheurs qui désignent un joueur (cible `actor`). */
export const hasActor = (tr: RuleTrigger | null | undefined) =>
  tr?.type === 'combat.turn' || tr?.type === 'fate.spent';

type Editor<T> = (p: { value: T; onChange(v: T): void; c: CatalogContext }) => ReactNode;

const ANY = '__any';

// ─── Petits champs ───────────────────────────────────────────────────────────

function HourField({ value, onChange }: Readonly<{ value: number; onChange(h: number): void }>) {
  return (
    <SelectField
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
      className="h-8 w-24 text-[13px]"
      options={Array.from({ length: 24 }, (_, h) => ({
        valeur: String(h),
        nom: `${String(h).padStart(2, '0')}:00`,
      }))}
    />
  );
}

function NumberField({
  value,
  onChange,
  min,
  max,
  suffix,
}: Readonly<{
  value: number;
  onChange(n: number): void;
  min: number;
  max: number;
  suffix?: string;
}>) {
  return (
    <span className="flex items-center gap-1.5">
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))
        }
        className="h-8 w-20 text-[13px] tabular-nums"
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </span>
  );
}

function SceneField({
  value,
  onChange,
  c,
  any,
}: Readonly<{
  value: string | undefined;
  onChange(id: string | undefined): void;
  c: CatalogContext;
  any?: string;
}>) {
  return (
    <SelectField
      value={value ?? ANY}
      onValueChange={(v) => onChange(v === ANY ? undefined : v)}
      className="h-8 w-52 text-[13px]"
      options={[
        ...(any ? [{ valeur: ANY, nom: any }] : []),
        ...c.scenes.map((s) => ({ valeur: s.id, nom: s.name })),
      ]}
    />
  );
}

function ClockField({
  value,
  onChange,
  c,
  any,
}: Readonly<{
  value: string | undefined;
  onChange(v: string | undefined): void;
  c: CatalogContext;
  any?: string;
}>) {
  return (
    <SelectField
      value={value ?? ANY}
      onValueChange={(v) => onChange(v === ANY ? undefined : v)}
      className="h-8 w-48 text-[13px]"
      options={[
        ...(any ? [{ valeur: ANY, nom: any }] : []),
        ...[...new Set([...c.clocks, ...(value ? [value] : [])])].map((n) => ({
          valeur: n,
          nom: n,
        })),
      ]}
    />
  );
}

const ALL = '__all';
const GM = '__gm';

/**
 * « pour … » d'une action personnelle : toute la table, le MJ seul (message), le joueur concerné
 * par le déclencheur, ou un joueur.
 */
function TargetField({
  to,
  gmOnly,
  withGm,
  onChange,
  c,
}: Readonly<{
  to: RuleTarget | undefined;
  gmOnly?: boolean;
  withGm?: boolean;
  onChange(v: { to?: RuleTarget; gmOnly?: boolean }): void;
  c: CatalogContext;
}>) {
  const t = useTranslations('table.automations.rules');
  const value = gmOnly ? GM : (to ?? ALL);
  const inconnu = to && to !== 'actor' && !c.players.some((p) => p.userId === to);
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t('for')}</span>
      <SelectField
        value={value}
        onValueChange={(v) =>
          onChange(
            v === GM
              ? { gmOnly: true }
              : v === ALL
                ? withGm
                  ? { gmOnly: false }
                  : {}
                : { to: v as RuleTarget, ...(withGm ? { gmOnly: false } : {}) },
          )
        }
        aria-label={t('target')}
        className="h-8 w-44 text-[13px]"
        options={[
          { valeur: ALL, nom: t('everyone') },
          ...(withGm ? [{ valeur: GM, nom: t('gmOnly') }] : []),
          ...(hasActor(c.trigger) || to === 'actor' ? [{ valeur: 'actor', nom: t('actor') }] : []),
          ...(c.players.length || inconnu
            ? [
                {
                  groupe: t('players'),
                  options: [
                    ...c.players.map((p) => ({ valeur: p.userId, nom: p.name })),
                    ...(inconnu ? [{ valeur: to!, nom: t('formerPlayer') }] : []),
                  ],
                },
              ]
            : []),
        ]}
      />
    </span>
  );
}

/** Retire `to` et `gmOnly` puis pose la nouvelle cible. */
function withTarget<A extends { to?: RuleTarget }>(
  a: A,
  v: { to?: RuleTarget; gmOnly?: boolean },
): A {
  const { to: _to, ...rest } = a;
  return { ...rest, ...v } as A;
}

function TrackField({
  value,
  onChange,
  c,
  kind,
}: Readonly<{
  value: AutomationTrack | null;
  onChange(t: AutomationTrack | null): void;
  c: CatalogContext;
  kind: 'music' | 'ambience';
}>) {
  const t = useTranslations('table.automations');
  const lib = useAudioLibrary(c.campaignId);
  const v = value ? (value.playlistId ? `p:${value.playlistId}` : `a:${value.assetId}`) : 'silence';
  return (
    <SelectField
      value={v}
      onValueChange={(x) =>
        onChange(
          x.startsWith('p:')
            ? { playlistId: x.slice(2), assetId: null }
            : x.startsWith('a:')
              ? { playlistId: null, assetId: x.slice(2) }
              : null,
        )
      }
      className="h-8 w-56 text-[13px]"
      options={[
        { valeur: 'silence', nom: t('silence') },
        ...(lib.playlists.length
          ? [
              {
                groupe: t('playlists'),
                options: lib.playlists.map((p) => ({ valeur: `p:${p.id}`, nom: p.name })),
              },
            ]
          : []),
        ...(lib.assets.some((a) => a.kind === kind)
          ? [
              {
                groupe: t('tracks'),
                options: lib.assets
                  .filter((a) => a.kind === kind)
                  .map((a) => ({ valeur: `a:${a.id}`, nom: a.name })),
              },
            ]
          : []),
      ]}
    />
  );
}

// ─── Déclencheurs ────────────────────────────────────────────────────────────

export const TRIGGERS: {
  [K in RuleTriggerType]: {
    make(): Extract<RuleTrigger, { type: K }>;
    Editor?: Editor<Extract<RuleTrigger, { type: K }>>;
  };
} = {
  'scene.enter': {
    make: () => ({ type: 'scene.enter' }),
    Editor: ({ value, onChange, c }) => {
      const t = useTranslations('table.automations.rules');
      return (
        <SceneField
          value={value.mapId}
          c={c}
          any={t('anyScene')}
          onChange={(mapId) => onChange({ type: 'scene.enter', ...(mapId ? { mapId } : {}) })}
        />
      );
    },
  },
  'scene.leave': {
    make: () => ({ type: 'scene.leave' }),
    Editor: ({ value, onChange, c }) => {
      const t = useTranslations('table.automations.rules');
      return (
        <SceneField
          value={value.mapId}
          c={c}
          any={t('anyScene')}
          onChange={(mapId) => onChange({ type: 'scene.leave', ...(mapId ? { mapId } : {}) })}
        />
      );
    },
  },
  'combat.start': { make: () => ({ type: 'combat.start' }) },
  'combat.end': { make: () => ({ type: 'combat.end' }) },
  'combat.round': {
    make: () => ({ type: 'combat.round' }),
    Editor: ({ value, onChange }) => {
      const t = useTranslations('table.automations.rules');
      return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {t('every')}
          <NumberField
            value={value.every ?? 1}
            min={1}
            max={20}
            onChange={(every) =>
              onChange({ type: 'combat.round', ...(every > 1 ? { every } : {}) })
            }
          />
          {t('rounds')}
        </span>
      );
    },
  },
  'combat.turn': {
    make: () => ({ type: 'combat.turn' }),
    Editor: ({ value, onChange, c }) => {
      const t = useTranslations('table.automations.rules');
      const v = value.userId ? `user:${value.userId}` : value.side ? `side:${value.side}` : ANY;
      return (
        <SelectField
          value={v}
          onValueChange={(x) =>
            onChange({
              type: 'combat.turn',
              ...(x.startsWith('side:') ? { side: x.slice(5) as 'players' } : {}),
              ...(x.startsWith('user:') ? { userId: x.slice(5) } : {}),
            })
          }
          className="h-8 w-48 text-[13px]"
          options={[
            { valeur: ANY, nom: t('anyone') },
            {
              groupe: t('sidesTitle'),
              options: (['players', 'enemies', 'allies'] as const).map((sd) => ({
                valeur: `side:${sd}`,
                nom: t(`sides.${sd}`),
              })),
            },
            ...(c.players.length
              ? [
                  {
                    groupe: t('players'),
                    options: c.players.map((p) => ({ valeur: `user:${p.userId}`, nom: p.name })),
                  },
                ]
              : []),
          ]}
        />
      );
    },
  },
  'time.hour': {
    make: () => ({ type: 'time.hour', hour: 20 }),
    Editor: ({ value, onChange }) => (
      <HourField value={value.hour} onChange={(hour) => onChange({ type: 'time.hour', hour })} />
    ),
  },
  'clock.segment': {
    make: () => ({ type: 'clock.segment' }),
    Editor: ({ value, onChange, c }) => {
      const t = useTranslations('table.automations.rules');
      return (
        <ClockField
          value={value.clock}
          c={c}
          any={t('anyClock')}
          onChange={(clock) => onChange({ type: 'clock.segment', ...(clock ? { clock } : {}) })}
        />
      );
    },
  },
  'clock.full': {
    make: () => ({ type: 'clock.full' }),
    Editor: ({ value, onChange, c }) => {
      const t = useTranslations('table.automations.rules');
      return (
        <ClockField
          value={value.clock}
          c={c}
          any={t('anyClock')}
          onChange={(clock) => onChange({ type: 'clock.full', ...(clock ? { clock } : {}) })}
        />
      );
    },
  },
  'timer.end': { make: () => ({ type: 'timer.end' }) },
  'fate.spent': { make: () => ({ type: 'fate.spent' }) },
};

// ─── Conditions ──────────────────────────────────────────────────────────────

export const CONDITIONS: {
  [K in RuleConditionType]: {
    make(c: CatalogContext): Extract<RuleCondition, { type: K }>;
    Editor: Editor<Extract<RuleCondition, { type: K }>>;
  };
} = {
  'scene.is': {
    make: (c) => ({ type: 'scene.is', mapId: c.scenes[0]?.id ?? '' }),
    Editor: ({ value, onChange, c }) => (
      <SceneField
        value={value.mapId}
        c={c}
        onChange={(mapId) => mapId && onChange({ type: 'scene.is', mapId })}
      />
    ),
  },
  'combat.active': {
    make: () => ({ type: 'combat.active', value: true }),
    Editor: ({ value, onChange }) => {
      const t = useTranslations('table.automations.rules');
      return (
        <SelectField
          value={value.value ? 'yes' : 'no'}
          onValueChange={(v) => onChange({ type: 'combat.active', value: v === 'yes' })}
          className="h-8 w-40 text-[13px]"
          options={[
            { valeur: 'yes', nom: t('inCombat') },
            { valeur: 'no', nom: t('outOfCombat') },
          ]}
        />
      );
    },
  },
  'time.between': {
    make: () => ({ type: 'time.between', from: 20, to: 6 }),
    Editor: ({ value, onChange }) => (
      <span className="flex items-center gap-1.5">
        <HourField value={value.from} onChange={(from) => onChange({ ...value, from })} />
        <span className="text-xs text-muted-foreground">→</span>
        <HourField value={value.to % 24} onChange={(to) => onChange({ ...value, to })} />
      </span>
    ),
  },
  chance: {
    make: () => ({ type: 'chance', percent: 50 }),
    Editor: ({ value, onChange }) => (
      <NumberField
        value={value.percent}
        min={1}
        max={99}
        suffix="%"
        onChange={(percent) => onChange({ type: 'chance', percent })}
      />
    ),
  },
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export const ACTIONS: {
  [K in RuleActionType]: {
    make(c: CatalogContext): Extract<RuleAction, { type: K }>;
    Editor?: Editor<Extract<RuleAction, { type: K }>>;
  };
} = {
  'preset.apply': {
    make: (c) => ({ type: 'preset.apply', automationId: c.presets[0]?.id ?? '' }),
    Editor: ({ value, onChange, c }) => (
      <SelectField
        value={value.automationId}
        onValueChange={(automationId) => onChange({ ...value, automationId })}
        className="h-8 w-56 text-[13px]"
        options={c.presets.map((p) => ({ valeur: p.id, nom: p.name }))}
      />
    ),
  },
  'audio.music': {
    make: () => ({ type: 'audio.music', track: null }),
    Editor: ({ value, onChange, c }) => (
      <TrackField
        value={value.track}
        c={c}
        kind="music"
        onChange={(track) => onChange({ ...value, track })}
      />
    ),
  },
  'audio.ambience': {
    make: () => ({ type: 'audio.ambience', track: null }),
    Editor: ({ value, onChange, c }) => (
      <TrackField
        value={value.track}
        c={c}
        kind="ambience"
        onChange={(track) => onChange({ ...value, track })}
      />
    ),
  },
  'weather.set': {
    make: () => ({ type: 'weather.set', weather: { type: 'rain', intensity: 1 } }),
    Editor: ({ value, onChange }) => {
      const t = useTranslations('table.automations');
      return (
        <SelectField
          value={value.weather?.type ?? 'clear'}
          onValueChange={(v) =>
            onChange({
              ...value,
              weather: v === 'clear' ? null : { type: v, intensity: value.weather?.intensity ?? 1 },
            })
          }
          className="h-8 w-44 text-[13px]"
          options={[
            { valeur: 'clear', nom: t('clearSky') },
            ...WEATHER_TYPES.map((w) => ({ valeur: w, nom: weatherName(w) })),
          ]}
        />
      );
    },
  },
  'screen.mood': {
    make: () => ({ type: 'screen.mood', mood: 'dark' }),
    Editor: ({ value, onChange, c }) => {
      const t = useTranslations('table.automations');
      const tfx = useTranslations('table.screenFx');
      return (
        <span className="flex flex-wrap items-center gap-2">
          <SelectField
            value={value.mood ?? 'none'}
            onValueChange={(v) =>
              onChange({ ...value, mood: v === 'none' ? null : (v as (typeof MOODS)[number]) })
            }
            className="h-8 w-40 text-[13px]"
            options={[
              { valeur: 'none', nom: t('noMood') },
              ...MOODS.map((m) => ({ valeur: m, nom: tfx(`moods.${m}`) })),
            ]}
          />
          <TargetField to={value.to} c={c} onChange={(x) => onChange(withTarget(value, x))} />
        </span>
      );
    },
  },
  'screen.fx': {
    make: () => ({ type: 'screen.fx', effect: 'flash' }),
    Editor: ({ value, onChange, c }) => {
      const tfx = useTranslations('table.screenFx');
      return (
        <span className="flex flex-wrap items-center gap-2">
          <SelectField
            value={value.effect}
            onValueChange={(v) => onChange({ ...value, effect: v as (typeof ONE_SHOTS)[number] })}
            className="h-8 w-40 text-[13px]"
            options={ONE_SHOTS.map((fx) => ({ valeur: fx, nom: tfx(`effects.${fx}`) }))}
          />
          <TargetField to={value.to} c={c} onChange={(x) => onChange(withTarget(value, x))} />
        </span>
      );
    },
  },
  'time.set': {
    make: () => ({ type: 'time.set', hour: 8 }),
    Editor: ({ value, onChange }) => {
      const tw = useTranslations('table.worldTime');
      const t = useTranslations('table.automations.rules');
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <SelectField
            value={value.hour === undefined ? ANY : String(value.hour)}
            onValueChange={(v) => onChange({ ...value, hour: v === ANY ? undefined : Number(v) })}
            className="h-8 w-28 text-[13px]"
            options={[
              { valeur: ANY, nom: t('sameHour') },
              ...Array.from({ length: 24 }, (_, h) => ({
                valeur: String(h),
                nom: `${String(h).padStart(2, '0')}:00`,
              })),
            ]}
          />
          <SelectField
            value={value.rate === undefined ? ANY : String(value.rate)}
            onValueChange={(v) => onChange({ ...value, rate: v === ANY ? undefined : Number(v) })}
            className="h-8 w-32 text-[13px]"
            options={[
              { valeur: ANY, nom: t('sameSpeed') },
              ...SPEEDS.map(([k, r]) => ({ valeur: String(r), nom: tw(`speeds.${k}`) })),
            ]}
          />
        </span>
      );
    },
  },
  'timer.start': {
    make: () => ({ type: 'timer.start', seconds: 60, label: '' }),
    Editor: ({ value, onChange }) => {
      const t = useTranslations('table.automations.rules');
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          <NumberField
            value={value.seconds}
            min={1}
            max={86_400}
            suffix={t('seconds')}
            onChange={(seconds) => onChange({ ...value, seconds })}
          />
          <Input
            value={value.label}
            maxLength={80}
            placeholder={t('timerLabel')}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            className="h-8 w-40 text-[13px]"
          />
        </span>
      );
    },
  },
  'timer.stop': { make: () => ({ type: 'timer.stop' }) },
  'clock.advance': {
    make: (c) => ({ type: 'clock.advance', clock: c.clocks[0] ?? '', by: 1 }),
    Editor: ({ value, onChange, c }) => (
      <span className="flex items-center gap-1.5">
        <ClockField
          value={value.clock || undefined}
          c={c}
          onChange={(clock) => clock && onChange({ ...value, clock })}
        />
        <NumberField
          value={value.by}
          min={-12}
          max={12}
          onChange={(by) => onChange({ ...value, by })}
        />
      </span>
    ),
  },
  'fate.give': {
    make: () => ({ type: 'fate.give', count: 1 }),
    Editor: ({ value, onChange }) => (
      <NumberField
        value={value.count}
        min={-20}
        max={20}
        onChange={(count) => onChange({ ...value, count })}
      />
    ),
  },
  'table.pause': {
    make: () => ({ type: 'table.pause', paused: true }),
    Editor: ({ value, onChange }) => {
      const t = useTranslations('table.automations.rules');
      return (
        <SelectField
          value={value.paused ? 'on' : 'off'}
          onValueChange={(v) => onChange({ ...value, paused: v === 'on' })}
          className="h-8 w-36 text-[13px]"
          options={[
            { valeur: 'on', nom: t('pauseOn') },
            { valeur: 'off', nom: t('pauseOff') },
          ]}
        />
      );
    },
  },
  notice: {
    make: () => ({ type: 'notice', text: '', gmOnly: false }),
    Editor: ({ value, onChange, c }) => {
      const t = useTranslations('table.automations.rules');
      return (
        <span className="flex w-full flex-wrap items-center gap-2">
          <Input
            value={value.text}
            maxLength={280}
            placeholder={t('noticePlaceholder')}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            className="h-8 min-w-40 flex-1 text-[13px]"
          />
          <TargetField
            to={value.to}
            gmOnly={value.gmOnly}
            withGm
            c={c}
            onChange={(x) => onChange(withTarget(value, x))}
          />
        </span>
      );
    },
  },
};

/** Groupes du menu d'ajout des actions, dans l'ordre. */
export const ACTION_GROUPS: { id: string; types: RuleActionType[] }[] = [
  {
    id: 'ambience',
    types: [
      'preset.apply',
      'audio.music',
      'audio.ambience',
      'weather.set',
      'screen.mood',
      'screen.fx',
      'time.set',
    ],
  },
  {
    id: 'tools',
    types: ['timer.start', 'timer.stop', 'clock.advance', 'fate.give', 'table.pause'],
  },
  { id: 'table', types: ['notice'] },
];

export const TRIGGER_GROUPS: { id: string; types: RuleTriggerType[] }[] = [
  { id: 'scene', types: ['scene.enter', 'scene.leave'] },
  { id: 'combat', types: ['combat.start', 'combat.end', 'combat.round', 'combat.turn'] },
  { id: 'tools', types: ['time.hour', 'clock.segment', 'clock.full', 'timer.end', 'fate.spent'] },
];

/** Clé de libellé d'un type (`scene.enter` → `scene_enter`). */
export const labelKey = (type: string) => type.replace('.', '_');

/** Icône de chaque bloc, dans l'éditeur comme dans la liste. */
export const ICONS: Record<RuleTriggerType | RuleConditionType | RuleActionType, LucideIcon> = {
  'scene.enter': DoorOpen,
  'scene.leave': DoorClosed,
  'combat.start': Swords,
  'combat.end': Flag,
  'combat.round': Repeat,
  'combat.turn': UserRound,
  'time.hour': SunMoon,
  'clock.segment': ChartPie,
  'clock.full': CircleCheckBig,
  'timer.end': TimerOff,
  'fate.spent': Gem,
  'scene.is': MapPinned,
  'combat.active': Swords,
  'time.between': Clock4,
  chance: Dices,
  'preset.apply': Workflow,
  'audio.music': Music,
  'audio.ambience': Waves,
  'weather.set': CloudRain,
  'screen.mood': Moon,
  'screen.fx': Zap,
  'time.set': Sunrise,
  'timer.start': Timer,
  'timer.stop': TimerOff,
  'clock.advance': ChartPie,
  'fate.give': Gem,
  'table.pause': Pause,
  notice: MessageSquareText,
};
