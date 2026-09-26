'use client';

/**
 * Fiche d'un exemplaire possédé : caractéristiques, équipement, quantité,
 * bonus propres à cet exemplaire, annulation d'achat et retrait.
 */
import { estExemplaire, quantiteDe, type Champ, type Sorte } from '@vtt/rules';
import { AlertTriangle, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatNumber, tagName } from '../format';
import {
  accentButton,
  chip,
  field as fieldStyle,
  secondaryButton,
  text,
  textAccent,
  textMuted,
} from '../styles';
import { copyActive, copyName, copyTarget, lastCopy } from '../possessions';
import { ItemEffects } from './effect-editor';
import { EquipToggle, QuantityStepper } from './item-card';
import { describeEffect, fieldValue, itemErrors, readableField } from './model';
import { InventoryDialog, useInventory, useSending } from './ui';

type Editable = number | string | boolean;

/** Champs propres à chaque exemplaire, modifiables sur la fiche (munitions, détail…). */
const isEditable = (c: Champ) => c.type === 'nombre' || c.type === 'texte' || c.type === 'booleen';

/** Index de la dernière ligne du journal qui porte sur cet objet (la seule annulable). */
function lastLine(journal: { objet: string }[], item: string): number {
  for (let i = journal.length - 1; i >= 0; i--) if (journal[i]!.objet === item) return i;
  return -1;
}

export function ItemDialog({
  entry: id,
  copy,
  kind,
  onClose,
}: {
  entry: string;
  /** Identifiant de l'exemplaire (absent : l'exemplaire sans identifiant, ou obtenu par effet). */
  copy?: string;
  kind: Sorte;
  onClose(): void;
}) {
  const { system, sheet, state, readOnly, onUpdateItem, onRemoveItem, onRefund } = useInventory();
  const [edits, setEdits] = useState<Record<string, Editable>>({});
  const [sending, run] = useSending();
  const entry = system.entrees.get(id);
  const p = sheet.possessions.get(id);
  const own = state.possessions.find((x) => estExemplaire(x, id, copy));
  // Exemplaire retiré entre-temps (sans possession explicite, seul un objet obtenu par effet s'affiche)
  if (!entry || !p || (!own && p.exemplaires.length)) return null;

  const explicit = !!own;
  const target = copyTarget(id, copy);
  const line = onRefund ? lastLine(state.journal, id) : -1;
  // Seul le dernier exemplaire est rendu par l'annulation ; un achat fait
  // pendant la création ne s'annule plus une fois celle-ci terminée
  const refundLine =
    line >= 0 &&
    !!own &&
    lastCopy(state, id) === own &&
    (state.creation || !state.journal[line]!.creation)
      ? state.journal[line]
      : undefined;
  const marks = [...(sheet.marques.get(id) ?? [])];
  const errors = itemErrors(sheet, id, own);
  const canEdit = !readOnly && explicit;
  const active = copyActive(p, own);
  const quantity = own ? quantiteDe(own) : 1;

  return (
    <InventoryDialog
      open
      onClose={onClose}
      title={copyName(p, own)}
      description={kind.nom}
      size="lg"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <EquipToggle entry={id} copy={copy} name={entry.nom} active={active} explicit={explicit} />
        {kind.quantites && (
          <span className="ml-auto flex items-center gap-2">
            <span className={cn(textMuted, 'text-xs')}>Quantité</span>
            {canEdit && own ? (
              <QuantityStepper possession={own} name={entry.nom} />
            ) : (
              <span className={cn(textAccent, 'font-mono text-sm font-bold tabular-nums')}>
                ×{quantity}
              </span>
            )}
          </span>
        )}
        {marks.map((m) => (
          <span key={m} className={cn(chip, textAccent)}>
            {tagName(m)}
          </span>
        ))}
        {entry.etiquettes.map((e) => (
          <span key={e} className={chip}>
            {tagName(e)}
          </span>
        ))}
      </div>

      {entry.description && (
        <p className={cn(text, 'whitespace-pre-line text-sm leading-relaxed')}>
          {entry.description}
        </p>
      )}

      {kind.champs.length > 0 && (
        <section className="space-y-2">
          <h3 className={cn(textMuted, 'text-xs uppercase tracking-wide')}>Caractéristiques</h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {kind.champs.map((c) => {
              const v = fieldValue(entry, c, own);
              const editable = canEdit && isEditable(c);
              const mine = own?.champs[c.id];
              return (
                <div key={c.id} className="min-w-0">
                  <dt className={cn(textMuted, 'text-xs')}>
                    {editable ? <label htmlFor={`item-field-${c.id}`}>{c.nom}</label> : c.nom}
                    {mine !== undefined && mine !== entry.champs[c.id] && (
                      <span
                        className={cn(textAccent, 'ml-1')}
                        title="Valeur propre à cet exemplaire"
                      >
                        •
                      </span>
                    )}
                  </dt>
                  <dd className={cn(text, 'text-sm')}>
                    {editable ? (
                      <EditableField
                        id={`item-field-${c.id}`}
                        field={c}
                        value={(edits[c.id] ?? v) as Editable | undefined}
                        onChange={(x) => setEdits((m) => ({ ...m, [c.id]: x }))}
                      />
                    ) : (
                      readableField(system, state.type, c, v)
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          {Object.keys(edits).length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                className={accentButton}
                disabled={sending}
                onClick={() =>
                  run(async () => {
                    const ok = await onUpdateItem({ ...target, champs: edits });
                    if (ok) setEdits({});
                    return ok;
                  })
                }
              >
                Enregistrer les valeurs
              </button>
              <button
                type="button"
                className={secondaryButton}
                disabled={sending}
                onClick={() => setEdits({})}
              >
                Annuler
              </button>
            </div>
          )}
        </section>
      )}

      {entry.effets.length > 0 && (
        <section className="space-y-1">
          <h3 className={cn(textMuted, 'text-xs uppercase tracking-wide')}>
            Effets de {kind.nom.toLowerCase()}
          </h3>
          <ul className={cn(text, 'list-inside list-disc space-y-0.5 text-sm')}>
            {entry.effets.map((f, i) => (
              <li key={i}>{f.description ?? describeEffect(system, state.type, f)}</li>
            ))}
          </ul>
        </section>
      )}

      {explicit && <ItemEffects entry={id} copy={copy} equipped={active} />}

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-xs text-amber-200">
          {errors.map((m, i) => (
            <li key={i} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {m}
            </li>
          ))}
        </ul>
      )}

      {!explicit && p.sources.length > 0 && (
        <p className={cn(textMuted, 'text-xs')}>
          Obtenu par : {p.sources.map((s) => system.entrees.get(s)?.nom ?? s).join(', ')}
        </p>
      )}

      {!readOnly && (refundLine || explicit) && (
        <div className="flex flex-wrap gap-2 border-t border-[color:var(--fiche-bordure)] pt-4">
          {refundLine && (
            <button
              type="button"
              className={secondaryButton}
              disabled={sending}
              onClick={() =>
                run(async () => {
                  const ok = await onRefund!(line);
                  if (ok) onClose();
                  return ok;
                })
              }
            >
              <Undo2 />
              Annuler l&apos;achat (rend {formatNumber(refundLine.cout)}{' '}
              {system.monnaies.get(refundLine.monnaie)?.nom ?? refundLine.monnaie})
            </button>
          )}
          {explicit && (
            <button
              type="button"
              className={cn(secondaryButton, 'text-red-400 hover:border-red-400')}
              disabled={sending}
              onClick={() =>
                run(async () => {
                  const ok = await onRemoveItem(id, copy);
                  if (ok) onClose();
                  return ok;
                })
              }
            >
              <Trash2 />
              {kind.quantites && quantity > 1
                ? `Retirer les ${quantity} unités`
                : p.exemplaires.length > 1
                  ? 'Retirer cet exemplaire'
                  : 'Retirer de l’inventaire'}
            </button>
          )}
        </div>
      )}
    </InventoryDialog>
  );
}

function EditableField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: Champ;
  value: Editable | undefined;
  onChange(v: Editable): void;
}) {
  if (field.type === 'booleen')
    return (
      <input
        id={id}
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[color:var(--fiche-accent)]"
      />
    );
  if (field.type === 'nombre')
    return (
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={typeof value === 'number' ? value : ''}
        onChange={(e) =>
          e.target.value !== '' &&
          Number.isFinite(Number(e.target.value)) &&
          onChange(Number(e.target.value))
        }
        className={cn(fieldStyle, 'w-28 tabular-nums')}
      />
    );
  return (
    <input
      id={id}
      type="text"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className={fieldStyle}
    />
  );
}
