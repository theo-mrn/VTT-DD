'use client';

/**
 * Ajout d'un bonus libre (potion, bénédiction, décision du MJ). La cible se
 * choisit dans des listes tirées du système : un attribut numérique, une
 * entrée à rangs, ou les jets qui impliquent une entrée ou un attribut (bonus
 * au total ou dé ajouté, selon les jets du système). L'effet est vérifié
 * localement par le moteur avant l'envoi ; le service le revérifie.
 */
import { compilerEffets, type Effet } from '@vtt/rules';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  attributeGroups,
  describeEffect,
  namesFor,
  OPERATIONS,
  rankedEntryGroups,
  rollAttributeGroups,
  rollEntryGroups,
  rollModes,
  type AttributeOperation,
  type OptionGroup,
  type RollMode,
} from './bonus-effects';
import { useSheet } from './context';
import { SheetDialog } from './elements';
import { accentButton, secondaryButton, field, focus, panel, text, textMuted } from './styles';

type TargetKind = 'attribut' | 'rang' | 'jet';

const KINDS: { id: TargetKind; label: string; hint: string }[] = [
  { id: 'attribut', label: 'Attribut', hint: 'Modifie une valeur de la fiche.' },
  { id: 'rang', label: 'Rangs', hint: 'Donne des rangs dans une entrée.' },
  { id: 'jet', label: 'Jets', hint: 'Modifie les jets qui impliquent une entrée ou un attribut.' },
];

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className={cn(textMuted, 'block text-xs font-bold uppercase tracking-wider')}
      >
        {label}
      </label>
      {children}
      {hint && <p className={cn(textMuted, 'text-[11px]')}>{hint}</p>}
    </div>
  );
}

function GroupedSelect<T>({
  id,
  value,
  onChange,
  groups,
  optionValue,
  optionLabel,
  empty,
}: {
  id: string;
  value: string;
  onChange(v: string): void;
  groups: OptionGroup<T>[];
  optionValue(o: T): string;
  optionLabel(o: T): string;
  empty?: string;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      {empty !== undefined && <option value="">{empty}</option>}
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={optionValue(o)} value={optionValue(o)}>
              {optionLabel(o)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function BonusForm({ onClose }: { onClose(): void }) {
  const { system, state, addBonus } = useSheet();
  const type = state.type;
  const names = useMemo(() => namesFor(system, type), [system, type]);
  const attributes = useMemo(() => attributeGroups(system, type), [system, type]);
  const ranked = useMemo(() => rankedEntryGroups(system, type), [system, type]);
  const rollEntries = useMemo(() => rollEntryGroups(system, type), [system, type]);
  const rollAttributes = useMemo(() => rollAttributeGroups(system, type), [system, type]);
  const modes = useMemo(() => rollModes(system, type), [system, type]);
  const dice = system.source.des?.sortes ?? [];
  const actions = [...system.actions.values()].filter((a) => a.pour.includes(type));
  const kinds = KINDS.filter(
    (k) =>
      (k.id === 'attribut' && attributes.length) ||
      (k.id === 'rang' && ranked.length) ||
      (k.id === 'jet' && (rollEntries.length || rollAttributes.length || actions.length)),
  );

  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [duration, setDuration] = useState('');
  const [kind, setKind] = useState<TargetKind>(kinds[0]?.id ?? 'attribut');
  const [attribute, setAttribute] = useState(attributes[0]?.options[0]?.cle ?? '');
  const [operation, setOperation] = useState<AttributeOperation>('ajouter');
  const [entry, setEntry] = useState(ranked[0]?.options[0]?.id ?? '');
  const [rollTarget, setRollTarget] = useState('');
  const [action, setAction] = useState('');
  const [mode, setMode] = useState<RollMode>(modes[0]!);
  const [die, setDie] = useState(dice[0]?.id ?? '');
  const [value, setValue] = useState('1');
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const effect = ((): Effet | null => {
    const v = value.trim() || '0';
    if (kind === 'attribut')
      return attribute ? { sur: 'attribut', attribut: attribute, operation, valeur: v } : null;
    if (kind === 'rang') return entry ? { sur: 'rang', entree: entry, valeur: v } : null;
    const [targetKind, targetId] = rollTarget.split(':');
    const implique =
      targetKind === 'entree'
        ? { entree: targetId! }
        : targetKind === 'attribut'
          ? { attribut: targetId! }
          : undefined;
    if (mode === 'de' && !die) return null;
    return {
      sur: 'jet',
      cote: 'acteur',
      ...(implique ? { implique } : {}),
      ...(action ? { actions: [action] } : {}),
      ajout: mode === 'de' ? { de: die, nombre: v } : { bonus: v },
    };
  })();

  const durationValue = duration.trim() === '' ? undefined : Number(duration);
  const durationInvalid =
    durationValue !== undefined && (!Number.isInteger(durationValue) || durationValue < 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!effect || !name.trim() || durationInvalid) return;
    // Même vérification que le service : cible existante, formule bien typée
    const check = compilerEffets(system, type, [effect], (i, x) => `bonus/effets/${i}/${x}`, {
      rang: 'nombre',
      actif: 'booleen',
    });
    if (check.erreurs.length) {
      setErrors(check.erreurs.map((x) => x.message));
      return;
    }
    setErrors([]);
    setSending(true);
    const ok = await addBonus({
      nom: name.trim(),
      ...(source.trim() ? { source: source.trim() } : {}),
      effets: [effect],
      actif: true,
      ...(durationValue !== undefined ? { duree: durationValue } : {}),
    });
    setSending(false);
    if (ok) onClose();
  }

  const valueLabel =
    kind === 'attribut'
      ? operation === 'multiplier'
        ? 'Facteur'
        : 'Valeur'
      : kind === 'rang'
        ? 'Rangs'
        : mode === 'de'
          ? 'Nombre de dés'
          : 'Bonus au total';

  return (
    <SheetDialog
      open
      onClose={onClose}
      title="Nouveau bonus"
      description="Un bonus libre s'ajoute à la fiche comme un effet du catalogue : potion, bénédiction, décision du MJ…"
    >
      <form onSubmit={submit} className={cn(text, 'space-y-4')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="bonus-nom" label="Nom">
            <input
              id="bonus-nom"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Potion de force"
              className={field}
              autoFocus
            />
          </Field>
          <Field id="bonus-source" label="Provenance (facultatif)">
            <input
              id="bonus-source"
              maxLength={200}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="MJ, objet, sort…"
              className={field}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className={cn(textMuted, 'mb-1 text-xs font-bold uppercase tracking-wider')}>
            Cible
          </legend>
          <div className="flex gap-1" role="radiogroup">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                title={k.hint}
                className={cn(
                  'flex-1 rounded border py-1.5 text-[11px] font-bold uppercase transition-all',
                  kind === k.id
                    ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)] text-zinc-950'
                    : 'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] text-[color:var(--fiche-texte-secondaire)] hover:border-[color:var(--fiche-texte-secondaire)]',
                  focus,
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          {kind === 'attribut' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="bonus-attribut" label="Attribut">
                <GroupedSelect
                  id="bonus-attribut"
                  value={attribute}
                  onChange={setAttribute}
                  groups={attributes}
                  optionValue={(a) => a.cle}
                  optionLabel={(a) => a.nom}
                />
              </Field>
              <Field id="bonus-operation" label="Opération">
                <select
                  id="bonus-operation"
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as AttributeOperation)}
                  className={field}
                >
                  {OPERATIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {kind === 'rang' && (
            <Field id="bonus-entree" label="Entrée">
              <GroupedSelect
                id="bonus-entree"
                value={entry}
                onChange={setEntry}
                groups={ranked}
                optionValue={(e) => e.id}
                optionLabel={(e) => e.nom}
              />
            </Field>
          )}

          {kind === 'jet' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="bonus-implique" label="Jets impliquant">
                <select
                  id="bonus-implique"
                  value={rollTarget}
                  onChange={(e) => setRollTarget(e.target.value)}
                  className={field}
                >
                  <option value="">Tous les jets</option>
                  {rollAttributes.map((g) => (
                    <optgroup key={`a-${g.label}`} label={g.label}>
                      {g.options.map((a) => (
                        <option key={a.cle} value={`attribut:${a.cle}`}>
                          {a.nom}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {rollEntries.map((g) => (
                    <optgroup key={`e-${g.label}`} label={g.label}>
                      {g.options.map((e) => (
                        <option key={e.id} value={`entree:${e.id}`}>
                          {e.nom}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              {actions.length > 1 && (
                <Field id="bonus-action" label="Action">
                  <select
                    id="bonus-action"
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className={field}
                  >
                    <option value="">Toutes les actions</option>
                    {actions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nom}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {modes.length > 1 && (
                <Field id="bonus-mode" label="Effet sur le jet">
                  <select
                    id="bonus-mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as RollMode)}
                    className={field}
                  >
                    <option value="bonus">Bonus au total</option>
                    <option value="de">Dé ajouté</option>
                  </select>
                </Field>
              )}
              {mode === 'de' && (
                <Field id="bonus-de" label="Dé">
                  <select
                    id="bonus-de"
                    value={die}
                    onChange={(e) => setDie(e.target.value)}
                    className={field}
                  >
                    {dice.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="bonus-valeur" label={valueLabel} hint="Un nombre ou une formule du système.">
            <input
              id="bonus-valeur"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={cn(field, 'font-mono')}
            />
          </Field>
          <Field id="bonus-duree" label="Durée en rounds (facultatif)" hint="Vide : permanent.">
            <input
              id="bonus-duree"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={field}
              aria-invalid={durationInvalid}
            />
          </Field>
        </div>

        {effect && (
          <p className={cn(panel, 'bg-[color:var(--fiche-canevas)] px-3 py-2 font-mono text-xs')}>
            <span className={textMuted}>Aperçu : </span>
            {describeEffect(effect, names)}
          </p>
        )}
        {errors.length > 0 && (
          <ul
            role="alert"
            className="space-y-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            {errors.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose} disabled={sending}>
            Annuler
          </button>
          <button
            type="submit"
            className={accentButton}
            disabled={sending || !effect || !name.trim() || durationInvalid}
          >
            Ajouter le bonus
          </button>
        </div>
      </form>
    </SheetDialog>
  );
}
