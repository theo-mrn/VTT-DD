'use client';

/**
 * Étapes qui fixent des valeurs d'attributs : répartir (points à dépenser),
 * tirer (jet fait par le serveur) et saisir (formulaire). Les attributs visés,
 * formules, budgets et bornes viennent de l'étape déclarée par le système.
 */
import {
  attributsVises,
  chemins,
  essayer,
  repartirEtape,
  saisirEtape,
  variables,
  type Attribut,
  type EtapeCreation,
  type EtatEtape,
  type Fiche,
  type Valeur,
} from '@vtt/rules';
import { Dices, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { writes } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { useSheet } from '../sheet/context';
import { SheetEmpty } from '../sheet/elements';
import { formatNumber } from '../sheet/format';
import { accentButton, field, focus, text, textAccent, textMuted } from '../sheet/styles';
import { cardButton, statGrid, StatCard } from './stat-card';
import { panel, StepFooter, type TabNav } from './ui';

type Step<T extends EtapeCreation['type']> = Extract<EtapeCreation, { type: T }>;
type Base = Extract<Attribut, { nature: 'base' }>;
const isBase = (a: Attribut): a is Base => a.nature === 'base';

/** Évalue une formule d'étape (budget, coût, bornes) ; undefined si absente ou en erreur. */
function stepFormula(
  sheet: Fiche,
  step: string,
  name: string,
  vars?: Record<string, Valeur>,
): number | undefined {
  const f = sheet.systeme.formules.get(chemins.etape(sheet.etat.type, step, name));
  if (!f) return undefined;
  const r = essayer(sheet, f, vars ? { variable: variables(vars) } : {});
  return r.ok ? Number(r.valeur) : undefined;
}

const baseValue = (sheet: Fiche, a: Base) => {
  const v = sheet.etat.valeurs[a.cle];
  return typeof v === 'number' ? v : a.defaut;
};

/** Badge de budget (« 12 / 20 points »). */
function Budget({ remaining, total, unit }: { remaining: number; total: number; unit: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold tabular-nums',
        remaining < 0
          ? 'border-red-500/40 bg-red-500/10 text-red-300'
          : 'border-[color:color-mix(in_srgb,var(--fiche-accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_10%,transparent)] text-[color:var(--fiche-accent)]',
      )}
    >
      {formatNumber(remaining)} / {formatNumber(total)} {unit}
    </span>
  );
}

// ─── Répartir ────────────────────────────────────────────────────────────────

export function DistributeStep({
  step,
  review,
  nav,
}: {
  step: Step<'repartir'>;
  review: EtatEtape;
  nav: TabNav;
}) {
  const { system, sheet, write, pending } = useSheet();
  const attributes = attributsVises(sheet.entite, step, isBase).filter(isBase);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(attributes.map((a) => [a.cle, baseValue(sheet, a)])),
  );
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);

  const budget = stepFormula(sheet, step.id, 'budget') ?? review.budget;
  const min = stepFormula(sheet, step.id, 'min');
  const max = stepFormula(sheet, step.id, 'max');
  const cost = (v: number) => stepFormula(sheet, step.id, 'cout', { valeur: v }) ?? 0;
  const spent = attributes.reduce((s, a) => s + cost(values[a.cle] ?? 0), 0);
  const remaining = budget !== undefined ? budget - spent : undefined;

  const set = (key: string, v: number) => {
    setValues((m) => ({ ...m, [key]: v }));
    setDirty(true);
  };

  async function next() {
    if (dirty) {
      setSending(true);
      const ok = await write(writes.step(step.id, { valeurs: values }), (e) => {
        const r = repartirEtape(system, e, step.id, values);
        return r.ok ? r.etat : null;
      });
      setSending(false);
      if (!ok) return;
      setDirty(false);
    }
    nav.onNext();
  }

  if (!attributes.length) return <SheetEmpty>Aucun attribut à répartir.</SheetEmpty>;

  return (
    <div className={cn(panel, 'space-y-6 p-5 sm:p-6')}>
      {remaining !== undefined && budget !== undefined && (
        <div className="flex justify-end">
          <Budget remaining={remaining} total={budget} unit="points" />
        </div>
      )}
      <div className={statGrid}>
        {attributes.map((a) => {
          const v = values[a.cle] ?? 0;
          const extra = cost(v + 1) - cost(v);
          const canUp =
            (max === undefined || v + 1 <= max) && (remaining === undefined || extra <= remaining);
          const canDown = min === undefined || v - 1 >= min;
          return (
            <StatCard
              key={a.cle}
              attribute={a}
              base={v}
              footer={
                <>
                  <button
                    type="button"
                    className={cardButton}
                    disabled={!canDown || sending}
                    aria-label={`${a.nom} : retirer 1`}
                    onClick={() => set(a.cle, v - 1)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span
                    className={cn(
                      'font-mono text-[10px] uppercase tracking-wide',
                      canUp ? textAccent : textMuted,
                    )}
                  >
                    {max !== undefined && v >= max
                      ? `Max (${formatNumber(max)})`
                      : `+1 → ${formatNumber(extra)} pt${extra > 1 ? 's' : ''}`}
                  </span>
                  <button
                    type="button"
                    className={cardButton}
                    disabled={!canUp || sending}
                    aria-label={`${a.nom} : ajouter 1`}
                    onClick={() => set(a.cle, v + 1)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </>
              }
            />
          );
        })}
      </div>
      <StepFooter
        className="border-t border-[color:var(--fiche-bordure)] pt-6"
        onPrev={nav.onPrev}
        onNext={next}
        busy={sending}
        nextDisabled={pending > 0 || (remaining !== undefined && remaining < 0)}
        nextLabel={dirty ? 'Valider et continuer' : 'Suivant'}
      />
    </div>
  );
}

// ─── Tirer ───────────────────────────────────────────────────────────────────

/**
 * Tirage fait par le serveur (générateur cryptographique). En attribution
 * libre, les valeurs tirées peuvent ensuite être échangées entre attributs.
 */
export function RollStep({ step, nav }: { step: Step<'tirer'>; nav: TabNav }) {
  const { sheet, write, setValues, pending } = useSheet();
  const attributes = attributsVises(sheet.entite, step, isBase).filter(isBase);
  const rolled = attributes.every((a) => typeof sheet.etat.valeurs[a.cle] === 'number');
  const rolledValues = attributes.map((a) => baseValue(sheet, a));
  const free = step.attribution === 'libre' && attributes.length > 1;
  // Attribution libre : indice de la valeur tirée retenue pour chaque attribut
  const [assignment, setAssignment] = useState<number[]>(() => attributes.map((_, i) => i));
  const [sending, setSending] = useState(false);
  const permutation = new Set(assignment).size === attributes.length;
  const changed = assignment.some((x, i) => x !== i);

  async function roll() {
    setSending(true);
    const ok = await write(writes.step(step.id, {}));
    if (ok) setAssignment(attributes.map((_, i) => i));
    setSending(false);
  }

  async function next() {
    if (free && rolled && changed) {
      if (!permutation) return;
      setSending(true);
      const ok = await setValues(
        Object.fromEntries(attributes.map((a, i) => [a.cle, rolledValues[assignment[i]!]!])),
      );
      setSending(false);
      if (!ok) return;
      setAssignment(attributes.map((_, i) => i));
    }
    nav.onNext();
  }

  if (!attributes.length) return <SheetEmpty>Aucun attribut à tirer.</SheetEmpty>;

  return (
    <div className={cn(panel, 'space-y-6 p-5 sm:p-6')}>
      <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] p-5 md:flex-row md:items-center md:justify-between">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className={textMuted}>Formule</dt>
          <dd>
            <code className={text}>{step.formule}</code>
          </dd>
          {step.contrainte && (
            <>
              <dt className={textMuted}>Contrainte</dt>
              <dd>
                <code className={text}>{step.contrainte}</code>
                {step.relancer && <span className={textMuted}> (relancé automatiquement)</span>}
              </dd>
            </>
          )}
          <dt className={textMuted}>Attribution</dt>
          <dd className={text}>
            {step.attribution === 'ordre' ? 'dans l’ordre' : 'libre, à répartir'}
          </dd>
        </dl>
        <button
          type="button"
          className={cn(accentButton, 'px-5 py-2.5 text-base shadow-lg')}
          disabled={sending || pending > 0}
          onClick={roll}
        >
          <Dices />
          {rolled ? 'Relancer les dés' : 'Lancer les dés'}
        </button>
      </div>

      <div className={statGrid}>
        {attributes.map((a, i) => (
          <StatCard
            key={a.cle}
            attribute={a}
            base={rolled && free ? rolledValues[assignment[i]!] : undefined}
            footer={
              rolled && free ? (
                <label className="flex w-full items-center gap-2 text-xs">
                  <span className={textMuted}>Valeur</span>
                  <select
                    value={assignment[i]}
                    onChange={(e) =>
                      setAssignment((aff) =>
                        aff.map((x, j) => (j === i ? Number(e.target.value) : x)),
                      )
                    }
                    className={cn(field, 'h-8 flex-1 text-center')}
                    aria-label={`Valeur tirée pour ${a.nom}`}
                  >
                    {rolledValues.map((v, j) => (
                      <option key={j} value={j}>
                        {v} (n°{j + 1})
                      </option>
                    ))}
                  </select>
                </label>
              ) : !rolled ? (
                <span className={cn(textMuted, 'w-full text-center text-xs')}>À tirer</span>
              ) : undefined
            }
          />
        ))}
      </div>

      {!permutation && (
        <p className="text-xs text-red-300">Chaque valeur tirée ne peut servir qu’une fois.</p>
      )}
      <StepFooter
        className="border-t border-[color:var(--fiche-bordure)] pt-6"
        onPrev={nav.onPrev}
        onNext={next}
        busy={sending}
        nextDisabled={pending > 0 || !permutation}
        nextLabel={free && rolled && changed ? 'Enregistrer et continuer' : 'Suivant'}
        hint={rolled ? undefined : 'Lancez les dés pour fixer ces valeurs.'}
      />
    </div>
  );
}

// ─── Saisir ──────────────────────────────────────────────────────────────────

export function InputStep({ step, nav }: { step: Step<'saisir'>; nav: TabNav }) {
  const { system, sheet, json, write, pending } = useSheet();
  const attributes = attributsVises(sheet.entite, step, (a) => a.nature !== 'derivee');
  const [values, setValues] = useState<Record<string, Valeur | ''>>(() =>
    Object.fromEntries(
      attributes.map((a) => {
        const v = sheet.etat.valeurs[a.cle];
        if (v !== undefined) return [a.cle, v];
        switch (a.nature) {
          case 'texte':
          case 'booleen':
          case 'base':
            return [a.cle, a.defaut];
          case 'choix':
            return [a.cle, a.defaut ?? ''];
          default:
            return [a.cle, json.valeurs[a.cle]?.valeur ?? ''];
        }
      }),
    ),
  );
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);
  // Une valeur jamais enregistrée compte comme à envoyer, même laissée par défaut
  const missing = attributes.some((a) => sheet.etat.valeurs[a.cle] === undefined);

  async function next() {
    if (dirty || missing) {
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
      if (!ok) return;
      setDirty(false);
    }
    nav.onNext();
  }

  if (!attributes.length) return <SheetEmpty>Aucune valeur à saisir.</SheetEmpty>;

  const update = (key: string, x: Valeur | '') => {
    setValues((m) => ({ ...m, [key]: x }));
    setDirty(true);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void next();
      }}
      className={cn(panel, 'mx-auto max-w-4xl space-y-6 p-5 sm:p-8')}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {attributes.map((a) => {
          const id = `saisie-${a.cle}`;
          const v = values[a.cle];
          const large = a.nature === 'texte' && a.multiligne;
          return (
            <div key={a.cle} className={cn('space-y-2', large && 'sm:col-span-2')}>
              <label
                htmlFor={id}
                className={cn(textMuted, 'block text-xs uppercase tracking-wider')}
              >
                {a.nom}
              </label>
              {a.nature === 'texte' ? (
                large ? (
                  <textarea
                    id={id}
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => update(a.cle, e.target.value)}
                    rows={6}
                    className={cn(field, 'h-auto min-h-[140px] resize-y py-2')}
                  />
                ) : (
                  <input
                    id={id}
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => update(a.cle, e.target.value)}
                    className={field}
                  />
                )
              ) : a.nature === 'choix' ? (
                <select
                  id={id}
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => update(a.cle, e.target.value)}
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
                  onChange={(e) => update(a.cle, e.target.checked)}
                  className={cn('h-5 w-5 accent-[color:var(--fiche-accent)]', focus)}
                />
              ) : (
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  value={typeof v === 'number' ? v : ''}
                  onChange={(e) =>
                    update(a.cle, e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className={cn(field, 'w-40')}
                />
              )}
              {a.description && <p className={cn(textMuted, 'text-xs')}>{a.description}</p>}
            </div>
          );
        })}
      </div>
      <StepFooter
        className="border-t border-[color:var(--fiche-bordure)] pt-6"
        onPrev={nav.onPrev}
        onNext={() => void next()}
        busy={sending}
        nextDisabled={pending > 0}
        nextLabel={dirty || missing ? 'Valider et continuer' : 'Suivant'}
      />
    </form>
  );
}
