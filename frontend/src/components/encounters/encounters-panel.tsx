'use client';

/**
 * Panneau Rencontres du MJ (touche M) : générateur sur les règles que déclare le système
 * (`Systeme.rencontres`). En haut, une barre de commande : le groupe (personnages joueurs,
 * niveau ajustable, un clic les écarte), la difficulté, les filtres (menu) et Générer. Dessous,
 * une rubrique par forme de rencontre, chacune avec ses propositions éditables (jauge
 * recalculée à chaque changement), enregistrables dans Mes PNJ.
 */
import { useTranslations } from 'next-intl';
import { Dices, Minus, Plus, SlidersHorizontal, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EtatVide, Page } from '@/components/commun/page';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
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
import { CTA } from '../combat/live-reports/look';
import { ProposalCard, type EncounterEdit } from './proposal-card';
import { useEncounterData } from './use-encounter-data';

type Proposals = Record<string, Encounter[]>;

export function EncountersPanel() {
  const t = useTranslations();
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
          titre={t('encounters.noGenerator')}
          description={t('encounters.noGeneratorHint')}
        />
      </Page>
    );

  const activeScenario = scenario ?? rules.scenarios[0]!.id;
  const list = proposals[activeScenario] ?? [];
  const generated = Object.keys(proposals).length > 0;

  const run = () => {
    if (!party.length) return toast.error(t('encounters.emptyParty'));
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
      const next = applyEdit(e, a);
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
      toast.success(t('encounters.saved', { name }));
    } catch (err) {
      toast.error(t('encounters.saveFailed'), { description: messageErreur(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      {/* Commande : groupe, difficulté, filtres, générer */}
      <section className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-3xl border border-border/70 bg-card p-4 sm:p-5">
        <div className="min-w-0 flex-1 basis-80 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t('encounters.party')}</p>
          {data.party.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {data.party.map((m) => {
                const excluded = out.has(m.id);
                return (
                  <li
                    key={m.id}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full bg-surface-2/70 py-1 pl-1 pr-1 transition-opacity',
                      excluded && 'opacity-40',
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
                      className="flex min-w-0 items-center gap-2 rounded-full pr-1 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <Illustration
                        graine={m.name}
                        src={null}
                        className="size-7 shrink-0 rounded-full"
                      />
                      <span className="max-w-[8rem] truncate">{m.name}</span>
                    </button>
                    <Stepper
                      value={levels[m.id] ?? m.level}
                      min={1}
                      max={rules.difficultes[0]!.parNiveau.length}
                      label={t('encounters.levelOf', { name: m.name })}
                      onChange={(v) => setLevels((l) => ({ ...l, [m.id]: v }))}
                      disabled={excluded}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t('encounters.noPlayerCharacter')}</p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t('encounters.difficulty')}</p>
          <PillGroup>
            <div className="flex gap-1 rounded-2xl bg-surface-2/60 p-1">
              {rules.difficultes.map((d) => {
                const on = d.id === difficultyId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDifficulty(d.id)}
                    className={cn(
                      'relative isolate h-9 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-medium transition-colors',
                      on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {on && <ActivePill className="bg-card shadow-surface ring-1 ring-border" />}
                    {d.nom}
                  </button>
                );
              })}
            </div>
          </PillGroup>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <Info texte={t('encounters.filters')}>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={t('encounters.filters')}
                  className="relative size-11 rounded-xl"
                >
                  <SlidersHorizontal />
                  {countFilters(filters) > 0 && (
                    <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {countFilters(filters)}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
            </Info>
            <PopoverContent align="end" className="w-80 space-y-4 p-4">
              {data.categories.length > 0 && (
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
                          'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                          on
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-surface-2/70 text-muted-foreground hover:bg-surface-3 hover:text-foreground',
                        )}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="space-y-2">
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
              </div>
              <p className="text-[11px] tabular-nums text-subtle">
                {pool.length} créature{pool.length > 1 ? 's' : ''}
              </p>
            </PopoverContent>
          </Popover>
          <Button
            size="lg"
            className={cn(CTA, 'h-11 rounded-xl px-6')}
            onClick={run}
            disabled={!pool.length || !party.length}
          >
            <Dices />
            {generated ? t('encounters.reroll') : t('encounters.generate')}
          </Button>
        </div>
      </section>

      {/* Formes de rencontre */}
      {generated && (
        <PillGroup>
          <div
            role="tablist"
            className="flex max-w-full gap-1 self-start overflow-x-auto rounded-2xl border border-border/70 bg-surface-2/50 p-1 [scrollbar-width:none]"
          >
            {rules.scenarios.map((s) => {
              const on = s.id === activeScenario;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  title={s.description}
                  onClick={() => setScenario(s.id)}
                  className={cn(
                    'relative isolate flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {on && <ActivePill className="bg-card shadow-surface ring-1 ring-border" />}
                  {s.nom}
                  {proposals[s.id] && (
                    <span className="rounded-md bg-surface-3 px-1.5 text-[10px] tabular-nums text-subtle">
                      {proposals[s.id]!.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </PillGroup>
      )}

      {!generated && (
        <div className="grid min-h-[22rem] place-items-center rounded-3xl bg-surface-2/40">
          <div className="text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary">
              <Swords className="size-7" aria-hidden />
            </span>
            <p className="mt-4 text-lg font-semibold tracking-tight">
              {party.length} personnage{party.length > 1 ? 's' : ''}, niveau{' '}
              {Math.round(
                (party.reduce((s, m) => s + m.level, 0) / Math.max(1, party.length)) * 10,
              ) / 10}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {rules.difficultes.find((d) => d.id === difficultyId)?.nom}
            </p>
          </div>
        </div>
      )}
      {generated && list.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
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
      )}
      {generated && list.length === 0 && (
        <EtatVide
          icone={Swords}
          titre={t('encounters.noProposal')}
          description={t('encounters.noProposalHint')}
        />
      )}
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
  const t = useTranslations();
  return (
    <span role="group" aria-label={label} className="flex items-center rounded-full bg-card">
      <button
        type="button"
        disabled={disabled || value <= min}
        aria-label={t('encounters.less')}
        className="grid size-7 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-3.5" />
      </button>
      <span className="w-6 text-center font-mono text-sm font-semibold tabular-nums">{value}</span>
      <button
        type="button"
        disabled={disabled || value >= max}
        aria-label={t('encounters.more')}
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
  value: { min?: number; max?: number };
  onChange(v: { min?: number; max?: number }): void;
}>) {
  const t = useTranslations();
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
        aria-label={t('encounters.atLeast', { label })}
        placeholder="min"
        value={value.min ?? ''}
        onChange={(e) => set('min', e.target.value)}
        className="h-8 w-16 text-right font-mono text-xs"
      />
      <span className="text-subtle">–</span>
      <Input
        type="number"
        inputMode="decimal"
        aria-label={t('encounters.atMost', { label })}
        placeholder="max"
        value={value.max ?? ''}
        onChange={(e) => set('max', e.target.value)}
        className="h-8 w-16 text-right font-mono text-xs"
      />
    </div>
  );
}

/** Modification d'une proposition depuis sa carte. */
function applyEdit(e: Encounter, a: EncounterEdit): Encounter {
  switch (a.type) {
    case 'count':
      return setCount(e, a.key, a.count);
    case 'lock':
      return toggleLock(e, a.key);
    case 'replace':
      return replaceCreature(e, a.key, a.by);
    case 'add':
      return addCreature(e, a.creature);
  }
}
