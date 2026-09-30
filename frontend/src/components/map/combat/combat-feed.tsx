'use client';

/**
 * Relie la table au module `combat` de la carte (surcouche sans rendu) : ce que les anneaux
 * montrent vient de React et part dans l'état du module.
 *
 * - Participant qui agit (`useCombat`, vue expurgée pour un joueur : un participant caché
 *   n'a pas d'anneau).
 * - Cibles des attaques ouvertes (réactions, dés, rapport en attente) : le service ne donne à
 *   un joueur que les siennes.
 * - Visées en direct (`combat.aim`, MJ seulement) : effacées à `end` ou au bout de 30 s sans
 *   nouvelles.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AIM_TTL_MS, AimBoard, COMBAT_AIM_KIND } from '@/lib/combat/aim';
import { isOpen, useAttacks } from '@/lib/combat/use-attacks';
import { currentActorId, useCombat } from '@/lib/combat/use-combat';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { combatModuleOf } from '@/lib/map/modules/combat/register';
import { useCampaignEphemeral } from '@/lib/realtime';

export function CombatMapFeed({ engine }: { engine: MapEngine }) {
  const mod = combatModuleOf(engine);
  const campaignId = engine.store.getState().campaignId;
  const gm = engine.viewer.role === 'gm';
  const { combat } = useCombat(campaignId);
  const inProgress = useAttacks(campaignId, { status: 'open', limit: 50 });
  const pending = useAttacks(campaignId, { status: 'pending', limit: 50 });

  const turnCharacterId = currentActorId(combat);
  const openTargetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of [...inProgress.attacks, ...pending.attacks])
      if (isOpen(a.status)) for (const t of a.targets) ids.add(t.characterId);
    return [...ids];
  }, [inProgress.attacks, pending.attacks]);

  useEffect(() => {
    mod?.state.setState({ turnCharacterId, openTargetIds });
  }, [mod, turnCharacterId, openTargetIds]);

  // Visées des autres (le MJ seul les reçoit : `gmOnly`)
  const board = useRef(new AimBoard());
  const push = useCallback(
    () =>
      mod?.state.setState({
        aims: board.current
          .list()
          .map((a) => ({ attackerId: a.attackerId, targetIds: a.targetIds })),
      }),
    [mod],
  );
  useCampaignEphemeral(gm ? campaignId : null, [COMBAT_AIM_KIND], (m) => {
    if (board.current.receive(m.from.userId, m.data, Date.now())) push();
  });
  useEffect(() => {
    if (!gm) return;
    const timer = setInterval(() => {
      if (board.current.expire(Date.now())) push();
    }, AIM_TTL_MS / 6);
    return () => clearInterval(timer);
  }, [gm, push]);

  return null;
}
