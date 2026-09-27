'use client';

import { CalendarClock, Users } from 'lucide-react';
import Link from 'next/link';
import { Illustration } from '@/components/commun/illustration';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Campagne, RoleCampagne } from '@/lib/campagnes';
import { useSystemes } from '@/lib/systemes';
import { cn } from '@/lib/utils';
import { BadgeRole, formaterDans, PileAvatars } from './elements';

/** Nom lisible d'un système à partir de l'index (identifiant en attendant). */
export function useNomSysteme(id: string | null | undefined) {
  const systemes = useSystemes();
  return systemes.data?.find((s) => s.id === id)?.nom ?? id ?? '';
}

type DonneesCarte = Pick<
  Campagne,
  | 'id'
  | 'name'
  | 'pitch'
  | 'coverUrl'
  | 'system'
  | 'ambiance'
  | 'members'
  | 'memberCount'
  | 'playerCount'
  | 'nextSession'
  | 'role'
>;

/**
 * Carte d'une campagne : couverture, rôle, système, accroche, joueurs et
 * prochaine session. Sans `userId` (aperçu de création), pas de lien.
 */
export function CarteCampagne({
  campagne,
  userId,
  role: roleImpose,
  className,
  grande = false,
}: {
  campagne: DonneesCarte;
  userId?: string;
  role?: RoleCampagne | null;
  className?: string;
  grande?: boolean;
}) {
  const nomSysteme = useNomSysteme(campagne.system);
  const role = roleImpose !== undefined ? roleImpose : campagne.role;
  const session = campagne.nextSession;

  const contenu = (
    <>
      <Illustration
        src={campagne.coverUrl}
        graine={campagne.name || 'Campagne'}
        className={cn('w-full', grande ? 'aspect-[16/8]' : 'aspect-[16/9]')}
        classeImage="transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        voile
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <BadgeRole role={role} />
        </div>
        {nomSysteme && (
          <div className="absolute right-3 top-3">
            <Badge ton="verre">{nomSysteme}</Badge>
          </div>
        )}
        <div className="absolute inset-x-4 bottom-3.5">
          <h3
            className={cn(
              'truncate font-semibold tracking-tight text-white drop-shadow',
              grande ? 'text-2xl' : 'text-[17px]',
            )}
          >
            {campagne.name || 'Nouvelle campagne'}
          </h3>
          {campagne.pitch && (
            <p
              className={cn(
                'mt-0.5 line-clamp-1 text-white/70',
                grande ? 'text-sm' : 'text-[13px]',
              )}
            >
              {campagne.pitch}
            </p>
          )}
        </div>
      </Illustration>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <PileAvatars membres={campagne.members} total={campagne.memberCount} />
          <span className="flex items-center gap-1 text-xs text-subtle">
            <Users className="size-3.5" />
            {campagne.playerCount} {campagne.playerCount > 1 ? 'joueurs' : 'joueur'}
          </span>
        </div>
        {session ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-primary">
            <CalendarClock className="size-3.5" />
            {formaterDans(session.startsAt)}
          </span>
        ) : (
          <span className="text-xs text-subtle">Aucune session prévue</span>
        )}
      </div>
    </>
  );

  const classes = cn(
    'group relative block overflow-hidden rounded-2xl border border-border bg-card shadow-surface transition-all duration-300',
    userId && 'hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevated',
    className,
  );

  return userId ? (
    <Link href={`/campagnes/${campagne.id}`} data-ambiance={campagne.ambiance} className={classes}>
      {contenu}
    </Link>
  ) : (
    <div data-ambiance={campagne.ambiance} className={classes}>
      {contenu}
    </div>
  );
}

export function CarteCampagneSquelette() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-[16/9] rounded-none" />
      <div className="flex items-center justify-between px-4 py-3">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}
