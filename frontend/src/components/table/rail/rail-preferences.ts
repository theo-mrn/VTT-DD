'use client';

import { useCallback, useMemo } from 'react';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { resolveFeatureId, type FeatureId, type TableFeatureItem } from '../panels/registry';

/**
 * Personnalisation du rail : ordre et panneaux masqués, par utilisateur et par campagne (chaque
 * table a ses habitudes). Préférence d'affichage gardée dans ce navigateur. Un panneau masqué
 * reste ouvrable au clavier et par ses liens.
 */
interface RailLayout {
  order: FeatureId[];
  hidden: FeatureId[];
  /** Fonctions en plus (`extra`) ajoutées à la barre par l'utilisateur. */
  shown: FeatureId[];
}

const VIDE: RailLayout = { order: [], hidden: [], shown: [] };

/** Ne garde que des identifiants connus, sans doublon (la valeur vient du stockage local). */
function nettoyer(valeur: unknown): RailLayout {
  if (!valeur || typeof valeur !== 'object') return VIDE;
  // Anciens identifiants (`mj`) ramenés à leur panneau d'aujourd'hui
  const ids = (v: unknown) =>
    Array.isArray(v)
      ? [
          ...new Set(
            v
              .map((x) => (typeof x === 'string' ? resolveFeatureId(x) : null))
              .filter((x): x is FeatureId => x !== null),
          ),
        ]
      : [];
  const brut = valeur as Partial<Record<keyof RailLayout, unknown>>;
  return { order: ids(brut.order), hidden: ids(brut.hidden), shown: ids(brut.shown) };
}

export interface RailItem {
  feature: TableFeatureItem;
  hidden: boolean;
}

export function useRailLayout(userId: string, campaignId: string, available: TableFeatureItem[]) {
  const [brut, definir] = usePreferenceLocale<unknown>(`table-rail:${userId}:${campaignId}`, VIDE);
  const layout = useMemo(() => nettoyer(brut), [brut]);

  /** Toutes les fonctions du rôle : ordre choisi d'abord, les nouvelles à la suite. */
  const items = useMemo<RailItem[]>(() => {
    const parId = new Map(available.map((p) => [p.id, p]));
    const ordre = [
      ...layout.order.filter((id) => parId.has(id)),
      ...available.map((p) => p.id).filter((id) => !layout.order.includes(id)),
    ];
    return ordre.map((id) => {
      const feature = parId.get(id)!;
      const hidden = feature.extra ? !layout.shown.includes(id) : layout.hidden.includes(id);
      return { feature, hidden };
    });
  }, [available, layout]);

  const move = useCallback(
    (id: FeatureId, delta: -1 | 1) => {
      const ordre = items.map((i) => i.feature.id);
      const de = ordre.indexOf(id);
      const vers = de + delta;
      if (de < 0 || vers < 0 || vers >= ordre.length) return;
      [ordre[de], ordre[vers]] = [ordre[vers]!, ordre[de]!];
      definir({ ...layout, order: ordre });
    },
    [items, layout, definir],
  );

  const setHidden = useCallback(
    (id: FeatureId, hidden: boolean) => {
      const sans = (l: FeatureId[]) => l.filter((x) => x !== id);
      // Fonction en plus : on l'ajoute (ou la retire) ; les autres : on les masque (ou montre)
      if (available.find((f) => f.id === id)?.extra)
        definir({ ...layout, shown: hidden ? sans(layout.shown) : [...sans(layout.shown), id] });
      else
        definir({ ...layout, hidden: hidden ? [...sans(layout.hidden), id] : sans(layout.hidden) });
    },
    [available, layout, definir],
  );

  const reset = useCallback(() => definir(VIDE), [definir]);

  const customized = layout.order.length > 0 || layout.hidden.length > 0 || layout.shown.length > 0;

  // Stable entre deux rendus : le rail (mémoïsé) ne se re-rend que si sa disposition change
  return useMemo(
    () => ({ items, move, setHidden, reset, customized }),
    [items, move, setHidden, reset, customized],
  );
}
