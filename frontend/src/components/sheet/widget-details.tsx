'use client';

import type { Attribut, Widget } from '@vtt/rules';
import { Check, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { PossessionDialog } from './possession-dialog';
import { Block } from './elements';
import { formatValue } from './format';
import { iconButton, field, focus, text, textAccent, textMuted } from './styles';

type DetailsWidget = Extract<Widget, { type: 'details' }>;

/** Résumé : entrées uniques (espèce, carrière…) et attributs courts (texte, choix). */
export function DetailsWidget({ widget }: { widget: DetailsWidget }) {
  const { system, sheet, json, character } = useSheet();
  const [openKind, setOpenKind] = useState<{ entry: string; kind: string } | null>(null);
  const kinds = widget.sortes.flatMap((id) => {
    const s = system.sortes.get(id);
    return s ? [s] : [];
  });
  const attributes = widget.attributs.flatMap((c) => {
    const a = sheet.entite.attributs.get(c);
    return a ? [a] : [];
  });
  const openedKind = openKind ? system.sortes.get(openKind.kind) : undefined;

  return (
    <Block title={widget.titre}>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 xs:grid-cols-2">
        {kinds.map((s) => {
          const owned = json.possessions.filter((p) => p.sorte === s.id);
          return (
            <div key={s.id} className="min-w-0">
              <dt className={cn(textMuted, 'text-xs uppercase tracking-wide')}>
                {owned.length > 1 ? (s.nomPluriel ?? s.nom) : s.nom}
              </dt>
              <dd className="text-sm">
                {owned.length ? (
                  <span className="flex flex-wrap gap-x-2">
                    {owned.map((p) => (
                      <button
                        key={p.entree}
                        type="button"
                        onClick={() => setOpenKind({ entry: p.entree, kind: s.id })}
                        className={cn(text, 'rounded text-left hover:underline', focus)}
                      >
                        {p.nom}
                      </button>
                    ))}
                  </span>
                ) : character.etat.creation ? (
                  <Link
                    href={`/characters/${character.id}/creation`}
                    className={cn(textAccent, 'rounded hover:underline', focus)}
                  >
                    À choisir
                  </Link>
                ) : (
                  <span className={textMuted}>—</span>
                )}
              </dd>
            </div>
          );
        })}
        {attributes.map((a) => (
          <AttributeDetail key={a.cle} attribute={a} />
        ))}
      </dl>
      {openKind && openedKind && (
        <PossessionDialog
          entry={openKind.entry}
          kind={openedKind}
          onClose={() => setOpenKind(null)}
        />
      )}
    </Block>
  );
}

function AttributeDetail({ attribute: a }: { attribute: Attribut }) {
  const { json, readOnly, setValues } = useSheet();
  const v = json.valeurs[a.cle]?.valeur;
  const editable = !readOnly && (a.nature === 'texte' || a.nature === 'choix');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const id = `detail-${a.cle}`;

  const submit = async () => {
    if (draft !== (typeof v === 'string' ? v : '')) await setValues({ [a.cle]: draft });
    setEditing(false);
  };

  return (
    <div className="min-w-0">
      <dt className={cn(textMuted, 'text-xs uppercase tracking-wide')}>
        {editing ? <label htmlFor={id}>{a.nom}</label> : a.nom}
      </dt>
      <dd className="text-sm">
        {editing ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {a.nature === 'choix' ? (
              <select
                id={id}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className={field}
                autoFocus
              >
                <option value="">—</option>
                {a.options.map((o) => (
                  <option key={o.valeur} value={o.valeur}>
                    {o.nom}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className={field}
                autoFocus
                onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
              />
            )}
            <button type="submit" className={cn(iconButton, 'h-8 w-8')} aria-label="Enregistrer">
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(iconButton, 'h-8 w-8')}
              aria-label="Annuler"
              onClick={() => setEditing(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <span className="group flex items-center gap-1.5">
            <span className={cn(text, 'min-w-0 break-words')}>{formatValue(a, v)}</span>
            {editable && (
              <button
                type="button"
                className={cn(
                  textMuted,
                  'rounded p-1 hover:text-[color:var(--fiche-accent)]',
                  focus,
                )}
                aria-label={`Modifier ${a.nom}`}
                onClick={() => {
                  setDraft(typeof v === 'string' ? v : '');
                  setEditing(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        )}
      </dd>
    </div>
  );
}
