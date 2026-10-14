'use client';

import type { Automation, AutomationParams, AutomationRule, MapScene } from '@vtt/contracts';
import { useTranslations } from 'next-intl';
import {
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Flame,
  Loader2,
  MapPinned,
  Moon,
  MoreHorizontal,
  Music,
  Pencil,
  Play,
  Plus,
  Snowflake,
  CloudMoon,
  Sun,
  Trash2,
  TriangleAlert,
  Waves,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { messageErreur } from '@/lib/api';
import { useAudioLibrary } from '@/lib/audio';
import { activeMapStore } from '@/lib/map/active-map';
import { mapKeys, mapsApi } from '@/lib/map/api';
import { weatherName } from '@/lib/map/features/weather/engine/effects';
import { cn } from '@/lib/utils';
import { useTable } from '../../../contexte';
import { useAutomations, useRemoveAutomation } from '../api';
import { applyAutomation } from '../apply';
import { lastAutomation } from '../state';
import { clocks } from '../../clocks/state';
import { AutomationEditor } from './automation-editor';
import type { CatalogContext } from './rule-catalog';
import { useRules } from '../rules-api';
import { RuleEditor } from './rule-editor';
import { RulesSection, RunLog } from './rules-section';

const VUES = ['presets', 'rules', 'log'] as const;
type Vue = (typeof VUES)[number];

/** Couleur et icône d'un réglage, tirées de son ambiance d'écran, sinon de sa météo. */
function lookOf(p: AutomationParams): { icon: LucideIcon; tint: string } {
  switch (p.mood) {
    case 'danger':
      return { icon: TriangleAlert, tint: 'from-red-500/30' };
    case 'dark':
      return { icon: Moon, tint: 'from-slate-400/25' };
    case 'cold':
      return { icon: Snowflake, tint: 'from-sky-400/30' };
    case 'dream':
      return { icon: CloudMoon, tint: 'from-violet-400/30' };
  }
  const w = p.weather?.type;
  if (w === 'rain') return { icon: CloudRain, tint: 'from-sky-500/25' };
  if (w === 'storm') return { icon: CloudLightning, tint: 'from-indigo-500/30' };
  if (w === 'snow' || w === 'blizzard') return { icon: CloudSnow, tint: 'from-cyan-200/25' };
  if (w === 'fog') return { icon: CloudFog, tint: 'from-zinc-300/20' };
  if (w === 'embers') return { icon: Flame, tint: 'from-orange-500/30' };
  if (p.music) return { icon: Music, tint: 'from-primary/30' };
  return { icon: p.weather === null ? Sun : Workflow, tint: 'from-primary/20' };
}

/**
 * Automatismes (MJ) : en haut, la scène du groupe et ses réglages (arrivée et thèmes) en
 * pastilles ; dessous, tous les réglages en tuiles qu'un clic lance. Le dernier lancé est
 * marqué « en cours ».
 */
export function AutomationsPanel() {
  const t = useTranslations('table.automations');
  const { campagne } = useTable();
  const automations = useAutomations(campagne.id);
  const remove = useRemoveAutomation(campagne.id);
  const maps = useQuery({
    queryKey: mapKeys.list(campagne.id),
    queryFn: () => mapsApi.list(campagne.id),
  });
  const settings = useQuery({
    queryKey: mapKeys.settings(campagne.id),
    queryFn: () => mapsApi.settings(campagne.id),
  });
  const ouverte = useStore(activeMapStore, (s) => s.mapId);
  const horloges = useStore(clocks.store, (s) => s.value);
  const [vue, setVue] = useState<Vue>('presets');
  const [regle, setRegle] = useState<AutomationRule | 'new' | null>(null);
  const { rules: regles } = useRules(campagne.id);
  const tr = useTranslations('table.automations.rules');
  const enCours = useStore(lastAutomation, (s) => s.id);
  const [edition, setEdition] = useState<Automation | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const liste = automations.data ?? [];
  const scenes = maps.data ?? [];
  const sceneId = settings.data?.partyMapId ?? ouverte;
  const scene = scenes.find((s) => s.id === sceneId) ?? null;
  const arrivee = (a: Automation) =>
    !!scene && a.triggers.some((tr) => tr.type === 'scene.enter' && tr.mapId === scene.id);
  const themes = scene ? liste.filter((a) => arrivee(a) || a.sceneIds.includes(scene.id)) : [];
  const catalog = useMemo<CatalogContext>(
    () => ({
      campaignId: campagne.id,
      scenes,
      presets: liste,
      clocks: [...new Set((horloges ?? []).map((h) => h.name).filter(Boolean))],
      players: campagne.members
        .filter((m) => m.role !== 'gm')
        .map((m) => ({ userId: m.userId, name: m.name })),
    }),
    [campagne.id, campagne.members, scenes, liste, horloges],
  );

  const jouer = async (a: Automation) => {
    setBusy(a.id);
    try {
      await applyAutomation(campagne.id, a.params, sceneId);
      lastAutomation.setState({ id: a.id });
    } catch (e) {
      toast.error(t('applyFailed'), { description: messageErreur(e) });
    } finally {
      setBusy(null);
    }
  };

  const ajouter = () => (vue === 'rules' ? setRegle('new') : setEdition('new'));
  const compte = (v: Vue) =>
    v === 'presets' ? liste.length : v === 'rules' ? (regles.data?.length ?? 0) : null;

  return (
    <div className="flex min-h-full flex-col">
      {/* En-tête : vues et ajout */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-background/85 px-4 py-2.5 backdrop-blur sm:px-5">
        <PillGroup>
          <div role="tablist" className="flex flex-1 gap-0.5 rounded-xl bg-surface-2/70 p-0.5">
            {VUES.map((v) => {
              const n = compte(v);
              return (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={vue === v}
                  onClick={() => setVue(v)}
                  className={cn(
                    'relative isolate flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-medium transition-colors',
                    vue === v ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {vue === v && <ActivePill className="bg-card shadow-sm ring-1 ring-border" />}
                  {t(`views.${v}`)}
                  {!!n && <span className="text-[11px] tabular-nums text-subtle">{n}</span>}
                </button>
              );
            })}
          </div>
        </PillGroup>
        {vue !== 'log' && (
          <Button
            size="icon-sm"
            onClick={ajouter}
            aria-label={vue === 'rules' ? tr('new') : t('new')}
            title={vue === 'rules' ? tr('new') : t('new')}
          >
            <Plus />
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-4 p-4 sm:p-5">
        {vue === 'rules' && <RulesSection c={catalog} onEdit={setRegle} />}
        {vue === 'log' && <RunLog c={catalog} />}

        {vue === 'presets' && (
          <>
            {/* Scène du groupe : ses réglages d'un clic */}
            {scene && themes.length > 0 && (
              <section className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-surface-2/50 p-1.5 [scrollbar-width:none]">
                <span
                  className="flex shrink-0 items-center gap-1.5 pl-2 pr-1 text-[12px] font-medium text-muted-foreground"
                  title={scene.name}
                >
                  <MapPinned className="size-3.5 text-primary" aria-hidden />
                  <span className="max-w-28 truncate">{scene.name}</span>
                </span>
                {themes.map((a) => {
                  const Icone = lookOf(a.params).icon;
                  const actif = enCours === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void jouer(a)}
                      className={cn(
                        'flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium transition-colors disabled:opacity-60',
                        actif
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card text-foreground ring-1 ring-border hover:ring-border-strong',
                      )}
                    >
                      {busy === a.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Icone className="size-3.5" aria-hidden />
                      )}
                      {a.name}
                      {arrivee(a) && (
                        <span
                          className={cn(
                            'rounded px-1 text-[10px] font-semibold',
                            actif ? 'bg-black/15' : 'bg-primary/15 text-primary-strong',
                          )}
                        >
                          {t('arrival')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </section>
            )}

            {/* Tous les réglages */}
            {liste.length ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2.5">
                {liste.map((a) => (
                  <li key={a.id}>
                    <Tuile
                      automation={a}
                      scenes={scenes}
                      campaignId={campagne.id}
                      actif={enCours === a.id}
                      busy={busy === a.id}
                      onPlay={() => void jouer(a)}
                      onEdit={() => setEdition(a)}
                      onDelete={() => remove.mutate(a.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              !automations.isLoading && (
                <button
                  type="button"
                  onClick={() => setEdition('new')}
                  className="grid w-full place-items-center gap-2 rounded-2xl border border-dashed border-border-strong py-10 text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-surface-2">
                    <Workflow className="size-5" aria-hidden />
                  </span>
                  {t('new')}
                </button>
              )
            )}
          </>
        )}
      </div>

      {edition && (
        <AutomationEditor
          campaignId={campagne.id}
          automation={edition === 'new' ? null : edition}
          scenes={scenes}
          onClose={() => setEdition(null)}
        />
      )}
      {regle && (
        <RuleEditor
          rule={regle === 'new' ? null : regle}
          c={catalog}
          onClose={() => setRegle(null)}
        />
      )}
    </div>
  );
}

/** Un réglage : teinte et icône de son ambiance, son nom, ce qu'il pilote ; un clic le lance. */
function Tuile({
  automation: a,
  scenes,
  campaignId,
  actif,
  busy,
  onPlay,
  onEdit,
  onDelete,
}: Readonly<{
  automation: Automation;
  scenes: readonly MapScene[];
  campaignId: string;
  actif: boolean;
  busy: boolean;
  onPlay(): void;
  onEdit(): void;
  onDelete(): void;
}>) {
  const t = useTranslations('table.automations');
  const { icon: Icone, tint } = lookOf(a.params);
  const resume = useResume(a.params, campaignId);
  const declencheurs = a.triggers.map((tr) =>
    tr.type === 'scene.enter'
      ? (scenes.find((s) => s.id === tr.mapId)?.name ?? '…')
      : t(`triggers.${tr.type.replace('.', '_')}` as 'triggers.combat_start'),
  );
  return (
    <div
      className={cn(
        'group relative flex h-full min-h-32 flex-col overflow-hidden rounded-2xl border bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-elevated',
        actif ? 'border-primary shadow-glow' : 'border-border/70 hover:border-border-strong',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent',
          tint,
        )}
      />
      <button
        type="button"
        onClick={onPlay}
        aria-label={t('playName', { name: a.name })}
        className="relative flex flex-1 flex-col gap-3 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex items-start gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background/50 text-foreground backdrop-blur-sm">
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Icone className="size-5" aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1 pr-6">
            <span className="block truncate text-[15px] font-semibold tracking-tight">
              {a.name}
            </span>
            {actif ? (
              <span className="text-[11px] font-medium text-primary">{t('running')}</span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                <Play className="size-3" aria-hidden />
                {t('play')}
              </span>
            )}
          </span>
        </span>
        <span className="mt-auto flex flex-wrap gap-1">
          {resume.map((x, i) => (
            <span
              key={i}
              className="flex max-w-full items-center gap-1 rounded-md bg-background/50 px-1.5 py-0.5 text-[11px] text-muted-foreground backdrop-blur-sm"
            >
              <x.icone className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{x.texte}</span>
            </span>
          ))}
        </span>
        {declencheurs.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-primary-strong">
            <Zap className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{declencheurs.join(' · ')}</span>
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('actions', { name: a.name })}
            className="absolute right-2 top-2 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            {t('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
            <Trash2 />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Ce que pilote un réglage, en puces courtes (les paramètres non pilotés n'apparaissent pas). */
function useResume(p: AutomationParams, campaignId: string) {
  const t = useTranslations('table.automations');
  const tfx = useTranslations('table.screenFx');
  const library = useAudioLibrary(campaignId);
  const piste = (tr: AutomationParams['music']) =>
    tr === null
      ? t('silence')
      : tr?.playlistId
        ? (library.playlists.find((x) => x.id === tr.playlistId)?.name ?? '…')
        : (library.assets.find((x) => x.id === tr?.assetId)?.name ?? '…');
  const puces: { icone: LucideIcon; texte: string }[] = [];
  if (p.music !== undefined) puces.push({ icone: Music, texte: piste(p.music) });
  if (p.ambience !== undefined) puces.push({ icone: Waves, texte: piste(p.ambience) });
  if (p.weather !== undefined)
    puces.push({
      icone: CloudRain,
      texte: p.weather ? weatherName(p.weather.type as never) : t('clearSky'),
    });
  if (p.mood !== undefined)
    puces.push({ icone: Moon, texte: p.mood ? tfx(`moods.${p.mood}`) : t('noMood') });
  if (p.effect) puces.push({ icone: Zap, texte: tfx(`effects.${p.effect}`) });
  if (p.time?.hour !== undefined)
    puces.push({ icone: Sun, texte: `${String(p.time.hour).padStart(2, '0')}:00` });
  return puces;
}
