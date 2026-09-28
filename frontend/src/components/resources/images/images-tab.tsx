'use client';

/**
 * Onglet Images : les collections déclarées par le système (personnages, cartes, photos),
 * prises dans la bibliothèque d'actifs publique. Filtre par catégorie, pages de 60, aperçu en
 * grand (flèches du clavier), ouverture de l'original et copie du lien.
 */
import type { Presentation } from '@vtt/rules';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  ImageIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssets } from '@/lib/assets';
import { categoriesOf, collectionImages } from '../model/images';
import { Chips, Notice, Thumb, Toolbar } from '../parts';

const PAGE = 60;
const TOUTES = '';

export function ImagesTab({ presentation }: { presentation: Presentation | null }) {
  const collections = presentation?.references.images?.collections ?? [];
  const assets = useAssets();
  const [index, setIndex] = useState(0);
  const [category, setCategory] = useState(TOUTES);
  const [page, setPage] = useState(0);
  const [ouverte, setOuverte] = useState<number | null>(null);
  const collection = collections[Math.min(index, collections.length - 1)];

  const images = useMemo(
    () => (assets.data && collection ? collectionImages(assets.data, collection) : []),
    [assets.data, collection],
  );
  const counts = useMemo(
    () => (assets.data ? collections.map((c) => collectionImages(assets.data, c).length) : []),
    [assets.data, collections],
  );
  const categories = useMemo(() => categoriesOf(images), [images]);
  const filtrees = useMemo(
    () => (category ? images.filter((i) => i.category === category) : images),
    [images, category],
  );
  const pages = Math.max(1, Math.ceil(filtrees.length / PAGE));
  const visibles = filtrees.slice(page * PAGE, (page + 1) * PAGE);
  const courante = ouverte !== null ? filtrees[ouverte] : undefined;

  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [page, pages]);

  if (!collection) return null;

  const deplacer = (pas: number) =>
    setOuverte((i) => (i === null ? i : (i + pas + filtrees.length) % filtrees.length));
  const clavier = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      deplacer(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      deplacer(-1);
    }
  };
  const copier = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Lien copié');
    } catch {
      toast.error('Copie impossible');
    }
  };

  return (
    <div>
      <Toolbar>
        {collections.length > 1 ? (
          <Chips
            label="Collections"
            value={String(index)}
            onChange={(v) => {
              setIndex(Number(v));
              setCategory(TOUTES);
              setPage(0);
            }}
            options={collections.map((c, i) => ({
              value: String(i),
              label: c.titre,
              ...(assets.data ? { count: counts[i] } : {}),
            }))}
          />
        ) : (
          <span />
        )}
        {categories.length > 1 && (
          <SelectField
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              setPage(0);
            }}
            aria-label="Filtrer par catégorie"
            className="h-9 sm:w-56"
            options={[
              { valeur: TOUTES, nom: 'Toutes les catégories' },
              ...categories.map((c) => ({ valeur: c, nom: c })),
            ]}
          />
        )}
      </Toolbar>

      {assets.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-busy="true">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : assets.isError ? (
        <Notice
          tone="error"
          icon={AlertTriangle}
          title="Bibliothèque indisponible"
          description="Les images n’ont pas pu être chargées."
          action={
            <Button variant="secondary" size="sm" onClick={() => void assets.refetch()}>
              Réessayer
            </Button>
          }
        />
      ) : filtrees.length === 0 ? (
        <Notice icon={ImageIcon} title="Aucune image" />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visibles.map((img, i) => (
              <li key={img.url}>
                <button
                  type="button"
                  onClick={() => setOuverte(page * PAGE + i)}
                  className="group relative block aspect-square w-full overflow-hidden rounded-xl border border-border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <ImageIcon
                    className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-subtle/50"
                    aria-hidden
                  />
                  <Thumb
                    src={img.url}
                    alt={img.name}
                    className="relative size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    fallback={null}
                  />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background/90 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {img.category}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav
              aria-label="Pages"
              className="mt-5 flex items-center justify-center gap-3 text-[13px]"
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
                Précédente
              </Button>
              <span className="tabular-nums text-muted-foreground">
                {page + 1} / {pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivante
                <ChevronRight />
              </Button>
            </nav>
          )}
        </>
      )}

      <Dialog open={courante !== undefined} onOpenChange={(o) => !o && setOuverte(null)}>
        <DialogContent className="gap-0 p-0 sm:max-w-4xl" onKeyDown={clavier}>
          {courante && (
            <>
              <div className="relative grid place-items-center bg-black/60">
                <Thumb
                  key={courante.url}
                  src={courante.url}
                  alt={courante.name}
                  className="max-h-[70dvh] w-auto max-w-full object-contain"
                  fallback={null}
                />
                {filtrees.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      onClick={() => deplacer(-1)}
                      aria-label="Image précédente"
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      onClick={() => deplacer(1)}
                      aria-label="Image suivante"
                    >
                      <ChevronRight />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-[15px]">{courante.name}</DialogTitle>
                  <DialogDescription className="text-xs">
                    {collection.titre} · {courante.category} · {(ouverte ?? 0) + 1} sur{' '}
                    {filtrees.length}
                  </DialogDescription>
                </div>
                <Button variant="secondary" size="sm" onClick={() => void copier(courante.url)}>
                  <Copy />
                  Copier le lien
                </Button>
                <Button size="sm" asChild>
                  <a href={courante.url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Ouvrir l’original
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
