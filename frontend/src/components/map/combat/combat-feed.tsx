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
 * - États des personnages posés (badges) : fiches que je peux lire seulement (MJ : toutes ;
 *   joueur : héros et alliés, jamais un PNJ ennemi, Q4), cache partagé avec la fiche.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { combatPresentation, statesOf } from '@/components/combat/turns/use-cast';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { campagnes, clePersonnagesCampagne, useCampagne } from '@/lib/campagnes';
import { AIM_TTL_MS, AimBoard, COMBAT_AIM_KIND } from '@/lib/combat/aim';
import { isOpen, useAttacks } from '@/lib/combat/use-attacks';
import { currentActorId, useCombat } from '@/lib/combat/use-combat';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { readableSheets, type MapStateBadge } from '@/lib/map/modules/combat/badges';
import { combatModuleOf } from '@/lib/map/modules/combat/register';
import type { TokenData } from '@/lib/map/modules/tokens/model';
import { clesPersonnages, personnages, type FichePersonnage } from '@/lib/personnages';
import { useCampaignEphemeral } from '@/lib/realtime';
import { useMapState } from '../engine-context';

const EMPTY: ReadonlyMap<string, unknown> = new Map();

const dataOf = (results: readonly { data?: FichePersonnage | undefined }[]) =>
  results.map((r) => r.data);

export function CombatMapFeed({ engine }: { engine: MapEngine }) {
  const mod = combatModuleOf(engine);
  const campaignId = engine.store.getState().campaignId;
  const gm = engine.viewer.role === 'gm';
  const mine = engine.viewer.characterIds;
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

  // États des personnages posés, lus sur leur fiche (badges des tokens)
  const campagne = useCampagne(campaignId);
  const sys = useCampaignSystem(campagne.data?.system, campaignId);
  const list = useQuery({
    queryKey: clePersonnagesCampagne(campaignId),
    queryFn: () => campagnes.personnages(campaignId),
  });
  const tokenMap = useMapState((s) => s.collections.tokens ?? EMPTY);
  const sheetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tokenMap.values()) {
      const d = t as TokenData;
      if (!d.draft && typeof d.characterId === 'string') ids.add(d.characterId);
    }
    const sides = new Map((list.data ?? []).map((c) => [c.characterId, c.side]));
    return readableSheets([...ids].sort(), { gm, mine, sideOf: (id) => sides.get(id) });
  }, [tokenMap, list.data, gm, mine]);
  const sheets = useQueries({
    queries: sheetIds.map((id) => ({
      queryKey: clesPersonnages.un(id),
      queryFn: () => personnages.lire(id),
      staleTime: 30_000,
      retry: false,
    })),
    combine: dataOf,
  });
  const states = useMemo(() => {
    const out = new Map<string, readonly MapStateBadge[]>();
    const s = sys.data;
    if (!s) return out;
    const { stateSorts, stateIcons } = combatPresentation(s.presentation);
    for (const sheet of sheets) {
      if (!sheet) continue;
      const list = statesOf(sheet, s.systeme, stateSorts, stateIcons).map((x) => ({
        icon: x.icon,
        name: x.name,
        duration: x.duration,
      }));
      if (list.length) out.set(sheet.id, list);
    }
    return out;
  }, [sheets, sys.data]);
  useEffect(() => {
    mod?.state.setState({ states });
  }, [mod, states]);

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
