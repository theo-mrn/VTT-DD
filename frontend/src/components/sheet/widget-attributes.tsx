'use client';

import type { Attribut, Widget } from '@vtt/rules';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { Block, Explanation, SheetEmpty } from './elements';
import { formatSign, formatValue } from './format';
import { valueBox, field, COLUMNS, focus, text, textAccent, textMuted } from './styles';

type AttributesWidget = Extract<Widget, { type: 'attributs' }>;

/** Attributs visés par un bloc : liste explicite, puis ceux du groupe (sauf ceux réservés au MJ). */
export function blockAttributes(
  attributes: Map<string, Attribut>,
  w: { groupe?: string; attributs?: string[] },
): Attribut[] {
  const r: Attribut[] = [];
  const seen = new Set<string>();
  for (const key of w.attributs ?? []) {
    const a = attributes.get(key);
    if (a && !seen.has(key)) {
      r.push(a);
      seen.add(key);
    }
  }
  if (w.groupe) {
    for (const a of attributes.values())
      if (a.groupe === w.groupe && a.visibilite !== 'mj' && !seen.has(a.cle)) {
        r.push(a);
        seen.add(a.cle);
      }
  }
  return r;
}

export function AttributesWidget({ widget }: { widget: AttributesWidget }) {
  const { sheet } = useSheet();
  const attributes = blockAttributes(sheet.entite.attributs, widget);
  const columns = widget.colonnes ?? Math.min(4, Math.max(2, attributes.length));

  return (
    <Block title={widget.titre}>
      {attributes.length ? (
        <div className={cn('grid gap-2', COLUMNS[columns] ?? COLUMNS[4])}>
          {attributes.map((a) => (
            <AttributeBox key={a.cle} attribute={a} />
          ))}
        </div>
      ) : (
        <SheetEmpty>Aucun attribut à afficher.</SheetEmpty>
      )}
    </Block>
  );
}

function AttributeBox({ attribute: a }: { attribute: Attribut }) {
  const { json, readOnly } = useSheet();
  const v = json.valeurs[a.cle];
  // Choix et booléens saisissables : modifiables directement sur la fiche
  const editable = !readOnly && (a.nature === 'choix' || a.nature === 'booleen');

  if (editable) return <AttributeInput attribute={a} />;

  const value =
    a.nature === 'ressource' && v?.max !== undefined
      ? `${formatValue(a, v.valeur)} / ${formatValue(a, v.max)}`
      : formatValue(a, v?.valeur);

  return (
    <Explanation title={a.nom} detail={v?.detail} className="block h-full rounded-xl">
      <span className={cn(valueBox, 'flex h-full flex-col items-center px-2 py-2.5 text-center')}>
        <span
          className={cn(textMuted, 'line-clamp-2 text-[11px] uppercase tracking-wide')}
          title={a.description ?? a.nom}
        >
          {a.abrege ?? a.nom}
        </span>
        <span className={cn(text, 'mt-1 text-xl font-semibold tabular-nums sm:text-2xl')}>
          {value}
        </span>
        {v?.modificateur !== undefined && (
          <span className={cn(textAccent, 'text-xs font-medium tabular-nums')}>
            {formatSign(v.modificateur)}
          </span>
        )}
      </span>
    </Explanation>
  );
}

function AttributeInput({ attribute: a }: { attribute: Attribut }) {
  const { json, setValues } = useSheet();
  const v = json.valeurs[a.cle]?.valeur;
  const id = `attribut-${a.cle}`;

  return (
    <div className={cn(valueBox, 'flex flex-col items-center gap-1.5 px-2 py-2.5 text-center')}>
      <label
        htmlFor={id}
        className={cn(textMuted, 'text-[11px] uppercase tracking-wide')}
        title={a.description ?? a.nom}
      >
        {a.abrege ?? a.nom}
      </label>
      {a.nature === 'choix' ? (
        <select
          id={id}
          value={typeof v === 'string' ? v : ''}
          onChange={(e) => void setValues({ [a.cle]: e.target.value })}
          className={cn(field, 'h-8 px-2 text-center')}
        >
          {typeof v !== 'string' || !v ? <option value="">—</option> : null}
          {a.options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.nom}
            </option>
          ))}
        </select>
      ) : (
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={v === true}
          onClick={() => void setValues({ [a.cle]: v !== true })}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors',
            v === true
              ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)]'
              : 'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)]',
            focus,
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 rounded-full shadow transition-transform',
              v === true ? 'translate-x-6 bg-zinc-950' : 'translate-x-1 bg-zinc-400',
            )}
          />
        </button>
      )}
    </div>
  );
}
