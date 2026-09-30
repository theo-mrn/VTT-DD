'use client';

/**
 * Hôte du menu d'attaque (docs/combat.md § 12.1), monté avec la carte de la table (qu'une
 * scène soit ouverte ou non) : le menu s'ouvre en plein écran par-dessus tout, depuis le
 * token, la barre de la sélection, un gabarit, la fiche, le panneau Combat ou la touche Y.
 *
 * « Viser sur la carte » n'existe que si une carte est affichée ; au début de la visée, le
 * panneau de la table qui la couvre (fiche, panneau Combat) se ferme pour laisser cliquer les
 * tokens. Les panneaux flottants (dés) restent.
 */
import { useEffect } from 'react';
import { usePanelStoreApi } from '@/components/table/panels/store';
import { panelRegistry } from '@/components/table/panels/registry';
import { useActiveMap } from '@/lib/map/active-map';
import { isMinimized } from '@/lib/combat/attack-flow';
import { attackMenuStore, registerAttackHost } from '@/lib/combat/attack-menu-store';
import { AttackMenu } from './attack-menu';

export function AttackMenuHost({ campaignId }: { campaignId: string }) {
  const { engine } = useActiveMap(campaignId);
  useEffect(() => registerAttackHost(campaignId), [campaignId]);
  useCloseCoveringPanelOnAim(campaignId);
  return (
    <AttackMenu
      campaignId={campaignId}
      canAim={Boolean(engine) && engine?.viewer.role !== 'spectator'}
    />
  );
}

function useCloseCoveringPanelOnAim(campaignId: string) {
  const panels = usePanelStoreApi();
  useEffect(
    () =>
      attackMenuStore.subscribe((s, prev) => {
        if (s.flow.phase === 'closed' || s.flow.campaignId !== campaignId) return;
        if (!isMinimized(s.flow) || isMinimized(prev.flow)) return;
        const active = panels.getState().active;
        const mode = panelRegistry.find((p) => p.id === active)?.mode;
        if (active && mode !== 'floating') panels.getState().close();
      }),
    [campaignId, panels],
  );
}
