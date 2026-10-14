'use client';

import type {
  Automation,
  AutomationParams,
  AutomationTrack,
  AutomationTrigger,
  MapScene,
} from '@vtt/contracts';
import { useTranslations } from 'next-intl';
import {
  Camera,
  CloudRain,
  DoorOpen,
  Gauge,
  Loader2,
  MapPinned,
  Moon,
  Music,
  Plus,
  Sunrise,
  Waves,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { messageErreur } from '@/lib/api';
import { useAudioLibrary } from '@/lib/audio';
import { WEATHER_TYPES, weatherName } from '@/lib/map/features/weather/engine/effects';
import { cn } from '@/lib/utils';
import { MOODS, ONE_SHOTS } from '../../screenFx/state';
import { SPEEDS } from '../../worldTime/state';
import { useSaveAutomation } from '../api';
import { captureAutomation } from '../apply';
import { ICONS } from './rule-catalog';

type Draft = {
  name: string;
  params: AutomationParams;
  triggers: AutomationTrigger[];
  sceneIds: string[];
};

type ParamId = 'music' | 'ambience' | 'weather' | 'hour' | 'speed' | 'mood' | 'effect';
const PARAMS: { id: ParamId; icon: LucideIcon }[] = [
  { id: 'music', icon: Music },
  { id: 'ambience', icon: Waves },
  { id: 'weather', icon: CloudRain },
  { id: 'hour', icon: Sunrise },
  { id: 'speed', icon: Gauge },
  { id: 'mood', icon: Moon },
  { id: 'effect', icon: Zap },
];
const AUTO: AutomationTrigger['type'][] = ['combat.start', 'combat.end', 'clock.full', 'timer.end'];

const SILENCE = 'silence';
const trackValue = (t: AutomationTrack | null | undefined) =>
  t ? (t.playlistId ? `p:${t.playlistId}` : `a:${t.assetId}`) : SILENCE;
const trackFrom = (v: string): AutomationTrack | null =>
  v.startsWith('p:')
    ? { playlistId: v.slice(2), assetId: null }
    : v.startsWith('a:')
      ? { playlistId: null, assetId: v.slice(2) }
      : null;

const pilote = (p: AutomationParams, id: ParamId) =>
  id === 'hour'
    ? p.time?.hour !== undefined
    : id === 'speed'
      ? p.time?.rate !== undefined
      : p[id] !== undefined;

/**
 * Fenêtre d'un réglage : ce qu'il règle (seuls ces paramètres changent quand il est lancé),
 * ce qui le lance tout seul, les scènes où il est proposé ou lancé à l'arrivée.
 */
export function AutomationEditor({
  campaignId,
  automation,
  scenes,
  onClose,
}: Readonly<{
  campaignId: string;
  /** null : nouveau réglage. */
  automation: Automation | null;
  scenes: readonly MapScene[];
  onClose(): void;
}>) {
  const t = useTranslations('table.automations');
  const tfx = useTranslations('table.screenFx');
  const tw = useTranslations('table.worldTime');
  const tr = useTranslations('table.automations.rules');
  const library = useAudioLibrary(campaignId);
  const save = useSaveAutomation(campaignId);
  const [d, setD] = useState<Draft>(() => ({
    name: automation?.name ?? '',
    params: automation?.params ?? {},
    triggers: automation?.triggers ?? [],
    sceneIds: automation?.sceneIds ?? [],
  }));
  const [capture, setCapture] = useState(false);
  const p = d.params;

  /** Change un paramètre ; `undefined` : il n'est plus réglé. */
  const set = <K extends keyof AutomationParams>(k: K, v: AutomationParams[K] | undefined) =>
    setD((x) => {
      const params = { ...x.params };
      if (v === undefined) delete params[k];
      else params[k] = v;
      return { ...x, params };
    });
  const setTime = (hour: number | undefined, rate: number | undefined) =>
    set('time', hour === undefined && rate === undefined ? undefined : { hour, rate });

  const activer = (id: ParamId, on: boolean) => {
    if (id === 'hour') return setTime(on ? 8 : undefined, p.time?.rate);
    if (id === 'speed') return setTime(p.time?.hour, on ? 1 : undefined);
    if (id === 'effect') return set('effect', on ? 'flash' : undefined);
    return set(id, on ? null : undefined);
  };

  const sons = (kind: 'music' | 'ambience') => [
    { valeur: SILENCE, nom: t('silence') },
    ...(library.playlists.length
      ? [
          {
            groupe: t('playlists'),
            options: library.playlists.map((pl) => ({ valeur: `p:${pl.id}`, nom: pl.name })),
          },
        ]
      : []),
    ...(library.assets.some((a) => a.kind === kind)
      ? [
          {
            groupe: t('tracks'),
            options: library.assets
              .filter((a) => a.kind === kind)
              .map((a) => ({ valeur: `a:${a.id}`, nom: a.name })),
          },
        ]
      : []),
  ];

  const controle = (id: ParamId): ReactNode => {
    const cls = 'h-8 text-[13px]';
    switch (id) {
      case 'music':
      case 'ambience':
        return (
          <SelectField
            value={trackValue(p[id])}
            onValueChange={(v) => set(id, trackFrom(v))}
            options={sons(id)}
            className={cn(cls, 'w-56')}
          />
        );
      case 'weather':
        return (
          <span className="flex flex-1 flex-wrap items-center gap-3">
            <SelectField
              value={p.weather?.type ?? 'clear'}
              onValueChange={(v) =>
                set(
                  'weather',
                  v === 'clear' ? null : { type: v, intensity: p.weather?.intensity ?? 1 },
                )
              }
              options={[
                { valeur: 'clear', nom: t('clearSky') },
                ...WEATHER_TYPES.map((w) => ({ valeur: w, nom: weatherName(w) })),
              ]}
              className={cn(cls, 'w-40')}
            />
            {p.weather && (
              <Slider
                value={[p.weather.intensity]}
                min={0.1}
                max={2}
                step={0.1}
                aria-label={t('intensity')}
                className="min-w-24 flex-1"
                onValueChange={([v]) => set('weather', { ...p.weather!, intensity: v ?? 1 })}
              />
            )}
          </span>
        );
      case 'hour':
        return (
          <SelectField
            value={String(p.time?.hour ?? 8)}
            onValueChange={(v) => setTime(Number(v), p.time?.rate)}
            options={Array.from({ length: 24 }, (_, h) => ({
              valeur: String(h),
              nom: `${String(h).padStart(2, '0')}:00`,
            }))}
            className={cn(cls, 'w-28')}
          />
        );
      case 'speed':
        return (
          <SelectField
            value={String(p.time?.rate ?? 1)}
            onValueChange={(v) => setTime(p.time?.hour, Number(v))}
            options={SPEEDS.map(([cle, r]) => ({ valeur: String(r), nom: tw(`speeds.${cle}`) }))}
            className={cn(cls, 'w-32')}
          />
        );
      case 'mood':
        return (
          <SelectField
            value={p.mood ?? 'none'}
            onValueChange={(v) => set('mood', v === 'none' ? null : (v as (typeof MOODS)[number]))}
            options={[
              { valeur: 'none', nom: t('noMood') },
              ...MOODS.map((m) => ({ valeur: m, nom: tfx(`moods.${m}`) })),
            ]}
            className={cn(cls, 'w-36')}
          />
        );
      case 'effect':
        return (
          <SelectField
            value={p.effect ?? 'flash'}
            onValueChange={(v) => set('effect', v as (typeof ONE_SHOTS)[number])}
            options={ONE_SHOTS.map((fx) => ({ valeur: fx, nom: tfx(`effects.${fx}`) }))}
            className={cn(cls, 'w-36')}
          />
        );
    }
  };

  const remplir = async () => {
    setCapture(true);
    try {
      const params = await captureAutomation(campaignId);
      setD((x) => ({ ...x, params: { ...x.params, ...params } }));
    } catch (e) {
      toast.error(t('captureFailed'), { description: messageErreur(e) });
    } finally {
      setCapture(false);
    }
  };

  const enregistrer = () =>
    save.mutate(
      {
        id: automation?.id ?? null,
        body: {
          name: d.name.trim() || t('defaultName'),
          params: d.params,
          triggers: d.triggers,
          sceneIds: d.sceneIds,
        },
      },
      { onSuccess: onClose },
    );

  const actifs = PARAMS.filter((x) => pilote(p, x.id));
  const libres = PARAMS.filter((x) => !pilote(p, x.id));
  const aDeclencheur = (ty: AutomationTrigger['type']) => d.triggers.some((x) => x.type === ty);
  const basculer = (ty: AutomationTrigger['type']) =>
    setD((x) => ({
      ...x,
      triggers: aDeclencheur(ty)
        ? x.triggers.filter((y) => y.type !== ty)
        : [...x.triggers, { type: ty } as AutomationTrigger],
    }));
  const arrivee = (mapId: string) =>
    d.triggers.some((x) => x.type === 'scene.enter' && x.mapId === mapId);
  const basculerArrivee = (mapId: string) =>
    setD((x) => ({
      ...x,
      triggers: arrivee(mapId)
        ? x.triggers.filter((y) => !(y.type === 'scene.enter' && y.mapId === mapId))
        : [...x.triggers, { type: 'scene.enter', mapId }],
    }));
  const basculerPropose = (mapId: string) =>
    setD((x) => ({
      ...x,
      sceneIds: x.sceneIds.includes(mapId)
        ? x.sceneIds.filter((id) => id !== mapId)
        : [...x.sceneIds, mapId],
    }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">{automation ? t('edit') : t('new')}</DialogTitle>
        <DialogDescription className="sr-only">{t('editorHint')}</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border py-3 pl-5 pr-12">
          <input
            autoFocus
            value={d.name}
            maxLength={80}
            onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))}
            placeholder={t('namePlaceholder')}
            aria-label={t('name')}
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-tight outline-none placeholder:text-subtle"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 text-muted-foreground"
            disabled={capture}
            onClick={() => void remplir()}
            title={t('capture')}
          >
            {capture ? <Loader2 className="animate-spin" /> : <Camera />}
            {t('capture')}
          </Button>
        </div>

        <div className="max-h-[calc(100dvh-10rem)] space-y-6 overflow-y-auto px-5 py-5">
          {/* Ce qu'il règle */}
          <Section titre={t('groups.controls')}>
            {actifs.length > 0 && (
              <div className="space-y-1.5">
                {actifs.map(({ id, icon: Icon }) => (
                  <div
                    key={id}
                    className="group flex items-center gap-2.5 rounded-xl bg-surface-2/60 p-1.5 pr-1"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background ring-1 ring-border">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="w-28 shrink-0 text-[13px] font-medium">
                      {t(`params.${id}`)}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center">{controle(id)}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('removeParam')}
                      onClick={() => activer(id, false)}
                      className="opacity-50 transition-opacity group-hover:opacity-100"
                    >
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {libres.length > 0 && (
              <div
                className={cn(
                  actifs.length
                    ? 'flex flex-wrap gap-1.5'
                    : 'grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-1.5',
                )}
              >
                {libres.map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => activer(id, true)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl text-[13px] font-medium transition-colors',
                      actifs.length
                        ? 'h-8 px-2.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                        : 'h-10 bg-surface-2/60 px-3 hover:bg-surface-2',
                    )}
                  >
                    {actifs.length ? (
                      <Plus className="size-3.5" aria-hidden />
                    ) : (
                      <Icon className="size-4 text-primary" aria-hidden />
                    )}
                    {t(`params.${id}`)}
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* Lancé tout seul */}
          <Section titre={t('groups.auto')}>
            <div className="flex flex-wrap gap-1.5">
              {AUTO.map((ty) => {
                const Icon = ICONS[ty];
                const on = aDeclencheur(ty);
                return (
                  <Bascule key={ty} on={on} onClick={() => basculer(ty)}>
                    <Icon className="size-3.5" aria-hidden />
                    {tr(`triggers.${ty.replace('.', '_')}` as 'triggers.combat_end')}
                  </Bascule>
                );
              })}
            </div>
          </Section>

          {/* Scènes */}
          {scenes.length > 0 && (
            <Section titre={t('groups.scenes')}>
              <ul className="max-h-60 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70">
                {scenes.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px]">{s.name}</span>
                    <Bascule
                      on={d.sceneIds.includes(s.id)}
                      onClick={() => basculerPropose(s.id)}
                      small
                    >
                      <MapPinned className="size-3" aria-hidden />
                      {t('offered')}
                    </Bascule>
                    <Bascule on={arrivee(s.id)} onClick={() => basculerArrivee(s.id)} small>
                      <DoorOpen className="size-3" aria-hidden />
                      {t('arrival')}
                    </Bascule>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button disabled={save.isPending} onClick={enregistrer}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {t('save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ titre, children }: Readonly<{ titre: string; children: ReactNode }>) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {titre}
      </h3>
      {children}
    </section>
  );
}

/** Pastille à bascule : pleine quand active. */
function Bascule({
  on,
  onClick,
  small,
  children,
}: Readonly<{ on: boolean; onClick(): void; small?: boolean; children: ReactNode }>) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors',
        small ? 'h-7 px-2 text-[12px]' : 'h-8 px-2.5 text-[13px]',
        on
          ? 'bg-primary text-primary-foreground'
          : 'bg-surface-2/70 text-muted-foreground hover:bg-surface-3 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
