/**
 * Ce dont les blocs « entrées à rangs », « liste d'entrées » et « arbres » ont
 * besoin, en props explicites : ils ne lisent aucun contexte eux-mêmes. Un
 * adaptateur (`useSheetBindings`) les remplit depuis le contexte de la fiche.
 */
import type { AchatDisponible, Fiche, Presentation, SystemeCharge } from '@vtt/rules';
import type { CSSProperties } from 'react';
import type { Character, PossessionUpdate } from '@/lib/characters';

export interface SheetBindings {
  /** Système chargé : sortes, entrées, achats, monnaies, arbres. */
  system: SystemeCharge;
  /** Présentation du système (géométrie des arbres…). */
  presentation: Presentation;
  /** Fiche calculée sur l'état affiché (possessions effectives, marques, valeurs). */
  sheet: Fiche;
  /** Personnage (facultatif : sert au nom affiché dans les confirmations). */
  character?: Character;
  /** Achats possibles (`GET /achats`, ou calcul local pendant une écriture). */
  purchases: AchatDisponible[];
  /** Lecture seule : aucun achat ni modification. */
  readOnly: boolean;
  /** Outils MJ : fixer un rang sans dépense, réinitialiser une entrée, ajout libre. */
  gm: boolean;
  /** Variables CSS du thème, reposées sur les dialogues (rendus hors du cadre). */
  themeVariables?: CSSProperties;
  /** `POST /achats` */
  onBuy(purchase: string, item: string): Promise<boolean>;
  /** `POST /achats/rembourser` */
  onRefund(index: number): Promise<boolean>;
  /** `POST /possessions` (ajout ou mise à jour, sans dépense) */
  onUpdatePossession(update: PossessionUpdate): Promise<boolean>;
  /** `DELETE /possessions/:entree?exemplaire=` (absent : l'exemplaire sans identifiant) */
  onRemovePossession(entry: string, copy?: string): Promise<boolean>;
}
