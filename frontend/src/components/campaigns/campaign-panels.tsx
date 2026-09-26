'use client';

/**
 * Panneaux de la vue détaillée d'une campagne, repris de l'ancienne app
 * (mes-campagnes et rejoindre, campagne sélectionnée) : barre de retour, image,
 * description, informations et créateur.
 */
import { ArrowLeft, Gamepad2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { aclonica, CampaignImage } from './elements';

/** Barre sous la navigation : « Retour » et titre de la campagne. */
export function CampaignHeaderBar({ title, onBack }: { title: string; onBack(): void }) {
  return (
    <div
      className="relative z-20 border-b border-[var(--border-color)] shadow-lg backdrop-blur-md"
      style={{ background: 'color-mix(in srgb, var(--bg-card) 80%, transparent)' }}
    >
      <div className="container mx-auto px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="shrink-0 gap-2 text-[var(--text-primary)] hover:bg-white/10 hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
          <div className="h-6 w-px shrink-0 bg-[var(--border-color)]" />
          <h1
            className={cn(
              aclonica,
              'truncate text-lg font-bold text-[var(--accent-brown)] sm:text-2xl',
            )}
          >
            {title}
          </h1>
        </div>
      </div>
    </div>
  );
}

/** Grille de la vue détaillée : colonne principale (2/3) et barre latérale. */
export function CampaignLayout({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="min-w-0 space-y-6 lg:col-span-2 lg:space-y-8">{main}</div>
        <div className="min-w-0 space-y-6">{side}</div>
      </div>
    </div>
  );
}

/** Image principale de la campagne, avec son halo doré au survol. */
export function CampaignHero({ url, title }: { url: string | null | undefined; title: string }) {
  return (
    <div className="group relative">
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[color-mix(in_srgb,var(--accent-brown)_20%,transparent)] via-[color-mix(in_srgb,var(--accent-brown)_40%,transparent)] to-[color-mix(in_srgb,var(--accent-brown)_20%,transparent)] opacity-0 blur-sm transition duration-500 group-hover:opacity-100" />
      <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-dark)] shadow-2xl">
        <CampaignImage
          url={url}
          alt={`Image de la campagne ${title}`}
          zoom={false}
          className="transition-transform duration-300 group-hover:scale-105"
        />
      </div>
    </div>
  );
}

/** Carte au style de l'ancienne app (fond de carte, bordure du thème). */
export function CampaignCard({
  title,
  icon,
  children,
  className,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        'border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xl ring-0',
        className,
      )}
    >
      {title && (
        <CardHeader className="px-6 pt-2">
          <CardTitle
            className={cn(aclonica, 'flex items-center gap-2 text-lg text-[var(--accent-brown)]')}
          >
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
      )}
      <CardContent className="px-6 pb-2">{children}</CardContent>
    </Card>
  );
}

/** Conteneur des panneaux (discussion, sessions, joueurs). */
export function CampaignPanel({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
      {children}
    </div>
  );
}

export function DescriptionCard({ text }: { text: string | undefined }) {
  return (
    <CampaignCard>
      <div className="py-2 sm:py-4">
        <h3
          className={cn(
            aclonica,
            'mb-3 text-lg font-bold text-[var(--accent-brown)] sm:mb-4 sm:text-xl',
          )}
        >
          Description
        </h3>
        <p className="whitespace-pre-line text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
          {text || 'Aucune description.'}
        </p>
      </div>
    </CampaignCard>
  );
}

/** Informations : joueurs, visibilité, système, puis ce que la page ajoute (code…). */
export function InfoCard({
  players,
  isPublic,
  system,
  children,
}: {
  players: number;
  isPublic: boolean | undefined;
  system?: string;
  children?: ReactNode;
}) {
  return (
    <CampaignCard title="Informations" icon={<Gamepad2 className="h-5 w-5" />}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-[var(--text-secondary)]">Joueurs</span>
          <span className="font-bold text-[var(--text-primary)]">{players}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-[var(--text-secondary)]">Visibilité</span>
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider',
              isPublic
                ? 'border border-green-500/20 bg-green-500/10 text-green-500'
                : 'border border-orange-500/20 bg-orange-500/10 text-orange-500',
            )}
          >
            {isPublic ? 'Publique' : 'Privée'}
          </span>
        </div>
        {system && (
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-[var(--text-secondary)]">Système</span>
            <span className="truncate text-right font-bold text-[var(--text-primary)]">
              {system}
            </span>
          </div>
        )}
        {children}
      </div>
    </CampaignCard>
  );
}

export function CreatorCard({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <CampaignCard title="Créateur">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={`Image de ${name}`}
              className="h-14 w-14 rounded-full border-2 object-cover shadow-md"
              style={{ borderColor: 'color-mix(in srgb, var(--accent-brown) 30%, transparent)' }}
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--border-color)] bg-[var(--bg-darker)] text-xl font-bold text-[var(--accent-brown)]">
              {name.charAt(0).toUpperCase() || '?'}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-[var(--text-primary)]">{name}</p>
          <p className="text-sm font-medium text-[var(--accent-brown)]">Maître de jeu</p>
        </div>
      </div>
    </CampaignCard>
  );
}
