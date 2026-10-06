'use client';

/**
 * Relie la table au module `combat` de la carte (surcouche sans rendu) : ce que les anneaux
 * montrent vient de React et part dans l'état du module.
 *
 * - Participant qui agit (`useCombat`, vue expurgée pour un joueur : un participant caché
 *   n'a pas d'anneau), et participants hors de combat (tokens grisés).
 * - Cibles des attaques ouvertes (réactions, dés, rapport en attente) : le service ne donne à
 *   un joueur que les siennes.
 * - Visées en direct (`combat.aim`, MJ seulement) : effacées à `end` ou au bout de 30 s sans
 *   nouvelles.
 * - États des personnages posés (badges) : fiches que je peux lire seulement (MJ : toutes ;
 *   joueur : héros et alliés, jamais un PNJ ennemi, Q4), cache partagé avec la fiche.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { calculer, estHorsCombat } from '@vtt/rules';
import { HeartPulse } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { combatPresentation, statesOf } from '@/components/combat/turns/use-cast';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { campagnes, clePersonnagesCampagne, useCampagne } from '@/lib/campagnes';
import { AIM_TTL_MS, AimBoard, COMBAT_AIM_KIND } from '@/lib/combat/aim';
import { isOpen, useAttacks } from '@/lib/combat/use-attacks';
import { currentActorId, useCombat, useCombatCommands } from '@/lib/combat/use-combat';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { readableSheets, type MapStateBadge } from '../engine/badges';
import { defeatedOf } from '../engine/model';
import { combatModuleOf } from '../engine/register';
import type { TokenData } from '@/lib/map/features/tokens/engine/model';
import { clesPersonnages, personnages, type FichePersonnage } from '@/lib/personnages';
import { useCampaignEphemeral } from '@/lib/realtime';
import { useMapState } from '@/components/map/engine-context';
import { compareCodeUnits } from '@vtt/contracts';

const EMPTY: ReadonlyMap<string, unknown> = new Map();

const dataOf = (results: readonly { data?: FichePersonnage }[]) => results.map((r) => r.data);

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

  // Hors de combat : participants tombés que je vois (la vue expurgée ne donne que ceux-là)
  const defeatedKey = defeatedOf(combat).join(',');
  const defeatedIds = useMemo(() => (defeatedKey ? defeatedKey.split(',') : []), [defeatedKey]);

  useEffect(() => {
    mod?.state.setState({ turnCharacterId, openTargetIds, defeatedIds });
  }, [mod, turnCharacterId, openTargetIds, defeatedIds]);

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
    return readableSheets([...ids].sort(compareCodeUnits), {
      gm,
      mine,
      sideOf: (id) => sides.get(id),
    });
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

  // Relever (MJ) : un participant marqué hors de combat dont la fiche ne l'est plus (PV rendus,
  // soin, état retiré) redevient actif tout seul ; et « Relever » au menu de son token
  const commands = useCombatCommands(campaignId);
  const revived = useRef(new Set<string>());
  useEffect(() => {
    const s = sys.data;
    if (!gm || !s || !defeatedIds.length) return;
    for (const sheet of sheets) {
      if (!sheet || !defeatedIds.includes(sheet.id)) continue;
      const key = `${sheet.id}:${sheet.updatedAt}`;
      if (revived.current.has(key)) continue;
      let down: boolean | undefined;
      try {
        down = estHorsCombat(calculer(s.systeme, sheet.state));
      } catch {
        continue;
      }
      if (down !== false) continue;
      revived.current.add(key);
      void commands.updateParticipant(sheet.id, { defeated: false }).catch(() => undefined);
    }
  }, [gm, sys.data, sheets, defeatedIds, commands]);
  useEffect(() => {
    if (!gm) return;
    return engine.registerMenuProvider(({ entities }) => {
      if (entities.length !== 1) return [];
      const id = (entities[0]!.data as TokenData).characterId;
      if (typeof id !== 'string' || !defeatedIds.includes(id)) return [];
      return [
        {
          id: 'combat:revive',
          label: 'Relever',
          icon: HeartPulse,
          urgent: true,
          primary: true,
          run: () => void commands.updateParticipant(id, { defeated: false }),
        },
      ];
    });
  }, [gm, engine, defeatedIds, commands]);

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
