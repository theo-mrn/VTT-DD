/**
 * Demande de jet venue d'ailleurs que le lanceur (bouton « Lancer » d'une capacité de la
 * fiche) : le panneau des dés de la table la prend dès qu'il est monté pour ce personnage,
 * allume les bonus demandés et ajoute à la formule les attributs qu'ils visent.
 */
import { create } from 'zustand';

export interface DemandeJet {
  personnageId: string;
  /** Clés des bonus du lanceur à allumer (`bonusDeJet`). */
  bonus: string[];
  /** Attributs visés, ajoutés à la formule s'ils n'y sont pas (`DEX`). */
  attributs: string[];
}

export const useDemandeJet = create<{
  demande: DemandeJet | null;
  demander(d: DemandeJet): void;
  vider(): void;
}>((set) => ({
  demande: null,
  demander: (demande) => set({ demande }),
  vider: () => set({ demande: null }),
}));

/** Formule avec les attributs demandés ajoutés en clés nues, s'ils n'y sont pas déjà. */
export function formuleAvecAttributs(formule: string, attributs: readonly string[]): string {
  const presents = new Set([...formule.matchAll(/@?([A-Za-z_]\w*)/g)].map((m) => m[1]));
  return attributs
    .filter((a) => !presents.has(a))
    .reduce((f, a) => (f ? `${f} + ${a}` : a), formule.trim());
}
