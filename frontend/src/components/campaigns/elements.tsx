'use client';

/**
 * Éléments communs aux pages de campagnes, repris de l'ancienne app
 * (mes-campagnes, creer, rejoindre) : fond, titres de section, tuiles de
 * campagne, état vide. Couleurs du thème (variables CSS de globals.css).
 */
import { ArrowRight, Gamepad2, Shield, Users, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { aclonica } from '@/components/account/styles';
import type { CampaignSummary } from '@/lib/campaigns';
import { cn } from '@/lib/utils';

export { aclonica };

/** Fond glacé des tuiles et champs (fond de carte à 60 %). */
export const glass = (percent = 60): CSSProperties => ({
  background: `color-mix(in srgb, var(--bg-card) ${percent}%, transparent)`,
});

/** Teinte de l'accent (bordure et fond), pour les pastilles et icônes. */
export const accentTint = (bg: number, border: number): CSSProperties => ({
  background: `color-mix(in srgb, var(--accent-brown) ${bg}%, transparent)`,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: `color-mix(in srgb, var(--accent-brown) ${border}%, transparent)`,
});

/** Libellé de champ en capitales espacées. */
export const fieldLabel =
  'ml-1 text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]';

/** Champ de saisie glacé. */
export const fieldInput =
  'h-12 rounded-xl border-[var(--border-color)] text-[var(--text-primary)] backdrop-blur-sm transition-all focus:border-[var(--accent-brown)] focus:shadow-[0_0_15px_rgba(192,160,128,0.1)] focus-visible:ring-[var(--accent-brown)]';

export const primaryButton =
  'border-none bg-[var(--accent-brown)] font-bold text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] disabled:opacity-60';

export const outlineButton =
  'border-[var(--border-color)] bg-transparent font-bold text-[var(--text-primary)] hover:bg-white/10 hover:text-[var(--text-primary)]';

/** Fond de l'ancienne app : noir profond, reflets doux, lueurs ambrées. */
export function CampaignsBackground({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative min-h-screen w-full overflow-x-clip font-body text-[var(--text-primary)]',
        className,
      )}
      style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #141414 40%, #050505 100%)' }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 60% at 0% 0%, rgba(255,255,255,0.07) 0%, transparent 65%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 55% 45% at 100% 100%, rgba(255,255,255,0.04) 0%, transparent 60%)',
        }}
      />
      <div
        className="pointer-events-none absolute left-1/4 top-0 z-0 h-[600px] w-[800px] max-w-full"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 50% at 30% 0%, rgba(192,160,128,0.1) 0%, transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 z-0 h-[500px] w-[500px] max-w-full"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at 100% 100%, rgba(192,160,128,0.04) 0%, transparent 60%)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Mise en page à deux panneaux : titre et actions à gauche (collant), contenu à droite. */
export function SplitLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="container mx-auto min-h-[calc(100vh-4rem)] px-4 pb-16 pt-8 sm:px-6 sm:pb-24 sm:pt-12">
      <div className="mx-auto grid max-w-7xl items-start gap-8 lg:grid-cols-[380px_1fr] lg:gap-10">
        <div className="space-y-6 lg:sticky lg:top-24 lg:space-y-10">{aside}</div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/** Titre doré en dégradé des pages de campagnes. */
export function HeroTitle({
  kicker,
  children,
  subtitle,
}: {
  kicker?: string;
  children: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {kicker && (
        <p
          className="text-sm font-bold uppercase tracking-[0.2em]"
          style={{ color: 'color-mix(in srgb, var(--accent-brown) 70%, transparent)' }}
        >
          {kicker}
        </p>
      )}
      <h1
        className={cn(
          aclonica,
          'gold-text-gradient text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl',
        )}
      >
        {children}
      </h1>
      {subtitle && (
        <p className="text-base leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
      )}
    </div>
  );
}

export function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-gradient-to-r from-[color-mix(in_srgb,var(--accent-brown)_30%,transparent)] to-transparent" />
    </div>
  );
}

/** Titre de section avec son icône dans une pastille. */
export function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl p-2" style={accentTint(10, 20)}>
        <Icon className="h-5 w-5 text-[var(--accent-brown)]" />
      </div>
      <div className="min-w-0">
        <h2 className={cn(aclonica, 'text-2xl font-bold text-[var(--text-primary)]')}>{title}</h2>
        {subtitle && <p className="text-sm text-[var(--text-secondary)]">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Grand encadré pointillé quand une liste est vide. */
export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6 rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-24 text-center">
      <div
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl"
        style={accentTint(5, 10)}
      >
        <Icon className="h-10 w-10 text-[var(--text-secondary)] opacity-30" />
      </div>
      <div className="space-y-2">
        <p className="text-lg font-bold text-[var(--text-primary)]">{title}</p>
        {children && (
          <p className="mx-auto max-w-sm text-sm text-[var(--text-secondary)]">{children}</p>
        )}
      </div>
    </div>
  );
}

/** Image de campagne, ou l'icône manette sur fond dégradé. */
export function CampaignImage({
  url,
  alt,
  className,
  zoom = true,
}: {
  url: string | null | undefined;
  alt: string;
  className?: string;
  zoom?: boolean;
}) {
  return url ? (
    // Image de campagne stockée hors de Next (URL publique du stockage)
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={cn(
        'h-full w-full object-cover',
        zoom && 'transition-transform duration-500 group-hover:scale-110',
        className,
      )}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--bg-dark)] to-[var(--bg-card)]">
      <Gamepad2
        className="h-12 w-12"
        style={{ color: 'color-mix(in srgb, var(--accent-brown) 20%, transparent)' }}
      />
    </div>
  );
}

/** Pastille « joueurs / max » en haut à droite des tuiles. */
export function PlayersBadge({ count, max }: { count: number; max?: number }) {
  return (
    <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
      <Users className="h-3 w-3" />
      {count}/{max ?? '—'}
    </div>
  );
}

/**
 * Tuile d'une campagne dans les grilles (mes campagnes, campagnes en ligne) :
 * image 16/10 zoomée au survol, pastilles, titre et pied selon l'usage.
 */
export function CampaignTile({
  campaign,
  variant,
  onClick,
  busy = false,
}: {
  campaign: CampaignSummary;
  variant: 'created' | 'joined' | 'public';
  onClick(): void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl border border-[var(--border-color)] text-left backdrop-blur-sm transition-all duration-300 hover:border-[color-mix(in_srgb,var(--accent-brown)_40%,transparent)] hover:shadow-[0_0_30px_rgba(192,160,128,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brown)]',
        busy ? 'cursor-wait opacity-60' : 'cursor-pointer',
      )}
      style={glass()}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--bg-dark)]">
        <CampaignImage url={campaign.imageUrl} alt={campaign.name} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <PlayersBadge count={campaign.playerCount} max={campaign.maxPlayers} />
        {variant === 'created' && (
          <div
            className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-[var(--accent-brown)] backdrop-blur-sm"
            style={accentTint(40, 50)}
          >
            <Shield className="h-3 w-3" />
            MJ
          </div>
        )}
        {variant === 'public' &&
          (campaign.isFull ? (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/20 px-2.5 py-1 text-xs font-bold text-red-400 backdrop-blur-sm">
              Complète
            </div>
          ) : (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/20 px-2.5 py-1 text-xs font-bold text-green-400 backdrop-blur-sm">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
              En ligne
            </div>
          ))}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 text-base font-bold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-brown)]">
          {campaign.name}
        </h3>
        {variant === 'public' ? (
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-color)] px-3 text-xs font-bold transition-all group-hover:border-[var(--accent-brown)] group-hover:text-[var(--accent-brown)]">
            Rejoindre <ArrowRight className="h-3 w-3" />
          </span>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">
              {campaign.isPublic ? 'Publique' : 'Privée'}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--accent-brown)] opacity-0 transition-opacity group-hover:opacity-100">
              Détails <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

/** Grille des tuiles. */
export function CampaignGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

/** Message d'erreur ou d'information dans le style des campagnes. */
export function Notice({
  tone = 'erreur',
  children,
}: {
  tone?: 'erreur' | 'info' | 'succes';
  children: ReactNode;
}) {
  return (
    <p
      role={tone === 'erreur' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'erreur' && 'border-red-500/30 bg-red-500/10 text-red-300',
        tone === 'info' &&
          'border-[color-mix(in_srgb,var(--accent-brown)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent-brown)_10%,transparent)] text-[var(--text-primary)]',
        tone === 'succes' && 'border-green-500/30 bg-green-500/10 text-green-300',
      )}
    >
      {children}
    </p>
  );
}
