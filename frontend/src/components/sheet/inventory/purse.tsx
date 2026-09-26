'use client';

/**
 * Bourse : les monnaies qui paient l'équipement (voir `purseLines`), avec
 * leur reste = total − achats du journal. Quand le total est un attribut de
 * base seul, il se saisit selon sa `saisie` : pendant la création (montant de
 * départ), puis en jeu pour `jeu` (propriétaire ou MJ) ou `mj` (MJ seul).
 */
import { Coins, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatNumber } from '../format';
import { field, iconButton, textAccent, textMuted } from '../styles';
import { purseLines, type PurseLine } from './model';
import { useInventory, useSending } from './ui';

export function Purse() {
  const { sheet, kinds } = useInventory();
  const lines = useMemo(() => purseLines(sheet, kinds), [sheet, kinds]);
  if (!lines.length) return null;

  return (
    <div
      className="flex flex-wrap items-stretch gap-x-5 gap-y-2 rounded-xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] px-3 py-2"
      aria-label="Bourse"
      role="group"
    >
      <span
        className={cn(
          textMuted,
          'flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider',
        )}
      >
        <Coins className="h-3.5 w-3.5" />
        Bourse
      </span>
      {lines.map((l, i) => (
        <PurseAmount key={l.balance.monnaie.id} line={l} divider={i > 0} />
      ))}
    </div>
  );
}

function PurseAmount({ line, divider }: { line: PurseLine; divider: boolean }) {
  const { state, readOnly, onSetValues, canSetValue } = useInventory();
  const { balance, attribute } = line;
  const [editing, setEditing] = useState<string | null>(null);
  const [sending, run] = useSending();
  const editable =
    !!attribute &&
    !!onSetValues &&
    (canSetValue ? canSetValue(attribute) : !readOnly && state.creation);
  // Pendant la création : le montant de départ ; ensuite, le total reçu (le reste en déduit les achats)
  const editLabel = state.creation
    ? `${attribute?.nom ?? balance.monnaie.nom} de départ`
    : (attribute?.nom ?? balance.monnaie.nom);
  const base = attribute ? Number(state.valeurs[attribute.cle] ?? attribute.defaut) : undefined;

  const save = () =>
    run(async () => {
      const n = Number(editing);
      if (!attribute || editing === null || editing.trim() === '' || !Number.isFinite(n))
        return false;
      const ok = await onSetValues!({ [attribute.cle]: n });
      if (ok) setEditing(null);
      return ok;
    });

  return (
    <div
      className={cn(
        'flex min-w-[4.5rem] flex-col justify-center',
        divider && 'border-l border-[color:var(--fiche-bordure)] pl-5',
      )}
    >
      {editing !== null ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={editing}
            aria-label={editLabel}
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
            onBlur={() => !sending && setEditing(null)}
            className={cn(field, 'h-8 w-24 tabular-nums')}
            disabled={sending}
          />
        </form>
      ) : (
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'font-mono text-2xl font-bold leading-none tabular-nums',
              balance.solde < 0 ? 'text-red-400' : textAccent,
            )}
            title={`${formatNumber(balance.total)} au total, ${formatNumber(balance.depense)} dépensé${balance.depense > 1 ? 's' : ''}`}
          >
            {formatNumber(balance.solde)}
          </span>
          {editable && (
            <button
              type="button"
              className={cn(iconButton, 'h-7 w-7 border-transparent')}
              aria-label={`Modifier : ${editLabel}`}
              title={
                state.creation
                  ? `Modifier : ${editLabel}`
                  : `Modifier : ${editLabel} (le solde en déduit les achats)`
              }
              onClick={() => setEditing(String(base ?? 0))}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      )}
      <span
        className={cn(
          textMuted,
          'mt-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide',
        )}
      >
        {balance.monnaie.nom}
      </span>
      {balance.depense > 0 && (
        <span className={cn(textMuted, 'text-[10px] tabular-nums')}>
          −{formatNumber(balance.depense)} en achats
        </span>
      )}
      {balance.erreur && <span className="text-[10px] text-red-300">{balance.erreur}</span>}
    </div>
  );
}
