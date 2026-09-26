'use client';

import { acheterEtape, detailSolde, type ObjetAchetable } from '@vtt/rules';
import { Search, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { writes } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { PurchaseButton } from '../purchase-button';
import { useSheet } from '../context';
import { normalize, SheetEmpty } from '../elements';
import { formatNumber, itemName } from '../format';
import {
  iconButton,
  secondaryButton,
  valueBox,
  field,
  text,
  textAccent,
  textMuted,
} from '../styles';
import { TreesWidget } from '../widget-trees';
import type { Step } from './assistant';

/** Étape « acheter » : achats autorisés par l'étape, soldes, et annulation des achats faits. */
export function PurchaseStep({ step }: { step: Step<'acheter'> }) {
  const { system, sheet, state, purchases, write, refund } = useSheet();
  const [search, setSearch] = useState('');
  const [blockedItems, setBlockedItems] = useState(false);

  const availableOnes = purchases.filter((a) => step.achats.includes(a.achat.id));
  const currencies = [...new Set(step.achats.map((id) => system.achats.get(id)?.monnaie))]
    .filter((m): m is string => !!m && !!system.monnaies.get(m)?.pour.includes(state.type))
    .map((m) => detailSolde(sheet, m));
  // Les nœuds d'arbre s'achètent sur la grille, plus lisible qu'une liste
  const withNodes = step.achats.some((id) => system.achats.get(id)?.obtient.type === 'noeud');
  const filter = normalize(search.trim());
  const log = state.journal
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.creation && step.achats.includes(l.achat))
    .reverse();

  const buy = (o: ObjetAchetable) =>
    write(writes.step(step.id, { achat: o.achat, objet: o.objet }), (e) => {
      const r = acheterEtape(system, e, step.id, { achat: o.achat, objet: o.objet });
      return r.ok ? r.etat : null;
    });

  return (
    <div className="space-y-5">
      {currencies.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-live="polite">
          {currencies.map((s) => (
            <div key={s.monnaie.id} className={cn(valueBox, 'px-3 py-2')}>
              <p className={cn(textMuted, 'text-xs uppercase tracking-wide')}>{s.monnaie.nom}</p>
              <p
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  s.solde < 0 ? 'text-red-400' : textAccent,
                )}
              >
                {formatNumber(s.solde)}
              </p>
              <p className={cn(textMuted, 'text-xs tabular-nums')}>sur {formatNumber(s.total)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className={cn(textMuted, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher un achat"
            className={cn(field, 'pl-9')}
          />
        </div>
        <button
          type="button"
          aria-pressed={blockedItems}
          className={cn(secondaryButton, 'text-xs')}
          onClick={() => setBlockedItems((b) => !b)}
        >
          {blockedItems ? 'Masquer les achats impossibles' : 'Afficher les achats impossibles'}
        </button>
      </div>

      {availableOnes
        .filter((a) => a.achat.obtient.type !== 'noeud')
        .map((a) => {
          const items = a.objets
            .filter(
              (o) => (blockedItems || o.possible) && (!filter || normalize(o.nom).includes(filter)),
            )
            .sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
          const currency = system.monnaies.get(a.achat.monnaie)?.nom ?? a.achat.monnaie;
          return (
            <section key={a.achat.id} aria-label={a.achat.nom} className="space-y-2">
              <div>
                <h3 className={cn(text, 'text-sm font-semibold')}>{a.achat.nom}</h3>
                {a.achat.description && (
                  <p className={cn(textMuted, 'text-xs')}>{a.achat.description}</p>
                )}
              </div>
              {items.length ? (
                <ul className="max-h-80 divide-y divide-[color:var(--fiche-bordure)] overflow-y-auto rounded-xl border border-[color:var(--fiche-bordure)] px-3">
                  {items.map((o) => (
                    <li key={o.objet} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className={cn(text, 'block truncate text-sm')}>{o.nom}</span>
                        <span className={cn(textMuted, 'block text-xs')}>
                          {o.possible
                            ? o.type === 'entree'
                              ? `${o.cout} ${currency}`
                              : `${o.actuel} → ${o.cible} · ${o.cout} ${currency}`
                            : o.blocages.map((b) => b.message).join(' ; ')}
                        </span>
                      </span>
                      <PurchaseButton
                        item={o}
                        label={`${a.achat.nom} : ${o.nom}`}
                        currency={currency}
                        onBuy={() => buy(o)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <SheetEmpty>
                  {filter ? 'Aucun résultat.' : 'Plus rien d’achetable pour l’instant.'}
                </SheetEmpty>
              )}
            </section>
          );
        })}

      {withNodes && <TreesWidget widget={{ type: 'arbres', titre: 'Arbres' }} />}

      {log.length > 0 && (
        <section aria-label="Achats de cette étape" className="space-y-2">
          <h3 className={cn(text, 'text-sm font-semibold')}>Achats faits</h3>
          <ul className="divide-y divide-[color:var(--fiche-bordure)] rounded-xl border border-[color:var(--fiche-bordure)] px-3">
            {log.map(({ l, i }) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className={cn(text, 'min-w-0 flex-1 truncate')}>
                  {itemName(system, state.type, l)}
                  <span className={textMuted}> · {system.achats.get(l.achat)?.nom ?? l.achat}</span>
                </span>
                <span className={cn(textMuted, 'tabular-nums')}>−{formatNumber(l.cout)}</span>
                <button
                  type="button"
                  className={cn(iconButton, 'h-8 w-8')}
                  aria-label={`Annuler : ${itemName(system, state.type, l)}`}
                  onClick={() => void refund(i)}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
