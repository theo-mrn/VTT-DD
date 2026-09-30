'use client';

import type { CombatState } from '@vtt/contracts';
import { ArrowLeft, Crown, Eye, UserRoundCog } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { LiveReports, ReportsToggle } from '@/components/combat/live-reports/live-reports';
import { useLiveReports } from '@/components/combat/live-reports/use-live-reports';
import { InitiativeStrip } from '@/components/combat/player/initiative-strip';
import { ReactionPrompts } from '@/components/combat/player/reaction-prompt';
import { Illustration } from '@/components/commun/illustration';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { useCombat } from '@/lib/combat/use-combat';
import type { DetailCampagne } from '@/lib/campagnes';
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

/**
 * Au centre, pendant un combat : la barre de combat du MJ (docs/combat.md § 12.6) et, dessous,
 * ses rapports d'attaque en direct, un seul ensemble ; pour un joueur, les invites de défense
 * active quand son personnage est attaqué (en combat ou non).
 */
export function HudCombat({ table }: { table: Table }) {
  const { campagne: c, gm, moi } = table;
  const { combat } = useCombat(c.id);
  const role = gm ? 'gm' : moi.role;
  const mine = useMemo(
    () => new Set(c.characters.filter((e) => e.playedBy === moi.userId).map((e) => e.characterId)),
    [c.characters, moi.userId],
  );
  const reacts = role === 'player' && mine.size > 0;
  const sys = useCampaignSystem(reacts ? c.system : null, c.id);
  if (!(combat && role === 'gm') && !reacts) return null;
  return (
    <div className="pointer-events-none flex min-w-0 flex-1 flex-col items-center gap-2">
      {combat && role === 'gm' && <GmCombat campagne={c} combat={combat} />}
      {reacts && (
        <ReactionPrompts campaignId={c.id} mine={mine} systeme={sys.data?.systeme ?? null} />
      )}
    </div>
  );
}

/** Barre du MJ et pile de rapports : l'état des rapports est partagé (pastille, repli). */
function GmCombat({ campagne, combat }: { campagne: DetailCampagne; combat: CombatState }) {
  const live = useLiveReports(campagne);
  return (
    <>
      <InitiativeStrip
        campaignId={campagne.id}
        combat={combat}
        reports={<ReportsToggle live={live} />}
      />
      <LiveReports live={live} campagne={campagne} combat={combat} />
    </>
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
