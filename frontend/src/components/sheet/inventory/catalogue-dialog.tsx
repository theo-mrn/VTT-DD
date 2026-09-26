'use client';

/**
 * Ajout depuis le catalogue du système : recherche, filtre par sorte, fiche
 * de l'entrée (champs et effets), puis achat par la bourse s'il existe un
 * achat pour cette sorte, ou ajout direct (butin, don du MJ).
 */
import { quantiteDe, type Entree, type ObjetAchetable, type Sorte } from '@vtt/rules';
import { ArrowLeft, Check, Coins, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatNumber, tagName } from '../format';
import { copiesOfKind, copyTarget } from '../possessions';
import {
  accentButton,
  chip,
  field,
  focus,
  secondaryButton,
  text,
  textAccent,
  textMuted,
} from '../styles';
import {
  describeEffect,
  entryPrice,
  fieldSummary,
  fieldValue,
  priceFields,
  readableField,
} from './model';
import { InventoryDialog, normalize, useInventory, useSending } from './ui';

/** Au-delà, on demande d'affiner la recherche plutôt que d'afficher tout le catalogue. */
const MAX_SHOWN = 240;

export function CatalogueDialog({
  onClose,
  initialKind,
}: {
  onClose(): void;
  initialKind?: string;
}) {
  const { system, kinds } = useInventory();
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>(initialKind ?? '');
  const [selected, setSelected] = useState<string | null>(null);

  const catalogue = useMemo(() => {
    const ids = new Set(kinds.map((k) => k.id));
    return [...system.entrees.values()]
      .filter((e) => ids.has(e.sorte))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [system, kinds]);

  const query = normalize(search.trim());
  const filtered = catalogue.filter(
    (e) =>
      (!kindFilter || e.sorte === kindFilter) &&
      (!query ||
        normalize(e.nom).includes(query) ||
        normalize(e.description ?? '').includes(query) ||
        e.etiquettes.some((t) => normalize(t).includes(query))),
  );
  const shown = filtered.slice(0, MAX_SHOWN);
  const selectedEntry = selected ? system.entrees.get(selected) : undefined;

  return (
    <InventoryDialog open onClose={onClose} title="Ajouter depuis le catalogue" size="xl">
      {selectedEntry ? (
        <EntryDetail entry={selectedEntry} onBack={() => setSelected(null)} onDone={onClose} />
      ) : (
        <>
          <div className="space-y-3">
            <div className="relative">
              <Search
                className={cn(textMuted, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un nom, une description, une étiquette…"
                aria-label="Rechercher dans le catalogue"
                className={cn(field, 'pl-9 text-base sm:text-sm')}
                autoFocus
              />
            </div>
            {kinds.length > 1 && (
              <KindFilter
                kinds={kinds}
                value={kindFilter}
                onChange={setKindFilter}
                counts={countByKind(catalogue)}
              />
            )}
          </div>

          {shown.length ? (
            <div className="space-y-6">
              {kinds
                .filter((k) => !kindFilter || k.id === kindFilter)
                .map((k) => {
                  const list = shown.filter((e) => e.sorte === k.id);
                  if (!list.length) return null;
                  return (
                    <section key={k.id}>
                      <div className="mb-2 flex items-center gap-3">
                        <h3
                          className={cn(textAccent, 'text-xs font-bold uppercase tracking-wider')}
                        >
                          {k.nomPluriel ?? k.nom}
                        </h3>
                        <span className="h-px flex-1 bg-[color:var(--fiche-bordure)]" />
                        <span className={chip}>{list.length}</span>
                      </div>
                      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {list.map((e) => (
                          <CatalogueCard
                            key={e.id}
                            entry={e}
                            kind={k}
                            onOpen={() => setSelected(e.id)}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              {filtered.length > MAX_SHOWN && (
                <p className={cn(textMuted, 'text-center text-xs')}>
                  {filtered.length - MAX_SHOWN} autres résultats : affinez la recherche.
                </p>
              )}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Search className={cn(textMuted, 'mx-auto mb-3 h-10 w-10 opacity-30')} />
              <p className={cn(text, 'font-medium')}>Aucun objet trouvé</p>
              <p className={cn(textMuted, 'mt-1 text-sm')}>
                Essayez un autre terme ou une autre sorte.
              </p>
            </div>
          )}
        </>
      )}
    </InventoryDialog>
  );
}

function countByKind(entries: Entree[]) {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.sorte, (m.get(e.sorte) ?? 0) + 1);
  return m;
}

/** Pastilles « Tout » et une par sorte. */
export function KindFilter({
  kinds,
  value,
  onChange,
  counts,
}: {
  kinds: Sorte[];
  value: string;
  onChange(v: string): void;
  counts?: Map<string, number>;
}) {
  const pill = (id: string, label: string, n?: number) => (
    <button
      key={id || 'tout'}
      type="button"
      aria-pressed={value === id}
      onClick={() => onChange(id)}
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        value === id
          ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)] text-zinc-950'
          : 'border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte-secondaire)] hover:border-[color:var(--fiche-accent)] hover:text-[color:var(--fiche-texte)]',
        focus,
      )}
    >
      {label}
      {n !== undefined && <span className="tabular-nums opacity-70">{n}</span>}
    </button>
  );
  const total = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : undefined;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par sorte">
      {pill('', 'Tout', total)}
      {kinds.map((k) => pill(k.id, k.nomPluriel ?? k.nom, counts?.get(k.id)))}
    </div>
  );
}

function CatalogueCard({ entry, kind, onOpen }: { entry: Entree; kind: Sorte; onOpen(): void }) {
  const { system, state, sheet } = useInventory();
  const p = sheet.possessions.get(entry.id);
  const owned = !!p;
  // Unités d'une sorte `quantites`, sinon nombre d'exemplaires
  const count = p ? (kind.quantites ? p.quantite : Math.max(1, p.exemplaires.length)) : 0;
  const price = entryPrice(system, entry, kind);
  const summary = fieldSummary(system, state.type, entry, kind);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'group relative flex h-full w-full flex-col gap-1 rounded-xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] p-3 text-left transition-colors hover:border-[color:var(--fiche-accent)]',
          focus,
        )}
      >
        <span className="flex items-start gap-2">
          <span
            className={cn(
              text,
              'line-clamp-1 flex-1 text-sm font-medium group-hover:text-[color:var(--fiche-accent)]',
            )}
          >
            {entry.nom}
          </span>
          {owned ? (
            <span className={cn(chip, textAccent)}>
              <Check className="h-3 w-3" />
              Possédé{count > 1 ? ` ×${count}` : ''}
            </span>
          ) : price !== undefined ? (
            <span className={cn(chip, 'tabular-nums')}>
              <Coins className="h-3 w-3" />
              {formatNumber(price)}
            </span>
          ) : null}
        </span>
        {summary.length > 0 && (
          <span className={cn(textAccent, 'font-mono text-[11px]')}>{summary.join(' · ')}</span>
        )}
        {entry.description && (
          <span className={cn(textMuted, 'line-clamp-2 text-xs leading-relaxed')}>
            {entry.description}
          </span>
        )}
      </button>
    </li>
  );
}

// ─── Fiche d'une entrée du catalogue ─────────────────────────────────────────

function EntryDetail({ entry, onBack, onDone }: { entry: Entree; onBack(): void; onDone(): void }) {
  const { system, state, sheet, purchases, readOnly, onUpdateItem, onBuy } = useInventory();
  const [sending, run] = useSending();
  const kind = system.sortes.get(entry.sorte)!;
  const prices = priceFields(system, kind.id);
  // Exemplaires explicites (une entrée obtenue par effet s'ajoute encore une fois)
  const copies = sheet.possessions.get(entry.id)?.exemplaires ?? [];
  const last = copies.at(-1);
  const owned = copies.length > 0;
  // Une unité de plus va sur le dernier exemplaire, comme le fait un achat
  const addUnit = kind.quantites ? last : undefined;
  const full = kind.maximum !== undefined && copiesOfKind(sheet, kind.id) >= kind.maximum;
  const addCopy = (!owned || kind.exemplaires) && !full;
  const found: ObjetAchetable | undefined = onBuy
    ? purchases.flatMap((a) => a.objets).find((o) => o.type === 'entree' && o.objet === entry.id)
    : undefined;
  // Achat d'une entrée déjà possédée : seulement s'il donne un exemplaire ou une unité
  const purchase =
    found && (!owned || found.mode === 'exemplaire' || found.mode === 'quantite')
      ? found
      : undefined;
  const currency = purchase ? (system.monnaies.get(purchase.monnaie)?.nom ?? purchase.monnaie) : '';
  const purchaseLabel =
    purchase?.mode === 'quantite'
      ? 'Acheter une unité'
      : purchase?.mode === 'exemplaire'
        ? 'Acheter un exemplaire'
        : 'Acheter';
  const units = copies.reduce((n, p) => n + quantiteDe(p), 0);
  const add = (update: Parameters<typeof onUpdateItem>[0]) =>
    run(async () => {
      const ok = await onUpdateItem(update);
      if (ok) onDone();
      return ok;
    });

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className={cn(
          textMuted,
          'flex items-center gap-1.5 rounded text-xs hover:underline',
          focus,
        )}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour au catalogue
      </button>

      <div className="space-y-1">
        <h3 className={cn(text, 'text-lg font-semibold')}>{entry.nom}</h3>
        <div className="flex flex-wrap gap-1.5">
          <span className={chip}>{kind.nom}</span>
          {entry.etiquettes.map((t) => (
            <span key={t} className={chip}>
              {tagName(t)}
            </span>
          ))}
        </div>
      </div>

      {entry.description && (
        <p className={cn(text, 'whitespace-pre-line text-sm leading-relaxed')}>
          {entry.description}
        </p>
      )}

      {kind.champs.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {kind.champs.map((c) => {
            const v = fieldValue(entry, c);
            if (v === undefined || v === '') return null;
            return (
              <div key={c.id} className="min-w-0">
                <dt className={cn(textMuted, 'text-xs')}>{c.nom}</dt>
                <dd className={cn(prices.has(c.id) ? textAccent : text, 'text-sm')}>
                  {readableField(system, state.type, c, v)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {entry.effets.length > 0 && (
        <section className="space-y-1">
          <h4 className={cn(textMuted, 'text-xs uppercase tracking-wide')}>Effets</h4>
          <ul className={cn(text, 'list-inside list-disc space-y-0.5 text-sm')}>
            {entry.effets.map((f, i) => (
              <li key={i}>{f.description ?? describeEffect(system, state.type, f)}</li>
            ))}
          </ul>
        </section>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--fiche-bordure)] pt-4">
          {owned && (
            <p className={cn(textMuted, 'w-full text-sm')}>
              Déjà dans l&apos;inventaire
              {kind.quantites
                ? ` : ${units} unité${units > 1 ? 's' : ''}`
                : copies.length > 1
                  ? ` : ${copies.length} exemplaires`
                  : ''}
              {!addUnit && !kind.exemplaires
                ? ` (${kind.nom.toLowerCase()} ne se possède qu’une fois).`
                : '.'}
            </p>
          )}
          {!addUnit && !addCopy && full && (
            <p className={cn(textMuted, 'w-full text-sm')}>
              Maximum de {kind.maximum} {(kind.nomPluriel ?? kind.nom).toLowerCase()} atteint.
            </p>
          )}
          {purchase && (addUnit || addCopy) && (
            <button
              type="button"
              className={accentButton}
              disabled={sending || !purchase.possible}
              title={
                purchase.possible ? undefined : purchase.blocages.map((b) => b.message).join(' ; ')
              }
              onClick={() =>
                run(async () => {
                  const ok = await onBuy!(purchase.achat, purchase.objet);
                  if (ok) onDone();
                  return ok;
                })
              }
            >
              <Coins />
              {purchaseLabel} · {formatNumber(purchase.cout)} {currency}
            </button>
          )}
          {addUnit && (
            <button
              type="button"
              className={purchase ? secondaryButton : accentButton}
              disabled={sending}
              onClick={() =>
                add({
                  ...copyTarget(entry.id, addUnit.exemplaire),
                  quantite: quantiteDe(addUnit) + 1,
                })
              }
            >
              <Plus />
              {purchase ? 'Une unité sans payer' : 'Ajouter une unité'}
            </button>
          )}
          {addCopy && (
            <button
              type="button"
              className={purchase || addUnit ? secondaryButton : accentButton}
              disabled={sending}
              onClick={() =>
                add(owned ? { entree: entry.id, nouveau: true } : { entree: entry.id })
              }
            >
              <Plus />
              {owned
                ? addUnit
                  ? 'Nouvel exemplaire séparé'
                  : purchase
                    ? 'Exemplaire sans payer'
                    : 'Ajouter un exemplaire'
                : purchase
                  ? 'Ajouter sans payer'
                  : 'Ajouter à l’inventaire'}
            </button>
          )}
          {purchase && !purchase.possible && (addUnit || addCopy) && (
            <p className="w-full text-xs text-red-300">
              {purchase.blocages.map((b) => b.message).join(' ; ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
