'use client';

/**
 * « Bonus de l'objet » : effets propres à un exemplaire (épée +1, objet
 * enchanté), qui remplacent les bonus saisis de l'ancienne app. Les cibles
 * proposées viennent du système ; chaque ajout est vérifié localement par
 * le moteur (`compilerEffets`, puis un calcul de la fiche) avant l'envoi,
 * et le serveur refait la même vérification.
 */
import type { Effet } from '@vtt/rules';
import { AlertTriangle, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  accentButton,
  field,
  iconButton,
  secondaryButton,
  text,
  textAccent,
  textMuted,
} from '../styles';
import {
  checkItemEffects,
  damageTypes,
  describeEffect,
  diceKinds,
  hasNumericRolls,
  numericAttributes,
  rollEntries,
  type EffectError,
  type Option,
} from './model';
import { Select, useInventory, useSending } from './ui';

type Target = 'attribut' | 'jet' | 'degats';
type AttributeOperation = 'ajouter' | 'multiplier' | 'fixer' | 'minimum' | 'maximum';
type RollChange = 'bonus' | 'de' | 'ameliorer' | 'retrograder' | 'retirer';
type DamageOperation = 'reduire' | 'multiplier' | 'annuler';

interface Draft {
  target: Target;
  attribute: string;
  operation: AttributeOperation;
  rollOn: 'entree' | 'attribut';
  rollEntry: string;
  rollAttribute: string;
  change: RollChange;
  die: string;
  toDie: string;
  defense: boolean;
  damageType: string;
  damageOperation: DamageOperation;
  value: string;
  description: string;
}

const ATTRIBUTE_OPERATIONS: Option[] = [
  { value: 'ajouter', label: 'Ajouter' },
  { value: 'multiplier', label: 'Multiplier par' },
  { value: 'fixer', label: 'Fixer à' },
  { value: 'minimum', label: 'Au moins' },
  { value: 'maximum', label: 'Au plus' },
];

const DAMAGE_OPERATIONS: Option[] = [
  { value: 'reduire', label: 'Réduire de' },
  { value: 'multiplier', label: 'Multiplier par' },
  { value: 'annuler', label: 'Annuler (immunité)' },
];

function buildEffect(d: Draft): Effet {
  const description = d.description.trim() || undefined;
  const value = d.value.trim();
  const common = description ? { description } : {};
  switch (d.target) {
    case 'attribut':
      return {
        ...common,
        sur: 'attribut',
        attribut: d.attribute,
        operation: d.operation,
        valeur: value,
      };
    case 'degats':
      return {
        ...common,
        sur: 'degats',
        ...(d.damageType ? { types: [d.damageType] } : {}),
        operation: d.damageOperation,
        valeur: d.damageOperation === 'annuler' ? '0' : value,
      };
    case 'jet': {
      const implique =
        d.rollOn === 'entree' ? { entree: d.rollEntry } : { attribut: d.rollAttribute };
      const ajout =
        d.change === 'bonus'
          ? { bonus: value }
          : d.change === 'de'
            ? { de: d.die, nombre: value }
            : d.change === 'retirer'
              ? { retirer: d.die, nombre: value }
              : d.change === 'ameliorer'
                ? { ameliorer: d.die, vers: d.toDie, nombre: value }
                : { retrograder: d.die, vers: d.toDie, nombre: value };
      return {
        ...common,
        sur: 'jet',
        cote: d.defense ? 'cible' : 'acteur',
        implique,
        ajout,
      };
    }
  }
}

/** Bonus propres à un exemplaire : liste, retrait, ajout vérifié. */
export function ItemEffects({ entry, equipped }: { entry: string; equipped: boolean }) {
  const { system, state, readOnly, onUpdateItem } = useInventory();
  const effects = useMemo(
    () => state.possessions.find((p) => p.entree === entry)?.effets ?? [],
    [state, entry],
  );
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<EffectError[]>([]);
  const [sending, run] = useSending();

  const save = (next: Effet[]) =>
    run(async () => {
      const found = checkItemEffects(system, state, entry, next);
      setErrors(found);
      if (found.length) return false;
      return onUpdateItem({ entree: entry, effets: next });
    });

  return (
    <section className="space-y-2 rounded-xl border border-[color:var(--fiche-bordure)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={cn(text, 'flex items-center gap-1.5 text-sm font-semibold')}>
          <Sparkles className={cn(textAccent, 'h-4 w-4')} />
          Bonus de l&apos;objet
        </h3>
        {!readOnly && !adding && (
          <button
            type="button"
            className={cn(secondaryButton, 'min-h-8 px-2.5 text-xs')}
            onClick={() => {
              setErrors([]);
              setAdding(true);
            }}
          >
            <Plus />
            Ajouter un bonus
          </button>
        )}
      </div>
      <p className={cn(textMuted, 'text-xs')}>
        Propres à cet exemplaire, en plus des effets du catalogue.{' '}
        {equipped
          ? 'Ils comptent tant que l’objet est équipé.'
          : 'Équipez l’objet pour qu’ils comptent.'}
      </p>

      {effects.length > 0 ? (
        <ul className="divide-y divide-[color:var(--fiche-bordure)]">
          {effects.map((f, i) => {
            const own = errors.filter((e) => e.index === i);
            return (
              <li key={i} className="flex items-start gap-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className={cn(text, 'block text-sm')}>
                    {describeEffect(system, state.type, f)}
                  </span>
                  {f.description && (
                    <span className={cn(textMuted, 'block text-xs')}>{f.description}</span>
                  )}
                  {own.map((e, k) => (
                    <span key={k} className="block text-xs text-red-300">
                      {e.message}
                    </span>
                  ))}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    className={cn(iconButton, 'h-8 w-8')}
                    disabled={sending}
                    aria-label={`Retirer le bonus : ${describeEffect(system, state.type, f)}`}
                    onClick={() => void save(effects.filter((_, k) => k !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !adding && <p className={cn(textMuted, 'text-xs italic')}>Aucun bonus propre.</p>
      )}

      {adding && (
        <EffectForm
          sending={sending}
          errors={errors.filter((e) => e.index === undefined || e.index === effects.length)}
          onCancel={() => {
            setAdding(false);
            setErrors([]);
          }}
          onSubmit={async (f) => {
            const ok = await save([...effects, f]);
            if (ok) setAdding(false);
          }}
        />
      )}
    </section>
  );
}

// ─── Formulaire ──────────────────────────────────────────────────────────────

function EffectForm({
  sending,
  errors,
  onSubmit,
  onCancel,
}: {
  sending: boolean;
  errors: EffectError[];
  onSubmit(f: Effet): Promise<void>;
  onCancel(): void;
}) {
  const { system, state } = useInventory();
  const attributes = useMemo(() => numericAttributes(system, state.type), [system, state.type]);
  const entries = useMemo(() => rollEntries(system, state.type), [system, state.type]);
  const dice = useMemo(() => diceKinds(system), [system]);
  const damages = useMemo(() => damageTypes(system), [system]);
  const numeric = useMemo(() => hasNumericRolls(system), [system]);

  // Cibles et modifications proposées selon ce que le système déclare
  const changes: Option[] = [
    ...(numeric ? [{ value: 'bonus', label: 'Bonus au total' }] : []),
    ...(dice.length
      ? [
          { value: 'de', label: 'Ajouter des dés' },
          { value: 'ameliorer', label: 'Améliorer des dés' },
          { value: 'retrograder', label: 'Rétrograder des dés' },
          { value: 'retirer', label: 'Retirer des dés' },
        ]
      : []),
  ];
  const targets: Option[] = [
    ...(attributes.length ? [{ value: 'attribut', label: 'Un attribut' }] : []),
    ...((entries.length || attributes.length) && changes.length
      ? [{ value: 'jet', label: 'Les jets qui impliquent…' }]
      : []),
    ...(damages.length ? [{ value: 'degats', label: 'Les dégâts subis (résistance)' }] : []),
  ];

  const [d, setD] = useState<Draft>(() => ({
    target: (targets[0]?.value as Target) ?? 'attribut',
    attribute: attributes[0]?.value ?? '',
    operation: 'ajouter',
    rollOn: entries.length ? 'entree' : 'attribut',
    rollEntry: entries[0]?.value ?? '',
    rollAttribute: attributes[0]?.value ?? '',
    change: (changes[0]?.value as RollChange) ?? 'bonus',
    die: dice[0]?.value ?? '',
    toDie: dice[1]?.value ?? dice[0]?.value ?? '',
    defense: false,
    damageType: '',
    damageOperation: 'reduire',
    value: '1',
    description: '',
  }));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  if (!targets.length)
    return <p className={cn(textMuted, 'text-sm')}>Ce système ne déclare rien à cibler.</p>;

  const needsValue = !(d.target === 'degats' && d.damageOperation === 'annuler');
  const usesDice = d.target === 'jet' && d.change !== 'bonus';
  const usesTwoDice = usesDice && (d.change === 'ameliorer' || d.change === 'retrograder');
  const valueLabel = usesDice ? 'Nombre de dés' : 'Valeur';
  const incomplete =
    (needsValue && !d.value.trim()) ||
    (d.target === 'attribut' && !d.attribute) ||
    (d.target === 'jet' &&
      (!changes.length ||
        (d.rollOn === 'entree' ? !d.rollEntry : !d.rollAttribute) ||
        (usesDice && !d.die)));

  return (
    <form
      className="space-y-3 rounded-lg bg-[color:var(--fiche-canevas)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!incomplete) void onSubmit(buildEffect(d));
      }}
    >
      <Labeled label="Cible">
        <Select
          value={d.target}
          options={targets}
          onChange={(e) => set('target', e.target.value as Target)}
        />
      </Labeled>

      {d.target === 'attribut' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="Attribut">
            <Select
              value={d.attribute}
              options={attributes}
              onChange={(e) => set('attribute', e.target.value)}
            />
          </Labeled>
          <Labeled label="Opération">
            <Select
              value={d.operation}
              options={ATTRIBUTE_OPERATIONS}
              onChange={(e) => set('operation', e.target.value as AttributeOperation)}
            />
          </Labeled>
        </div>
      )}

      {d.target === 'jet' && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labeled label="Jets qui impliquent">
              <Select
                value={d.rollOn}
                options={[
                  ...(entries.length ? [{ value: 'entree', label: 'Une entrée' }] : []),
                  ...(attributes.length ? [{ value: 'attribut', label: 'Un attribut' }] : []),
                ]}
                onChange={(e) => set('rollOn', e.target.value as Draft['rollOn'])}
              />
            </Labeled>
            {d.rollOn === 'entree' ? (
              <Labeled label="Entrée">
                <Select
                  value={d.rollEntry}
                  options={entries}
                  onChange={(e) => set('rollEntry', e.target.value)}
                />
              </Labeled>
            ) : (
              <Labeled label="Attribut">
                <Select
                  value={d.rollAttribute}
                  options={attributes}
                  onChange={(e) => set('rollAttribute', e.target.value)}
                />
              </Labeled>
            )}
          </div>
          {changes.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Labeled label="Modification">
                <Select
                  value={d.change}
                  options={changes}
                  onChange={(e) => set('change', e.target.value as RollChange)}
                />
              </Labeled>
              {usesDice && (
                <Labeled label={usesTwoDice ? 'Dé de départ' : 'Dé'}>
                  <Select
                    value={d.die}
                    options={dice}
                    onChange={(e) => set('die', e.target.value)}
                  />
                </Labeled>
              )}
              {usesTwoDice && (
                <Labeled label="Devient">
                  <Select
                    value={d.toDie}
                    options={dice}
                    onChange={(e) => set('toDie', e.target.value)}
                  />
                </Labeled>
              )}
            </div>
          ) : (
            <p className={cn(textMuted, 'text-xs')}>Aucune modification de jet possible ici.</p>
          )}
          <label className={cn(text, 'flex items-center gap-2 text-sm')}>
            <input
              type="checkbox"
              checked={d.defense}
              onChange={(e) => set('defense', e.target.checked)}
              className="h-4 w-4 accent-[color:var(--fiche-accent)]"
            />
            Quand le porteur est la cible du jet (défense)
          </label>
        </>
      )}

      {d.target === 'degats' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labeled label="Type de dégâts">
            <Select
              value={d.damageType}
              options={[{ value: '', label: 'Tous les types' }, ...damages]}
              onChange={(e) => set('damageType', e.target.value)}
            />
          </Labeled>
          <Labeled label="Opération">
            <Select
              value={d.damageOperation}
              options={DAMAGE_OPERATIONS}
              onChange={(e) => set('damageOperation', e.target.value as DamageOperation)}
            />
          </Labeled>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        {needsValue && (
          <Labeled label={valueLabel} hint="Nombre ou formule (@attribut, rang…)">
            <input
              type="text"
              inputMode="decimal"
              value={d.value}
              onChange={(e) => set('value', e.target.value)}
              className={cn(field, 'font-mono tabular-nums')}
            />
          </Labeled>
        )}
        <Labeled label="Description (facultative)">
          <input
            type="text"
            value={d.description}
            maxLength={500}
            placeholder="Affichée dans le détail des calculs"
            onChange={(e) => set('description', e.target.value)}
            className={field}
          />
        </Labeled>
      </div>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="space-y-1 rounded-lg border border-red-400/40 bg-red-500/10 p-2 text-xs text-red-200"
        >
          {errors.map((e, i) => (
            <li key={i} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {e.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={sending}>
          Annuler
        </button>
        <button type="submit" className={accentButton} disabled={sending || incomplete}>
          <Plus />
          Ajouter
        </button>
      </div>
    </form>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className={cn(textMuted, 'block text-xs')}>{label}</span>
      {children}
      {hint && <span className={cn(textMuted, 'block text-[11px] opacity-80')}>{hint}</span>}
    </label>
  );
}
