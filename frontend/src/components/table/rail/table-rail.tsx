'use client';

import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Map as IconeCarte,
  Plus,
  RotateCcw,
  Settings2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { cn } from '@/lib/utils';
import { panelDomId } from '../panels/panel-host';
import { useTable } from '../contexte';
import type { ActionFeature, TableFeatureItem } from '../panels/registry';
import { usePanelStore, usePanelStoreApi } from '../panels/store';
import { shortcutOfFeature, TABLE_SHORTCUTS } from '../panels/shortcuts';
import { useBindingLabel } from '@/lib/shortcuts/hooks';
import type { RailItem, useRailLayout } from './rail-preferences';

type RailLayout = ReturnType<typeof useRailLayout>;

/**
 * Navigation de la table : rail vertical flottant à gauche (grand écran), dock en bas avec un
 * bouton Carte (mobile). Mêmes panneaux, même ordre personnalisé.
 */
export const TableRail = memo(function TableRail({ layout }: { layout: RailLayout }) {
  const t = useTranslations('table.rail');
  const visibles = layout.items.filter((i) => !i.hidden);
  return (
    <>
      <nav
        aria-label={t('label')}
        className="fixed left-3 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-border-strong bg-popover/95 p-1.5 shadow-elevated lg:flex"
      >
        <RailScroll>
          <PillGroup>
            {visibles.map((i) => (
              <RailButton key={i.feature.id} feature={i.feature} variante="rail" />
            ))}
          </PillGroup>
        </RailScroll>
        <span aria-hidden className="my-1 h-px w-6 bg-border-strong" />
        <RailCustomizer layout={layout} cote="right" />
      </nav>

      <nav
        aria-label={t('label')}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[var(--table-dock-h)] items-start border-t border-border-strong bg-popover/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 lg:hidden"
      >
        <div className="no-scrollbar flex w-full items-center gap-0.5 overflow-x-auto">
          <DockMap />
          <span aria-hidden className="mx-0.5 h-8 w-px shrink-0 bg-border-strong" />
          <PillGroup>
            {visibles.map((i) => (
              <RailButton key={i.feature.id} feature={i.feature} variante="dock" />
            ))}
          </PillGroup>
          <span aria-hidden className="mx-0.5 h-8 w-px shrink-0 bg-border-strong" />
          <RailCustomizer layout={layout} cote="top" />
        </div>
      </nav>
    </>
  );
});

/**
 * Liste du rail à hauteur plafonnée (une dizaine de panneaux), défilante sans barre ; un fondu
 * montre qu'il en reste au-dessus ou en dessous. La marge garde visible le repère du panneau
 * actif, qui déborde à gauche.
 */
function RailScroll({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdges({
        top: el.scrollTop > 1,
        bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);
  const fade = `linear-gradient(to bottom, ${edges.top ? 'transparent' : '#000'}, #000 1.5rem, #000 calc(100% - 1.5rem), ${edges.bottom ? 'transparent' : '#000'})`;
  return (
    <div
      ref={ref}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
      className="no-scrollbar -mx-1.5 flex max-h-[min(30rem,calc(100dvh-12rem))] flex-col items-center gap-1 overflow-y-auto overscroll-contain px-1.5"
    >
      {children}
    </div>
  );
}

function Pastille({ nombre }: Readonly<{ nombre: number }>) {
  return (
    <span
      // Nouvelle valeur : la pastille « saute » (remontée à chaque changement)
      key={nombre}
      aria-hidden
      className="duration-300 ease-out animate-in zoom-in-50 absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-popover"
    >
      {nombre > 99 ? '99+' : nombre}
    </span>
  );
}

function RailButton({
  feature,
  variante,
}: Readonly<{ feature: TableFeatureItem; variante: 'rail' | 'dock' }>) {
  return feature.kind === 'panel' ? (
    <PanelButton feature={feature} variante={variante} />
  ) : (
    <ActionButton feature={feature} variante={variante} />
  );
}

/** Action : lancée au clic, allumée tant que son `useActive` le dit. */
function ActionButton({
  feature,
  variante,
}: Readonly<{ feature: ActionFeature & TableFeatureItem; variante: 'rail' | 'dock' }>) {
  const table = useTable();
  const panels = usePanelStoreApi();
  const useActive = feature.useActive ?? jamais;
  const actif = useActive();
  return (
    <RailItemButton
      feature={feature}
      variante={variante}
      actif={actif}
      onClick={() => feature.run({ table, panels })}
    />
  );
}

const jamais = () => false;

function PanelButton({
  feature: panel,
  variante,
}: Readonly<{ feature: TableFeatureItem; variante: 'rail' | 'dock' }>) {
  const id = panel.id as never;
  const actif = usePanelStore((s) => s.active === id);
  const monte = usePanelStore((s) => s.mounted.includes(id));
  const badge = usePanelStore((s) => s.badges[id] ?? 0);
  const toggle = usePanelStore((s) => s.toggle);
  return (
    <RailItemButton
      feature={panel}
      variante={variante}
      actif={actif}
      badge={badge}
      controls={monte ? panelDomId(id) : undefined}
      onClick={() => toggle(id)}
    />
  );
}

function RailItemButton({
  feature: panel,
  variante,
  actif,
  badge = 0,
  controls,
  onClick,
}: Readonly<{
  feature: TableFeatureItem;
  variante: 'rail' | 'dock';
  actif: boolean;
  badge?: number;
  controls?: string;
  onClick(): void;
}>) {
  const Icone = panel.icon;
  const touche = useBindingLabel(shortcutOfFeature(panel.id));
  const t = useTranslations('table');
  const nom = t(`panels.${panel.id}.label`);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Ouvert par sa touche alors qu'il est hors de la partie visible du rail
    if (actif && variante === 'rail') ref.current?.scrollIntoView({ block: 'nearest' });
  }, [actif, variante]);

  const bouton = (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={panel.kind === 'panel' ? actif : undefined}
      aria-pressed={panel.kind === 'action' ? actif : undefined}
      aria-controls={controls}
      aria-keyshortcuts={touche.aria}
      aria-label={t('rail.news', { count: badge, panel: nom })}
      className={cn(
        'relative isolate flex shrink-0 items-center justify-center transition-[color,background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95',
        variante === 'rail'
          ? 'size-11 rounded-xl'
          : 'h-12 min-w-14 flex-1 flex-col gap-0.5 rounded-xl px-1 text-[10px] font-medium',
        actif ? 'text-primary' : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
      )}
    >
      {actif && <ActivePill className="bg-primary/15" />}
      {variante === 'rail' && actif && (
        <ActivePill
          id="rail-marker"
          className="inset-auto -left-1.5 top-3 z-0 h-5 w-1 rounded-l-none rounded-r-full bg-primary"
        />
      )}
      <Icone className="size-5" aria-hidden />
      {variante === 'dock' && <span className="max-w-full truncate">{nom}</span>}
      {badge > 0 && <Pastille nombre={badge} />}
    </button>
  );

  if (variante === 'dock') return bouton;
  return (
    <Info
      cote="right"
      texte={
        <span className="flex items-center gap-2">
          {nom}
          {touche.label && <Kbd>{touche.label}</Kbd>}
        </span>
      }
    >
      {bouton}
    </Info>
  );
}

/** Mobile : revenir à la carte (ferme le panneau ouvert). */
function DockMap() {
  const t = useTranslations('table.rail');
  const surCarte = usePanelStore((s) => s.active === null);
  const close = usePanelStore((s) => s.close);
  return (
    <button
      type="button"
      onClick={close}
      aria-pressed={surCarte}
      className={cn(
        'flex h-12 min-w-14 flex-1 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        surCarte ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
      )}
    >
      <IconeCarte className="size-5" aria-hidden />
      {t('map')}
    </button>
  );
}

/** Ordre et masquage des panneaux du rail, par boutons (pas de glisser-déposer). */
function RailCustomizer({ layout, cote }: Readonly<{ layout: RailLayout; cote: 'right' | 'top' }>) {
  const t = useTranslations('table.rail');
  const { items, move, setHidden, reset, customized } = layout;
  const tousVisibles = items.filter((i) => !i.hidden).length;
  // Fonctions en plus pas encore ajoutées : à part, avec « Ajouter »
  const enPlus = items.filter((i) => i.feature.extra && i.hidden);
  const dansLaBarre = items.filter((i) => !(i.feature.extra && i.hidden));
  return (
    <Popover>
      <Info texte={cote === 'right' ? t('customizeRail') : null} cote="right">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t('customizeLabel')}
            className={cn(
              'flex shrink-0 items-center justify-center rounded-xl text-subtle transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-surface-3 data-[state=open]:text-foreground',
              cote === 'right' ? 'size-11' : 'h-12 w-11',
            )}
          >
            <Settings2 className="size-[18px]" aria-hidden />
          </button>
        </PopoverTrigger>
      </Info>
      <PopoverContent side={cote} align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{t('title')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('lead')}</p>
        </div>
        <div className="max-h-[55dvh] overflow-y-auto">
          <ul className="p-1.5" aria-label={t('panels')}>
            {dansLaBarre.map((i, index) => (
              <LigneCustomizer
                key={i.feature.id}
                item={i}
                premier={index === 0}
                dernier={index === dansLaBarre.length - 1}
                dernierVisible={!i.hidden && tousVisibles === 1}
                onMove={(delta) => move(i.feature.id, delta)}
                onHidden={(h) => setHidden(i.feature.id, h)}
              />
            ))}
          </ul>
          {enPlus.length > 0 && (
            <div className="border-t border-border p-1.5">
              <p className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
                {t('extras')}
              </p>
              <ul aria-label={t('extras')}>
                {enPlus.map((i) => (
                  <LigneExtra
                    key={i.feature.id}
                    item={i}
                    onAdd={() => setHidden(i.feature.id, false)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <ToucheNoteRapide />
          <Button variant="ghost" size="xs" onClick={reset} disabled={!customized}>
            <RotateCcw />
            {t('reset')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LigneCustomizer({
  item: { feature: panel, hidden },
  premier,
  dernier,
  dernierVisible,
  onMove,
  onHidden,
}: Readonly<{
  item: RailItem;
  premier: boolean;
  dernier: boolean;
  dernierVisible: boolean;
  onMove: (delta: -1 | 1) => void;
  onHidden: (hidden: boolean) => void;
}>) {
  const t = useTranslations('table');
  const nom = t(`panels.${panel.id}.label`);
  const Icone = panel.icon;
  const touche = useBindingLabel(shortcutOfFeature(panel.id));
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
      <Icone
        className={cn('size-4 shrink-0', hidden ? 'text-subtle' : 'text-primary')}
        aria-hidden
      />
      <span className={cn('min-w-0 flex-1 truncate text-sm', hidden && 'text-subtle line-through')}>
        {nom}
      </span>
      {touche.label && <Kbd aria-hidden>{touche.label}</Kbd>}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onMove(-1)}
        disabled={premier}
        aria-label={t('rail.moveUp', { panel: nom })}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onMove(1)}
        disabled={dernier}
        aria-label={t('rail.moveDown', { panel: nom })}
      >
        <ChevronDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onHidden(!hidden)}
        disabled={dernierVisible}
        aria-pressed={!hidden}
        aria-label={hidden ? t('rail.show', { panel: nom }) : t('rail.hide', { panel: nom })}
      >
        {hidden ? <EyeOff /> : <Eye />}
      </Button>
    </li>
  );
}

/** Fonction en plus, hors de la barre : nom, phrase courte, « Ajouter ». */
function LigneExtra({ item: { feature }, onAdd }: Readonly<{ item: RailItem; onAdd(): void }>) {
  const t = useTranslations('table');
  const nom = t(`panels.${feature.id}.label`);
  const Icone = feature.icon;
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted-foreground">
        <Icone className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{nom}</span>
        <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {t(`panels.${feature.id}.description`)}
        </span>
      </span>
      <Button
        variant="secondary"
        size="xs"
        onClick={onAdd}
        aria-label={t('rail.addPanel', { panel: nom })}
      >
        <Plus />
        {t('rail.add')}
      </Button>
    </li>
  );
}

/** Rappel de la note rapide, avec la touche choisie (rien si elle n'en a plus). */
function ToucheNoteRapide() {
  const t = useTranslations('table.rail');
  const touche = useBindingLabel(TABLE_SHORTCUTS.quickNote);
  if (!touche.label) return <span />;
  return (
    <span className="flex items-center gap-1.5 text-xs text-subtle">
      {t('quickNote')} <Kbd>{touche.label}</Kbd>
    </span>
  );
}
