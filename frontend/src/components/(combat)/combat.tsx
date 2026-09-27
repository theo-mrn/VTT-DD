'use client';

/**
 * Attaque lancée depuis la carte (menu d'un token, gabarit de zone). L'ancien
 * composant de combat écrivait jets, dégâts et rapports dans Firestore ; les
 * actions passent maintenant par le service character (panneau d'actions de
 * la fiche) et le combat par le service campaign. L'attaque depuis la carte
 * n'est pas encore branchée : ce panneau l'annonce.
 */
import { ComingSoonPanel } from '@/components/(map)/ComingSoonPanel';

export default function Combat({
  onClose,
}: {
  attackerId: string;
  targetId: string;
  targetIds?: string[];
  onClose(): void;
}) {
  return (
    <ComingSoonPanel
      isOpen
      title="Attaque depuis la carte"
      description="Bientôt disponible. En attendant, lancez l'action depuis le panneau d'actions de la fiche."
      onClose={onClose}
    />
  );
}
