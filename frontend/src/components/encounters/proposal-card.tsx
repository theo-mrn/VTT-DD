'use client';

/**
 * Une proposition de rencontre : aperçu teinté par la difficulté (coût, la troupe en portraits,
 * jauge et seuils du groupe), une ligne par créature (nombre ±, verrou, remplacer, retirer),
 * puis relancer (les verrouillées restent), ajouter une créature, enregistrer dans Mes PNJ.
 */
import { useTranslations } from 'next-intl';
import type { Rencontres } from '@vtt/rules';
import { Lock, LockOpen, Plus, RefreshCw, Replace, Save, Minus, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import {
  alternativesFor,
  readDifficulty,
  type Encounter,
  type EncounterCreature,
  type PartyMember,
} from '@/lib/encounters/generator';
import { formatter } from '@/i18n/runtime';
import { cn } from '@/lib/utils';
import { SPRING } from '../combat/live-reports/look';

const fmt = (n: number) => formatter().number(n);
const power = (p: number) => (p > 0 && p < 1 ? `1/${Math.round(1 / p)}` : formatter().number(p));

/** Teinte de la difficulté atteinte (index dans la liste déclarée). */
function tone(index: number, total: number) {
  if (index < 0) return 'text-muted-foreground';
  const r = total > 1 ? index / (total - 1) : 1;
  if (r >= 0.99) return 'text-destructive';
  if (r >= 0.6) return 'text-warning';
  return r >= 0.3 ? 'text-primary-strong' : 'text-success';
}

export function ProposalCard({
  index,
  encounter,
  rules,
  party,
  pool,
  busy,
  onChange,
  onReroll,
  onSave,
}: Readonly<{
  index: number;
  encounter: Encounter;
  rules: Rencontres;
  party: readonly PartyMember[];
  pool: readonly EncounterCreature[];
  busy: boolean;
  onChange(action: EncounterEdit): void;
  onReroll(): void;
  onSave(): void;
}>) {
  const t = useTranslations();
  const reading = readDifficulty(rules, party, encounter.groups);
  const reachedIndex = reading.reached
    ? reading.thresholds.findIndex((t) => t.id === reading.reached!.id)
    : -1;
  const max = Math.max(reading.adjusted, reading.thresholds.at(-1)?.budget ?? 1) * 1.1;
  const count = encounter.groups.reduce((s, g) => s + g.count, 0);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: index * 0.04 }}
      className="flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-elevated"
    >
      {/* Aperçu : difficulté, coût, la troupe en portraits, la jauge */}
      <div className={cn('px-5 pb-4 pt-5', hero(reachedIndex, reading.thresholds.length))}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tabular-nums text-subtle">
              #{index + 1} · {count} créature{count > 1 ? 's' : ''}
            </p>
            <p
              className={cn(
                'truncate text-xl font-semibold tracking-tight',
                tone(reachedIndex, reading.thresholds.length),
              )}
            >
              {reading.reached?.nom ?? t('encounters.tooEasy')}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-semibold tabular-nums">{fmt(reading.adjusted)}</p>
            <p className="text-[11px] text-subtle">{rules.unite}</p>
          </div>
        </div>

        <div className="mt-4 flex min-h-12 flex-wrap items-center gap-y-2 -space-x-2">
          {encounter.groups.map((g) => (
            <Info key={g.creature.key} texte={`${g.count} × ${g.creature.name}`}>
              <span className="relative transition-transform hover:z-10 hover:-translate-y-0.5">
                <Illustration
                  src={g.creature.image}
                  graine={g.creature.name}
                  position="top"
                  className="size-12 rounded-full ring-2 ring-card"
                />
                {g.count > 1 && (
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-foreground px-1.5 text-[10px] font-semibold tabular-nums text-background ring-2 ring-card">
                    ×{g.count}
                  </span>
                )}
              </span>
            </Info>
          ))}
        </div>

        {/* Jauge : coût pondéré face aux budgets du groupe */}
        <div className="relative mt-4 h-1.5 rounded-full bg-surface-3">
          <motion.span
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              barTone(reachedIndex, reading.thresholds.length),
            )}
            animate={{ width: `${Math.min(100, (reading.adjusted / max) * 100)}%` }}
            transition={SPRING}
          />
          {reading.thresholds.map((th) => (
            <span
              key={th.id}
              aria-hidden
              className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-foreground/30"
              style={{ left: `${(th.budget / max) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {reading.thresholds.map((th, i) => (
            <span
              key={th.id}
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] tabular-nums',
                i === reachedIndex
                  ? 'bg-foreground/10 font-semibold text-foreground'
                  : 'text-subtle',
              )}
            >
              {th.nom} {fmt(th.budget)}
            </span>
          ))}
        </div>
      </div>

      {/* Créatures : nombre, verrou, remplacer, retirer (au survol) */}
      <ul className="flex-1 space-y-0.5 p-2.5">
        <AnimatePresence initial={false}>
          {encounter.groups.map((g) => (
            <motion.li
              key={g.creature.key}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={SPRING}
              className={cn(
                'group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2/70',
                g.locked && 'bg-primary/[0.06]',
              )}
            >
              <Illustration
                src={g.creature.image}
                graine={g.creature.name}
                position="top"
                className="size-8 shrink-0 rounded-full"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{g.creature.name}</span>
                <span className="block truncate text-[11px] text-subtle">
                  {g.creature.category} · {rules.nomPuissance} {power(g.creature.power)}
                </span>
              </span>
              <span className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Info
                  texte={g.locked ? t('encounters.keptOnReroll') : t('encounters.keepOnReroll')}
                >
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-pressed={Boolean(g.locked)}
                    aria-label={t('encounters.lock')}
                    className={cn(g.locked ? 'text-primary-strong' : 'text-subtle')}
                    onClick={() => onChange({ type: 'lock', key: g.creature.key })}
                  >
                    {g.locked ? <Lock /> : <LockOpen />}
                  </Button>
                </Info>
                <CreaturePicker
                  label={t('encounters.replace')}
                  icon={<Replace />}
                  options={alternativesFor(pool, g.creature, 40)}
                  onPick={(c) => onChange({ type: 'replace', key: g.creature.key, by: c })}
                />
                <Info texte={t('common.actions.remove')}>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Retirer ${g.creature.name}`}
                    className="text-subtle hover:text-destructive"
                    onClick={() => onChange({ type: 'count', key: g.creature.key, count: 0 })}
                  >
                    <X />
                  </Button>
                </Info>
              </span>
              <span className="flex items-center rounded-full bg-surface-2">
                <button
                  type="button"
                  aria-label={t('encounters.oneLess', { name: g.creature.name })}
                  className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    onChange({ type: 'count', key: g.creature.key, count: g.count - 1 })
                  }
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-5 text-center text-[13px] font-semibold tabular-nums">
                  {g.count}
                </span>
                <button
                  type="button"
                  aria-label={t('encounters.oneMore', { name: g.creature.name })}
                  className="grid size-7 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    onChange({ type: 'count', key: g.creature.key, count: g.count + 1 })
                  }
                >
                  <Plus className="size-3.5" />
                </button>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <footer className="flex items-center gap-1 border-t border-border/60 px-3 py-2.5">
        <Info texte={t('encounters.rerollHint')}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('encounters.reroll')}
            onClick={onReroll}
          >
            <RefreshCw />
          </Button>
        </Info>
        <CreaturePicker
          label={t('encounters.addCreature')}
          icon={<Plus />}
          options={pool}
          onPick={(c) => onChange({ type: 'add', creature: c })}
        />
        <span className="flex-1" />
        <Button size="sm" onClick={onSave} disabled={busy || !encounter.groups.length}>
          <Save />
          {t('encounters.myNpcs')}
        </Button>
      </footer>
    </motion.article>
  );
}

export type EncounterEdit =
  | { type: 'count'; key: string; count: number }
  | { type: 'lock'; key: string }
  | { type: 'replace'; key: string; by: EncounterCreature }
  | { type: 'add'; creature: EncounterCreature };

function CreaturePicker({
  label,
  icon,
  options,
  onPick,
}: Readonly<{
  label: string;
  icon: ReactNode;
  options: readonly EncounterCreature[];
  onPick(c: EncounterCreature): void;
}>) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info texte={label}>
        <PopoverTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={label} className="text-subtle">
            {icon}
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder={t('encounters.searchCreature')} />
          <CommandList className="max-h-72">
            <CommandEmpty>{t('encounters.noCreature')}</CommandEmpty>
            <CommandGroup>
              {options.map((c) => (
                <CommandItem
                  key={c.key}
                  value={`${c.name} ${c.category}`}
                  onSelect={() => {
                    onPick(c);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <Illustration
                    src={c.image}
                    graine={c.name}
                    position="top"
                    className="size-7 shrink-0 rounded-lg"
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-[11px] text-subtle">{power(c.power)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Fond de l'aperçu, teinté par la difficulté atteinte. */
function hero(index: number, total: number) {
  if (index < 0) return 'bg-surface-2/30';
  const r = total > 1 ? index / (total - 1) : 1;
  if (r >= 0.99) return 'bg-gradient-to-br from-destructive/15 via-destructive/5 to-transparent';
  if (r >= 0.6) return 'bg-gradient-to-br from-warning/15 via-warning/5 to-transparent';
  return r >= 0.3
    ? 'bg-gradient-to-br from-primary/15 via-primary/5 to-transparent'
    : 'bg-gradient-to-br from-success/15 via-success/5 to-transparent';
}

/** Jauge de difficulté : au maximum, atteinte, ou sous le premier seuil. */
function barTone(reached: number, thresholds: number): string {
  if (reached >= thresholds - 1) return 'bg-destructive';
  return reached >= 0 ? 'bg-primary' : 'bg-muted-foreground/60';
}
