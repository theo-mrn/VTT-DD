'use client';

/**
 * Catalogue de la marketplace : recherche, filtres (système, contenu, prix, avertissements),
 * tri, tuiles, pages. Les filtres vivent dans l'adresse (partageable, retour arrière).
 */
import { ListingKind, type CatalogSort } from '@vtt/contracts';
import {
  ArrowDownWideNarrow,
  Check,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  PackageSearch,
  Search,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Message } from '@/components/compte/elements';
import { EtatVide, Page } from '@/components/commun/page';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import {
  catalogQuery,
  DEFAULT_FILTERS,
  useCatalog,
  type CatalogFilters,
} from '@/lib/marketplace/api';
import { KIND_LABELS } from '@/lib/marketplace/format';
import { useSystemes } from '@/lib/systemes';
import { Chip, KIND_ICONS, MarketplaceTabs } from './elements';
import { ListingTile, ListingTileSkeleton } from './listing-tile';

const SORTS: Record<CatalogSort, string> = {
  popular: 'Populaires',
  recent: 'Récents',
  rating: 'Mieux notés',
  price_asc: 'Prix croissant',
  price_desc: 'Prix décroissant',
};

const SORT_TIPS: Record<CatalogSort, string> = {
  popular: 'Les plus obtenus',
  recent: 'Les derniers publiés',
  rating: 'Moyenne des avis, pondérée par leur nombre',
  price_asc: 'Du moins cher au plus cher',
  price_desc: 'Du plus cher au moins cher',
};

/** Filtres lus dans l'adresse (valeurs inconnues ignorées). */
function filtersFrom(params: URLSearchParams): CatalogFilters {
  const kind = ListingKind.safeParse(params.get('kind'));
  const sort = params.get('sort') as CatalogSort | null;
  const price = params.get('price');
  return {
    q: params.get('q') ?? '',
    system: params.get('system') ?? '',
    kind: kind.success ? kind.data : '',
    price: price === 'free' || price === 'paid' ? price : '',
    safe: params.get('safe') === '1',
    sort: sort && sort in SORTS ? sort : 'popular',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

export function CatalogPage() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => filtersFrom(new URLSearchParams(params.toString())), [params]);
  const [search, setSearch] = useState(filters.q);
  const deferred = useDeferredValue(search);
  const systems = useSystemes();

  const apply = (patch: Partial<CatalogFilters>) =>
    router.replace(`${path}${catalogQuery({ ...filters, page: 1, ...patch })}`, { scroll: false });

  // La saisie part dans l'adresse une fois l'utilisateur arrêté
  useEffect(() => {
    if (deferred.trim() === filters.q.trim()) return;
    const t = setTimeout(
      () =>
        router.replace(`${path}${catalogQuery({ ...filters, page: 1, q: deferred })}`, {
          scroll: false,
        }),
      300,
    );
    return () => clearTimeout(t);
  }, [deferred, filters, path, router]);

  const catalog = useCatalog(filters);
  const pages = catalog.data
    ? Math.max(1, Math.ceil(catalog.data.total / catalog.data.perPage))
    : 1;

  return (
    <Page large>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Marketplace</h1>
        <MarketplaceTabs />
      </header>

      <div className="mb-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:w-80">
            <InputGroup
              avant={<Search />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un pack, un créateur…"
              aria-label="Rechercher un pack"
              className="h-9"
            />
          </div>
          <SelectField
            value={filters.system}
            onValueChange={(system) => apply({ system })}
            options={[
              { valeur: '', nom: 'Tous les systèmes' },
              ...(systems.data ?? []).map((s) => ({ valeur: s.id, nom: s.nom })),
            ]}
            aria-label="Système de jeu"
            className="h-9 sm:w-56"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground sm:ml-auto">
                <ArrowDownWideNarrow aria-hidden />
                {SORTS[filters.sort]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {(Object.keys(SORTS) as CatalogSort[]).map((s) => (
                <DropdownMenuItem key={s} onSelect={() => apply({ sort: s })} title={SORT_TIPS[s]}>
                  <span className="flex-1">{SORTS[s]}</span>
                  {filters.sort === s && <Check className="text-primary" aria-hidden />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <Chip active={filters.kind === ''} onClick={() => apply({ kind: '' })}>
            Tout
          </Chip>
          {ListingKind.options.map((k) => {
            const Icon = KIND_ICONS[k];
            return (
              <Chip
                key={k}
                active={filters.kind === k}
                onClick={() => apply({ kind: filters.kind === k ? '' : k })}
              >
                <Icon aria-hidden />
                {KIND_LABELS[k]}
              </Chip>
            );
          })}
          <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
          <Chip
            active={filters.price === 'free'}
            onClick={() => apply({ price: filters.price === 'free' ? '' : 'free' })}
          >
            Gratuits
          </Chip>
          <Chip
            active={filters.price === 'paid'}
            onClick={() => apply({ price: filters.price === 'paid' ? '' : 'paid' })}
          >
            Payants
          </Chip>
          <Info texte="Masquer les packs avec un avertissement de contenu">
            <span>
              <Chip active={filters.safe} onClick={() => apply({ safe: !filters.safe })}>
                <EyeOff aria-hidden />
                Sans avertissement
              </Chip>
            </span>
          </Info>
        </div>
      </div>

      {catalog.isError && <Message>{messageErreur(catalog.error)}</Message>}

      {catalog.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <ListingTileSkeleton key={i} />
          ))}
        </div>
      )}

      {catalog.data && catalog.data.items.length === 0 && (
        <EtatVide
          icone={PackageSearch}
          titre="Aucun pack"
          action={
            JSON.stringify({ ...filters, page: 1 }) !== JSON.stringify(DEFAULT_FILTERS) ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  router.replace(path, { scroll: false });
                }}
              >
                Effacer les filtres
              </Button>
            ) : undefined
          }
        />
      )}

      {catalog.data && catalog.data.items.length > 0 && (
        <>
          <ul
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            aria-busy={catalog.isFetching}
          >
            {catalog.data.items.map((l) => (
              <li key={l.id}>
                <ListingTile listing={l} />
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Page précédente"
                disabled={filters.page <= 1}
                onClick={() => apply({ page: filters.page - 1 })}
              >
                <ChevronLeft />
              </Button>
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {filters.page} / {pages}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Page suivante"
                disabled={filters.page >= pages}
                onClick={() => apply({ page: filters.page + 1 })}
              >
                <ChevronRight />
              </Button>
            </nav>
          )}
        </>
      )}
    </Page>
  );
}
