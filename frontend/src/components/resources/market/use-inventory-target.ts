'use client';

/**
 * Cible « Ajouter à l'inventaire » du marché, à la table : la fiche du héros incarné, si sa
 * lecture donne le droit d'écrire (décidé par le service character). Même opération que
 * l'inventaire de la fiche (`ajouter`) : une unité de plus sur une pile, sinon un nouvel
 * exemplaire ; refusée quand la sorte est pleine ou l'entrée déjà possédée sans exemplaires.
 */
import { useTranslations } from 'next-intl';
import { calculer, type Entree, type SystemeCharge } from '@vtt/rules';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ajouter, modesAjout } from '@/components/fiche/blocks/inventory/model';
import { messageErreur } from '@/lib/api';
import { useOperationsPersonnage, usePersonnage } from '@/lib/personnages';

export interface InventoryTarget {
  /** Nom du héros qui reçoit. */
  name: string;
  /** null : ajout possible ; sinon la raison du refus. */
  blocked(entry: Entree): string | null;
  add(entry: Entree): Promise<void>;
}

export function useInventoryTarget(
  heroId: string | null,
  systeme: SystemeCharge | null,
): InventoryTarget | null {
  const t = useTranslations();
  const hero = usePersonnage(heroId);
  const ops = useOperationsPersonnage(heroId ?? '');
  const fiche = hero.data;
  const ecrire = Boolean(
    fiche?.permissions?.write &&
    !fiche.inCreation &&
    systeme &&
    fiche.system.id === systeme.source.id,
  );
  const calcul = useMemo(() => {
    if (!ecrire || !fiche || !systeme) return null;
    try {
      return calculer(systeme, fiche.state);
    } catch {
      return null;
    }
  }, [ecrire, fiche, systeme]);

  const blocked = useCallback(
    (entry: Entree): string | null => {
      if (!calcul) return t('resources.market.sheetUnavailable');
      const sorte = calcul.systeme.sortes.get(entry.sorte);
      if (!sorte?.pour.includes(calcul.etat.type)) return t('resources.market.wrongInventory');
      const modes = modesAjout(calcul, entry, sorte);
      if (modes.empiler || modes.nouveau) return null;
      return calcul.etat.possessions.some((p) => p.entree === entry.id)
        ? t('resources.market.owned')
        : t('resources.market.max');
    },
    [calcul, t],
  );

  const add = useCallback(
    async (entry: Entree) => {
      if (!calcul || !fiche || !systeme) return;
      const w = ajouter(systeme, calcul.etat, entry.id);
      try {
        await ops.possession(w.demande, w.apercu);
        toast.success(t('resources.market.added', { item: entry.nom }), {
          description: fiche.name,
        });
      } catch (err) {
        toast.error(t('map.sounds.addFailed'), { description: messageErreur(err) });
      }
    },
    [calcul, fiche, systeme, ops, t],
  );

  if (!heroId || !ecrire || !fiche || !calcul) return null;
  return { name: fiche.name, blocked, add };
}
