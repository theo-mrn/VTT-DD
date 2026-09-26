'use client';

/**
 * Texte libre (historique, motivation…), présenté comme les textes de la
 * fenêtre « Infos » de l'ancienne fiche ; modifiable au crayon si l'attribut
 * est saisissable.
 */
import type { Widget } from '@vtt/rules';
import { Pencil } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { WidgetCard } from './frame';
import { accentButton, secondaryButton, field, focus, text, textMuted } from './styles';

type TextWidgetProps = Extract<Widget, { type: 'texte' }>;

export function TextWidget({ widget }: { widget: TextWidgetProps }) {
  const { sheet, json, canSetValue, setValues } = useSheet();
  const a = sheet.entite.attributs.get(widget.attribut);
  const raw = json.valeurs[widget.attribut]?.valeur;
  const value = typeof raw === 'string' ? raw : raw === undefined ? '' : String(raw);
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const id = useId();
  const editable = a?.nature === 'texte' && canSetValue(a);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  return (
    <WidgetCard
      title={widget.titre}
      action={
        editable && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(textMuted, 'rounded p-1 hover:text-[color:var(--fiche-accent)]', focus)}
            aria-label={`Modifier : ${widget.titre}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setSending(true);
            const ok = await setValues({ [widget.attribut]: draft });
            setSending(false);
            if (ok) setEditing(false);
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
            autoFocus
            placeholder={a?.description ?? `${widget.titre}…`}
            className={cn(field, 'h-auto min-h-[80px] resize-y py-2 leading-relaxed')}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
              disabled={sending}
            >
              Annuler
            </button>
            <button type="submit" className={accentButton} disabled={sending || draft === value}>
              Sauvegarder
            </button>
          </div>
        </form>
      ) : (
        <div
          className={cn(
            'whitespace-pre-wrap rounded-lg border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] p-3 text-sm',
            value ? text : cn(textMuted, 'italic'),
          )}
        >
          {value || `Aucun texte pour « ${widget.titre} ».`}
        </div>
      )}
    </WidgetCard>
  );
}
