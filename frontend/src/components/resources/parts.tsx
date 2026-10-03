'use client';

/**
 * Éléments communs aux onglets des ressources : recherche, filtres en pastilles, états
 * vides, texte du catalogue (markdown léger), mise en page liste et détail.
 */
import { Search, X, type LucideIcon } from 'lucide-react';
import { createContext, Fragment, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { RichText } from '@/components/fiche/blocks/skills/rich-text';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { InputGroup } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { surCdn, vignette } from '@/lib/assets';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { cn } from '@/lib/utils';

// ─── Mise en page ────────────────────────────────────────────────────────────

/** Où vivent les ressources : page de l'app (défile avec la fenêtre) ou panneau de la table. */
export type ResourcesVariant = 'page' | 'panel';

const VariantContext = createContext<ResourcesVariant>('page');
export const ResourcesVariantProvider = VariantContext.Provider;
export const useResourcesVariant = () => useContext(VariantContext);

/** Colonne collante (détail) : sous la barre haute de l'app, ou sous l'en-tête du panneau. */
const STICKY: Record<ResourcesVariant, string> = {
  page: 'lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)]',
  panel: 'lg:top-[4.5rem] lg:max-h-[calc(100dvh-5.5rem)]',
};

const LARGE = '(min-width: 1024px)';

function abonner(rappel: () => void) {
  const m = window.matchMedia(LARGE);
  m.addEventListener('change', rappel);
  return () => m.removeEventListener('change', rappel);
}

/** Grand écran (lg) : le détail s'affiche à côté de la liste, sinon dans un volet. */
export function useWide(): boolean {
  return useSyncExternalStore(
    abonner,
    () => window.matchMedia(LARGE).matches,
    () => true,
  );
}

/**
 * Liste à gauche, détail à droite (collant) sur grand écran ; sur petit écran, le détail
 * s'ouvre dans un volet quand `open`.
 */
export function MasterDetail({
  list,
  detail,
  placeholder,
  open,
  title,
  onClose,
}: Readonly<{
  list: ReactNode;
  detail: ReactNode;
  placeholder: ReactNode;
  open: boolean;
  /** Titre du volet (lecteurs d'écran). */
  title: string;
  onClose(): void;
}>) {
  const wide = useWide();
  const variant = useResourcesVariant();
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0">{list}</div>
      {wide ? (
        <aside
          aria-label={title}
          className={cn(
            'min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card shadow-surface lg:sticky',
            STICKY[variant],
          )}
        >
          {open ? detail : placeholder}
        </aside>
      ) : (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
          <SheetContent cote="right" className="w-full max-w-lg overflow-y-auto p-0">
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">Détail de l’entrée choisie</DialogDescription>
            {detail}
          </SheetContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Barre d'outils ──────────────────────────────────────────────────────────

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: Readonly<{
  value: string;
  onChange(v: string): void;
  placeholder: string;
  label: string;
  className?: string;
}>) {
  return (
    <div className={cn('w-full sm:w-72', className)}>
      <InputGroup
        type="search"
        avant={<Search />}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-9 [&::-webkit-search-cancel-button]:hidden"
        apres={
          value ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onChange('')}
              aria-label="Effacer la recherche"
            >
              <X />
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

export interface ChipOption {
  value: string;
  label: ReactNode;
  count?: number;
}

/** Filtre exclusif en pastilles (sections, sortes, collections). */
export function Chips({
  options,
  value,
  onChange,
  label,
}: Readonly<{
  options: ChipOption[];
  value: string;
  onChange(v: string): void;
  label: string;
}>) {
  return (
    <PillGroup>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const actif = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={actif}
              onClick={() => onChange(o.value)}
              className={cn(
                'relative isolate inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97]',
                actif
                  ? 'border-primary/50 text-primary-strong'
                  : 'border-border-strong text-muted-foreground hover:text-foreground',
              )}
            >
              {actif && <ActivePill className="bg-primary/15" />}
              {o.label}
              {o.count !== undefined && (
                <span
                  className={cn('text-[11px]', actif ? 'text-primary-strong/80' : 'text-subtle')}
                >
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </PillGroup>
  );
}

export function Toolbar({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── États ───────────────────────────────────────────────────────────────────

/** État vide ou d'erreur compact, à l'intérieur d'un onglet. */
export function Notice({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
}: Readonly<{
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'error';
}>) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center"
    >
      <span
        className={cn(
          'mb-3 grid size-10 place-items-center rounded-xl border border-border-strong bg-surface-2',
          tone === 'error' ? 'text-destructive' : 'text-primary',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ListSkeleton({
  rows = 6,
  className,
}: Readonly<{ rows?: number; className?: string }>) {
  return (
    <div className={cn('space-y-2', className)} aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

// ─── Texte du catalogue ──────────────────────────────────────────────────────

const HTML = /<\/?[a-z][\s\S]*?>/i;

/** `**gras**` dans une ligne de texte. */
function inline(texte: string): ReactNode[] {
  return texte.split(/(\*\*[^*]+\*\*)/g).map((morceau, i) =>
    /^\*\*[^*]+\*\*$/.test(morceau) ? (
      <strong key={i} className="font-semibold text-foreground">
        {morceau.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{morceau}</Fragment>
    ),
  );
}

type Bloc =
  | { t: 'titre'; niveau: number; texte: string }
  | { t: 'liste'; items: string[] }
  | { t: 'para'; lignes: string[] };

function blocs(texte: string): Bloc[] {
  const r: Bloc[] = [];
  let para: string[] = [];
  let liste: string[] = [];
  const vider = () => {
    if (para.length) r.push({ t: 'para', lignes: para });
    if (liste.length) r.push({ t: 'liste', items: liste });
    para = [];
    liste = [];
  };
  for (const brute of texte.split('\n')) {
    const ligne = brute.trimEnd();
    const titre = /^(#{1,4})\s+(.*)$/.exec(ligne);
    const item = /^\s*[-*]\s+(.*)$/.exec(ligne);
    if (!ligne.trim()) vider();
    else if (titre) {
      vider();
      r.push({ t: 'titre', niveau: titre[1]!.length, texte: titre[2]! });
    } else if (item) {
      if (para.length) {
        r.push({ t: 'para', lignes: para });
        para = [];
      }
      liste.push(item[1]!);
    } else {
      if (liste.length) {
        r.push({ t: 'liste', items: liste });
        liste = [];
      }
      para.push(ligne);
    }
  }
  vider();
  return r;
}

/**
 * Description d'une entrée ou texte du système : HTML assaini (comme la fiche), sinon
 * markdown léger rendu sans HTML injecté (titres, listes, gras, paragraphes).
 */
export function CatalogueText({
  text,
  className,
  skipTitle = false,
}: Readonly<{
  text: string;
  className?: string;
  /** Sans le premier titre (déjà affiché au-dessus). */
  skipTitle?: boolean;
}>) {
  if (HTML.test(text)) return <RichText text={text} className={className} />;
  const liste = blocs(text);
  const debut = skipTitle && liste[0]?.t === 'titre' ? 1 : 0;
  return (
    <div className={cn('space-y-2 text-[13px] leading-relaxed text-foreground/85', className)}>
      {liste.slice(debut).map((b, i) =>
        b.t === 'titre' ? (
          <p
            key={i}
            className={cn(
              'font-semibold text-foreground',
              b.niveau <= 2 ? 'pt-2 text-sm' : 'pt-1 text-[13px]',
            )}
          >
            {inline(b.texte)}
          </p>
        ) : b.t === 'liste' ? (
          <ul key={i} className="ml-4 list-disc space-y-1 marker:text-subtle">
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {b.lignes.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

/** Image d'illustration, masquée si elle ne charge pas. */
export function Thumb({
  src,
  alt,
  className,
  fallback,
  width,
}: Readonly<{
  src: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
  /** Largeur affichée (px CSS) : vignette du CDN en 1x/2x au lieu de la pleine résolution. */
  width?: number;
}>) {
  if (!src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- images du CDN public, tailles variées
    <img
      src={width ? vignette(src, width * 2) : src}
      srcSet={
        width && surCdn(src)
          ? `${vignette(src, width)} 1x, ${vignette(src, width * 2)} 2x`
          : undefined
      }
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}
