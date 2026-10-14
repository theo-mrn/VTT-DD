'use client';

import type {
  AutomationRule,
  RuleAction,
  RuleActionType,
  RuleCondition,
  RuleConditionType,
  RuleTrigger,
  RuleTriggerType,
} from '@vtt/contracts';
import { useTranslations } from 'next-intl';
import { ChevronDown, Clock3, Plus, X, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useRuleMutations } from '../rules-api';
import {
  ACTION_GROUPS,
  ACTIONS,
  CONDITIONS,
  ICONS,
  labelKey,
  TRIGGER_GROUPS,
  TRIGGERS,
  type CatalogContext,
} from './rule-catalog';

type Draft = {
  name: string;
  trigger: RuleTrigger | null;
  conditions: RuleCondition[];
  actions: RuleAction[];
  once: boolean;
  cooldownSec: number;
};

type Famille = 'triggers' | 'conditions' | 'actions';
type AnyEditor = ComponentType<{ value: unknown; onChange(v: unknown): void; c: CatalogContext }>;
const editorOf = (e: unknown) => e as AnyEditor | undefined;

const DELAYS = [0, 5_000, 15_000, 30_000, 60_000, 300_000] as const;
const COOLDOWNS = [0, 30, 60, 300, 900, 3600] as const;

/** Durée courte : « 5 s », « 1 min ». */
const duree = (ms: number) => (ms < 60_000 ? `${ms / 1000} s` : `${ms / 60_000} min`); // i18n-ignore

/**
 * Fenêtre d'une règle, lue comme une phrase sur un fil : quand (un déclencheur), si (des
 * conditions, toutes vraies), alors (des actions, dans l'ordre, chacune à son moment).
 */
export function RuleEditor({
  rule,
  c: base,
  onClose,
}: Readonly<{
  /** null : nouvelle règle. */
  rule: AutomationRule | null;
  c: CatalogContext;
  onClose(): void;
}>) {
  const t = useTranslations('table.automations.rules');
  const { save } = useRuleMutations(base.campaignId);
  const [d, setD] = useState<Draft>(() => ({
    name: rule?.name ?? '',
    trigger: rule?.trigger ?? null,
    conditions: rule?.conditions ?? [],
    actions: rule?.actions ?? [],
    once: rule?.once ?? false,
    cooldownSec: rule?.cooldownSec ?? 0,
  }));
  const c = useMemo(() => ({ ...base, trigger: d.trigger }), [base, d.trigger]);
  const [choixDeclencheur, setChoixDeclencheur] = useState(false);
  const [choixCondition, setChoixCondition] = useState(false);
  const [choixAction, setChoixAction] = useState(false);
  const nom = (famille: Famille, type: string) =>
    t(`${famille}.${labelKey(type)}` as 'triggers.combat_end');

  const valide =
    !!d.trigger &&
    d.actions.length > 0 &&
    d.actions.every(
      (a) =>
        (a.type !== 'notice' || a.text.trim()) &&
        (a.type !== 'preset.apply' || a.automationId) &&
        (a.type !== 'clock.advance' || a.clock),
    ) &&
    d.conditions.every((x) => x.type !== 'scene.is' || x.mapId);

  const enregistrer = () =>
    d.trigger &&
    save.mutate(
      {
        id: rule?.id ?? null,
        body: {
          name: d.name.trim() || nom('triggers', d.trigger.type),
          trigger: d.trigger,
          conditions: d.conditions,
          actions: d.actions,
          once: d.once,
          cooldownSec: d.cooldownSec,
        },
      },
      { onSuccess: onClose },
    );

  const setAction = (i: number, a: RuleAction) =>
    setD((x) => ({ ...x, actions: x.actions.map((y, j) => (j === i ? a : y)) }));
  const setCondition = (i: number, v: RuleCondition) =>
    setD((x) => ({ ...x, conditions: x.conditions.map((y, j) => (j === i ? v : y)) }));

  const triggerGroups = TRIGGER_GROUPS.map((g) => ({
    label: t(`triggerGroups.${g.id}` as 'triggerGroups.scene'),
    items: g.types.map((ty) => ({ type: ty, label: nom('triggers', ty) })),
  }));
  const choisirDeclencheur = (ty: string) => {
    setD((x) => ({ ...x, trigger: TRIGGERS[ty as RuleTriggerType].make() }));
    setChoixDeclencheur(false);
  };
  const TriggerEditor = d.trigger ? editorOf(TRIGGERS[d.trigger.type].Editor) : undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">{rule ? t('edit') : t('new')}</DialogTitle>
        <DialogDescription className="sr-only">{t('editorHint')}</DialogDescription>
        <div className="border-b border-border px-5 pb-3 pt-4 pr-12">
          <input
            autoFocus
            value={d.name}
            maxLength={80}
            onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))}
            placeholder={d.trigger ? nom('triggers', d.trigger.type) : t('new')}
            aria-label={t('name')}
            className="w-full bg-transparent text-lg font-semibold tracking-tight outline-none placeholder:text-subtle"
          />
        </div>

        <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto px-5 py-5">
          {/* Quand */}
          <Etape mot={t('when')} fait={!!d.trigger}>
            {d.trigger ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-2">
                <Popover open={choixDeclencheur} onOpenChange={setChoixDeclencheur}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-primary/[0.08]"
                    >
                      <Pastille icon={ICONS[d.trigger.type]} accent />
                      <span className="flex-1 text-[14px] font-semibold">
                        {nom('triggers', d.trigger.type)}
                      </span>
                      <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(34rem,calc(100vw-2rem))] p-3">
                    <Catalogue
                      groups={triggerGroups}
                      selected={d.trigger.type}
                      onPick={choisirDeclencheur}
                    />
                  </PopoverContent>
                </Popover>
                {TriggerEditor && (
                  <div className="flex flex-wrap items-center gap-2 px-1.5 pb-0.5 pt-2">
                    <TriggerEditor
                      value={d.trigger}
                      c={c}
                      onChange={(trigger) =>
                        setD((x) => ({ ...x, trigger: trigger as RuleTrigger }))
                      }
                    />
                  </div>
                )}
              </div>
            ) : (
              <Catalogue groups={triggerGroups} onPick={choisirDeclencheur} />
            )}
          </Etape>

          {/* Si */}
          <Etape mot={t('if')} fait={d.conditions.length > 0} optional>
            <div className="space-y-1.5">
              {d.conditions.map((cond, i) => {
                const E = editorOf(CONDITIONS[cond.type].Editor)!;
                return (
                  <Ligne
                    key={i}
                    icon={ICONS[cond.type]}
                    label={nom('conditions', cond.type)}
                    onRemove={() =>
                      setD((x) => ({ ...x, conditions: x.conditions.filter((_, j) => j !== i) }))
                    }
                    removeLabel={t('removeCondition')}
                  >
                    <E value={cond} c={c} onChange={(v) => setCondition(i, v as RuleCondition)} />
                  </Ligne>
                );
              })}
              {d.conditions.length < 10 && (
                <Ajout
                  label={t('addCondition')}
                  open={choixCondition}
                  onOpenChange={setChoixCondition}
                >
                  <Catalogue
                    groups={[
                      {
                        label: t('if'),
                        items: (Object.keys(CONDITIONS) as RuleConditionType[])
                          .filter((ty) => ty !== 'scene.is' || c.scenes.length)
                          .map((ty) => ({ type: ty, label: nom('conditions', ty) })),
                      },
                    ]}
                    onPick={(ty) => {
                      setD((x) => ({
                        ...x,
                        conditions: [...x.conditions, CONDITIONS[ty as RuleConditionType].make(c)],
                      }));
                      setChoixCondition(false);
                    }}
                  />
                </Ajout>
              )}
            </div>
          </Etape>

          {/* Alors */}
          <Etape mot={t('then')} fait={d.actions.length > 0} last>
            <div className="space-y-1.5">
              {d.actions.map((a, i) => {
                const E = editorOf(ACTIONS[a.type].Editor);
                return (
                  <Ligne
                    key={i}
                    icon={ICONS[a.type]}
                    label={nom('actions', a.type)}
                    onRemove={() =>
                      setD((x) => ({ ...x, actions: x.actions.filter((_, j) => j !== i) }))
                    }
                    removeLabel={t('removeAction')}
                    aside={
                      <SelectField
                        value={String(a.delayMs ?? 0)}
                        onValueChange={(v) => {
                          const { delayMs: _d, ...rest } = a;
                          setAction(
                            i,
                            (Number(v) ? { ...rest, delayMs: Number(v) } : rest) as RuleAction,
                          );
                        }}
                        aria-label={t('delay')}
                        className={cn(
                          'h-7 w-auto gap-1 rounded-lg border-transparent bg-transparent px-2 text-[12px] shadow-none',
                          a.delayMs ? 'text-primary-strong' : 'text-muted-foreground',
                        )}
                        options={DELAYS.map((ms) => ({
                          valeur: String(ms),
                          nom: (
                            <span className="flex items-center gap-1">
                              <Clock3 className="size-3" aria-hidden />
                              {ms ? t('after', { delay: duree(ms) }) : t('now')}
                            </span>
                          ),
                        }))}
                      />
                    }
                  >
                    {E && <E value={a} c={c} onChange={(v) => setAction(i, v as RuleAction)} />}
                  </Ligne>
                );
              })}
              {d.actions.length < 20 && (
                <Ajout
                  label={t('addAction')}
                  primary={d.actions.length === 0}
                  open={choixAction}
                  onOpenChange={setChoixAction}
                >
                  <Catalogue
                    groups={ACTION_GROUPS.map((g) => ({
                      label: t(`actionGroups.${g.id}` as 'actionGroups.ambience'),
                      items: g.types
                        .filter((ty: RuleActionType) => ty !== 'preset.apply' || c.presets.length)
                        .map((ty) => ({ type: ty, label: nom('actions', ty) })),
                    }))}
                    onPick={(ty) => {
                      setD((x) => ({
                        ...x,
                        actions: [...x.actions, ACTIONS[ty as RuleActionType].make(c)],
                      }));
                      setChoixAction(false);
                    }}
                  />
                </Ajout>
              )}
            </div>
          </Etape>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-5 py-3">
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Switch checked={d.once} onCheckedChange={(once) => setD((x) => ({ ...x, once }))} />
            {t('once')}
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {t('cooldown')}
            <SelectField
              value={String(d.cooldownSec)}
              onValueChange={(v) => setD((x) => ({ ...x, cooldownSec: Number(v) }))}
              className="h-8 w-28 text-[13px]"
              options={COOLDOWNS.map((s) => ({
                valeur: String(s),
                nom: s ? duree(s * 1000) : t('noCooldown'),
              }))}
            />
          </label>
          <span className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button disabled={!valide || save.isPending} onClick={enregistrer}>
              {t('save')}
            </Button>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Une étape du fil : sa pastille et son trait, son mot (« Quand », « Si », « Alors »), son contenu. */
function Etape({
  mot,
  fait,
  optional,
  last,
  children,
}: Readonly<{
  mot: string;
  fait: boolean;
  optional?: boolean;
  last?: boolean;
  children: ReactNode;
}>) {
  return (
    <section className="relative grid grid-cols-[1.5rem_1fr] gap-x-3 pb-6 last:pb-0">
      {!last && (
        <span aria-hidden className="absolute bottom-0 left-[0.6875rem] top-7 w-px bg-border" />
      )}
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-6 place-items-center rounded-full ring-4 ring-background',
          fait
            ? 'bg-primary text-primary-foreground'
            : optional
              ? 'border border-dashed border-border-strong bg-background'
              : 'border border-primary/50 bg-background',
        )}
      >
        <span className={cn('size-1.5 rounded-full', fait ? 'bg-current' : 'bg-transparent')} />
      </span>
      <div className="min-w-0">
        <p className="mb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {mot}
        </p>
        {children}
      </div>
    </section>
  );
}

function Pastille({ icon: Icon, accent }: Readonly<{ icon: LucideIcon; accent?: boolean }>) {
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg',
        accent
          ? 'bg-primary text-primary-foreground'
          : 'bg-background text-foreground ring-1 ring-border',
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

/** Une condition ou une action : icône, nom, réglages, moment (actions), retrait. */
function Ligne({
  icon,
  label,
  children,
  aside,
  onRemove,
  removeLabel,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  children?: ReactNode;
  aside?: ReactNode;
  onRemove(): void;
  removeLabel: string;
}>) {
  return (
    <div className="group flex items-start gap-2.5 rounded-xl bg-surface-2/60 p-1.5 pr-1">
      <Pastille icon={icon} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-[3px]">
        <span className="mr-1 text-[13px] font-medium">{label}</span>
        {children}
      </div>
      <span className="flex shrink-0 items-center">
        {aside}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={removeLabel}
          onClick={onRemove}
          className="mt-0.5 opacity-50 transition-opacity group-hover:opacity-100"
        >
          <X />
        </Button>
      </span>
    </div>
  );
}

/** Bouton d'ajout qui ouvre le catalogue des blocs. */
function Ajout({
  label,
  primary,
  open,
  onOpenChange,
  children,
}: Readonly<{
  label: string;
  primary?: boolean;
  open: boolean;
  onOpenChange(o: boolean): void;
  children: ReactNode;
}>) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium transition-colors',
            primary
              ? 'w-full justify-center border border-dashed border-primary/50 text-primary-strong hover:bg-primary/[0.06]'
              : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
          )}
        >
          <Plus className="size-4" aria-hidden />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(34rem,calc(100vw-2rem))] p-3">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Blocs disponibles en tuiles (icône et nom), rangés par groupe. */
function Catalogue({
  groups,
  selected,
  onPick,
}: Readonly<{
  groups: { label: string; items: { type: string; label: string }[] }[];
  selected?: string;
  onPick(type: string): void;
}>) {
  return (
    <div className="space-y-3">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">
              {g.label}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-1.5">
              {g.items.map((it) => {
                const Icon = ICONS[it.type as keyof typeof ICONS];
                const actif = it.type === selected;
                return (
                  <button
                    key={it.type}
                    type="button"
                    onClick={() => onPick(it.type)}
                    className={cn(
                      'flex h-10 items-center gap-2 rounded-xl px-2.5 text-left text-[13px] font-medium transition-colors',
                      actif
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface-2/60 hover:bg-surface-2 hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('size-4 shrink-0', !actif && 'text-primary')} aria-hidden />
                    <span className="truncate">{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
