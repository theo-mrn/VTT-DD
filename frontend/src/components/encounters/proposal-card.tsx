'use client';

/**
 * Une proposition de rencontre : jauge de difficulté (budgets du groupe, coût pondéré), une
 * ligne par créature (portrait, puissance, nombre ±, verrou, remplacer, retirer), puis
 * relancer (les verrouillées restent), ajouter une créature, enregistrer dans Mes PNJ.
 */
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
import { cn } from '@/lib/utils';
import { DotsBackdrop } from '../combat/backdrop';
import { SPRING } from '../combat/live-reports/look';

const fmt = (n: number) => n.toLocaleString('fr-FR');
const power = (p: number) =>
  p > 0 && p < 1 ? `1/${Math.round(1 / p)}` : p.toLocaleString('fr-FR');

/** Teinte de la difficulté atteinte (index dans la liste déclarée). */
function tone(index: number, total: number) {
  if (index < 0) return 'text-muted-foreground';
  const r = total > 1 ? index / (total - 1) : 1;
  return r >= 0.99
    ? 'text-destructive'
    : r >= 0.6
      ? 'text-warning'
      : r >= 0.3
        ? 'text-primary-strong'
        : 'text-success';
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
  const reading = readDifficulty(rules, party, encounter.groups);
  const reachedIndex = reading.reached
    ? reading.thresholds.findIndex((t) => t.id === reading.reached!.id)
    : -1;
  const max =
    Math.max(reading.adjusted, reading.thresholds[reading.thresholds.length - 1]?.budget ?? 1) *
    1.1;
  const count = encounter.groups.reduce((s, g) => s + g.count, 0);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: index * 0.04 }}
      className="relative isolate overflow-hidden rounded-2xl border border-border bg-card shadow-surface"
    >
      <DotsBackdrop />
      <header className="flex items-center gap-3 px-4 pt-3.5">
        <span className="font-mono text-xs text-subtle tabular-nums">#{index + 1}</span>
        <span
          className={cn(
            'font-display text-base font-semibold',
            tone(reachedIndex, reading.thresholds.length),
          )}
        >
          {reading.reached?.nom ?? 'Trop facile'}
        </span>
        <span className="flex-1" />
        <span className="font-mono text-sm font-semibold tabular-nums">
          {fmt(reading.adjusted)}{' '}
          <span className="text-[11px] font-normal text-subtle">{rules.unite}</span>
        </span>
        <span className="text-[11px] text-subtle">
          {count} créature{count > 1 ? 's' : ''}
        </span>
      </header>

      {/* Jauge : budgets du groupe par difficulté, coût pondéré de la proposition */}
      <div className="relative mx-4 mt-2.5 h-2 rounded-full bg-surface-3">
        <motion.span
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            reachedIndex >= reading.thresholds.length - 1
              ? 'bg-destructive'
              : reachedIndex >= 0
                ? 'bg-primary'
                : 'bg-muted-foreground/60',
          )}
          animate={{ width: `${Math.min(100, (reading.adjusted / max) * 100)}%` }}
          transition={SPRING}
        />
        {reading.thresholds.map((t) => (
          <Info key={t.id} texte={`${t.nom} : ${fmt(t.budget)} ${rules.unite}`}>
            <span
              className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/40"
              style={{ left: `${(t.budget / max) * 100}%` }}
            />
          </Info>
        ))}
      </div>

      <ul className="mt-3 space-y-1 px-2">
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
                className="size-10 shrink-0 rounded-xl ring-1 ring-border"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{g.creature.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {g.creature.category} · {rules.nomPuissance} {power(g.creature.power)}
                </span>
              </span>
              <span className="flex items-center rounded-lg border border-border bg-background/40">
                <button
                  type="button"
                  aria-label={`Un ${g.creature.name} de moins`}
                  className="grid size-7 place-items-center text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    onChange({ type: 'count', key: g.creature.key, count: g.count - 1 })
                  }
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-6 text-center font-mono text-sm font-semibold tabular-nums">
                  {g.count}
                </span>
                <button
                  type="button"
                  aria-label={`Un ${g.creature.name} de plus`}
                  className="grid size-7 place-items-center text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    onChange({ type: 'count', key: g.creature.key, count: g.count + 1 })
                  }
                >
                  <Plus className="size-3.5" />
                </button>
              </span>
              <Info texte={g.locked ? 'Gardée à la relance' : 'Garder à la relance'}>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-pressed={Boolean(g.locked)}
                  aria-label="Verrouiller"
                  className={cn(g.locked ? 'text-primary-strong' : 'text-subtle')}
                  onClick={() => onChange({ type: 'lock', key: g.creature.key })}
                >
                  {g.locked ? <Lock /> : <LockOpen />}
                </Button>
              </Info>
              <CreaturePicker
                label="Remplacer"
                icon={<Replace />}
                options={alternativesFor(pool, g.creature, 40)}
                onPick={(c) => onChange({ type: 'replace', key: g.creature.key, by: c })}
              />
              <Info texte="Retirer">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Retirer ${g.creature.name}`}
                  className="text-subtle hover:text-destructive"
                  onClick={() => onChange({ type: 'count', key: g.creature.key, count: 0 })}
                >
                  <X />
                </Button>
              </Info>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <footer className="mt-2 flex items-center gap-1.5 border-t border-border px-3 py-2.5">
        <Info texte="Relancer (les créatures verrouillées restent)">
          <Button size="icon-sm" variant="ghost" aria-label="Relancer" onClick={onReroll}>
            <RefreshCw />
          </Button>
        </Info>
        <CreaturePicker
          label="Ajouter une créature"
          icon={<Plus />}
          options={pool}
          onPick={(c) => onChange({ type: 'add', creature: c })}
        />
        <span className="flex-1" />
        <Button
          size="sm"
          variant="secondary"
          onClick={onSave}
          disabled={busy || !encounter.groups.length}
        >
          <Save />
          Mes PNJ
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
          <CommandInput placeholder="Chercher une créature" />
          <CommandList className="max-h-72">
            <CommandEmpty>Aucune créature.</CommandEmpty>
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
