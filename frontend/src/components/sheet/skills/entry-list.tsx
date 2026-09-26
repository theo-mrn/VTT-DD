'use client';

/**
 * Entrées possédées d'une sorte SANS rangs (capacités, talents acquis,
 * équipement…), dans l'esprit de la liste de capacités de l'ancienne fiche :
 * cartes avec description, détail, activation, ajout (achat ou ajout libre)
 * et retrait (remboursement de l'achat, ou retrait de la possession).
 */
import type { PossessionEffective, Sorte } from '@vtt/rules';
import { Plus, Star, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { SheetBindings } from './common/bindings';
import { SearchField, WriteButton } from './common/controls';
import { EntryDialog } from './common/entry-dialog';
import {
  byName,
  currencyName,
  journalLines,
  markName,
  marksOf,
  normalize,
  readableField,
  refundError,
  sourceNames,
} from './common/helpers';
import {
  accentChip,
  autoGrid,
  dangerButton,
  entryCard,
  entryCardOn,
  focus,
  ghostButton,
  iconButton,
  panel,
  text,
  textAccent,
  textMuted,
  titleFont,
} from './common/styles';
import { AddEntryDialog, freelyAddable } from './add-entry-dialog';

export interface EntryListProps extends SheetBindings {
  /** Identifiant de la sorte affichée (sans rangs de préférence). */
  kind: string;
  title: string;
  className?: string;
}

/** Au-delà de ce nombre d'entrées, la recherche s'affiche. */
const SEARCH_FROM = 6;

export function EntryList(props: EntryListProps) {
  const { system, sheet, purchases, readOnly, gm, kind: kindId, title, className } = props;
  const kind = system.sortes.get(kindId);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!kind || !kind.pour.includes(sheet.etat.type)) return null;

  const owned = [...sheet.possessions.values()]
    .filter((p) => p.sorte.id === kind.id && (!kind.rangs || p.rang > 0))
    .sort((a, b) => byName(a.entree, b.entree));
  const query = normalize(search.trim());
  const shown = owned.filter((p) => !query || normalize(p.entree.nom).includes(query));
  const full = kind.maximum !== undefined && owned.length >= kind.maximum;
  const purchasable = purchases.some((a) =>
    a.objets.some(
      (o) =>
        (o.type === 'entree' || o.type === 'rang') &&
        system.entrees.get(o.objet)?.sorte === kind.id,
    ),
  );
  const canAdd = !readOnly && !full && (purchasable || gm || freelyAddable(system, kind.id));
  const current = selected ? sheet.possessions.get(selected) : undefined;

  return (
    <>
      <section aria-label={title} className={cn(panel, 'h-full w-full', className)}>
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[color:var(--fiche-bordure)] p-3">
          <div className="flex min-w-0 flex-1 basis-[240px] items-center gap-3">
            <h2 className={cn(titleFont, textAccent, 'shrink-0 text-lg font-bold')}>{title}</h2>
            {owned.length > SEARCH_FROM && (
              <SearchField value={search} onChange={setSearch} className="max-w-64 flex-grow" />
            )}
          </div>
          {canAdd && (
            <button
              type="button"
              className={iconButton}
              onClick={() => setAdding(true)}
              aria-label={`Ajouter : ${kind.nomPluriel ?? kind.nom}`}
              title={`Ajouter : ${kind.nomPluriel ?? kind.nom}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {shown.length === 0 ? (
            <p className={cn(textMuted, 'py-10 text-center text-sm')}>
              {owned.length ? 'Aucun résultat' : 'Rien ici pour l’instant.'}
            </p>
          ) : (
            <ul className={autoGrid}>
              {shown.map((p) => (
                <li key={p.entree.id}>
                  <EntryCard
                    possession={p}
                    marks={marksOf(sheet, p.entree.id)}
                    canToggle={!readOnly && kind.activable && !!p.possession}
                    onToggle={() =>
                      props.onUpdatePossession({ entree: p.entree.id, actif: !p.actif })
                    }
                    onOpen={() => setSelected(p.entree.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {current && (
        <EntryDetailDialog
          {...props}
          kind={kind}
          possession={current}
          onClose={() => setSelected(null)}
        />
      )}
      {adding && <AddEntryDialog {...props} kind={kind} onClose={() => setAdding(false)} />}
    </>
  );
}

function EntryCard({
  possession: p,
  marks,
  canToggle,
  onToggle,
  onOpen,
}: {
  possession: PossessionEffective;
  marks: string[];
  canToggle: boolean;
  onToggle(): Promise<boolean>;
  onOpen(): void;
}) {
  const inactive = p.sorte.activable && !p.actif;
  return (
    <div
      className={cn(
        entryCard,
        entryCardOn,
        'h-full cursor-default justify-start gap-1',
        inactive && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            textAccent,
            'min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline',
            focus,
          )}
        >
          {p.entree.nom}
        </button>
        {marks.length > 0 && <Star aria-hidden className={cn(textAccent, 'h-3 w-3 shrink-0')} />}
        {p.sorte.rangs && p.rang > 1 && (
          <span className={cn(textMuted, 'shrink-0 font-mono text-xs')}>×{p.rang}</span>
        )}
        {p.sorte.activable && (
          <WriteButton
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-none transition-colors disabled:cursor-not-allowed',
              p.actif
                ? 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_14%,transparent)] text-[color:var(--fiche-texte)]'
                : 'border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte-secondaire)]',
              focus,
            )}
            disabled={!canToggle}
            label={`${p.entree.nom} : ${p.actif ? 'actif' : 'inactif'}`}
            onClick={onToggle}
          >
            {p.actif ? 'Actif' : 'Inactif'}
          </WriteButton>
        )}
      </div>
      {p.entree.description && (
        <p className={cn(textMuted, 'line-clamp-2 text-xs leading-snug')}>{p.entree.description}</p>
      )}
    </div>
  );
}

function EntryDetailDialog({
  system,
  sheet,
  readOnly,
  gm,
  themeVariables,
  kind,
  possession: p,
  onRefund,
  onRemovePossession,
  onClose,
}: Omit<EntryListProps, 'kind'> & {
  kind: Sorte;
  possession: PossessionEffective;
  onClose(): void;
}) {
  const state = sheet.etat;
  const entry = p.entree;
  const marks = marksOf(sheet, entry.id);
  const from = sourceNames(system, p.sources);
  const fields = kind.champs
    .map((c) => ({ c, v: readableField(sheet, entry, c) }))
    .filter(({ v }) => v !== '');
  const lines = journalLines(state, entry.id);
  const last = lines.at(-1);
  const lastLine = last !== undefined ? state.journal[last] : undefined;
  const lastError = last !== undefined ? refundError(system, state, last) : null;
  const removable =
    !readOnly && !lines.length && !!p.possession && (gm || freelyAddable(system, kind.id));

  return (
    <EntryDialog
      open
      onClose={onClose}
      title={entry.nom}
      description={kind.nom}
      themeVariables={themeVariables}
      badges={marks.map((m) => (
        <span key={m} className={accentChip}>
          <Star className="h-3 w-3" />
          {markName(m)}
        </span>
      ))}
      footer={
        <>
          {removable && (
            <WriteButton
              className={dangerButton}
              onClick={async () => {
                if (await onRemovePossession(entry.id)) onClose();
              }}
            >
              <Trash2 />
              Retirer
            </WriteButton>
          )}
          {!readOnly && lastLine && last !== undefined && (
            <WriteButton
              className={ghostButton}
              disabled={!!lastError}
              title={lastError ?? undefined}
              onClick={async () => {
                if (await onRefund(last)) onClose();
              }}
            >
              <Undo2 />
              Annuler l’achat (+{lastLine.cout} {currencyName(system, lastLine.monnaie)})
            </WriteButton>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            Fermer
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed">
        {entry.description ? (
          <p className="whitespace-pre-line">{entry.description}</p>
        ) : (
          <p className={textMuted}>Pas de description.</p>
        )}
        {kind.rangs && (
          <p>
            Rang : <strong>{p.rang}</strong>
          </p>
        )}
        {fields.map(({ c, v }) => (
          <p key={c.id}>
            {c.nom} : <strong className={text}>{v}</strong>
          </p>
        ))}
        {from.length > 0 && (
          <p className={cn(textMuted, 'text-xs')}>Obtenu par : {from.join(', ')}.</p>
        )}
      </div>
    </EntryDialog>
  );
}
