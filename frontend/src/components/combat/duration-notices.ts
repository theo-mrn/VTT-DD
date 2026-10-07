'use client';

/**
 * Fin des durées annoncée à la table (docs/combat.md § 18.7) : un toast discret quand un passage
 * de tour retire des états ou des bonus (`combat.durations_expired`). Le MJ reçoit l'annonce
 * complète puis, pour le même décompte, celle des joueurs : une seule est montrée.
 */
import { translate } from '@/i18n/runtime';
import type { CombatDurationsExpiredPayload } from '@vtt/contracts';
import { useRef } from 'react';
import { toast } from 'sonner';
import { useCampaignEvents } from '@/lib/realtime';

/** « Béni prend fin · Aria », « Fin de Béni (Aria), Marqué (Orc) » ; null : rien à dire. */
export function expiryMessage(
  p: Pick<CombatDurationsExpiredPayload, 'expirations'>,
  nameOf: (id: string) => string,
): string | null {
  const parts = p.expirations.flatMap((x) =>
    x.entries.map((e) => ({ entry: e.name, who: nameOf(x.characterId) })),
  );
  if (!parts.length) return null;
  if (parts.length === 1)
    return translate('combat.durations.expiredOne', {
      entry: parts[0]!.entry,
      name: parts[0]!.who,
    });
  return translate('combat.durations.expiredMany', {
    list: parts.map((x) => `${x.entry} (${x.who})`).join(', '),
  });
}

/** Écoute les fins de durée de la campagne et les annonce, une fois par décompte. */
export function useDurationNotices(
  campaignId: string,
  nameOf: (id: string) => string,
  enabled = true,
) {
  const seen = useRef(new Set<string>());
  useCampaignEvents<CombatDurationsExpiredPayload>(
    campaignId,
    ['combat.durations_expired'],
    (e) => {
      const p = e.event.payload;
      if (!p?.tickId || seen.current.has(p.tickId)) return;
      seen.current.add(p.tickId);
      const message = expiryMessage(p, nameOf);
      if (message) toast.info(message);
    },
    { enabled },
  );
}
