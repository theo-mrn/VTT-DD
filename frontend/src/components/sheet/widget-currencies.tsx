'use client';

import { soldes, type Widget } from '@vtt/rules';
import { ChevronDown, Coins, Undo2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { formatNumber, itemName } from './format';
import { WidgetCard } from './frame';
import { iconButton, focus, text, textAccent, textMuted } from './styles';

type CurrenciesWidget = Extract<Widget, { type: 'monnaies' }>;

/**
 * Soldes des monnaies, repris du bloc « Bourse » de l'ancienne fiche : les
 * montants en grand, côte à côte, séparés d'un filet ; puis l'historique des
 * achats (total gagné − dépenses du journal), avec annulation.
 */
export function CurrenciesWidget({ widget }: { widget: CurrenciesWidget }) {
  const { system, sheet, state, readOnly, refund } = useSheet();
  const [log, setLog] = useState(false);
  const list = soldes(sheet);
  const lines = state.journal.map((l, i) => ({ l, i })).reverse();

  return (
    <WidgetCard title={widget.titre} icon={<Coins size={12} aria-hidden />}>
      {list.length ? (
        <div className="flex flex-row items-center justify-around gap-4 overflow-x-auto px-1 py-1">
          {list.map((s, idx) => (
            <Fragment key={s.monnaie.id}>
              {idx > 0 && (
                <div aria-hidden className="h-8 w-px shrink-0 bg-[color:var(--fiche-bordure)]" />
              )}
              <div
                className="flex min-w-[3rem] flex-col items-center justify-center"
                title={`${formatNumber(s.total)} gagné${s.total > 1 ? 's' : ''} · ${formatNumber(s.depense)} dépensé${s.depense > 1 ? 's' : ''}`}
              >
                <span
                  className={cn(
                    'font-mono text-2xl font-bold leading-none tabular-nums drop-shadow-sm',
                    s.solde < 0 ? 'text-red-400' : textAccent,
                  )}
                >
                  {formatNumber(s.solde)}
                </span>
                <span
                  className={cn(
                    textMuted,
                    'mt-1 whitespace-nowrap text-center text-[10px] font-bold uppercase tracking-wide',
                  )}
                >
                  {s.monnaie.nom}
                </span>
                {s.erreur && <span className="mt-1 text-xs text-red-300">{s.erreur}</span>}
              </div>
            </Fragment>
          ))}
        </div>
      ) : (
        <p className={cn(textMuted, 'w-full py-2 text-center text-xs italic opacity-60')}>Vide</p>
      )}

      {lines.length > 0 && (
        <div className="mt-2 border-t border-[color:var(--fiche-bordure)] pt-2">
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
    </WidgetCard>
  );
}
