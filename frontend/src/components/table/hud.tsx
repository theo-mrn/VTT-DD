'use client';

import { ArrowLeft, Crown, Eye, UserRoundCog } from 'lucide-react';
import Link from 'next/link';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import type { Personnage } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import type { Table } from './contexte';
import { FrontiereTable } from './frontiere';
import { JaugesFiche } from './jauges';
import { PanelLink } from './panels/navigation';
import { usePanelStore } from './panels/store';

const VERRE =
  'rounded-2xl border border-border-strong bg-popover/75 shadow-elevated backdrop-blur-xl';

/** En haut à gauche : retour au salon, campagne et système. */
export function HudCampaign({ table }: { table: Table }) {
  const c = table.campagne;
  const nomSysteme = useNomSysteme(c.system);
  return (
    <div
      className={cn(
        VERRE,
        'pointer-events-auto flex min-w-0 max-w-[min(22rem,calc(100vw-8rem))] items-center gap-1 p-1 pr-3',
      )}
    >
      <Info texte="Retour au salon" cote="bottom">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href={`/campagnes/${c.id}`} aria-label="Retour au salon">
            <ArrowLeft />
          </Link>
        </Button>
      </Info>
      <Illustration
        src={c.coverUrl}
        graine={c.name}
        className="hidden size-8 shrink-0 rounded-lg ring-1 ring-border sm:block"
      />
      <span className="ml-1.5 min-w-0">
        <span className="block truncate font-display text-sm font-semibold leading-tight">
          {c.name}
        </span>
        <span className="block truncate text-[11px] text-subtle">{nomSysteme}</span>
      </span>
    </div>
  );
}

/** En haut à droite : mon héros (portrait, jauges) et « Changer de héros ». */
export function HudHero({ table }: { table: Table }) {
  const { campagne: c, gm, moi } = table;
  // Un panneau ouvert : le héros se fait discret (portrait seul)
  const compact = usePanelStore((s) => s.active !== null);
  return (
    <div className={cn(VERRE, 'pointer-events-auto flex min-w-0 items-center gap-1 p-1')}>
      {table.heros ? (
        <FrontiereTable nom="Fiche" compacte>
          <HerosIncarne heros={table.heros} herosId={table.herosId} compact={compact} />
        </FrontiereTable>
      ) : table.herosId ? (
        <Skeleton className="size-9 rounded-full" aria-label="Chargement du héros" />
      ) : (
        <span className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-primary-strong">
          {gm ? <Crown className="size-3.5" /> : <Eye className="size-3.5" />}
          {gm ? 'Maître du jeu' : moi.role === 'spectator' ? 'Spectateur' : 'Sans héros'}
        </span>
      )}
      {moi.role !== 'spectator' && (
        <Info texte={gm ? 'Jouer un héros ou mener en MJ' : 'Changer de héros'} cote="bottom">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`/campagnes/${c.id}/personnage`} aria-label="Changer de héros">
              <UserRoundCog />
            </Link>
          </Button>
        </Info>
      )}
    </div>
  );
}

function HerosIncarne({
  heros,
  herosId,
  compact,
}: {
  heros: Personnage;
  herosId: string | null;
  compact: boolean;
}) {
  const { ctx } = useFicheCalculee(herosId);
  return (
    <PanelLink
      panel="fiche"
      aria-label={`${heros.name} : ouvrir ma fiche`}
      className="flex min-w-0 items-center gap-3 rounded-xl py-0.5 pl-2 pr-0.5 transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      {ctx && !compact && <JaugesFiche ctx={ctx} className="hidden xl:flex" />}
      {ctx && !compact && <JaugesFiche ctx={ctx} nombre={1} className="hidden sm:flex xl:hidden" />}
      <span className={cn('hidden min-w-0 text-right', !compact && 'md:block')}>
        <span className="block max-w-40 truncate text-[13px] font-semibold leading-tight">
          {heros.name}
        </span>
        <span className="block max-w-40 truncate text-[11px] text-subtle">
          {heros.summary.tagline || 'Mon héros'}
        </span>
      </span>
      <Illustration
        src={heros.portraitUrl}
        graine={heros.name}
        position="top"
        className="size-9 shrink-0 rounded-full ring-2 ring-primary/60"
      />
    </PanelLink>
  );
}
