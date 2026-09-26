'use client';

/**
 * Ajout d'une entrée d'une sorte : par un achat du système (coût, blocages)
 * ou librement (`POST /possessions`) quand la sorte s'ajoute sans achat, ou
 * pour le MJ.
 */
import type { ObjetAchetable, Sorte } from '@vtt/rules';
import { Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { SheetBindings } from './common/bindings';
import { SearchField, WriteButton } from './common/controls';
import { EntryDialog } from './common/entry-dialog';
import {
  blockMessages,
  byName,
  currencyName,
  entriesOfKind,
  kindFromTrees,
  kindIsPurchasable,
  normalize,
} from './common/helpers';
import { softAccentButton, text, textMuted } from './common/styles';

export interface AddEntryDialogProps extends SheetBindings {
  kind: Sorte;
  /** Seulement l'ajout libre (outil MJ), sans les achats. */
  freeOnly?: boolean;
  onClose(): void;
}

/** L'entrée s'ajoute-t-elle sans achat (ni achat ni nœud d'arbre ne la vise) ? */
export function freelyAddable(system: SheetBindings['system'], kind: string) {
  return !kindIsPurchasable(system, kind) && !kindFromTrees(system, kind);
}

export function AddEntryDialog({
  system,
  sheet,
  purchases,
  gm,
  themeVariables,
  kind,
  freeOnly,
  onBuy,
  onUpdatePossession,
  onClose,
}: AddEntryDialogProps) {
  const [search, setSearch] = useState('');
  const query = normalize(search.trim());
  const match = (name: string) => !query || normalize(name).includes(query);
  const owned = (id: string) =>
    (sheet.possessions.get(id)?.rang ?? 0) > 0 || (!kind.rangs && sheet.possessions.has(id));

  const items: ObjetAchetable[] = freeOnly
    ? []
    : purchases
        .flatMap((a) => a.objets)
        .filter(
          (o) =>
            (o.type === 'entree' || (o.type === 'rang' && o.actuel === 0)) &&
            system.entrees.get(o.objet)?.sorte === kind.id &&
            match(o.nom),
        )
        .sort((a, b) => Number(b.possible) - Number(a.possible) || byName(a, b));
  const allowFree = freeOnly || gm || freelyAddable(system, kind.id);
  const free = allowFree
    ? entriesOfKind(system, kind.id)
        .filter((e) => !owned(e.id) && match(e.nom) && !items.some((o) => o.objet === e.id))
        .sort(byName)
    : [];

  const done = (ok: boolean) => {
    if (ok) onClose();
    return ok;
  };

  return (
    <EntryDialog
      open
      onClose={onClose}
      title={`Ajouter : ${kind.nomPluriel ?? kind.nom}`}
      description={freeOnly ? 'Ajout sans dépense (MJ).' : undefined}
      themeVariables={themeVariables}
      size="lg"
    >
      <div className="space-y-3">
        <SearchField value={search} onChange={setSearch} />
        <ul className="divide-y divide-[color:var(--fiche-bordure)]">
          {items.map((o) => {
            const currency = currencyName(system, o.monnaie);
            return (
              <li key={`${o.achat}:${o.objet}`} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className={cn(text, 'block truncate text-sm')}>{o.nom}</span>
                  <span className={cn(textMuted, 'block text-xs')}>
                    {o.possible ? `${o.cout} ${currency}` : blockMessages(o).join(' ; ')}
                  </span>
                </span>
                <WriteButton
                  className={softAccentButton}
                  disabled={!o.possible}
                  label={`Acheter ${o.nom} : ${o.cout} ${currency}`}
                  onClick={async () => done(await onBuy(o.achat, o.objet))}
                >
                  {o.possible ? <Plus /> : <Lock />}
                  {o.cout} {currency}
                </WriteButton>
              </li>
            );
          })}
          {free.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className={cn(text, 'block truncate text-sm')}>{e.nom}</span>
                {e.description && (
                  <span className={cn(textMuted, 'line-clamp-1 block text-xs')}>
                    {e.description}
                  </span>
                )}
              </span>
              <WriteButton
                className={softAccentButton}
                label={`Ajouter ${e.nom}`}
                onClick={async () =>
                  done(
                    await onUpdatePossession({ entree: e.id, ...(kind.rangs ? { rang: 1 } : {}) }),
                  )
                }
              >
                <Plus />
                Ajouter
              </WriteButton>
            </li>
          ))}
        </ul>
        {!items.length && !free.length && (
          <p className={cn(textMuted, 'py-6 text-center text-sm')}>Rien à ajouter.</p>
        )}
      </div>
    </EntryDialog>
  );
}
