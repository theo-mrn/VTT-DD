'use client';

/**
 * Panneau « Combat » du MJ (touche M ; docs/combat.md § 12.3), qui remplace le panneau MJ :
 * l'ancien tableau de bord du combat en une seule vue (ordre du tour, personnage actif,
 * cibles, rapports d'attaque), hors combat comme en combat ; les héros de la table en vue
 * secondaire (menu ⋯).
 */
import { Lock } from 'lucide-react';
import { EtatVide, Page } from '@/components/commun/page';
import { CombatDashboard } from '@/components/combat/turns/dashboard';
import { useTable } from '../contexte';

export function OngletCombat() {
  const { gm, campagne } = useTable();
  if (!gm)
    return (
      <Page>
        <EtatVide
          icone={Lock}
          titre="Réservé au maître du jeu"
          description="Ce panneau mène les tours et les rapports d’attaque de la table."
        />
      </Page>
    );
  return <CombatDashboard campagne={campagne} />;
}
