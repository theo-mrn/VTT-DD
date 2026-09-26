'use client';

import { estExemplaire, type Champ, type Sorte } from '@vtt/rules';
import { Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { ChoiceEditor, hasChoices, type Choice } from './choice-editor';
import { SheetDialog } from './elements';
import { tagName, itemName } from './format';
import {
  copyName,
  copyTarget,
  fieldValue,
  freeKind,
  lastCopy,
  lastLine,
  nextRankPurchase,
  readableField,
} from './possessions';
import { PurchaseButton } from './purchase-button';
import {
  accentButton,
  secondaryButton,
  field as styleChamp,
  chip,
  text,
  textAccent,
  textMuted,
} from './styles';

type FieldValue = number | string | boolean;

/** Champs propres à chaque exemplaire, modifiables sur la fiche (valeur, détail…). */
const isEditable = (c: Champ) => c.type === 'nombre' || c.type === 'texte' || c.type === 'booleen';

/** Détail d'un exemplaire possédé : description, champs, choix, achats et retrait. */
export function PossessionDialog({
  entry: id,
  copy,
  kind,
  onClose,
}: {
  entry: string;
  /** Identifiant de l'exemplaire (absent : l'exemplaire sans identifiant). */
  copy?: string;
  kind: Sorte;
  onClose(): void;
}) {
  const {
    system,
    sheet,
    state,
    json,
    purchases,
    readOnly,
    buy,
    refund,
    updatePossession,
    removePossession,
  } = useSheet();
  const entry = system.entrees.get(id);
  const p = json.possessions.find((x) => x.entree === id);
  const explicit = state.possessions.find((x) => estExemplaire(x, id, copy));
  const effective = sheet.possessions.get(id);
  const [fields, setFields] = useState<Record<string, FieldValue>>({});
  const [choices, setChoices] = useState<Choice>(() => ({ ...(explicit?.choix ?? {}) }));
  const [sending, setSending] = useState(false);
  if (!entry) return null;

  const next = nextRankPurchase(purchases, id);
  // L'annulation du dernier achat rend le dernier exemplaire : proposée sur celui-là seulement
  const line = !explicit || lastCopy(state, id) === explicit ? lastLine(state, id) : -1;
  const target = copyTarget(id, copy);
  const free = freeKind(system, kind.id);
  const editableKeys = explicit ? kind.champs.filter(isEditable) : [];
  const changedFields = Object.keys(fields).length > 0;
  const changedChoices = JSON.stringify(choices) !== JSON.stringify(explicit?.choix ?? {});

  const run = async (f: () => Promise<boolean>, close = false) => {
    setSending(true);
    const ok = await f();
    setSending(false);
    if (ok && close) onClose();
    return ok;
  };

  return (
    <SheetDialog
      open
      onClose={onClose}
      title={effective ? copyName(effective, explicit) : entry.nom}
      description={kind.nom}
      large
    >
      {entry.description && (
        <p className={cn(text, 'whitespace-pre-line text-sm leading-relaxed')}>
          {entry.description}
        </p>
      )}

      {(p || entry.etiquettes.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {p && kind.rangs && (
            <span className={chip}>
              Rang {p.rang}
              {p.rang > p.achete ? ` (${p.achete} acheté${p.achete > 1 ? 's' : ''})` : ''}
            </span>
          )}
          {p?.marques.map((m) => (
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
      )}

      {p && p.sources.length > 0 && (
        <p className={cn(textMuted, 'text-xs')}>
          Obtenu par : {p.sources.map((s) => itemName(system, state.type, { objet: s })).join(', ')}
        </p>
      )}

      {kind.champs.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {kind.champs.map((c) => {
            const v = fieldValue(entry, c, explicit);
            const editable = !readOnly && editableKeys.some((m) => m.id === c.id);
            return (
              <div key={c.id} className="min-w-0">
                <dt className={cn(textMuted, 'text-xs')}>
                  {editable ? <label htmlFor={`champ-${c.id}`}>{c.nom}</label> : c.nom}
                </dt>
                <dd className={cn(text, 'text-sm')}>
                  {editable ? (
                    <EditableField
                      id={`champ-${c.id}`}
                      field={c}
                      value={(fields[c.id] ?? v) as FieldValue | undefined}
                      onChange={(x) => setFields((m) => ({ ...m, [c.id]: x }))}
                    />
                  ) : (
                    readableField(system, state.type, c, v)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {changedFields && (
        <button
          type="button"
          className={accentButton}
          disabled={sending}
          onClick={() =>
            run(async () => {
              const ok = await updatePossession({ ...target, champs: fields });
              if (ok) setFields({});
              return ok;
            })
          }
        >
          Enregistrer les valeurs
        </button>
      )}

      {explicit && hasChoices(entry) && (
        <div className="space-y-3 rounded-xl border border-[color:var(--fiche-bordure)] p-3">
          <ChoiceEditor
            sheet={sheet}
            entry={entry}
            value={choices}
            onChange={setChoices}
            disabled={readOnly || sending}
          />
          {!readOnly && changedChoices && (
            <button
              type="button"
              className={accentButton}
              disabled={sending}
              onClick={() => run(() => updatePossession({ ...target, choix: choices }))}
            >
              Enregistrer les choix
            </button>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap gap-2 border-t border-[color:var(--fiche-bordure)] pt-4">
          {next && (
            <PurchaseButton
              item={next}
              label={`Acheter le rang ${next.cible}`}
              currency={system.monnaies.get(next.monnaie)?.nom ?? next.monnaie}
              buttonText={`Rang ${next.cible} · ${next.cout} ${system.monnaies.get(next.monnaie)?.nom ?? ''}`}
              onBuy={() => buy(next.achat, next.objet)}
            />
          )}
          {line >= 0 && (
            <button
              type="button"
              className={secondaryButton}
              disabled={sending}
              onClick={() => run(() => refund(line))}
              title={`Rend ${state.journal[line]!.cout} ${system.monnaies.get(state.journal[line]!.monnaie)?.nom ?? ''}`}
            >
              <Undo2 />
              Annuler le dernier achat
            </button>
          )}
          {free && explicit && (
            <button
              type="button"
              className={cn(secondaryButton, 'text-red-400 hover:border-red-400')}
              disabled={sending}
              onClick={() => run(() => removePossession(id, copy), true)}
            >
              <Trash2 />
              Retirer
            </button>
          )}
        </div>
      )}
    </SheetDialog>
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
  value: FieldValue | undefined;
  onChange(v: FieldValue): void;
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
        inputMode="numeric"
        value={typeof value === 'number' ? value : ''}
        onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
        className={cn(styleChamp, 'w-28')}
      />
    );
  return (
    <input
      id={id}
      type="text"
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className={styleChamp}
    />
  );
}
