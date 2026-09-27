/**
 * useActiveAttackTargets.ts — IDs des personnages ciblés par l'attaquant actif du combat
 *
 * N'écoute les attaques que si le personnage actif du tour est un JOUEUR :
 * une attaque lancée par un PNJ/allié, ou par un joueur hors de son tour, ne doit
 * jamais faire surligner de cible sur la carte du MJ.
 *
 * Sources de l'ancienne app :
 * - `combat/{id}/engaged/current` : marqueur écrit dès le lancer du dé d'attaque,
 *   avant même de connaître le résultat, pour un surlignage immédiat. Il passe
 *   maintenant par le canal éphémère du temps réel (`attack.engaged`
 *   { attackerId, targets, timestamp }) ;
 * - `combat/{id}/rapport` : rapports de dégâts finaux. Pas d'équivalent côté
 *   serveur (rapports non importés) : cette source reste vide pour l'instant.
 * Le marqueur `engaged` expire après ENGAGED_TTL_MS pour ne jamais rester périmé
 * si le MJ ne referme pas le combat.
 */

import { useEffect, useMemo, useState } from 'react';
import { useCampaignEphemeral } from '@/lib/realtime';

const ENGAGED_TTL_MS = 15000;

export function useActiveAttackTargets(
  roomId: string | null,
  activePlayerId: string | null,
  isActivePlayerAPlayerCharacter: boolean,
): Set<string> {
  const [engagedTargetIds, setEngagedTargetIds] = useState<Set<string>>(new Set());
  const [reportedTargetIds] = useState<Set<string>>(new Set());
  const [engaged, setEngaged] = useState<{
    attackerId: string;
    targets: string[];
    receivedAt: number;
  } | null>(null);

  useCampaignEphemeral<{ attackerId?: string; targets?: string[] }>(
    roomId,
    ['attack.engaged'],
    (m) => {
      if (!m.data?.attackerId) return;
      setEngaged({
        attackerId: m.data.attackerId,
        targets: m.data.targets ?? [],
        receivedAt: Date.now(),
      });
    },
  );

  useEffect(() => {
    if (
      !roomId ||
      !activePlayerId ||
      !isActivePlayerAPlayerCharacter ||
      !engaged ||
      engaged.attackerId !== activePlayerId
    ) {
      setEngagedTargetIds(new Set());
      return;
    }

    const age = Date.now() - engaged.receivedAt;
    if (age > ENGAGED_TTL_MS) {
      setEngagedTargetIds(new Set());
      return;
    }

    setEngagedTargetIds(new Set<string>(engaged.targets));
    const expiryTimer = setTimeout(() => setEngagedTargetIds(new Set()), ENGAGED_TTL_MS - age);
    return () => clearTimeout(expiryTimer);
  }, [roomId, activePlayerId, isActivePlayerAPlayerCharacter, engaged]);

  return useMemo(
    () => new Set<string>([...engagedTargetIds, ...reportedTargetIds]),
    [engagedTargetIds, reportedTargetIds],
  );
}
