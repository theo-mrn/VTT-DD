import type {
  AchatDisponible,
  Attribut,
  EtatEntite,
  Fiche,
  Presentation,
  SystemeCharge,
  Valeur,
} from '@vtt/rules';
import type { Character, PossessionUpdate } from '@/lib/characters';

/**
 * Props de l'inventaire. Le composant ne lit aucun contexte : tout arrive
 * ici, ce qui permet de l'afficher dans la fiche, dans un panneau de la
 * table ou dans une fenêtre MJ. `ConnectedInventoryWidget` les remplit
 * depuis le contexte de la fiche.
 */
export interface InventoryWidgetProps {
  /** Titre du bloc (celui de la présentation, sinon « Inventaire »). */
  title?: string;
  /** Système chargé : sortes activables, champs, achats, monnaies. */
  system: SystemeCharge;
  /** Présentation du système : son thème est reposé sur les dialogues (portails). */
  presentation: Presentation;
  /** Personnage tel que renvoyé par le service character. */
  character: Character;
  /** État affiché (serveur + aperçus des écritures en attente). */
  state: EtatEntite;
  /** Fiche calculée sur `state` par `calculer()` : possessions, valeurs, sources, erreurs. */
  sheet: Fiche;
  /** Achats possibles (serveur, sinon calcul local) : achat d'équipement dans la bourse. */
  purchases: AchatDisponible[];
  /** Lecture seule : aucune action d'écriture n'est proposée. */
  readOnly?: boolean;
  /**
   * Sortes à afficher. Par défaut : les sortes activables sans rangs qui
   * portent des champs (voir `equipmentKinds`).
   */
  kinds?: string[];
  /** Affiche la bourse en tête du bloc (vrai par défaut). */
  showPurse?: boolean;

  // ─── Écritures : chacune renvoie vrai si le serveur l'a acceptée ───────────
  /**
   * Ajout ou mise à jour d'un exemplaire (`POST /possessions`) : équipement,
   * quantité, champs, bonus de l'objet (`effets`), nouvel exemplaire (`nouveau`).
   */
  onUpdateItem(update: PossessionUpdate): Promise<boolean>;
  /** Retire un exemplaire (`DELETE /possessions/:entree?exemplaire=`). */
  onRemoveItem(entry: string, copy?: string): Promise<boolean>;
  /** Achat d'une entrée par la bourse (absent : pas d'achat proposé). */
  onBuy?(purchase: string, item: string): Promise<boolean>;
  /** Annulation d'une ligne du journal (absent : pas d'annulation proposée). */
  onRefund?(index: number): Promise<boolean>;
  /** Saisie de valeurs : le montant de la bourse, selon la `saisie` de son attribut. */
  onSetValues?(values: Record<string, Valeur>): Promise<boolean>;
  /**
   * L'attribut se saisit-il maintenant (voir `saisie` : création, jeu, MJ) ?
   * Absent : seulement pendant la création, hors lecture seule.
   */
  canSetValue?(attribute: Attribut): boolean;
}
