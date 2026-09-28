'use client';

/**
 * Onglet Marché : l'équipement du système (sortes déclarées), en tables denses avec
 * recherche, filtre par sorte et par catégorie, tri par nom ou prix, et le détail d'un objet.
 * À la table, « Ajouter » range l'objet dans l'inventaire du héros incarné.
 */
import type { Entree, Presentation, SystemeCharge } from '@vtt/rules';
import { Plus, SearchX, Store } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/select';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { EntryDetail } from '../catalogue/entry-detail';
import {
  buildMarket,
  priceLabel,
  visibleRows,
  type MarketRow,
  type MarketSection,
  type MarketSort,
} from '../model/market';
import { CatalogueText, Chips, Notice, SearchField, Toolbar } from '../parts';
import type { InventoryTarget } from './use-inventory-target';

const TOUT = '';

export function MarketTab({
  systeme,
  presentation,
  target,
}: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  /** Inventaire où ranger un objet (table, droit d'écriture) ; absent : catalogue seul. */
  target: InventoryTarget | null;
}) {
  const sections = useMemo(() => buildMarket(systeme, presentation), [systeme, presentation]);
  const textes = useMemo(() => {
    const ids = presentation?.references.marche?.textes ?? [];
    return systeme.source.textes.filter((t) => ids.includes(t.id));
  }, [systeme, presentation]);
  const [sorte, setSorte] = useState(TOUT);
  const [category, setCategory] = useState(TOUT);
  const [sort, setSort] = useState<MarketSort>('nom');
  const [query, setQuery] = useState('');
  const recherche = useDeferredValue(query);
  const [stack, setStack] = useState<string[]>([]);

  const choisie = sections.find((s) => s.sorte.id === sorte) ?? null;
  const visibles = useMemo(() => (choisie ? [choisie] : sections), [choisie, sections]);
  const tables = useMemo(
    () =>
      visibles.map((s) => ({
        section: s,
        rows: visibleRows(s, recherche, choisie ? category : TOUT, sort),
      })),
    [visibles, recherche, choisie, category, sort],
  );
  const total = tables.reduce((n, t) => n + t.rows.length, 0);
  const avecPrix = sections.some((s) => s.priceField);
  const ouvertes = stack
    .map((id) => systeme.entrees.get(id))
    .filter((e): e is Entree => e !== undefined);
  const courante = ouvertes.at(-1) ?? null;

  if (!sections.length)
    return (
      <Notice
        icon={Store}
        title="Aucun équipement"
        description="Ce système ne déclare pas d’équipement à vendre."
      />
    );

  return (
    <div>
      <Toolbar>
        <Chips
          label="Sortes d’équipement"
          value={sorte}
          onChange={(v) => {
            setSorte(v);
            setCategory(TOUT);
          }}
          options={[
            {
              value: TOUT,
              label: 'Tout',
              count: sections.reduce((n, s) => n + s.rows.length, 0),
            },
            ...sections.map((s) => ({ value: s.sorte.id, label: s.title, count: s.rows.length })),
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {choisie && choisie.categories.length > 1 && (
            <SelectField
              value={category}
              onValueChange={setCategory}
              aria-label={`Filtrer par ${choisie.categoryField?.nom.toLowerCase() ?? 'catégorie'}`}
              className="h-9 sm:w-48"
              options={[
                { valeur: TOUT, nom: 'Toutes les catégories' },
                ...choisie.categories.map((c) => ({ valeur: c, nom: c })),
              ]}
            />
          )}
          {avecPrix && (
            <SelectField
              value={sort}
              onValueChange={(v) => setSort(v as MarketSort)}
              aria-label="Trier"
              className="h-9 sm:w-44"
              options={[
                { valeur: 'nom', nom: 'Par nom' },
                { valeur: 'prix-croissant', nom: 'Prix croissant' },
                { valeur: 'prix-decroissant', nom: 'Prix décroissant' },
              ]}
            />
          )}
          <SearchField
            value={query}
            onChange={setQuery}
            label="Rechercher un objet"
            placeholder="Rechercher un objet…"
          />
        </div>
      </Toolbar>

      {target && (
        <p className="mb-3 text-xs text-muted-foreground">
          « Ajouter » range l’objet dans l’inventaire de{' '}
          <span className="font-medium text-foreground">{target.name}</span>. Aucune pièce n’est
          dépensée.
        </p>
      )}

      {total === 0 ? (
        <Notice
          icon={SearchX}
          title="Aucun résultat"
          description={recherche ? `Rien ne correspond à « ${recherche} ».` : undefined}
        />
      ) : (
        <div className="space-y-6">
          {tables.map(({ section, rows }) =>
            rows.length === 0 ? null : (
              <MarketTable
                key={section.sorte.id}
                section={section}
                rows={rows}
                titled={!choisie}
                target={target}
                onOpen={(id) => setStack([id])}
              />
            ),
          )}
        </div>
      )}

      {!choisie && !recherche && textes.length > 0 && (
        <div className="mt-8 space-y-4">
          {textes.map((t) => (
            <section
              key={t.id}
              aria-label={t.titre}
              className="rounded-2xl border border-border bg-card p-5 shadow-surface"
            >
              <h3 className="mb-2 text-[15px] font-semibold">{t.titre}</h3>
              <CatalogueText text={t.contenu} skipTitle className="sm:columns-2 sm:gap-8" />
            </section>
          ))}
        </div>
      )}

      <Dialog open={courante !== null} onOpenChange={(o) => !o && setStack([])}>
        <DialogContent className="gap-0 p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">{courante?.nom ?? 'Objet'}</DialogTitle>
          <DialogDescription className="sr-only">Caractéristiques de l’objet</DialogDescription>
          {courante && (
            <EntryDetail
              key={courante.id}
              systeme={systeme}
              presentation={presentation}
              entry={courante}
              trail={ouvertes.slice(0, -1)}
              onOpen={(id) => setStack((s) => [...s, id])}
              onBack={stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : undefined}
              actions={
                target && sections.some((s) => s.sorte.id === courante.sorte) ? (
                  <AddButton target={target} entry={courante} large />
                ) : undefined
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MarketTable({
  section,
  rows,
  titled,
  target,
  onOpen,
}: {
  section: MarketSection;
  rows: MarketRow[];
  titled: boolean;
  target: InventoryTarget | null;
  onOpen(id: string): void;
}) {
  const prix = priceLabel(section);
  return (
    <section aria-label={section.title}>
      {titled && (
        <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
          {section.title}
          <span className="font-normal normal-case">{rows.length}</span>
        </h3>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[32rem] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-[11px] uppercase tracking-wide text-subtle">
              <th scope="col" className="px-3 py-2 font-medium">
                Nom
              </th>
              {section.columns.map((c) => (
                <th key={c.id} scope="col" className="px-3 py-2 font-medium">
                  {c.name}
                </th>
              ))}
              {prix && (
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {prix}
                </th>
              )}
              {target && (
                <th scope="col" className="w-0 px-3 py-2">
                  <span className="sr-only">Ajouter</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr
                key={r.entry.id}
                onClick={() => onOpen(r.entry.id)}
                className="cursor-pointer transition-colors hover:bg-surface-2"
              >
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(r.entry.id);
                    }}
                    className="rounded text-left hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {r.entry.nom}
                  </button>
                  {r.category &&
                    !section.columns.some((c) => c.id === section.categoryField?.id) && (
                      <span className="ml-2 text-xs font-normal text-subtle">{r.category}</span>
                    )}
                </th>
                {r.cells.map((c, i) => (
                  <td
                    key={section.columns[i]?.id ?? i}
                    className={cn('px-3 py-2', c ? 'text-muted-foreground' : 'text-subtle')}
                  >
                    {c ?? '—'}
                  </td>
                ))}
                {prix && (
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-primary-strong">
                    {r.priceText ?? <span className="font-normal text-subtle">—</span>}
                  </td>
                )}
                {target && (
                  <td className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <AddButton target={target} entry={r.entry} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AddButton({
  target,
  entry,
  large = false,
}: {
  target: InventoryTarget;
  entry: Entree;
  large?: boolean;
}) {
  const [envoi, setEnvoi] = useState(false);
  const refus = target.blocked(entry);
  const bouton = (
    <Button
      variant={large ? 'default' : 'ghost'}
      size={large ? 'sm' : 'xs'}
      disabled={refus !== null || envoi}
      aria-label={large ? undefined : `Ajouter ${entry.nom} à l’inventaire de ${target.name}`}
      onClick={async () => {
        setEnvoi(true);
        try {
          await target.add(entry);
        } finally {
          setEnvoi(false);
        }
      }}
    >
      <Plus />
      {large ? `Ajouter à l’inventaire de ${target.name}` : 'Ajouter'}
    </Button>
  );
  if (!refus) return bouton;
  return (
    <Info texte={refus}>
      <span tabIndex={0} className="inline-flex">
        {bouton}
      </span>
    </Info>
  );
}
