'use client';

import { DoorOpen, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';
import { EtatVide } from '@/components/commun/page';
import { TableAudio } from '@/components/audio/table-audio';
import { DiceThrowerHost } from '@/components/dice/thrower-host';
import { EcranChargement } from '@/components/shell/ecran-chargement';
import { Button } from '@/components/ui/button';
import { ApiError, messageErreur } from '@/lib/api';
import { useCampagne } from '@/lib/campagnes';
import { usePersonnagesCampagne } from '@/lib/personnages';
import { useSynchroCampagne } from '@/lib/realtime-sync';
import { useProfilRequis } from '@/lib/session';
import { FournisseurTable, type Table } from './contexte';
import { HudCampaign, HudHero } from './hud';
import { usePanelLocationSync } from './panels/navigation';
import { PanelHost } from './panels/panel-host';
import { panelsFor, type TableRole } from './panels/registry';
import { PanelStoreProvider } from './panels/store';
import { useActivityBadges } from './panels/use-activity-badges';
import { useTableShortcuts } from './panels/use-table-shortcuts';
import { useRailLayout } from './rail/rail-preferences';
import { TableRail } from './rail/table-rail';

/**
 * Plateau de jeu d'une campagne : la carte au centre, en plein écran (`children`), les
 * surcouches (campagne, héros), le rail des panneaux (dock sur mobile) et les panneaux ouverts
 * par-dessus, les dés 3D au-dessus de tout. Thème de la campagne sur toute la scène.
 *
 * Contrôle d'accès : un non-membre retourne à la page de la campagne ; un joueur sans héros
 * choisit d'abord le sien.
 */
export function TableScene({ id, children }: { id: string; children: ReactNode }) {
  const profil = useProfilRequis();
  const router = useRouter();
  const campagne = useCampagne(profil ? id : null);
  const engages = usePersonnagesCampagne(profil ? id : null);
  const c = campagne.data;
  const moi = c?.members.find((m) => m.userId === profil?.id) ?? null;
  const herosId = c?.playedCharacterId ?? null;
  // Table, héros et membres tenus à jour en direct
  useSynchroCampagne(c ? id : null, { personnage: herosId });

  const refuse = campagne.error instanceof ApiError && [403, 404].includes(campagne.error.status);
  const sansHeros = Boolean(c && moi && moi.role === 'player' && !herosId);
  const horsTable = Boolean(c && !moi);

  useEffect(() => {
    if (refuse || horsTable) router.replace(`/campagnes/${id}`);
    else if (sansHeros) router.replace(`/campagnes/${id}/personnage`);
  }, [refuse, horsTable, sansHeros, router, id]);

  const heros = useMemo(
    () => engages.data?.find((p) => p.id === herosId) ?? null,
    [engages.data, herosId],
  );

  const table = useMemo<Table | null>(
    () =>
      c && moi
        ? {
            campagne: c,
            moi,
            gm: c.role === 'gm',
            herosId,
            heros,
            base: `/campagnes/${id}/table`,
          }
        : null,
    [c, moi, herosId, heros, id],
  );

  if (!profil || campagne.isLoading || refuse || horsTable || sansHeros)
    return <EcranChargement texte="Installation de la table…" />;
  if (!table)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <EtatVide
          icone={DoorOpen}
          titre="La table est inaccessible"
          description={messageErreur(campagne.error)}
          className="w-full max-w-md"
          action={
            <>
              <Button variant="secondary" onClick={() => void campagne.refetch()}>
                <RotateCw />
                Réessayer
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/campagnes">Mes campagnes</Link>
              </Button>
            </>
          }
        />
      </div>
    );

  return (
    <FournisseurTable value={table}>
      <PanelStoreProvider key={table.campagne.id}>
        <Plateau table={table}>{children}</Plateau>
      </PanelStoreProvider>
    </FournisseurTable>
  );
}

function Plateau({ table, children }: { table: Table; children: ReactNode }) {
  const role: TableRole = table.gm ? 'gm' : table.moi.role;
  const panels = useMemo(() => panelsFor(role), [role]);
  const permis = useMemo(() => new Set(panels.map((p) => p.id)), [panels]);
  usePanelLocationSync(permis);
  useTableShortcuts(panels);
  const viewer = useMemo(
    () => ({ userId: table.moi.userId, gm: table.gm }),
    [table.moi.userId, table.gm],
  );
  useActivityBadges(table.campagne.id, viewer, panels);
  const rail = useRailLayout(table.moi.userId, table.campagne.id, panels);

  return (
    <div
      data-ambiance={table.campagne.ambiance}
      className="fixed inset-0 overflow-hidden bg-background text-foreground [--table-dock-h:calc(4rem+env(safe-area-inset-bottom))] lg:[--table-dock-h:0px]"
    >
      <main className="absolute inset-x-0 top-0 bottom-[var(--table-dock-h)]">{children}</main>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3 lg:left-20">
        <HudCampaign table={table} />
        <HudHero table={table} />
      </div>

      <TableRail layout={rail} />
      <PanelHost panels={panels} />
      {/* Son de la campagne : canaux synchronisés, effets, mixeur, bandeau d'activation */}
      <TableAudio campaignId={table.campagne.id} gm={table.gm} />
      {/* Dés 3D de la table, chargés au premier lancer, au-dessus de tout */}
      <DiceThrowerHost />
    </div>
  );
}
