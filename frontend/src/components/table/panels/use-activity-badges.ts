'use client';

import { useMemo, useRef } from 'react';
import { useCampaignEvents } from '@/lib/realtime';
import type { TablePanel } from './registry';
import { usePanelStoreApi } from './store';

const correspond = (motif: string, type: string) =>
  motif.endsWith('.*') ? type.startsWith(motif.slice(0, -1)) : motif === type;

/**
 * Pastilles de non-lus : un événement temps réel déclaré par un panneau (`activity` du registre)
 * arrive pendant qu'il est fermé, et n'est pas de mon fait. Rien d'autre que le type de
 * l'événement n'est lu : chaque domaine garde ses données.
 */
export function useActivityBadges(campaignId: string, me: string, panels: TablePanel[]) {
  const store = usePanelStoreApi();
  const suivis = useMemo(() => panels.filter((p) => p.activity?.length), [panels]);
  const types = useMemo(() => [...new Set(suivis.flatMap((p) => p.activity ?? []))], [suivis]);
  const ref = useRef(suivis);
  ref.current = suivis;

  useCampaignEvents(
    campaignId,
    types,
    (e) => {
      if (e.event.actor.userId === me) return;
      for (const p of ref.current)
        if (p.activity?.some((m) => correspond(m, e.event.type))) store.getState().bumpBadge(p.id);
    },
    { enabled: types.length > 0 },
  );
}
