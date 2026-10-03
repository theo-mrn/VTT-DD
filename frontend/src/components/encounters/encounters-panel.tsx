'use client';

/**
 * Panneau Rencontres du MJ (touche M) : le générateur de l'ancienne app, refait sur les règles
 * que déclare le système (`Systeme.rencontres`). À gauche, le groupe (personnages joueurs et
 * leur niveau, chacun ajustable ou écarté), la difficulté et les filtres ; à droite, une
 * rubrique par forme de rencontre, chacune avec ses propositions éditables (jauge recalculée
 * à chaque changement), enregistrables dans Mes PNJ.
 */
import { ChevronDown, Dices, Minus, Plus, SlidersHorizontal, Swords } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EtatVide, Page } from '@/components/commun/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { messageErreur } from '@/lib/api';
import { npcTemplatesApi, useRefreshNpcTemplates } from '@/lib/bestiary';
import {
  addCreature,
  filterPool,
  generate,
  replaceCreature,
  reroll,
  setCount,
  toggleLock,
  type Encounter,
  type EncounterFilters,
  type PartyMember,
} from '@/lib/encounters/generator';
import { cn } from '@/lib/utils';
import { useTable } from '../table/contexte';
import { DotsBackdrop } from '../combat/backdrop';
import { CTA, LABEL } from '../combat/live-reports/look';
import { ProposalCard, type EncounterEdit } from './proposal-card';
import { useEncounterData } from './use-encounter-data';

type Proposals = Record<string, Encounter[]>;

export function EncountersPanel() {
  const { campagne } = useTable();
  const data = useEncounterData(campagne.id, campagne.system);
  const refresh = useRefreshNpcTemplates(campagne.id);
  const rules = data.rules;

  // Le groupe : chacun ajustable (niveau) ou écarté ; les nouveaux venus y entrent
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [out, setOut] = useState<ReadonlySet<string>>(new Set());
  const party = useMemo(
    (): PartyMember[] =>
      data.party
        .filter((m) => !out.has(m.id))
        .map((m) => ({ ...m, level: levels[m.id] ?? m.level })),
    [data.party, levels, out],
  );

  const [difficulty, setDifficulty] = useState<string | null>(null);
  const difficultyId = difficulty ?? rules?.difficultes[1]?.id ?? rules?.difficultes[0]?.id ?? '';
  const [filters, setFilters] = useState<EncounterFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [proposals, setProposals] = useState<Proposals>({});
  const [scenario, setScenario] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pool = useMemo(() => filterPool(data.pool, filters), [data.pool, filters]);

  if (data.loading)
    return (
      <Page large>
        <Skeleton className="h-64 rounded-2xl" />
      </Page>
    );
  if (!rules)
    return (
      <Page>
        <EtatVide
          icone={Swords}
          titre="Pas de générateur pour ce système"
          description="Le système de la campagne ne déclare pas de règles de rencontre."
        />
      </Page>
    );

  const activeScenario = scenario ?? rules.scenarios[0]!.id;
  const list = proposals[activeScenario] ?? [];
  const generated = Object.keys(proposals).length > 0;

  const run = () => {
    if (!party.length) return toast.error('Le groupe est vide');
    const next: Proposals = {};
    for (const s of rules.scenarios)
      next[s.id] = generate({ rules, pool, party, difficultyId, scenarioId: s.id });
    setProposals(next);
    if (!next[activeScenario]?.length) {
      const first = rules.scenarios.find((s) => next[s.id]?.length);
      if (first) setScenario(first.id);
    }
  };

  const edit = (i: number, a: EncounterEdit) =>
    setProposals((p) => {
      const cur = p[activeScenario] ?? [];
      const e = cur[i];
      if (!e) return p;
      const next =
        a.type === 'count'
          ? setCount(e, a.key, a.count)
          : a.type === 'lock'
            ? toggleLock(e, a.key)
            : a.type === 'replace'
              ? replaceCreature(e, a.key, a.by)
              : addCreature(e, a.creature);
      return { ...p, [activeScenario]: cur.map((x, j) => (j === i ? next : x)) };
    });

  const again = (i: number) =>
    setProposals((p) => {
      const cur = p[activeScenario] ?? [];
      const e = cur[i];
      if (!e) return p;
      const next = reroll({ rules, pool, party, difficultyId, encounter: e });
      return { ...p, [activeScenario]: cur.map((x, j) => (j === i ? next : x)) };
    });

  /** Une catégorie « Rencontre — … » dans Mes PNJ, un modèle par créature. */
  const save = async (e: Encounter, i: number) => {
    setBusy(true);
    try {
      const s = rules.scenarios.find((x) => x.id === e.scenario);
      const d = rules.difficultes.find((x) => x.id === difficultyId);
      const name = `Rencontre — ${s?.nom ?? ''} ${d ? `(${d.nom.toLowerCase()})` : ''} #${i + 1}`
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
      const category = await npcTemplatesApi.createCategory(campagne.id, name);
      for (const g of e.groups) {
        if ('template' in g.creature.source) continue;
        await npcTemplatesApi.create(campagne.id, {
          name: g.creature.name,
          categoryId: category.id,
          systemeId: campagne.system,
          bestiary: { key: g.creature.source.bestiary },
        });
      }
      refresh();
      toast.success(`« ${name} » ajoutée à Mes PNJ`);
    } catch (err) {
      toast.error('La rencontre n’a pas pu être enregistrée', { description: messageErreur(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full gap-5 p-4 sm:p-6 lg:grid-cols-[20rem_1fr]">
      {/* Réglages */}
      <aside className="relative isolate space-y-5 self-start overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-surface lg:sticky lg:top-20">
        <DotsBackdrop />
        <section className="space-y-2">
          <h3 className={LABEL}>Groupe</h3>
          <ul className="space-y-1">
            {data.party.map((m) => {
              const excluded = out.has(m.id);
              const level = levels[m.id] ?? m.level;
              return (
                <li
                  key={m.id}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-1.5 py-1',
                    excluded && 'opacity-45',
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={!excluded}
                    onClick={() =>
                      setOut((s) => {
                        const n = new Set(s);
                        if (n.has(m.id)) n.delete(m.id);
                        else n.add(m.id);
                        return n;
                      })
                    }
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                  >
                    {m.name}
                  </button>
                  <Stepper
                    value={level}
                    min={1}
                    max={rules.difficultes[0]!.parNiveau.length}
                    label={`Niveau de ${m.name}`}
                    onChange={(v) => setLevels((l) => ({ ...l, [m.id]: v }))}
                    disabled={excluded}
                  />
                </li>
              );
            })}
          </ul>
          {!data.party.length && (
            <p className="text-[13px] text-muted-foreground">Aucun personnage joueur.</p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className={LABEL}>Difficulté</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {rules.difficultes.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={d.id === difficultyId}
                onClick={() => setDifficulty(d.id)}
                className={cn(
                  'h-9 rounded-xl border text-sm font-medium transition-colors',
                  d.id === difficultyId
                    ? 'border-primary/50 bg-primary/15 text-primary-strong'
                    : 'border-border bg-background/40 text-muted-foreground hover:text-foreground',
                )}
              >
                {d.nom}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <button
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
            className={cn(LABEL, 'flex w-full items-center gap-1.5')}
          >
            <SlidersHorizontal className="size-3.5" />
            Filtres
            {countFilters(filters) > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {countFilters(filters)}
              </span>
            )}
            <span className="flex-1" />
            <ChevronDown
              className={cn('size-3.5 transition-transform', showFilters && 'rotate-180')}
            />
          </button>
          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 overflow-hidden"
              >
                <div className="flex flex-wrap gap-1">
                  {data.categories.map((c) => {
                    const on = filters.categories?.includes(c) ?? false;
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            categories: on
                              ? (f.categories ?? []).filter((x) => x !== c)
                              : [...(f.categories ?? []), c],
                          }))
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs transition-colors',
                          on
                            ? 'border-primary/50 bg-primary/15 text-primary-strong'
                            : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
                <Range
                  label={rules.nomPuissance}
                  value={{ min: filters.minPower, max: filters.maxPower }}
                  onChange={(r) => setFilters((f) => ({ ...f, minPower: r.min, maxPower: r.max }))}
                />
                {rules.filtres.map((k) => (
                  <Range
                    key={k}
                    label={data.attributeName(k)}
                    value={filters.ranges?.[k] ?? {}}
                    onChange={(r) => setFilters((f) => ({ ...f, ranges: { ...f.ranges, [k]: r } }))}
                  />
                ))}
                <p className="text-[11px] text-subtle tabular-nums">
                  {pool.length} créature{pool.length > 1 ? 's' : ''}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <Button
          size="lg"
          className={cn(CTA, 'h-11 w-full')}
          onClick={run}
          disabled={!pool.length || !party.length}
        >
          <Dices />
          {generated ? 'Relancer' : 'Générer'}
        </Button>
      </aside>

      {/* Propositions */}
      <main className="min-w-0 space-y-4">
        <Tabs value={activeScenario} onValueChange={setScenario}>
          <TabsList className="w-full">
            {rules.scenarios.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="flex-1" title={s.description}>
                {s.nom}
                {proposals[s.id] && (
                  <span className="ml-1 font-mono text-[10px] text-subtle tabular-nums">
                    {proposals[s.id]!.length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {!generated ? (
          <div className="relative isolate grid min-h-[20rem] place-items-center overflow-hidden rounded-2xl border border-dashed border-border">
            <DotsBackdrop />
            <div className="text-center">
              <Dices className="mx-auto size-10 text-primary" aria-hidden />
              <p className="mt-3 font-display text-lg font-semibold">
                {party.length} personnage{party.length > 1 ? 's' : ''}, niveau{' '}
                {Math.round(
                  (party.reduce((s, m) => s + m.level, 0) / Math.max(1, party.length)) * 10,
                ) / 10}
              </p>
            </div>
          </div>
        ) : list.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {list.map((e, i) => (
              <ProposalCard
                key={e.id}
                index={i}
                encounter={e}
                rules={rules}
                party={party}
                pool={pool}
                busy={busy}
                onChange={(a) => edit(i, a)}
                onReroll={() => again(i)}
                onSave={() => void save(e, i)}
              />
            ))}
          </div>
        ) : (
          <EtatVide
            icone={Swords}
            titre="Aucune proposition"
            description="Aucune créature du vivier ne convient à cette forme de rencontre : élargissez les filtres."
          />
        )}
      </main>
    </div>
  );
}

function countFilters(f: EncounterFilters) {
  return (
    (f.categories?.length ? 1 : 0) +
    (f.minPower !== undefined || f.maxPower !== undefined ? 1 : 0) +
    Object.values(f.ranges ?? {}).filter((r) => r.min !== undefined || r.max !== undefined).length
  );
}

function Stepper({
  value,
  min,
  max,
  label,
  disabled,
  onChange,
}: Readonly<{
  value: number;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
  onChange(v: number): void;
}>) {
  return (
    <span
      role="group"
      aria-label={label}
      className="flex items-center rounded-lg border border-border bg-background/40"
    >
      <button
        type="button"
        disabled={disabled || value <= min}
        aria-label="Moins"
        className="grid size-7 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-3.5" />
      </button>
      <span className="w-6 text-center font-mono text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        disabled={disabled || value >= max}
        aria-label="Plus"
        className="grid size-7 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-3.5" />
      </button>
    </span>
  );
}

function Range({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: { min?: number | undefined; max?: number | undefined };
  onChange(v: { min?: number; max?: number }): void;
}>) {
  const parse = (s: string) => (s.trim() === '' ? undefined : Number(s));
  const set = (k: 'min' | 'max', s: string) => {
    const next = { ...value, [k]: parse(s) };
    const out: { min?: number; max?: number } = {};
    if (next.min !== undefined && Number.isFinite(next.min)) out.min = next.min;
    if (next.max !== undefined && Number.isFinite(next.max)) out.max = next.max;
    onChange(out);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        aria-label={`${label} au moins`}
        placeholder="min"
        value={value.min ?? ''}
        onChange={(e) => set('min', e.target.value)}
        className="h-8 w-16 text-right font-mono text-xs"
      />
      <span className="text-subtle">–</span>
      <Input
        type="number"
        inputMode="decimal"
        aria-label={`${label} au plus`}
        placeholder="max"
        value={value.max ?? ''}
        onChange={(e) => set('max', e.target.value)}
        className="h-8 w-16 text-right font-mono text-xs"
      />
    </div>
  );
}
