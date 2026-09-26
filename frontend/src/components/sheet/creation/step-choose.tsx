'use client';

import {
  choisirEtape,
  nouvellePossession,
  type Champ,
  type Entree,
  type EtatEntite,
} from '@vtt/rules';
import { AlertTriangle, Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { writes, type ChosenEntry } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { computeOn, useSheet } from '../context';
import { hasChoices, incompleteChoices, ChoiceEditor, type Choice } from '../choice-editor';
import { normalize, SheetEmpty } from '../elements';
import { prerequisitesMet } from '../possessions';
import { accentButton, field, focus, text, textAccent, textMuted } from '../styles';
import type { Step } from './assistant';

type FieldValue = number | string | boolean;

interface Selection {
  entry: string;
  choices: Choice;
  /** Champs de l'exemplaire modifiés dans l'assistant (valeur d'une Obligation…). */
  fields: Record<string, FieldValue>;
}

const SEARCH_FROM = 8;

/** Étape « choisir » : entrées de la sorte, leurs choix et les champs de chaque exemplaire. */
export function ChooseStep({ step, onNext }: { step: Step<'choisir'>; onNext(): void }) {
  const { system, state, sheet, write } = useSheet();
  const kind = system.sortes.get(step.sorte);
  const catalogue = useMemo(
    () =>
      [...system.entrees.values()]
        .filter((e) => e.sorte === step.sorte)
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [system, step.sorte],
  );
  const ofKind = (id: string) => system.entrees.get(id)?.sorte === step.sorte;
  const [selection, setSelection] = useState<Selection[]>(() =>
    state.possessions
      .filter((p) => ofKind(p.entree))
      .map((p) => ({ entry: p.entree, choices: { ...p.choix }, fields: {} })),
  );
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const unique = step.max === 1;
  const ids = selection.map((s) => s.entry);

  // Fiche d'aperçu : la sélection possédée, sans ses choix (comme la vérification du moteur)
  const selectionKey = ids.join('|');
  const preview = useMemo(() => {
    const others = state.possessions.filter(
      (p) => system.entrees.get(p.entree)?.sorte !== step.sorte,
    );
    const chosenOnes = selectionKey
      ? selectionKey.split('|').map((id) => ({
          ...(state.possessions.find((p) => p.entree === id) ?? nouvellePossession(id)),
          choix: {},
        }))
      : [];
    return computeOn(system, { ...state, possessions: [...others, ...chosenOnes] }) ?? sheet;
  }, [system, state, sheet, selectionKey, step.sorte]);

  if (!kind) return <SheetEmpty>Sorte inconnue : {step.sorte}</SheetEmpty>;

  const toggle = (e: Entree) => {
    setSelection((sel) => {
      if (sel.some((s) => s.entry === e.id)) return sel.filter((s) => s.entry !== e.id);
      const created: Selection = { entry: e.id, choices: {}, fields: {} };
      if (unique) return [created];
      return sel.length < step.max ? [...sel, created] : sel;
    });
  };
  const update = (id: string, patch: Partial<Selection>) =>
    setSelection((sel) => sel.map((s) => (s.entry === id ? { ...s, ...patch } : s)));

  const filter = normalize(search.trim());
  const visible = catalogue.filter((e) => !filter || normalize(e.nom).includes(filter));
  const editableFields = kind.champs.filter(
    (c) => c.type === 'nombre' || c.type === 'texte' || c.type === 'booleen',
  );
  const incomplete = selection.flatMap((s) => {
    const e = system.entrees.get(s.entry);
    return e ? incompleteChoices(preview, e, s.choices).map((c) => `${e.nom} : ${c}`) : [];
  });
  const enough = selection.length >= step.min && selection.length <= step.max;

  async function submit() {
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
      const attributeChoices = e.choixAttributs.some((c) => s.choices[c.id]?.length);
      if (!attributeChoices && !Object.keys(s.fields).length) continue;
      ok = await write(
        writes.possession({
          entree: s.entry,
          ...(attributeChoices ? { choix: s.choices } : {}),
          ...(Object.keys(s.fields).length ? { champs: s.fields } : {}),
        }),
      );
    }
    setSending(false);
    if (ok) onNext();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn(textMuted, 'text-sm')}>
          {step.min === step.max
            ? `${step.min} ${step.min > 1 ? (kind.nomPluriel ?? kind.nom) : kind.nom} à choisir`
            : `Entre ${step.min} et ${step.max}`}
          {' · '}
          <span className={cn(enough ? textAccent : '', 'tabular-nums')}>
            {selection.length} choisi{selection.length > 1 ? 's' : ''}
          </span>
        </p>
        {catalogue.length > SEARCH_FROM && (
          <div className="relative w-full sm:w-64">
            <Search
              className={cn(textMuted, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')}
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              aria-label={`Rechercher : ${kind.nomPluriel ?? kind.nom}`}
              className={cn(field, 'pl-9')}
            />
          </div>
        )}
      </div>

      <ul
        role={unique ? 'radiogroup' : 'group'}
        aria-label={step.nom}
        className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
      >
        {visible.map((e) => {
          const kept = ids.includes(e.id);
          const prerequisites = prerequisitesMet(sheet, e.id);
          const filled = !unique && !kept && selection.length >= step.max;
          return (
            <li key={e.id}>
              <button
                type="button"
                role={unique ? 'radio' : 'checkbox'}
                aria-checked={kept}
                disabled={filled}
                onClick={() => toggle(e)}
                className={cn(
                  'flex h-full w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  kept
                    ? 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_12%,var(--fiche-carte))]'
                    : 'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] hover:border-[color:var(--fiche-accent)]',
                  focus,
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center border',
                      unique ? 'rounded-full' : 'rounded',
                      kept
                        ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)] text-zinc-950'
                        : 'border-[color:var(--fiche-bordure)]',
                    )}
                  >
                    {kept && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn(text, 'min-w-0 flex-1 truncate text-sm font-medium')}>
                    {e.nom}
                  </span>
                  {!prerequisites && (
                    <span title="Prérequis non rempli" className="text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="sr-only">Prérequis non rempli</span>
                    </span>
                  )}
                </span>
                {e.description && (
                  <span className={cn(textMuted, 'line-clamp-3 text-xs leading-relaxed')}>
                    {e.description}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!visible.length && <SheetEmpty>Aucun résultat.</SheetEmpty>}

      {selection.map((s) => {
        const e = system.entrees.get(s.entry);
        if (!e || (!hasChoices(e) && !editableFields.length)) return null;
        return (
          <fieldset
            key={s.entry}
            className="space-y-4 rounded-xl border border-[color:var(--fiche-bordure)] p-3"
          >
            <legend className={cn(textAccent, 'px-1 text-sm font-semibold')}>{e.nom}</legend>
            {hasChoices(e) && (
              <ChoiceEditor
                sheet={preview}
                entry={e}
                value={s.choices}
                onChange={(choices) => update(s.entry, { choices })}
                disabled={sending}
              />
            )}
            {editableFields.length > 0 && (
              <CopyFields
                entry={e}
                fields={editableFields}
                values={s.fields}
                onChange={(fields) => update(s.entry, { fields })}
              />
            )}
          </fieldset>
        );
      })}

      {incomplete.length > 0 && (
        <p className={cn(textMuted, 'text-xs')}>Choix à compléter : {incomplete.join(' ; ')}</p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          className={accentButton}
          disabled={!enough || sending}
          onClick={submit}
        >
          Valider cette étape
        </button>
      </div>
    </div>
  );
}

function CopyFields({
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
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((c) => {
        const id = `champ-${entry.id}-${c.id}`;
        const v = current(c);
        return (
          <div key={c.id} className={cn('space-y-1', c.type === 'texte' && 'sm:col-span-2')}>
            <label htmlFor={id} className={cn(textMuted, 'block text-xs')}>
              {c.nom}
            </label>
            {c.type === 'booleen' ? (
              <input
                id={id}
                type="checkbox"
                checked={v === true}
                onChange={(e) => onChange({ ...values, [c.id]: e.target.checked })}
                className="h-4 w-4 accent-[color:var(--fiche-accent)]"
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
              <input
                id={id}
                type="text"
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange({ ...values, [c.id]: e.target.value })}
                className={field}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
