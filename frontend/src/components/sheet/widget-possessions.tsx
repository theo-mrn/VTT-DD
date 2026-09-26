'use client';

import type { Entree, ObjetAchetable, PossessionJson, Sorte, Widget } from '@vtt/rules';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { Block, SheetDialog, normalize, SheetEmpty } from './elements';
import { tagName } from './format';
import {
  nextRankPurchase,
  readableField,
  itemsOfKind,
  maxRank,
  purchasableKind,
  freeKind,
  fieldValue,
} from './possessions';
import { PurchaseButton } from './purchase-button';
import { PossessionDialog } from './possession-dialog';
import {
  iconButton,
  secondaryButton,
  field,
  focus,
  chip,
  text,
  textAccent,
  textMuted,
} from './styles';

type PossessionsWidget = Extract<Widget, { type: 'possessions' }>;

/** Au-delà de ce nombre d'entrées au catalogue, seules les possessions sont listées par défaut. */
const SHOW_ALL_UP_TO = 40;

interface Row {
  entry: Entree;
  possession?: PossessionJson;
}

export function PossessionsWidget({ widget }: { widget: PossessionsWidget }) {
  const { system, state, json, purchases, readOnly } = useSheet();
  const kind = system.sortes.get(widget.sorte);
  const [openKind, setOpenKind] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Sorte à rangs achetables : on peut aussi lister tout le catalogue (rang 0)
  const catalogue = useMemo(
    () => [...system.entrees.values()].filter((e) => e.sorte === widget.sorte),
    [system, widget.sorte],
  );
  const hasPurchasableRanks = !!kind?.rangs && purchasableKind(system, widget.sorte);
  const [all, setAll] = useState(hasPurchasableRanks && catalogue.length <= SHOW_ALL_UP_TO);

  if (!kind) return null;

  const owned = json.possessions.filter((p) => p.sorte === widget.sorte);
  const lines: Row[] = owned.flatMap((p) => {
    const e = system.entrees.get(p.entree);
    return e ? [{ entry: e, possession: p }] : [];
  });
  if (all && hasPurchasableRanks) {
    const views = new Set(owned.map((p) => p.entree));
    for (const e of catalogue) if (!views.has(e.id)) lines.push({ entry: e });
  }
  lines.sort((a, b) => a.entry.nom.localeCompare(b.entry.nom, 'fr'));

  const groups = groupBy(lines, (l) =>
    widget.groupeChamp ? groupLabel(l.entry, kind, widget.groupeChamp) : '',
  );
  const full = kind.maximum !== undefined && owned.length >= kind.maximum;
  const canAdd =
    !readOnly &&
    !full &&
    (purchasableKind(system, kind.id)
      ? itemsOfKind(system, purchases, kind.id).some((o) => o.actuel === 0)
      : freeKind(system, kind.id));

  function groupLabel(e: Entree, s: Sorte, fieldId: string) {
    const c = s.champs.find((x) => x.id === fieldId);
    if (!c) return '';
    return readableField(system, json.type, c, fieldValue(state, e, c));
  }

  return (
    <Block
      title={widget.titre}
      action={
        <div className="flex items-center gap-2">
          {hasPurchasableRanks && (
            <button
              type="button"
              className={cn(secondaryButton, 'min-h-8 px-2.5 text-xs')}
              aria-pressed={all}
              onClick={() => setAll((t) => !t)}
            >
              {all ? 'Possédées seulement' : 'Tout le catalogue'}
            </button>
          )}
          {canAdd && (
            <button
              type="button"
              className={cn(secondaryButton, 'min-h-8 px-2.5 text-xs')}
              onClick={() => setAdding(true)}
            >
              <Plus />
              Ajouter
            </button>
          )}
        </div>
      }
    >
      {lines.length ? (
        <div className="space-y-3">
          {groups.map(([group, list]) => (
            <div key={group}>
              {group && (
                <h3 className={cn(textMuted, 'mb-1 text-xs uppercase tracking-wide')}>{group}</h3>
              )}
              <ul className="divide-y divide-[color:var(--fiche-bordure)]">
                {list.map((l) => (
                  <PossessionRow
                    key={l.entry.id}
                    line={l}
                    kind={kind}
                    groupField={widget.groupeChamp}
                    onOpen={() => setOpenKind(l.entry.id)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <SheetEmpty>Rien ici pour l&apos;instant.</SheetEmpty>
      )}

      {openKind && (
        <PossessionDialog entry={openKind} kind={kind} onClose={() => setOpenKind(null)} />
      )}
      {adding && <AddDialog kind={kind} onClose={() => setAdding(false)} />}
    </Block>
  );
}

function groupBy<T>(list: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
}

// ─── Ligne ───────────────────────────────────────────────────────────────────

function PossessionRow({
  line,
  kind,
  groupField,
  onOpen,
}: {
  line: Row;
  kind: Sorte;
  groupField?: string;
  onOpen(): void;
}) {
  const { system, sheet, state, json, purchases, readOnly, buy, updatePossession } = useSheet();
  const { entry, possession: p } = line;
  const max = maxRank(sheet, kind);
  const next = nextRankPurchase(purchases, entry.id);
  const currency = next ? system.monnaies.get(next.monnaie) : undefined;
  const explicit = state.possessions.some((x) => x.entree === entry.id);

  // Résumé : quelques champs renseignés de l'entrée
  const summary = kind.champs
    .filter((c) => c.id !== groupField && c.type !== 'entrees' && c.type !== 'booleen')
    .map((c) => ({ c, v: fieldValue(state, entry, c) }))
    .filter(({ v }) => v !== undefined && v !== '' && v !== 0)
    .slice(0, 3);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
      <button
        type="button"
        onClick={onOpen}
        className={cn('group flex min-w-0 flex-1 items-center gap-2 rounded text-left', focus)}
      >
        <span className="min-w-0">
          <span
            className={cn(
              'block truncate text-sm group-hover:underline',
              p?.effective ? text : textMuted,
            )}
          >
            {entry.nom}
          </span>
          {summary.length > 0 && (
            <span className={cn(textMuted, 'block truncate text-xs')}>
              {summary
                .map(({ c, v }) => `${c.nom} : ${readableField(system, json.type, c, v)}`)
                .join(' · ')}
            </span>
          )}
        </span>
        <ChevronRight
          className={cn(textMuted, 'h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100')}
        />
      </button>

      {p?.marques.length ? (
        <span className="flex flex-wrap gap-1">
          {p.marques.map((m) => (
            <span key={m} className={cn(chip, textAccent)}>
              {tagName(m)}
            </span>
          ))}
        </span>
      ) : null}

      {kind.rangs && <Ranks rank={p?.rang ?? 0} max={max} bought={p?.achete ?? 0} />}

      {!readOnly && next && (
        <PurchaseButton
          item={next}
          label={`Acheter le rang ${next.cible} de ${entry.nom}`}
          currency={currency?.nom ?? next.monnaie}
          onBuy={() => buy(next.achat, next.objet)}
        />
      )}

      {kind.activable && p && (
        <button
          type="button"
          role="switch"
          aria-checked={p.actif}
          aria-label={`${entry.nom} : ${p.actif ? 'actif' : 'inactif'}`}
          disabled={readOnly || !explicit}
          onClick={() => void updatePossession({ entree: entry.id, actif: !p.actif })}
          className={cn(
            chip,
            'min-h-8 px-2.5 text-xs disabled:cursor-not-allowed',
            p.actif &&
              'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_14%,transparent)] text-[color:var(--fiche-texte)]',
            focus,
          )}
        >
          {p.actif ? 'Actif' : 'Inactif'}
        </button>
      )}
    </li>
  );
}

function Ranks({ rank, max, bought }: { rank: number; max?: number; bought: number }) {
  const label = `Rang ${rank}${max ? ` sur ${max}` : ''}${rank > bought ? ` (dont ${rank - bought} gratuit${rank - bought > 1 ? 's' : ''})` : ''}`;
  if (!max || max > 10)
    return (
      <span className={cn(text, 'text-sm tabular-nums')} title={label}>
        {rank}
        {max ? <span className={textMuted}> / {max}</span> : null}
      </span>
    );
  return (
    <span className="flex items-center gap-1" role="img" aria-label={label} title={label}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 w-2.5 rounded-full border',
            i < rank
              ? i < bought
                ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)]'
                : 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_45%,transparent)]'
              : 'border-[color:var(--fiche-bordure)]',
          )}
        />
      ))}
    </span>
  );
}

// ─── Ajout ───────────────────────────────────────────────────────────────────

function AddDialog({ kind, onClose }: { kind: Sorte; onClose(): void }) {
  const { system, json, purchases, buy, updatePossession } = useSheet();
  const [search, setSearch] = useState('');
  const purchasable = purchasableKind(system, kind.id);
  const owned = new Set(json.possessions.map((p) => p.entree));
  const filter = (name: string) => normalize(name).includes(normalize(search.trim()));

  // Sorte achetée : les objets des achats (avec coût et blocages) ; sinon le catalogue, librement
  const items: ObjetAchetable[] = purchasable
    ? itemsOfKind(system, purchases, kind.id).filter((o) => o.actuel === 0 && filter(o.nom))
    : [];
  const free = purchasable
    ? []
    : [...system.entrees.values()].filter(
        (e) => e.sorte === kind.id && !owned.has(e.id) && filter(e.nom),
      );
  items.sort((a, b) => Number(b.possible) - Number(a.possible) || a.nom.localeCompare(b.nom, 'fr'));
  free.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  return (
    <SheetDialog open onClose={onClose} title={`Ajouter : ${kind.nomPluriel ?? kind.nom}`}>
      <div className="relative">
        <Search className={cn(textMuted, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          aria-label="Rechercher"
          className={cn(field, 'pl-9')}
          autoFocus
        />
      </div>
      <ul className="max-h-[50vh] divide-y divide-[color:var(--fiche-bordure)] overflow-y-auto">
        {items.map((o) => {
          const currency = system.monnaies.get(o.monnaie)?.nom ?? o.monnaie;
          return (
            <li key={`${o.achat}:${o.objet}`} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className={cn(text, 'block truncate text-sm')}>{o.nom}</span>
                <span className={cn(textMuted, 'block text-xs')}>
                  {o.possible
                    ? `${o.cout} ${currency}`
                    : o.blocages.map((b) => b.message).join(' ; ')}
                </span>
              </span>
              <PurchaseButton
                item={o}
                label={`Acheter ${o.nom}`}
                currency={currency}
                buttonText={String(o.cout)}
                onBuy={async () => {
                  const ok = await buy(o.achat, o.objet);
                  if (ok) onClose();
                  return ok;
                }}
              />
            </li>
          );
        })}
        {free.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className={cn(text, 'block truncate text-sm')}>{e.nom}</span>
              {e.description && (
                <span className={cn(textMuted, 'line-clamp-1 block text-xs')}>{e.description}</span>
              )}
            </span>
            <button
              type="button"
              className={cn(iconButton, 'w-auto gap-1 px-2 text-xs')}
              onClick={async () => {
                const ok = await updatePossession({
                  entree: e.id,
                  ...(kind.rangs ? { rang: 1 } : {}),
                });
                if (ok) onClose();
              }}
              aria-label={`Ajouter ${e.nom}`}
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </li>
        ))}
      </ul>
      {!items.length && !free.length && <SheetEmpty>Rien à ajouter.</SheetEmpty>}
    </SheetDialog>
  );
}
