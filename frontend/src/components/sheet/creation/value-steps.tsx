'use client';

/** Étapes qui fixent des valeurs d'attributs : répartir, tirer, saisir. */
import {
  attributsVises,
  chemins,
  essayer,
  repartirEtape,
  saisirEtape,
  variables,
  type Attribut,
  type EtatEtape,
  type Fiche,
  type Valeur,
} from '@vtt/rules';
import { Dices, Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { writes } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { useSheet } from '../context';
import { SheetEmpty } from '../elements';
import { formatNumber, formatValue } from '../format';
import {
  accentButton,
  iconButton,
  secondaryButton,
  valueBox,
  field,
  focus,
  text,
  textAccent,
  textMuted,
} from '../styles';
import type { Step } from './assistant';

type Base = Extract<Attribut, { nature: 'base' }>;
const isBase = (a: Attribut): a is Base => a.nature === 'base';

/** Évalue une formule d'étape (budget, coût, bornes) ; undefined si absente ou en erreur. */
function stepFormula(
  sheet: Fiche,
  step: string,
  field: string,
  vars?: Record<string, Valeur>,
): number | undefined {
  const f = sheet.systeme.formules.get(chemins.etape(sheet.etat.type, step, field));
  if (!f) return undefined;
  const r = essayer(sheet, f, vars ? { variable: variables(vars) } : {});
  return r.ok ? Number(r.valeur) : undefined;
}

const baseValue = (sheet: Fiche, a: Base) => {
  const v = sheet.etat.valeurs[a.cle];
  return typeof v === 'number' ? v : a.defaut;
};

// ─── Répartir ────────────────────────────────────────────────────────────────

export function DistributeStep({
  step,
  state: review,
  onNext,
}: {
  step: Step<'repartir'>;
  state: EtatEtape;
  onNext(): void;
}) {
  const { system, sheet, write } = useSheet();
  const attributes = attributsVises(sheet.entite, step, isBase).filter(isBase);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(attributes.map((a) => [a.cle, baseValue(sheet, a)])),
  );
  const [sending, setSending] = useState(false);

  const budget = stepFormula(sheet, step.id, 'budget') ?? review.budget;
  const min = stepFormula(sheet, step.id, 'min');
  const max = stepFormula(sheet, step.id, 'max');
  const cost = (v: number) => stepFormula(sheet, step.id, 'cout', { valeur: v }) ?? 0;
  const spent = attributes.reduce((s, a) => s + cost(values[a.cle] ?? 0), 0);
  const remaining = budget !== undefined ? budget - spent : undefined;

  async function submit() {
    setSending(true);
    const ok = await write(writes.step(step.id, { valeurs: values }), (e) => {
      const r = repartirEtape(system, e, step.id, values);
      return r.ok ? r.etat : null;
    });
    setSending(false);
    if (ok) onNext();
  }

  if (!attributes.length) return <SheetEmpty>Aucun attribut à répartir.</SheetEmpty>;

  return (
    <div className="space-y-4">
      {remaining !== undefined && (
        <p
          role="status"
          className={cn('text-sm', remaining < 0 ? 'text-red-400' : text)}
          aria-live="polite"
        >
          Points restants :{' '}
          <strong className={cn('tabular-nums', remaining >= 0 && textAccent)}>
            {formatNumber(remaining)}
          </strong>{' '}
          <span className={textMuted}>sur {formatNumber(budget ?? 0)}</span>
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {attributes.map((a) => {
          const v = values[a.cle] ?? 0;
          const extraCost = cost(v + 1) - cost(v);
          const canIncrease =
            (max === undefined || v + 1 <= max) &&
            (remaining === undefined || extraCost <= remaining);
          const canDecrease = min === undefined || v - 1 >= min;
          return (
            <li key={a.cle} className={cn(valueBox, 'flex items-center gap-3 px-3 py-2')}>
              <span className="min-w-0 flex-1">
                <span className={cn(text, 'block truncate text-sm')}>{a.nom}</span>
                <span className={cn(textMuted, 'block text-xs tabular-nums')}>
                  coût {formatNumber(cost(v))}
                </span>
              </span>
              <button
                type="button"
                className={iconButton}
                disabled={!canDecrease || sending}
                aria-label={`${a.nom} : retirer 1`}
                onClick={() => setValues((m) => ({ ...m, [a.cle]: v - 1 }))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span
                className={cn(text, 'w-8 text-center text-lg font-semibold tabular-nums')}
                aria-live="polite"
              >
                {v}
              </span>
              <button
                type="button"
                className={iconButton}
                disabled={!canIncrease || sending}
                aria-label={`${a.nom} : ajouter 1`}
                onClick={() => setValues((m) => ({ ...m, [a.cle]: v + 1 }))}
              >
                <Plus className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          className={accentButton}
          disabled={sending || (remaining !== undefined && remaining < 0)}
          onClick={submit}
        >
          Valider la répartition
        </button>
      </div>
    </div>
  );
}

// ─── Tirer ───────────────────────────────────────────────────────────────────

/**
 * Tirage fait par le serveur (générateur cryptographique). En attribution
 * libre, les valeurs tirées peuvent ensuite être échangées entre attributs.
 */
export function RollStep({ step }: { step: Step<'tirer'> }) {
  const { sheet, write, setValues } = useSheet();
  const attributes = attributsVises(sheet.entite, step, isBase).filter(isBase);
  const rolled = attributes.every((a) => typeof sheet.etat.valeurs[a.cle] === 'number');
  const rolledValues = attributes.map((a) => baseValue(sheet, a));
  // Attribution libre : indice de la valeur tirée retenue pour chaque attribut
  const [assignment, setAssignment] = useState<number[]>(() => attributes.map((_, i) => i));
  const [sending, setSending] = useState(false);
  const permutation = new Set(assignment).size === attributes.length;
  const changed = assignment.some((x, i) => x !== i);

  async function roll() {
    setSending(true);
    await write(writes.step(step.id, {}));
    setSending(false);
  }

  async function reassign() {
    setSending(true);
    await setValues(
      Object.fromEntries(attributes.map((a, i) => [a.cle, rolledValues[assignment[i]!]!])),
    );
    setSending(false);
  }

  if (!attributes.length) return <SheetEmpty>Aucun attribut à tirer.</SheetEmpty>;

  return (
    <div className="space-y-4">
      <p className={cn(textMuted, 'text-sm')}>
        Formule <code className={text}>{step.formule}</code>
        {step.contrainte && (
          <>
            {' '}
            · contrainte <code className={text}>{step.contrainte}</code>
            {step.relancer ? ' (relancé automatiquement)' : ''}
          </>
        )}
        {' · '}
        {step.essais} essai{step.essais > 1 ? 's' : ''}
        {' · '}
        {step.attribution === 'ordre' ? 'valeurs attribuées dans l’ordre' : 'répartition libre'}
      </p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {attributes.map((a, i) => (
          <li key={a.cle} className={cn(valueBox, 'px-3 py-2 text-center')}>
            <label
              htmlFor={`tirage-${a.cle}`}
              className={cn(textMuted, 'block text-xs uppercase tracking-wide')}
            >
              {a.abrege ?? a.nom}
            </label>
            {rolled && step.attribution === 'libre' ? (
              <select
                id={`tirage-${a.cle}`}
                value={assignment[i]}
                onChange={(e) =>
                  setAssignment((aff) => aff.map((x, j) => (j === i ? Number(e.target.value) : x)))
                }
                className={cn(field, 'mt-1 h-8 text-center')}
              >
                {rolledValues.map((v, j) => (
                  <option key={j} value={j}>
                    {v} (n°{j + 1})
                  </option>
                ))}
              </select>
            ) : (
              <span
                id={`tirage-${a.cle}`}
                className={cn(text, 'block text-2xl font-semibold tabular-nums')}
              >
                {rolled ? formatValue(a, sheet.etat.valeurs[a.cle]) : '—'}
              </span>
            )}
          </li>
        ))}
      </ul>

      {!permutation && (
        <p className="text-xs text-red-300">Chaque valeur tirée ne peut servir qu&apos;une fois.</p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {rolled && step.attribution === 'libre' && changed && (
          <button
            type="button"
            className={secondaryButton}
            disabled={!permutation || sending}
            onClick={reassign}
          >
            Enregistrer la répartition
          </button>
        )}
        <button type="button" className={accentButton} disabled={sending} onClick={roll}>
          <Dices />
          {rolled ? 'Tirer à nouveau' : 'Tirer'}
        </button>
      </div>
    </div>
  );
}

// ─── Saisir ──────────────────────────────────────────────────────────────────

export function InputStep({ step, onNext }: { step: Step<'saisir'>; onNext(): void }) {
  const { system, sheet, json, write } = useSheet();
  const attributes = attributsVises(sheet.entite, step, (a) => a.nature !== 'derivee');
  const [values, setValues] = useState<Record<string, Valeur | ''>>(() =>
    Object.fromEntries(
      attributes.map((a) => {
        const v = sheet.etat.valeurs[a.cle];
        if (v !== undefined) return [a.cle, v];
        switch (a.nature) {
          case 'texte':
            return [a.cle, a.defaut];
          case 'booleen':
            return [a.cle, a.defaut];
          case 'choix':
            return [a.cle, a.defaut ?? ''];
          case 'base':
            return [a.cle, a.defaut];
          default:
            return [a.cle, json.valeurs[a.cle]?.valeur ?? ''];
        }
      }),
    ),
  );
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, Valeur> = {};
    for (const a of attributes) {
      const v = values[a.cle];
      if (v === undefined || (v === '' && a.nature !== 'texte')) continue;
      body[a.cle] = v;
    }
    setSending(true);
    const ok = await write(writes.step(step.id, { valeurs: body }), (st) => {
      const r = saisirEtape(system, st, step.id, body);
      return r.ok ? r.etat : null;
    });
    setSending(false);
    if (ok) onNext();
  }

  if (!attributes.length) return <SheetEmpty>Aucune valeur à saisir.</SheetEmpty>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {attributes.map((a) => {
          const id = `saisie-${a.cle}`;
          const v = values[a.cle];
          const large = a.nature === 'texte' && a.multiligne;
          const update = (x: Valeur | '') => setValues((m) => ({ ...m, [a.cle]: x }));
          return (
            <div key={a.cle} className={cn('space-y-1', large && 'sm:col-span-2')}>
              <label htmlFor={id} className={cn(text, 'block text-sm')}>
                {a.nom}
              </label>
              {a.description && <p className={cn(textMuted, 'text-xs')}>{a.description}</p>}
              {a.nature === 'texte' ? (
                large ? (
                  <textarea
                    id={id}
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => update(e.target.value)}
                    rows={4}
                    className={cn(field, 'h-auto py-2')}
                  />
                ) : (
                  <input
                    id={id}
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => update(e.target.value)}
                    className={field}
                  />
                )
              ) : a.nature === 'choix' ? (
                <select
                  id={id}
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => update(e.target.value)}
                  className={field}
                  required
                >
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {a.options.map((o) => (
                    <option key={o.valeur} value={o.valeur}>
                      {o.nom}
                    </option>
                  ))}
                </select>
              ) : a.nature === 'booleen' ? (
                <input
                  id={id}
                  type="checkbox"
                  checked={v === true}
                  onChange={(e) => update(e.target.checked)}
                  className={cn('h-5 w-5 accent-[color:var(--fiche-accent)]', focus)}
                />
              ) : (
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  value={typeof v === 'number' ? v : ''}
                  onChange={(e) => update(e.target.value === '' ? '' : Number(e.target.value))}
                  className={cn(field, 'w-32')}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button type="submit" className={accentButton} disabled={sending}>
          Valider cette étape
        </button>
      </div>
    </form>
  );
}
