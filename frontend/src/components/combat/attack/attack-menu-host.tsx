'use client';

/**
 * Où s'affiche le menu d'attaque (docs/combat.md § 12.1) :
 * - avec une carte : dans la colonne de gauche de la carte (surcouche du module `combat`),
 *   à côté de la bibliothèque et de la fiche d'un token, la carte visible pour viser ;
 * - sans carte (aucune scène ouverte) : panneau flottant au même endroit, cibles prises dans la
 *   liste des participants.
 *
 * Ouvert depuis un panneau de la table qui couvre la carte (fiche, panneau Combat), ce panneau
 * se ferme : on attaque sur la carte. Les panneaux flottants (dés) restent.
 */
import { useEffect } from 'react';
import { usePanelStoreApi } from '@/components/table/panels/store';
import { panelRegistry } from '@/components/table/panels/registry';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { useActiveMap } from '@/lib/map/active-map';
import { attackMenuStore, registerAttackHost } from '@/lib/combat/attack-menu-store';
import { AttackMenu } from './attack-menu';

/** Surcouche de la carte (colonne de gauche). */
export function AttackMenuSlot({ engine }: { engine: MapEngine }) {
  const campaignId = engine.store.getState().campaignId;
  return <AttackMenu campaignId={campaignId} canAim={engine.viewer.role !== 'spectator'} />;
}

/**
 * Hôte de la table (monté avec la carte, qu'il y ait une scène ou non) : ferme le panneau qui
 * couvre la carte à l'ouverture, et montre le menu lui-même quand aucune carte n'est affichée.
 */
export function AttackMenuFallback({ campaignId }: { campaignId: string }) {
  const { engine } = useActiveMap(campaignId);
  useEffect(() => registerAttackHost(campaignId), [campaignId]);
  useCloseCoveringPanel(campaignId);
  if (engine) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 left-3 top-20 z-30 flex items-start lg:left-[5.75rem]">
      <AttackMenu campaignId={campaignId} canAim={false} className="pointer-events-auto" />
    </div>
  );
}

function useCloseCoveringPanel(campaignId: string) {
  const panels = usePanelStoreApi();
  useEffect(
    () =>
      attackMenuStore.subscribe((s, prev) => {
        if (s.opens === prev.opens) return;
        if (s.flow.phase === 'closed' || s.flow.campaignId !== campaignId) return;
        const active = panels.getState().active;
        const mode = panelRegistry.find((p) => p.id === active)?.mode;
        if (active && mode !== 'floating') panels.getState().close();
      }),
    [campaignId, panels],
  );
}
