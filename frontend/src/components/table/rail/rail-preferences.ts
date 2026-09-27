'use client';

import { useCallback, useMemo } from 'react';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { isPanelId, type PanelId, type TablePanel } from '../panels/registry';

/**
 * Personnalisation du rail : ordre et panneaux masqués, par utilisateur et par campagne (chaque
 * table a ses habitudes). Préférence d'affichage gardée dans ce navigateur. Un panneau masqué
 * reste ouvrable au clavier et par ses liens.
 */
interface RailLayout {
  order: PanelId[];
  hidden: PanelId[];
}

const VIDE: RailLayout = { order: [], hidden: [] };

/** Ne garde que des identifiants connus, sans doublon (la valeur vient du stockage local). */
function nettoyer(valeur: unknown): RailLayout {
  if (!valeur || typeof valeur !== 'object') return VIDE;
  const ids = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is PanelId => isPanelId(x)))] : [];
  const brut = valeur as Partial<Record<keyof RailLayout, unknown>>;
  return { order: ids(brut.order), hidden: ids(brut.hidden) };
}

export interface RailItem {
  panel: TablePanel;
  hidden: boolean;
}

export function useRailLayout(userId: string, campaignId: string, available: TablePanel[]) {
  const [brut, definir] = usePreferenceLocale<unknown>(`table-rail:${userId}:${campaignId}`, VIDE);
  const layout = useMemo(() => nettoyer(brut), [brut]);

  /** Tous les panneaux du rôle : ordre choisi d'abord, les nouveaux à la suite. */
  const items = useMemo<RailItem[]>(() => {
    const parId = new Map(available.map((p) => [p.id, p]));
    const ordre = [
      ...layout.order.filter((id) => parId.has(id)),
      ...available.map((p) => p.id).filter((id) => !layout.order.includes(id)),
    ];
    return ordre.map((id) => ({ panel: parId.get(id)!, hidden: layout.hidden.includes(id) }));
  }, [available, layout]);

  const move = useCallback(
    (id: PanelId, delta: -1 | 1) => {
      const ordre = items.map((i) => i.panel.id);
      const de = ordre.indexOf(id);
      const vers = de + delta;
      if (de < 0 || vers < 0 || vers >= ordre.length) return;
      [ordre[de], ordre[vers]] = [ordre[vers]!, ordre[de]!];
      definir({ ...layout, order: ordre });
    },
    [items, layout, definir],
  );

  const setHidden = useCallback(
    (id: PanelId, hidden: boolean) =>
      definir({
        ...layout,
        hidden: hidden ? [...layout.hidden, id] : layout.hidden.filter((x) => x !== id),
      }),
    [layout, definir],
  );

  const reset = useCallback(() => definir(VIDE), [definir]);

  const customized = layout.order.length > 0 || layout.hidden.length > 0;

  return { items, move, setHidden, reset, customized };
}
