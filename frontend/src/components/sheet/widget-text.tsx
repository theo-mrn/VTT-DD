'use client';

import type { Widget } from '@vtt/rules';
import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { Block, SheetEmpty } from './elements';
import { accentButton, secondaryButton, field, text } from './styles';

type TextWidget = Extract<Widget, { type: 'texte' }>;

/** Texte libre (historique, motivation…), modifiable si l'attribut est saisissable. */
export function TextWidget({ widget }: { widget: TextWidget }) {
  const { sheet, json, readOnly, setValues } = useSheet();
  const a = sheet.entite.attributs.get(widget.attribut);
  const raw = json.valeurs[widget.attribut]?.valeur;
  const value = typeof raw === 'string' ? raw : raw === undefined ? '' : String(raw);
  const [draft, setDraft] = useState(value);
  const [sending, setSending] = useState(false);
  const id = useId();
  const editable = !readOnly && a?.nature === 'texte';
  const changed = draft !== value;

  useEffect(() => setDraft(value), [value]);

  return (
    <Block title={widget.titre}>
      {editable ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setSending(true);
            await setValues({ [widget.attribut]: draft });
            setSending(false);
          }}
        >
          <label htmlFor={id} className="sr-only">
            {widget.titre}
          </label>
          <textarea
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder={a?.description ?? `${widget.titre}…`}
            className={cn(field, 'h-auto min-h-28 resize-y py-2 leading-relaxed')}
          />
          {changed && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setDraft(value)}
                disabled={sending}
              >
                Annuler
              </button>
              <button type="submit" className={accentButton} disabled={sending}>
                Enregistrer
              </button>
            </div>
          )}
        </form>
      ) : value ? (
        <p className={cn(text, 'whitespace-pre-line text-sm leading-relaxed')}>{value}</p>
      ) : (
        <SheetEmpty>Rien d&apos;écrit pour l&apos;instant.</SheetEmpty>
      )}
    </Block>
  );
}
