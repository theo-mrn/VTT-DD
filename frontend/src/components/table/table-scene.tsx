'use client';

import { TableDiceShortcuts } from '@/components/des/raccourcis-table';
import { useQuery } from '@tanstack/react-query';
import { DoorOpen, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useEffect, useMemo, type ReactNode } from 'react';
import { EtatVide } from '@/components/commun/page';
import { TableAudio } from '@/components/audio/table-audio';
import { TableSearch } from './table-search';
import { useDicePreferences } from '@/lib/dice-preferences';
import { prepareDice3D } from '@/lib/dice-throw';
import { Projection } from '@/components/handouts/projection';
import { EcranChargement } from '@/components/shell/ecran-chargement';
import { Button } from '@/components/ui/button';
import { ApiError, messageErreur } from '@/lib/api';
import { campagnes, useCampagne } from '@/lib/campagnes';
import { clesPersonnages, usePersonnagesCampagne } from '@/lib/personnages';
import { useSynchroCampagne } from '@/lib/realtime-sync';
import { useProfilRequis } from '@/lib/session';
import { useSystemTypography } from '@/lib/system-fonts';
import { useSysteme } from '@/lib/systemes';
import { FournisseurHeros, FournisseurTable, useTableHeros, type Table } from './contexte';
import { HudCombat, HudExit } from './hud';
import { TABLE_HUD_LEFT } from './hud-slots';
import { PanelLocationSync } from './panels/navigation';
import { PanelHost } from './panels/panel-host';
import { panelsFor, type TableRole } from './panels/registry';
import { PanelStoreProvider, usePanelStore } from './panels/store';
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
export function TableScene({ id, children }: Readonly<{ id: string; children: ReactNode }>) {
  const profil = useProfilRequis();
  const router = useRouter();
  const campagne = useCampagne(profil ? id : null);
  // Engagés (le héros du HUD) lus dès l'arrivée, avec la campagne ; leurs changements ne
  // re-rendent pas la scène (`notifyOnChangeProps: []`), seulement `HerosTable`
  useQuery({
    queryKey: clesPersonnages.campagne(id),
    queryFn: () => campagnes.personnages(id),
    enabled: Boolean(profil),
    notifyOnChangeProps: [],
  });
  const c = campagne.data;
  const moi = c?.members.find((m) => m.userId === profil?.id) ?? null;
  const herosId = c?.playedCharacterId ?? null;
  // Table, héros et membres tenus à jour en direct
  useSynchroCampagne(c ? id : null, { personnage: herosId });
  // Polices et typographie du système de la campagne sur toute la table
  const systeme = useSysteme(c?.system ?? null);
  useSystemTypography(c?.system ?? null, systeme.data?.presentation ?? null);

  const refuse = campagne.error instanceof ApiError && [403, 404].includes(campagne.error.status);
  const sansHeros = Boolean(c && moi?.role === 'player' && !herosId);
  const horsTable = Boolean(c && !moi);

  useEffect(() => {
    if (refuse || horsTable) router.replace(`/campagnes/${id}`);
    else if (sansHeros) router.replace(`/campagnes/${id}/personnage`);
  }, [refuse, horsTable, sansHeros, router, id]);

  const table = useMemo<Table | null>(
    () =>
      c && moi
        ? {
            campagne: c,
            moi,
            gm: c.role === 'gm',
            herosId,
            base: `/campagnes/${id}/table`,
          }
        : null,
    [c, moi, herosId, id],
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
      <HerosTable campaignId={id} herosId={herosId}>
        <PanelStoreProvider key={table.campagne.id}>
          <Plateau table={table}>{children}</Plateau>
        </PanelStoreProvider>
      </HerosTable>
    </FournisseurTable>
  );
}

/**
 * Résumé de mon héros, lu dans les personnages engagés : il change à chaque écriture sur sa
 * fiche, seuls ses lecteurs (`useTableHeros`) se re-rendent, pas le plateau.
 */
function HerosTable({
  campaignId,
  herosId,
  children,
}: Readonly<{
  campaignId: string;
  herosId: string | null;
  children: ReactNode;
}>) {
  const engages = usePersonnagesCampagne(campaignId);
  const heros = useMemo(
    () => engages.data?.find((p) => p.id === herosId) ?? null,
    [engages.data, herosId],
  );
  return <FournisseurHeros value={heros}>{children}</FournisseurHeros>;
}

/** Re-rendu seulement quand la table change (pas à chaque écriture d'une fiche ou d'un panneau). */
/**
 * Dés 3D préparés dès l'arrivée à la table (module, shaders, motifs cuits, gravures) : le premier
 * jet, d'où qu'il vienne (fiche, combat, attaque, panneau des dés), part sans à-coup.
 */
function useDicePreheat() {
  const prefs = useDicePreferences().data;
  const skin = prefs?.animation3d ? prefs.skinId : null;
  useEffect(() => {
    if (skin) prepareDice3D([skin]);
  }, [skin]);
}

const Plateau = memo(function Plateau({ table, children }: { table: Table; children: ReactNode }) {
  useDicePreheat();
  const role: TableRole = table.gm ? 'gm' : table.moi.role;
  const panels = useMemo(() => panelsFor(role), [role]);
  const permis = useMemo(() => new Set(panels.map((p) => p.id)), [panels]);
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
      {/* L'adresse suit le panneau ouvert : seul ce composant la lit, le plateau ne bouge pas */}
      <PanelLocationSync allowed={permis} />
      <main className="absolute inset-x-0 top-0 bottom-[var(--table-dock-h)]">{children}</main>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 lg:left-20">
        {/* Gauche et droite à leur taille, le combat centré dans ce qui reste : jamais dessous */}
        {/* Barre du groupe et sortie : rendues ici par la carte, voir PartyBar */}
        <div
          id={TABLE_HUD_LEFT}
          className="flex min-w-0 justify-start [&:has([data-party-bar])>[data-hud-exit]]:hidden"
        >
          {/* Sans scène (pas de barre du groupe), la sortie seule */}
          <HudExit table={table} />
        </div>
        <div className="flex min-w-0 justify-center">
          <HudCombat table={table} />
        </div>
        <div aria-hidden />
      </div>

      <TableRail layout={rail} />
      <PanelHost panels={panels} />
      {/* Son de la campagne : canaux synchronisés, effets, mixeur, bandeau d'activation */}
      <TableAudio campaignId={table.campagne.id} gm={table.gm} />
      {/* Recherche dans les règles : ⌘K / Ctrl+K (docs/recherche.md) */}
      <TableSearch />
      {/* Raccourcis de dés (macros, relancer…), panneau des dés fermé compris */}
      <RaccourcisDes campagneId={table.campagne.id} />
      {/* Document projeté par le MJ : plein écran au-dessus de tout (docs/projection.md) */}
      <Projection campaignId={table.campagne.id} gm={table.gm} />
    </div>
  );
});

/** Raccourcis de dés à la table, tant que le panneau des dés n'est pas ouvert (il prend le relais). */
function RaccourcisDes({ campagneId }: Readonly<{ campagneId: string }>) {
  const heros = useTableHeros();
  const panneauOuvert = usePanelStore((s) => s.active === 'des');
  return <TableDiceShortcuts campagneId={campagneId} personnage={heros} enabled={!panneauOuvert} />;
}
