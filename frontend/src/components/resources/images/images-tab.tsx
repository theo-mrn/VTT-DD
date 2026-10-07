'use client';

/**
 * Onglet Images : les collections déclarées par le système (personnages, cartes, photos),
 * prises dans la bibliothèque d'actifs publique. Filtre par catégorie, pages de 60, aperçu en
 * grand (flèches du clavier), ouverture de l'original et copie du lien.
 */
import { useTranslations } from 'next-intl';
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

export function ImagesTab({ presentation }: Readonly<{ presentation: Presentation | null }>) {
  const t = useTranslations();
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
  let etat: 'chargement' | 'erreur' | 'vide' | 'liste' = 'liste';
  if (assets.isPending) etat = 'chargement';
  else if (assets.isError) etat = 'erreur';
  else if (filtrees.length === 0) etat = 'vide';

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
      toast.success(t('resources.images.copied'));
    } catch {
      toast.error(t('resources.images.copyFailed'));
    }
  };

  return (
    <div>
      <Toolbar>
        {collections.length > 1 ? (
          <Chips
            label={t('resources.images.collections')}
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
            aria-label={t('map.tokens.library.filterCategory')}
            className="h-9 sm:w-56"
            options={[
              { valeur: TOUTES, nom: t('map.tokens.library.allCategories') },
              ...categories.map((c) => ({ valeur: c, nom: c })),
            ]}
          />
        )}
      </Toolbar>

      {etat === 'chargement' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-busy="true">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      )}
      {etat === 'erreur' && (
        <Notice
          tone="error"
          icon={AlertTriangle}
          title={t('resources.images.unavailable')}
          description={t('resources.images.loadFailed')}
          action={
            <Button variant="secondary" size="sm" onClick={() => void assets.refetch()}>
              {t('common.actions.retry')}
            </Button>
          }
        />
      )}
      {etat === 'vide' && <Notice icon={ImageIcon} title={t('resources.images.none')} />}
      {etat === 'liste' && (
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
                    width={320}
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
              aria-label={t('resources.images.pages')}
              className="mt-5 flex items-center justify-center gap-3 text-[13px]"
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft />
                {t('resources.images.previous')}
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
                {t('resources.images.next')}
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
                      aria-label={t('resources.images.previousImage')}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      onClick={() => deplacer(1)}
                      aria-label={t('resources.images.nextImage')}
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
                  {t('resources.images.copyLink')}
                </Button>
                <Button size="sm" asChild>
                  <a href={courante.url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    {t('resources.images.openOriginal')}
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
