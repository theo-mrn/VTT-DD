'use client';

/**
 * Étape « choisir » : grille des entrées de la sorte avec leur aperçu, puis
 * une sous-étape par choix des entrées retenues (« 4 compétences de
 * carrière », sous-espèce, caractéristique au choix…) et par exemplaire à
 * détailler (valeur d'une Obligation). Chaque « Suivant » enregistre ce qui a
 * changé ; le nombre à retenir est la formule du système, évaluée sur la fiche.
 */
import {
  choisirEtape,
  nombreChoix,
  nouvellePossession,
  optionsChoix,
  type Champ,
  type Choix,
  type ChoixAttribut,
  type EtapeCreation,
  type Entree,
  type EtatEntite,
} from '@vtt/rules';
import { Check, Search, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { writes, type ChosenEntry } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { attributeChoiceCount } from '../sheet/choice-editor';
import { computeOn, useSheet } from '../sheet/context';
import { normalize, SheetEmpty } from '../sheet/elements';
import { prerequisitesMet } from '../sheet/possessions';
import { field, focus, secondaryButton, text, textAccent, textMuted } from '../sheet/styles';
import type { DraftSelection, DraftTracker } from './draft';
import { entryLinks, summarizeEntry } from './entries';
import { EntryCard, EntryPreview } from './entry-card';
import {
  accentChip,
  idleCard,
  panel,
  plainSummary,
  selectedCard,
  StepFooter,
  SubStepTrail,
  type TabNav,
} from './ui';

type Step = Extract<EtapeCreation, { type: 'choisir' }>;
type FieldValue = number | string | boolean;

type SubStep =
  | { kind: 'pick' }
  | { kind: 'choice'; entry: Entree; choice: Choix; count: number }
  | { kind: 'attributes'; entry: Entree; choice: ChoixAttribut; count: number }
  | { kind: 'fields'; entry: Entree };

const SEARCH_FROM = 8;

/** Champs d'exemplaire saisissables dans l'assistant (nombre, texte, oui/non). */
const editable = (c: Champ) => c.type === 'nombre' || c.type === 'texte' || c.type === 'booleen';

export function ChooseStep({ step, nav, draft }: { step: Step; nav: TabNav; draft: DraftTracker }) {
  const { system, state, sheet, write, pending } = useSheet();
  const kind = system.sortes.get(step.sorte);
  const ofKind = (id: string) => system.entrees.get(id)?.sorte === step.sorte;
  const saved = draft.draft.selections[step.id];
  const [selection, setSelection] = useState<DraftSelection[]>(
    () =>
      saved ??
      state.possessions
        .filter((p) => ofKind(p.entree))
        .map((p) => ({ entry: p.entree, choices: { ...p.choix }, fields: {} })),
  );
  const [dirty, setDirty] = useState(() => !!saved);
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const unique = step.max === 1;
  const fields = (kind?.champs ?? []).filter(editable);

  // Fiche d'aperçu : la sélection possédée, sans ses choix (comme la vérification du moteur)
  const ids = selection.map((s) => s.entry);
  const selectionKey = ids.join('|');
  const preview = useMemo(() => {
    const others = state.possessions.filter(
      (p) => system.entrees.get(p.entree)?.sorte !== step.sorte,
    );
    const chosen = selectionKey
      ? selectionKey.split('|').map((id) => ({
          ...(state.possessions.find((p) => p.entree === id) ?? nouvellePossession(id)),
          choix: {},
        }))
      : [];
    return computeOn(system, { ...state, possessions: [...others, ...chosen] }) ?? sheet;
  }, [system, state, sheet, selectionKey, step.sorte]);

  const subSteps = useMemo<SubStep[]>(() => {
    const r: SubStep[] = [{ kind: 'pick' }];
    for (const id of selectionKey ? selectionKey.split('|') : []) {
      const e = system.entrees.get(id);
      if (!e) continue;
      for (const c of e.choix) {
        const count = nombreChoix(preview, e.id, c);
        if (count > 0) r.push({ kind: 'choice', entry: e, choice: c, count });
      }
      for (const c of e.choixAttributs) {
        const count = attributeChoiceCount(preview, e, c.id);
        if (count > 0) r.push({ kind: 'attributes', entry: e, choice: c, count });
      }
      if (fields.length) r.push({ kind: 'fields', entry: e });
    }
    return r;
  }, [system, preview, selectionKey, fields.length]);

  const [index, setIndex] = useState(() => {
    if (nav.enterAt === 'end') return subSteps.length - 1;
    if (nav.enterAt === 'start') return 0;
    return draft.draft.subSteps[step.id] ?? 0;
  });
  const current = Math.max(0, Math.min(index, subSteps.length - 1));
  const sub = subSteps[current]!;

  // Sous-étape courante gardée dans le brouillon (reprise après rechargement)
  const { setSubStep } = draft;
  useEffect(() => setSubStep(step.id, current), [setSubStep, step.id, current]);

  if (!kind) return <SheetEmpty>Sorte inconnue : {step.sorte}</SheetEmpty>;
  const kindName = unique ? kind.nom : (kind.nomPluriel ?? kind.nom);

  const change = (next: DraftSelection[]) => {
    setSelection(next);
    setDirty(true);
    draft.setSelection(step.id, next);
  };
  const updateOne = (id: string, patch: Partial<DraftSelection>) =>
    change(selection.map((s) => (s.entry === id ? { ...s, ...patch } : s)));

  const go = (i: number) => {
    setIndex(i);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ─── Validité de la sous-étape courante ────────────────────────────────────

  const optionsOf = (c: Choix, kept: string[]) => {
    const options = optionsChoix(preview, c);
    // Les options déjà retenues restent visibles, même si une marque les exclut désormais
    for (const id of kept) {
      const e = system.entrees.get(id);
      if (e && !options.some((o) => o.id === id)) options.push(e);
    }
    return options.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  };
  const attributeOptions = (c: ChoixAttribut) =>
    [...preview.entite.attributs.values()].filter(
      (a) =>
        c.parmi.attributs?.includes(a.cle) || (!!c.parmi.groupe && a.groupe === c.parmi.groupe),
    );
  const keptFor = (entry: string, choice: string) =>
    selection.find((s) => s.entry === entry)?.choices[choice] ?? [];

  let valid = true;
  let hint: string | undefined;
  if (sub.kind === 'pick') {
    valid = selection.length >= step.min && selection.length <= step.max;
    if (!valid)
      hint =
        step.min === step.max
          ? `${step.min} ${step.min > 1 ? (kind.nomPluriel ?? kind.nom) : kind.nom} à choisir.`
          : `Entre ${step.min} et ${step.max} ${kind.nomPluriel ?? kind.nom} à choisir.`;
  } else if (sub.kind === 'choice' || sub.kind === 'attributes') {
    const total =
      sub.kind === 'choice'
        ? optionsOf(sub.choice, keptFor(sub.entry.id, sub.choice.id)).length
        : attributeOptions(sub.choice).length;
    const need = Math.min(sub.count, total);
    const kept = keptFor(sub.entry.id, sub.choice.id).length;
    valid = kept >= need;
    if (!valid) hint = `Encore ${need - kept} à choisir.`;
  }

  // ─── Enregistrement ────────────────────────────────────────────────────────

  async function submit(): Promise<boolean> {
    setSending(true);
    const entries: ChosenEntry[] = selection.map((s) => {
      const e = system.entrees.get(s.entry)!;
      const choices = Object.fromEntries(
        Object.entries(s.choices).filter(([k]) => e.choix.some((c) => c.id === k)),
      );
      return { entree: s.entry, ...(Object.keys(choices).length ? { choix: choices } : {}) };
    });
    let ok = await write(writes.step(step.id, { entrees: entries }), (st: EtatEntite) => {
      const r = choisirEtape(system, st, step.id, entries);
      return r.ok ? r.etat : null;
    });
    // Choix d'attributs et champs d'exemplaire : enregistrés sur chaque possession
    for (const s of selection) {
      if (!ok) break;
      const e = system.entrees.get(s.entry)!;
      const attributeChoices = Object.fromEntries(
        Object.entries(s.choices).filter(([k]) => e.choixAttributs.some((c) => c.id === k)),
      );
      const hasAttributes = Object.keys(attributeChoices).length > 0;
      const hasFields = Object.keys(s.fields).length > 0;
      if (!hasAttributes && !hasFields) continue;
      ok = await write(
        writes.possession({
          entree: s.entry,
          ...(hasAttributes ? { choix: attributeChoices } : {}),
          ...(hasFields ? { champs: s.fields } : {}),
        }),
      );
    }
    setSending(false);
    if (ok) {
      setDirty(false);
      draft.setSelection(step.id, null);
    }
    return ok;
  }

  async function next() {
    if (!valid) return;
    if (dirty && !(await submit())) return;
    if (current < subSteps.length - 1) go(current + 1);
    else nav.onNext();
  }
  const prev = current > 0 ? () => go(current - 1) : nav.onPrev;

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  const labels = subSteps.map((s) => {
    if (s.kind === 'pick') return step.nom;
    const prefix = selection.length > 1 ? `${s.entry.nom} : ` : '';
    return s.kind === 'fields' ? `${s.entry.nom} : détails` : prefix + s.choice.nom;
  });
  const previewEntry =
    sub.kind === 'pick'
      ? system.entrees.get(focused ?? selection[0]?.entry ?? '')
      : system.entrees.get(sub.entry.id);

  return (
    <div
      ref={top}
      className={cn(panel, 'flex scroll-mt-24 flex-col overflow-hidden lg:h-[78vh] lg:flex-row')}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-[color:var(--fiche-bordure)] px-5 py-2 text-xs">
          {subSteps.length > 1 ? (
            <SubStepTrail labels={labels} current={current} onGo={go} />
          ) : selection.length ? (
            selection.map((s) => (
              <span key={s.entry} className={accentChip}>
                {system.entrees.get(s.entry)?.nom ?? s.entry}
              </span>
            ))
          ) : (
            <span className={textMuted}>
              {step.min === 0
                ? `Facultatif : ${kind.nomPluriel ?? kind.nom}`
                : `Sélectionnez ${step.min === step.max && step.min === 1 ? 'votre choix' : 'vos choix'} : ${kindName}`}
            </span>
          )}
          {!unique && sub.kind === 'pick' && (
            <span
              className={cn(
                'ml-auto tabular-nums',
                selection.length >= step.min ? textAccent : textMuted,
              )}
            >
              {selection.length} / {step.max}
            </span>
          )}
        </div>

        <div className="max-h-[65vh] flex-1 overflow-y-auto p-5 [scrollbar-width:thin] lg:max-h-none">
          {sub.kind === 'pick' ? (
            <PickGrid
              step={step}
              selection={selection}
              onChange={change}
              onFocus={setFocused}
              disabled={sending}
            />
          ) : sub.kind === 'fields' ? (
            <FieldsEditor
              entry={sub.entry}
              fields={fields}
              values={selection.find((s) => s.entry === sub.entry.id)?.fields ?? {}}
              onChange={(v) => updateOne(sub.entry.id, { fields: v })}
            />
          ) : (
            <OptionPicker
              key={`${sub.entry.id}/${sub.choice.id}`}
              title={sub.choice.nom}
              count={sub.count}
              options={
                sub.kind === 'choice'
                  ? optionsOf(sub.choice, keptFor(sub.entry.id, sub.choice.id)).map((o) => ({
                      id: o.id,
                      name: o.nom,
                      description: o.description,
                    }))
                  : attributeOptions(sub.choice).map((a) => ({
                      id: a.cle,
                      name: a.nom,
                      description: a.description,
                    }))
              }
              kept={keptFor(sub.entry.id, sub.choice.id)}
              onChange={(kept) =>
                updateOne(sub.entry.id, {
                  choices: {
                    ...(selection.find((s) => s.entry === sub.entry.id)?.choices ?? {}),
                    [sub.choice.id]: kept,
                  },
                })
              }
              disabled={sending}
            />
          )}
        </div>
      </div>

      <aside className="flex flex-col border-t border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] lg:w-[380px] lg:shrink-0 lg:border-l lg:border-t-0 xl:w-[420px]">
        <div className="flex-1 overflow-y-auto [scrollbar-width:thin]">
          <EntryPreview sheet={preview} entry={previewEntry} />
        </div>
        <StepFooter
          className="border-t border-[color:var(--fiche-bordure)] p-4"
          onPrev={prev}
          onNext={next}
          nextDisabled={!valid || pending > 0}
          busy={sending}
          nextLabel={dirty ? 'Valider et continuer' : 'Suivant'}
          hint={hint}
        />
      </aside>
    </div>
  );
}

// ─── Grille des entrées ──────────────────────────────────────────────────────

function PickGrid({
  step,
  selection,
  onChange,
  onFocus,
  disabled,
}: {
  step: Step;
  selection: DraftSelection[];
  onChange(s: DraftSelection[]): void;
  onFocus(id: string): void;
  disabled: boolean;
}) {
  const { system, sheet } = useSheet();
  const [search, setSearch] = useState('');
  const unique = step.max === 1;

  const catalogue = useMemo(() => {
    const entries = [...system.entrees.values()].filter((e) => e.sorte === step.sorte);
    return entries
      .map((e) => ({
        entry: e,
        summary: summarizeEntry(sheet, e),
        links: entryLinks(sheet, e),
        missing: !prerequisitesMet(sheet, e.id),
      }))
      .sort(
        (a, b) =>
          Number(b.links.length > 0) - Number(a.links.length > 0) ||
          Number(a.missing) - Number(b.missing) ||
          a.entry.nom.localeCompare(b.entry.nom, 'fr'),
      );
  }, [system, sheet, step.sorte]);

  const filter = normalize(search.trim());
  const visible = catalogue.filter(
    (c) =>
      !filter ||
      normalize(c.entry.nom).includes(filter) ||
      normalize(c.entry.description ?? '').includes(filter),
  );
  const linked = catalogue.filter((c) => c.links.length > 0).map((c) => c.entry.id);
  const selected = new Set(selection.map((s) => s.entry));

  const toggle = (e: Entree) => {
    onFocus(e.id);
    if (selected.has(e.id)) {
      if (unique && step.min > 0) return;
      onChange(selection.filter((s) => s.entry !== e.id));
      return;
    }
    const created: DraftSelection = { entry: e.id, choices: {}, fields: {} };
    if (unique) onChange([created]);
    else if (selection.length < step.max) onChange([...selection, created]);
  };

  const takeLinked = () => {
    const next = [...selection];
    for (const id of linked) {
      if (next.length >= step.max) break;
      if (!next.some((s) => s.entry === id)) next.push({ entry: id, choices: {}, fields: {} });
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {(catalogue.length > SEARCH_FROM || (!unique && linked.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {catalogue.length > SEARCH_FROM && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className={cn(textMuted, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                aria-label={`Rechercher : ${system.sortes.get(step.sorte)?.nomPluriel ?? step.sorte}`}
                className={cn(field, 'pl-9')}
              />
            </div>
          )}
          {!unique && linked.some((id) => !selected.has(id)) && (
            <button
              type="button"
              className={cn(secondaryButton, 'text-xs')}
              onClick={takeLinked}
              disabled={disabled || selection.length >= step.max}
            >
              <Sparkles />
              Prendre les propositions ({linked.length})
            </button>
          )}
        </div>
      )}
      <div
        role={unique ? 'radiogroup' : 'group'}
        aria-label={step.nom}
        className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4"
      >
        {visible.map((c) => {
          const kept = selected.has(c.entry.id);
          return (
            <EntryCard
              key={c.entry.id}
              entry={c.entry}
              summary={c.summary}
              selected={kept}
              multiple={!unique}
              disabled={disabled || (!unique && !kept && selection.length >= step.max)}
              links={c.links}
              prerequisitesMissing={c.missing}
              onClick={() => toggle(c.entry)}
            />
          );
        })}
      </div>
      {!visible.length && <SheetEmpty>Aucun résultat.</SheetEmpty>}
    </div>
  );
}

// ─── Choix d'options ─────────────────────────────────────────────────────────

interface Option {
  id: string;
  name: string;
  description?: string | undefined;
}

/** Options d'un choix : pastilles, ou cartes décrites quand elles sont peu nombreuses. */
function OptionPicker({
  title,
  count,
  options,
  kept,
  onChange,
  disabled,
}: {
  title: string;
  count: number;
  options: Option[];
  kept: string[];
  onChange(kept: string[]): void;
  disabled: boolean;
}) {
  const need = Math.min(count, options.length);
  const full = kept.length >= count;
  const described = options.length <= 8 && options.some((o) => o.description);
  const toggle = (id: string) => {
    if (kept.includes(id)) onChange(kept.filter((x) => x !== id));
    else if (count === 1) onChange([id]);
    else if (!full) onChange([...kept, id]);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className={cn(text, 'text-base font-semibold')}>{title}</h3>
        <p className={cn(textMuted, 'text-sm')}>
          {need === options.length && need > 1
            ? `Retenez les ${need} options proposées`
            : `Choisissez exactement ${need} option${need > 1 ? 's' : ''}`}{' '}
          <span className={cn('tabular-nums', kept.length >= need ? textAccent : '')}>
            ({kept.length}/{need})
          </span>
          .
        </p>
      </div>
      {!options.length ? (
        <SheetEmpty>Aucune option disponible pour l’instant.</SheetEmpty>
      ) : described ? (
        <ul role="group" aria-label={title} className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const on = kept.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={disabled || (!on && full && count !== 1)}
                  onClick={() => toggle(o.id)}
                  className={cn(
                    'flex h-full w-full flex-col gap-1 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40',
                    on ? selectedCard : idleCard,
                    focus,
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CheckBox on={on} />
                    <span className={cn(text, 'font-semibold')}>{o.name}</span>
                  </span>
                  {o.description && (
                    <span className={cn(textMuted, 'text-xs leading-relaxed')}>
                      {plainSummary(o.description)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = kept.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                title={o.description ? plainSummary(o.description) : undefined}
                disabled={disabled || (!on && full && count !== 1)}
                onClick={() => toggle(o.id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  on
                    ? 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_10%,transparent)] text-[color:var(--fiche-accent)]'
                    : 'border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte-secondaire)] hover:border-[color:color-mix(in_srgb,var(--fiche-accent)_50%,var(--fiche-bordure))]',
                  focus,
                )}
              >
                {on && <Check className="h-3.5 w-3.5" />}
                {o.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CheckBox({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
        on
          ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)] text-zinc-950'
          : 'border-[color:var(--fiche-bordure)]',
      )}
    >
      {on && <Check className="h-3 w-3" />}
    </span>
  );
}

// ─── Champs de l'exemplaire ──────────────────────────────────────────────────

function FieldsEditor({
  entry,
  fields,
  values,
  onChange,
}: {
  entry: Entree;
  fields: Champ[];
  values: Record<string, FieldValue>;
  onChange(v: Record<string, FieldValue>): void;
}) {
  const { state } = useSheet();
  const possession = state.possessions.find((p) => p.entree === entry.id);
  const current = (c: Champ): FieldValue | undefined => {
    if (c.id in values) return values[c.id];
    const v = possession?.champs[c.id] ?? entry.champs[c.id];
    if (v !== undefined && !Array.isArray(v)) return v;
    return 'defaut' in c && c.defaut !== undefined && typeof c.defaut !== 'object'
      ? c.defaut
      : undefined;
  };

  return (
    <div className="space-y-4">
      <h3 className={cn(text, 'text-base font-semibold')}>{entry.nom}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((c) => {
          const id = `champ-${entry.id}-${c.id}`;
          const v = current(c);
          return (
            <div
              key={c.id}
              className={cn(
                'space-y-1.5 rounded-xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] p-4',
                c.type === 'texte' && 'sm:col-span-2',
              )}
            >
              <label
                htmlFor={id}
                className={cn(textMuted, 'block text-xs uppercase tracking-wider')}
              >
                {c.nom}
              </label>
              {c.type === 'booleen' ? (
                <input
                  id={id}
                  type="checkbox"
                  checked={v === true}
                  onChange={(e) => onChange({ ...values, [c.id]: e.target.checked })}
                  className="h-5 w-5 accent-[color:var(--fiche-accent)]"
                />
              ) : c.type === 'nombre' ? (
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  value={typeof v === 'number' ? v : ''}
                  onChange={(e) =>
                    e.target.value !== '' && onChange({ ...values, [c.id]: Number(e.target.value) })
                  }
                  className={cn(field, 'w-32')}
                />
              ) : (
                <textarea
                  id={id}
                  rows={3}
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => onChange({ ...values, [c.id]: e.target.value })}
                  className={cn(field, 'h-auto resize-y py-2')}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
