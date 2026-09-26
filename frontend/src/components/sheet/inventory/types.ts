import type {
  AchatDisponible,
  EtatEntite,
  Fiche,
  Presentation,
  SystemeCharge,
  Valeur,
} from '@vtt/rules';
import type { Character } from '@/lib/characters';
import type { ItemUpdate } from './api';

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
  /** Ajout, équipement, champs de l'exemplaire, bonus de l'objet (`effets`). */
  onUpdateItem(update: ItemUpdate): Promise<boolean>;
  /** Retire la possession (DELETE /possessions/:entree). */
  onRemoveItem(entry: string): Promise<boolean>;
  /** Achat d'une entrée par la bourse (absent : pas d'achat proposé). */
  onBuy?(purchase: string, item: string): Promise<boolean>;
  /** Annulation d'une ligne du journal (absent : pas d'annulation proposée). */
  onRefund?(index: number): Promise<boolean>;
  /** Saisie de valeurs : le montant de la bourse, pendant la création seulement. */
  onSetValues?(values: Record<string, Valeur>): Promise<boolean>;
}
