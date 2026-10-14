'use client';

import type { AutomationRule, RuleAction, RuleTrigger } from '@vtt/contracts';
import { useFormatter, useTranslations } from 'next-intl';
import {
  ArrowRight,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useRuleMutations, useRules } from '../rules-api';
import { ICONS, labelKey, type CatalogContext } from './rule-catalog';

/** Précision d'un déclencheur : sa scène, son horloge, son heure. */
function useTriggerDetail(c: CatalogContext) {
  return (tr: RuleTrigger) => {
    if ((tr.type === 'scene.enter' || tr.type === 'scene.leave') && tr.mapId)
      return c.scenes.find((s) => s.id === tr.mapId)?.name ?? '…';
    if ((tr.type === 'clock.segment' || tr.type === 'clock.full') && tr.clock) return tr.clock;
    if (tr.type === 'time.hour') return `${String(tr.hour).padStart(2, '0')}:00`;
    if (tr.type === 'combat.turn' && tr.userId)
      return c.players.find((p) => p.userId === tr.userId)?.name ?? '…';
    return null;
  };
}

/** Règles : une carte chacune, lue comme une phrase ; un clic l'ouvre. */
export function RulesSection({
  c,
  onEdit,
}: Readonly<{ c: CatalogContext; onEdit(rule: AutomationRule): void }>) {
  const t = useTranslations('table.automations.rules');
  const format = useFormatter();
  const { rules } = useRules(c.campaignId);
  const m = useRuleMutations(c.campaignId);
  const detail = useTriggerDetail(c);
  const liste = rules.data ?? [];
  /** À qui s'adresse une action personnelle, quand ce n'est pas toute la table. */
  const cible = (a: RuleAction) => {
    if (a.type === 'notice' && a.gmOnly) return t('gmOnly');
    if (!('to' in a) || !a.to) return null;
    if (a.to === 'actor') return t('actor');
    return c.players.find((p) => p.userId === a.to)?.name ?? t('formerPlayer');
  };

  if (rules.isLoading)
    return <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />;
  if (!liste.length)
    return (
      <div className="grid place-items-center gap-2 py-10 text-muted-foreground">
        <span className="grid size-12 place-items-center rounded-2xl bg-surface-2">
          <Zap className="size-5" aria-hidden />
        </span>
        <span className="text-[13px]">{t('empty')}</span>
      </div>
    );

  return (
    <ul className="space-y-2">
      {liste.map((r) => {
        const Icone = ICONS[r.trigger.type];
        const precision = detail(r.trigger);
        const visibles = r.actions.slice(0, 3);
        return (
          <li
            key={r.id}
            className={cn(
              'group relative rounded-2xl border bg-card transition-[border-color,opacity]',
              r.enabled ? 'border-border/70 hover:border-border-strong' : 'border-border/40',
            )}
          >
            <button
              type="button"
              onClick={() => onEdit(r)}
              className={cn(
                'flex w-full items-start gap-3 p-3 pr-14 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring rounded-2xl',
                !r.enabled && 'opacity-55',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-xl',
                  r.enabled
                    ? 'bg-primary/15 text-primary-strong'
                    : 'bg-surface-2 text-muted-foreground',
                )}
              >
                <Icone className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[14px] font-semibold tracking-tight">
                    {r.name}
                  </span>
                  {r.once && (
                    <span className="shrink-0 rounded bg-surface-2 px-1 text-[10px] font-medium text-muted-foreground">
                      {t('onceShort')}
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <span className="flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary-strong">
                    <span className="truncate">
                      {t(`triggers.${labelKey(r.trigger.type)}` as 'triggers.combat_end')}
                      {precision && ` · ${precision}`}
                    </span>
                  </span>
                  {r.conditions.length > 0 && (
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {t('conditionsCount', { count: r.conditions.length })}
                    </span>
                  )}
                  <ArrowRight className="size-3 text-subtle" aria-hidden />
                  {visibles.map((a, i) => {
                    const I = ICONS[a.type];
                    return (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-foreground/80"
                      >
                        <I className="size-3 shrink-0" aria-hidden />
                        {t(`actions.${labelKey(a.type)}` as 'actions.notice')}
                        {cible(a) && <span className="text-muted-foreground">· {cible(a)}</span>}
                      </span>
                    );
                  })}
                  {r.actions.length > visibles.length && (
                    <span className="px-1 text-[11px] text-muted-foreground">
                      +{r.actions.length - visibles.length}
                    </span>
                  )}
                </span>
                {r.lastRunAt && (
                  <span className="flex items-center gap-1 text-[11px] text-subtle">
                    <History className="size-3" aria-hidden />
                    {format.relativeTime(new Date(r.lastRunAt))}
                  </span>
                )}
              </span>
            </button>
            <span className="absolute right-3 top-3.5">
              <Switch
                checked={r.enabled}
                onCheckedChange={(enabled) => m.toggle.mutate({ id: r.id, enabled })}
                aria-label={t('toggle', { name: r.name })}
              />
            </span>
            <span className="absolute bottom-2 right-2 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('runNow')}
                title={t('runNow')}
                disabled={m.run.isPending}
                onClick={() => m.run.mutate(r.id)}
              >
                <Play />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={t('menu', { name: r.name })}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => onEdit(r)}>
                    <Pencil />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => m.remove.mutate(r.id)}
                  >
                    <Trash2 />
                    {t('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Journal : fil des dernières exécutions, ce qui les a lancées, réussite ou erreur. */
export function RunLog({ c }: Readonly<{ c: CatalogContext }>) {
  const t = useTranslations('table.automations.rules');
  const format = useFormatter();
  const { runs } = useRules(c.campaignId);
  const liste = runs.data ?? [];
  const origine = (trigger: string) =>
    trigger === 'manual' || trigger === 'delay'
      ? t(`origins.${trigger}`)
      : t(`triggers.${labelKey(trigger)}` as 'triggers.combat_end');
  const iconeDe = (trigger: string) =>
    trigger === 'manual'
      ? Play
      : trigger === 'delay'
        ? History
        : (ICONS[trigger as keyof typeof ICONS] ?? Zap);

  if (runs.isLoading)
    return <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />;
  if (!liste.length)
    return (
      <div className="grid place-items-center gap-2 py-10 text-muted-foreground">
        <span className="grid size-12 place-items-center rounded-2xl bg-surface-2">
          <History className="size-5" aria-hidden />
        </span>
        <span className="text-[13px]">{t('noRuns')}</span>
      </div>
    );
  return (
    <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[0.9375rem] before:top-3 before:w-px before:bg-border">
      {liste.map((r) => {
        const I = iconeDe(r.trigger);
        return (
          <li key={r.id} className="relative flex items-start gap-3 rounded-xl px-0 py-1.5">
            <span
              className={cn(
                'relative grid size-[1.875rem] shrink-0 place-items-center rounded-full ring-4 ring-background',
                r.ok ? 'bg-surface-2 text-foreground' : 'bg-destructive/15 text-destructive',
              )}
              aria-label={r.ok ? t('ok') : t('failed')}
            >
              <I className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-medium">{r.ruleName}</span>
                <time
                  className="ml-auto shrink-0 text-[11px] tabular-nums text-subtle"
                  dateTime={r.at}
                >
                  {format.dateTime(new Date(r.at), {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </time>
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {origine(r.trigger)}
              </span>
              {r.error && (
                <span className="mt-1 block rounded-md bg-destructive/10 px-1.5 py-1 text-[11px] text-destructive">
                  {r.error}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
