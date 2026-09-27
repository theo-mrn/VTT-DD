/**
 * Type des modèles de PNJ de l'ancienne app (`components/(personnages)/personnages.tsx`),
 * gardé pour les signatures reprises de la carte (glisser-déposer d'un modèle).
 * Le gestionnaire de PNJ lui-même (NPCManager) n'est pas encore porté.
 */
export interface NPC {
  id: string;
  Nomperso: string;
  categoryId?: string;
  imageURL?: string; // Base image
  imageURL2?: string; // Token/Composite
  niveau: number;

  Actions?: Array<{
    Nom: string;
    Description: string;
    Toucher: number;
  }>;

  // Index signature additive : stats du système actif — cf NewCharacter (map/types.ts).
  [key: string]: unknown;
}
