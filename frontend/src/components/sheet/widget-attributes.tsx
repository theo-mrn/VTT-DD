'use client';

import type { Attribut, ObjetAchetable, Widget } from '@vtt/rules';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { DetailPopover } from './detail-popover';
import { SheetEmpty } from './elements';
import { formatSign, formatValue } from './format';
import { WidgetCard } from './frame';
import { PurchaseButton } from './purchase-button';
import { panel, field, COLUMNS, focus, iconButton, negative, text, textMuted } from './styles';

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
    <WidgetCard title={widget.titre} bare>
      {attributes.length ? (
        <div className={cn('grid gap-1 md:gap-2', COLUMNS[columns] ?? COLUMNS[4])}>
          {attributes.map((a) => (
            <AttributeBox key={a.cle} attribute={a} />
          ))}
        </div>
      ) : (
        <SheetEmpty>Aucun attribut à afficher.</SheetEmpty>
      )}
    </WidgetCard>
  );
}

/** Achat qui augmente cet attribut (le possible d'abord), s'il en existe un. */
function attributePurchase(
  purchases: { objets: ObjetAchetable[] }[],
  key: string,
): ObjetAchetable | undefined {
  let blocked: ObjetAchetable | undefined;
  for (const a of purchases)
    for (const o of a.objets)
      if (o.type === 'attribut' && o.objet === key) {
        if (o.possible) return o;
        blocked ??= o;
      }
  return blocked;
}

/**
 * Case d'un attribut, comme les caractéristiques de l'ancienne fiche : le
 * modificateur en grand (s'il existe) et la valeur en petit dessous, sinon la
 * valeur seule. Le détail du calcul s'ouvre au survol. La saisie suit la
 * `saisie` de l'attribut (création, jeu, MJ : voir `canSetValue`) ; un
 * attribut qui ne se saisit plus propose son achat, s'il y en a un.
 */
function AttributeBox({ attribute: a }: { attribute: Attribut }) {
  const { system, json, state, purchases, readOnly, canSetValue, setValues, buy } = useSheet();
  const [editing, setEditing] = useState<string | null>(null);
  const v = json.valeurs[a.cle];
  const allowed = canSetValue(a);
  // Choix et booléens saisissables : modifiables directement sur la fiche
  if (allowed && (a.nature === 'choix' || a.nature === 'booleen'))
    return <AttributeInput attribute={a} />;

  const editableBase = allowed && a.nature === 'base';
  const purchase =
    !readOnly && !editableBase && a.nature === 'base'
      ? attributePurchase(purchases, a.cle)
      : undefined;
  const base = a.nature === 'base' ? Number(state.valeurs[a.cle] ?? a.defaut) : undefined;

  if (editableBase && editing !== null)
    return (
      <BaseAttributeForm
        attribute={a}
        value={editing}
        min={v?.min}
        max={v?.max}
        onChange={setEditing}
        onCancel={() => setEditing(null)}
        onSave={async (n) => {
          if (n === base) return setEditing(null);
          if (await setValues({ [a.cle]: n })) setEditing(null);
        }}
      />
    );

  const value =
    a.nature === 'ressource' && v?.max !== undefined
      ? `${formatValue(a, v.valeur)} / ${formatValue(a, v.max)}`
      : formatValue(a, v?.valeur);
  const mod = v?.modificateur;
  const gmOnly = a.nature === 'base' && a.saisie === 'mj';

  return (
    <div className="relative h-full">
      <DetailPopover
        title={a.nom}
        detail={v?.detail}
        footer={
          editableBase
            ? `Cliquer pour modifier${gmOnly ? ' (MJ)' : ''}${
                base !== undefined && base !== v?.valeur ? ` · valeur saisie ${base}` : ''
              }`
            : undefined
        }
        onClick={editableBase ? () => setEditing(String(base ?? 0)) : undefined}
        label={editableBase ? `Modifier ${a.nom} (${value})` : undefined}
        className="rounded-lg"
      >
        <span
          className={cn(
            panel,
            'flex h-full min-h-[50px] flex-col items-center justify-center overflow-hidden p-1 text-center',
          )}
        >
          <span
            className={cn(textMuted, 'w-full truncate text-xs font-semibold sm:text-sm')}
            title={a.description ?? a.nom}
          >
            {a.abrege ?? a.nom}
          </span>
          {mod !== undefined ? (
            <>
              <span
                className={cn(
                  'text-lg font-bold leading-none tabular-nums sm:text-xl md:text-2xl',
                  mod < 0 ? negative : text,
                )}
              >
                {formatSign(mod)}
              </span>
              <span className={cn(textMuted, 'text-[10px] tabular-nums sm:text-xs')}>{value}</span>
            </>
          ) : (
            <span
              className={cn(
                text,
                'mt-1 text-sm font-bold leading-none tabular-nums sm:text-base md:text-xl',
              )}
            >
              {value}
            </span>
          )}
        </span>
      </DetailPopover>
      {purchase && (
        <span className="absolute right-0.5 top-0.5">
          <PurchaseButton
            item={purchase}
            label={`${a.nom} : passer à ${purchase.cible}`}
            currency={system.monnaies.get(purchase.monnaie)?.nom ?? purchase.monnaie}
            onBuy={() => buy(purchase.achat, purchase.objet)}
            compact
          />
        </span>
      )}
    </div>
  );
}

/** Saisie d'un attribut de base sur place (crédits, niveau pour le MJ…). */
function BaseAttributeForm({
  attribute: a,
  value,
  min,
  max,
  onChange,
  onCancel,
  onSave,
}: {
  attribute: Attribut;
  value: string;
  min?: number;
  max?: number;
  onChange(v: string): void;
  onCancel(): void;
  onSave(n: number): Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  const id = `attribut-${a.cle}`;
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n);
  return (
    <form
      className={cn(panel, 'flex min-h-[50px] flex-col items-center gap-1 p-1 text-center')}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || sending) return;
        setSending(true);
        await onSave(n);
        setSending(false);
      }}
    >
      <label
        htmlFor={id}
        className={cn(textMuted, 'w-full truncate text-xs font-semibold sm:text-sm')}
        title={a.description ?? a.nom}
      >
        {a.abrege ?? a.nom}
      </label>
      <span className="flex items-center gap-1">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          autoFocus
          value={value}
          min={min}
          max={max}
          disabled={sending}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          className={cn(field, 'h-8 w-20 px-2 text-center tabular-nums')}
        />
        <button
          type="submit"
          className={cn(iconButton, 'h-8 w-8')}
          aria-label={`Enregistrer ${a.nom}`}
          disabled={!valid || sending}
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cn(iconButton, 'h-8 w-8')}
          aria-label="Annuler"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </button>
      </span>
    </form>
  );
}

function AttributeInput({ attribute: a }: { attribute: Attribut }) {
  const { json, setValues } = useSheet();
  const v = json.valeurs[a.cle]?.valeur;
  const id = `attribut-${a.cle}`;

  return (
    <div className={cn(panel, 'flex min-h-[50px] flex-col items-center gap-1 p-1 text-center')}>
      <label
        htmlFor={id}
        className={cn(textMuted, 'text-xs font-semibold sm:text-sm')}
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
