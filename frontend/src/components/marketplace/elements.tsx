'use client';

/**
 * Briques communes des écrans de la marketplace : onglets de navigation, nom d'un système,
 * étoiles, badges de contenu, couverture. Même langage visuel que la boutique de dés.
 */
import { CONTENT_WARNING_LABELS, type ContentWarning, type ListingKind } from '@vtt/contracts';
import {
  Box,
  ImageOff,
  Library,
  Map as MapIcon,
  Shield,
  Star,
  Store,
  Users,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Info } from '@/components/ui/tooltip';
import { KIND_LABELS, ratingLabel } from '@/lib/marketplace/format';
import { useMarketplaceMe } from '@/lib/marketplace/api';
import { useSystemes } from '@/lib/systemes';
import { cn } from '@/lib/utils';

type Section = 'catalog' | 'library' | 'studio' | 'moderation';

const TABS: { section: Section; href: string; label: string; icon: typeof Store }[] = [
  { section: 'catalog', href: '/marketplace', label: 'Catalogue', icon: Store },
  { section: 'library', href: '/marketplace/library', label: 'Bibliothèque', icon: Library },
  { section: 'studio', href: '/marketplace/studio', label: 'Studio', icon: Wand2 },
  { section: 'moderation', href: '/marketplace/moderation', label: 'Modération', icon: Shield },
];

/** Partie de la marketplace d'une adresse : fiches et créateurs relèvent du catalogue. */
export function sectionOf(path: string): Section {
  const [, , part] = path.split('/');
  return part === 'library' || part === 'studio' || part === 'moderation' ? part : 'catalog';
}

/** Onglets de la marketplace ; « Modération » pour les modérateurs. */
export function MarketplaceTabs({ className }: Readonly<{ className?: string }>) {
  const path = usePathname();
  const me = useMarketplaceMe();
  const tabs = TABS.filter((t) => t.section !== 'moderation' || me.data?.moderator);
  const current = sectionOf(path);
  const active = (t: (typeof tabs)[number]) => t.section === current;
  return (
    <nav
      aria-label="Marketplace"
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1',
        className,
      )}
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t) ? 'page' : undefined}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors',
            active(t)
              ? 'bg-card text-foreground shadow-surface'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <t.icon className="size-4" aria-hidden />
          <span className="hidden sm:inline">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Nom lisible d'un système de jeu (son identifiant tant que la liste n'est pas chargée). */
export function useSystemName() {
  const systems = useSystemes();
  return (id: string | null | undefined) =>
    id ? (systems.data?.find((s) => s.id === id)?.nom ?? id) : null;
}

export const KIND_ICONS: Record<ListingKind, typeof MapIcon> = {
  scenes: MapIcon,
  npcs: Users,
  objects: Box,
};

/** Badges « Scènes », « PNJ », « Objets ». */
export function KindBadges({ kinds }: Readonly<{ kinds: readonly ListingKind[] }>) {
  return (
    <>
      {kinds.map((k) => {
        const Icon = KIND_ICONS[k];
        return (
          <Badge key={k}>
            <Icon aria-hidden />
            {KIND_LABELS[k]}
          </Badge>
        );
      })}
    </>
  );
}

export function WarningBadges({ warnings }: Readonly<{ warnings: readonly ContentWarning[] }>) {
  return (
    <>
      {warnings.map((w) => (
        <Badge key={w} ton="alerte">
          {CONTENT_WARNING_LABELS[w]}
        </Badge>
      ))}
    </>
  );
}

/** Note moyenne et nombre d'avis ; rien sans avis. */
export function RatingSummary({
  rating,
  count,
  className,
}: Readonly<{ rating: number | null; count: number; className?: string }>) {
  const label = ratingLabel(rating);
  if (!label) return null;
  return (
    <Info texte={`${count} avis`}>
      <span className={cn('inline-flex items-center gap-1 tabular-nums', className)}>
        <Star className="size-3.5 fill-current text-warning" aria-hidden />
        {label}
        <span className="sr-only">sur 5, {count} avis</span>
      </span>
    </Info>
  );
}

/** Choix d'une note de 1 à 5. */
export function StarInput({
  value,
  onChange,
}: Readonly<{ value: number; onChange: (v: number) => void }>) {
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Note">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} sur 5`}
          onClick={() => onChange(n)}
          className="rounded-md p-0.5 text-warning transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Star className={cn('size-5', n <= value ? 'fill-current' : 'opacity-40')} />
        </button>
      ))}
    </div>
  );
}

/** Puce de filtre (comme celles de la boutique de dés). */
export function Chip({
  active,
  onClick,
  children,
}: Readonly<{ active: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors [&_svg]:size-3.5',
        active
          ? 'border-border-strong bg-surface-3 text-foreground'
          : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** Couverture d'un pack (16:9), ou un aplat neutre sans image. */
export function Cover({
  url,
  alt,
  className,
}: Readonly<{ url: string | null; alt: string; className?: string }>) {
  return (
    <span
      className={cn(
        'relative block aspect-video w-full overflow-hidden bg-[radial-gradient(circle_at_50%_40%,hsl(var(--surface-3)),transparent_70%)]',
        className,
      )}
    >
      {url ? (
        // Images du stockage (R2) : tailles variables, pas d'optimisation Next
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <ImageOff className="absolute inset-0 m-auto size-6 text-subtle" aria-hidden />
      )}
    </span>
  );
}
