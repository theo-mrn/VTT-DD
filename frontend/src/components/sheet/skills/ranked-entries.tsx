'use client';

/**
 * Entrées à rangs d'une sorte (compétences…), reprise de la fiche
 * « Compétences » de l'ancienne app : recherche, onglets par groupe, grille de
 * cartes (pastille, rang / max, marques, champ attribut lié), dialogue de
 * détail avec achat du rang suivant, remboursement et outils MJ.
 *
 * Rien n'est propre à un jeu : la sorte, son rang maximal, ses champs, les
 * marques et les coûts viennent du système et des achats possibles.
 */
import type { Entree, Fiche, ObjetAchetable, Sorte } from '@vtt/rules';
import { Plus, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { SheetBindings } from './common/bindings';
import { GroupTabs, SearchField } from './common/controls';
import {
  balances,
  entriesOfKind,
  formatValue,
  groupFieldOf,
  itemFor,
  kindIsPurchasable,
  linkedAttributeField,
  marksOf,
  markName,
  maxRankOf,
  normalize,
  readableField,
} from './common/helpers';
import {
  autoGrid,
  balanceBadge,
  entryCard,
  entryCardOff,
  entryCardOn,
  iconButton,
  panel,
  text,
  textAccent,
  textMuted,
  titleFont,
} from './common/styles';
import { AddEntryDialog } from './add-entry-dialog';
import { RankedEntryDialog } from './ranked-entry-dialog';

export interface RankedEntriesProps extends SheetBindings {
  /** Identifiant de la sorte à rangs affichée. */
  kind: string;
  /** Titre du bloc (celui du widget de la présentation). */
  title: string;
  /** Champ de regroupement en onglets (`groupeChamp` du widget) ; sinon un champ texte `groupe`. */
  groupField?: string;
  className?: string;
}

/** Données d'une carte, recalculées à chaque rendu depuis la fiche. */
export interface RankedCard {
  entry: Entree;
  /** Rang total (achetés + gratuits). */
  rank: number;
  /** Rangs enregistrés dans l'état (achetés ou fixés par le MJ). */
  bought: number;
  max?: number;
  marks: string[];
  /** Achat du rang suivant, s'il existe (possible ou bloqué). */
  next?: ObjetAchetable;
  /** Champ attribut lié : nom de l'attribut et valeur calculée. */
  linked?: { field: string; name: string; value: string };
  group: string;
}

export function buildCard(
  sheet: Fiche,
  kind: Sorte,
  entry: Entree,
  purchases: SheetBindings['purchases'],
  groupField?: string,
): RankedCard {
  const p = sheet.possessions.get(entry.id);
  const linkedField = linkedAttributeField(kind);
  const attributeKey = linkedField ? entry.champs[linkedField.id] : undefined;
  const attribute =
    linkedField && typeof attributeKey === 'string'
      ? sheet.systeme.entites.get(linkedField.entite)?.attributs.get(attributeKey)
      : undefined;
  const groupDef = groupFieldOf(kind, groupField);
  return {
    entry,
    rank: p?.rang ?? 0,
    bought: p?.achete ?? 0,
    max: maxRankOf(sheet, kind),
    marks: marksOf(sheet, entry.id),
    next: itemFor(purchases, 'rang', entry.id),
    linked:
      linkedField && attribute
        ? {
            field: linkedField.nom,
            name: attribute.nom,
            value:
              linkedField.entite === sheet.etat.type
                ? formatValue(sheet.valeur(attribute.cle))
                : '',
          }
        : undefined,
    group: groupDef ? readableField(sheet, entry, groupDef) : '',
  };
}

export function RankedEntries(props: RankedEntriesProps) {
  const {
    system,
    sheet,
    purchases,
    readOnly,
    gm,
    kind: kindId,
    title,
    groupField,
    className,
  } = props;
  const kind = system.sortes.get(kindId);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Sorte dont un achat vise les rangs : tout le catalogue (rang 0 compris) ; sinon les possédées
  const listAll = !!kind && kindIsPurchasable(system, kind.id, 'rang');
  const entries = useMemo(() => {
    if (!kind) return [];
    if (listAll) return entriesOfKind(system, kind.id);
    return [...sheet.possessions.values()]
      .filter((p) => p.sorte.id === kind.id)
      .map((p) => p.entree);
  }, [system, sheet, kind, listAll]);

  if (!kind || !kind.pour.includes(sheet.etat.type)) return null;

  const cards = entries.map((e) => buildCard(sheet, kind, e, purchases, groupField));
  const groups = [...new Set(cards.map((c) => c.group).filter(Boolean))];
  const query = normalize(search.trim());
  const shown = cards
    .filter((c) => group === null || c.group === group)
    .filter((c) => !query || normalize(c.entry.nom).includes(query));
  const wallet = balances(
    system,
    purchases,
    (p) => p.achat.obtient.type === 'rang' && p.achat.obtient.sorte === kind.id,
  );
  const selectedCard = selected ? cards.find((c) => c.entry.id === selected) : undefined;
  const canAddFreely = gm && !listAll;

  return (
    <>
      <section aria-label={title} className={cn(panel, 'h-full w-full', className)}>
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[color:var(--fiche-bordure)] p-3">
          <div className="flex min-w-0 flex-1 basis-[240px] items-center gap-3">
            <h2 className={cn(titleFont, textAccent, 'shrink-0 text-lg font-bold')}>{title}</h2>
            <SearchField value={search} onChange={setSearch} className="max-w-64 flex-grow" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <GroupTabs
              groups={groups}
              value={group}
              onChange={setGroup}
              label={`Groupes : ${title}`}
            />
            {wallet.map((w) => (
              <span key={w.id} className={balanceBadge} title={`${w.name} disponible`}>
                {w.balance} {w.name}
              </span>
            ))}
            {canAddFreely && (
              <button
                type="button"
                className={iconButton}
                onClick={() => setAdding(true)}
                title={`Ajouter : ${kind.nomPluriel ?? kind.nom} (MJ)`}
                aria-label={`Ajouter : ${kind.nomPluriel ?? kind.nom}`}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {shown.length === 0 ? (
            <p className={cn(textMuted, 'py-12 text-center text-sm')}>
              {cards.length ? 'Aucun résultat' : 'Rien ici pour l’instant.'}
            </p>
          ) : (
            <ul className={autoGrid}>
              {shown.map((c) => (
                <li key={c.entry.id}>
                  <RankedCardView card={c} onOpen={() => setSelected(c.entry.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {selectedCard && (
        <RankedEntryDialog
          {...props}
          kind={kind}
          card={selectedCard}
          canEdit={!readOnly}
          onClose={() => setSelected(null)}
        />
      )}
      {adding && (
        <AddEntryDialog {...props} kind={kind} freeOnly onClose={() => setAdding(false)} />
      )}
    </>
  );
}

function RankedCardView({ card, onOpen }: { card: RankedCard; onOpen(): void }) {
  const on = card.rank > 0;
  const label = `${card.entry.nom}, rang ${card.rank}${card.max ? ` sur ${card.max}` : ''}${
    card.marks.length ? `, ${card.marks.map(markName).join(', ')}` : ''
  }`;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={cn(entryCard, 'w-full', on ? entryCardOn : entryCardOff)}
    >
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            on
              ? 'bg-[color:var(--fiche-accent)] shadow-[0_0_4px_color-mix(in_srgb,var(--fiche-accent)_60%,transparent)]'
              : 'bg-[color:var(--fiche-bordure)]',
          )}
        />
        <span className={cn('flex-1 truncate text-sm font-semibold', on ? textAccent : text)}>
          {card.entry.nom}
        </span>
        {card.marks.length > 0 && (
          <Star aria-hidden className={cn(textAccent, 'h-3 w-3 shrink-0')} />
        )}
        <span className={cn(textMuted, 'shrink-0 font-mono text-xs')}>
          {card.rank}
          {card.max ? `/${card.max}` : ''}
        </span>
      </span>
      {card.linked && (
        <span className={cn(textMuted, 'ml-4 mt-1 text-[11px]')}>
          {card.linked.name} {card.linked.value}
        </span>
      )}
    </button>
  );
}
