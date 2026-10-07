'use client';

/**
 * Choix d'un objet du marché du système (docs/ressources.md, Marché) pour remplir un objet à
 * fouiller. Même catalogue que l'inventaire des fiches : les sortes, colonnes, catégories et
 * prix viennent de la présentation du système (`references.marche`), jamais de clés en dur.
 * Un clic ajoute une unité ; la liste reste ouverte pour en ajouter d'autres.
 */
import { translate } from '@/i18n/runtime';
import type { Entree } from '@vtt/rules';
import { Plus, Store } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { buildMarket, priceLabel } from '@/components/resources/model/market';
import { normaliser } from '@/components/resources/model/catalogue';
import { SearchField } from '@/components/resources/parts';
import { useTable } from '@/components/table/contexte';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignSystem } from '@/lib/campaign-settings';

/** Nombre de lignes affichées à la fois (affiner par la recherche au-delà). */
const SHOWN_MAX = 60;

/** Entrées du catalogue du système de la campagne (description d'un contenu référencé). */
export function useCatalogueEntries(): ReadonlyMap<string, Entree> | null {
  const { campagne } = useTable();
  const systeme = useCampaignSystem(campagne.system, campagne.id);
  return systeme.data?.systeme.entrees ?? null;
}

interface PickerRow {
  entry: Entree;
  text: string;
  meta: string;
}

export function CataloguePicker({ onPick }: Readonly<{ onPick(entry: Entree): void }>) {
  const { campagne } = useTable();
  const systeme = useCampaignSystem(campagne.system, campagne.id);
  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);

  const rows = useMemo((): PickerRow[] => {
    if (!systeme.data) return [];
    const sections = buildMarket(systeme.data.systeme, systeme.data.presentation);
    return sections
      .flatMap((section) => {
        const price = priceLabel(section);
        return section.rows.map((r) => ({
          entry: r.entry,
          text: r.text,
          meta: [
            section.title,
            r.category,
            r.priceText && price ? `${r.priceText} (${price.toLowerCase()})` : r.priceText,
          ]
            .filter(Boolean)
            .join(' · '),
        }));
      })
      .sort((a, b) => a.entry.nom.localeCompare(b.entry.nom, 'fr'));
  }, [systeme.data]);

  const visible = useMemo(() => {
    const q = normaliser(search);
    return (q ? rows.filter((r) => r.text.includes(q)) : rows).slice(0, SHOWN_MAX);
  }, [rows, search]);

  if (systeme.isPending)
    return (
      <div className="space-y-1.5 p-1" aria-label={translate('map.objects.market.loading')}>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    );
  if (systeme.isError || !rows.length)
    return (
      <p className="flex items-start gap-2 p-2 text-xs text-muted-foreground">
        <Store className="mt-0.5 size-4 shrink-0" aria-hidden />
        {systeme.isError
          ? translate('map.objects.market.failed')
          : translate('map.objects.market.none')}
      </p>
    );

  return (
    <div className="space-y-2">
      <SearchField
        value={query}
        onChange={setQuery}
        label={translate('map.objects.market.search')}
        placeholder={translate('map.objects.market.placeholder')}
        className="sm:w-full"
      />
      <ul className="max-h-64 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
        {visible.map((r) => (
          <li key={r.entry.id}>
            <button
              type="button"
              onClick={() => onPick(r.entry)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-foreground">{r.entry.nom}</span>
                {r.meta && (
                  <span className="block truncate text-[11px] text-muted-foreground">{r.meta}</span>
                )}
              </span>
              <Plus className="size-4 shrink-0 text-subtle" aria-hidden />
              <span className="sr-only">{translate('map.objects.contents.addShort')}</span>
            </button>
          </li>
        ))}
        {!visible.length && (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">
            {translate('map.objects.library.noMatch')}
          </li>
        )}
      </ul>
      {rows.length > SHOWN_MAX && visible.length === SHOWN_MAX && (
        <p className="px-1 text-[11px] text-subtle">
          Les {SHOWN_MAX} premiers : précisez la recherche pour les autres.
        </p>
      )}
    </div>
  );
}
