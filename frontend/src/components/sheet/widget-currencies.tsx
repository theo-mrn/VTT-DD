'use client';

import { soldes, type Widget } from '@vtt/rules';
import { ChevronDown, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { Block, SheetEmpty } from './elements';
import { formatNumber, itemName } from './format';
import { iconButton, valueBox, focus, text, textAccent, textMuted } from './styles';

type CurrenciesWidget = Extract<Widget, { type: 'monnaies' }>;

/** Soldes des monnaies (total gagné − dépenses du journal) et historique des achats. */
export function CurrenciesWidget({ widget }: { widget: CurrenciesWidget }) {
  const { system, sheet, state, readOnly, refund } = useSheet();
  const [log, setLog] = useState(false);
  const list = soldes(sheet);
  const lines = state.journal.map((l, i) => ({ l, i })).reverse();

  return (
    <Block title={widget.titre}>
      {list.length ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {list.map((s) => (
            <div key={s.monnaie.id} className={cn(valueBox, 'px-3 py-2.5')}>
              <p className={cn(textMuted, 'text-xs uppercase tracking-wide')}>{s.monnaie.nom}</p>
              <p
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  s.solde < 0 ? 'text-red-400' : textAccent,
                )}
              >
                {formatNumber(s.solde)}
              </p>
              <p className={cn(textMuted, 'text-xs tabular-nums')}>
                {formatNumber(s.total)} gagné{s.total > 1 ? 's' : ''} · {formatNumber(s.depense)}{' '}
                dépensé{s.depense > 1 ? 's' : ''}
              </p>
              {s.erreur && <p className="mt-1 text-xs text-red-300">{s.erreur}</p>}
            </div>
          ))}
        </div>
      ) : (
        <SheetEmpty>Aucune monnaie pour ce type d&apos;entité.</SheetEmpty>
      )}

      {lines.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={log}
            onClick={() => setLog((j) => !j)}
            className={cn(
              textMuted,
              'flex items-center gap-1 rounded text-xs hover:underline',
              focus,
            )}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', log && 'rotate-180')} />
            Historique des achats ({lines.length})
          </button>
          {log && (
            <ul className="mt-2 max-h-72 divide-y divide-[color:var(--fiche-bordure)] overflow-y-auto">
              {lines.map(({ l, i }) => (
                <li key={i} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className={cn(text, 'block truncate')}>
                      {itemName(system, state.type, l)}
                    </span>
                    <span className={cn(textMuted, 'block text-xs')}>
                      {system.achats.get(l.achat)?.nom ?? l.achat}
                      {l.creation ? ' · création' : ''}
                      {l.date ? ` · ${new Date(l.date).toLocaleDateString('fr-FR')}` : ''}
                    </span>
                  </span>
                  <span className={cn(text, 'tabular-nums')}>
                    −{formatNumber(l.cout)}{' '}
                    <span className={textMuted}>{system.monnaies.get(l.monnaie)?.nom}</span>
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      className={cn(iconButton, 'h-8 w-8')}
                      aria-label={`Annuler l'achat : ${itemName(system, state.type, l)}`}
                      title="Annuler cet achat (seul le dernier achat d'un même objet s'annule)"
                      onClick={() => void refund(i)}
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Block>
  );
}
