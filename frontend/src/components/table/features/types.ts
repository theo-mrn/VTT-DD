import type { LucideIcon } from 'lucide-react';
import type { ComponentType, LazyExoticComponent } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import type { RealtimeEnvelope } from '@/lib/realtime';
import type { Table } from '../contexte';
import type { PanelState } from '../panels/store';

/** Rôle d'un membre à la table. */
export type TableRole = 'gm' | 'player' | 'spectator';

export const ALL_ROLES = ['gm', 'player', 'spectator'] as const;

/** Largeur d'un panneau latéral sur grand écran (plein écran sur mobile). */
export type PanelWidth = 'compact' | 'fit' | 'narrow' | 'medium' | 'wide' | 'full';

/**
 * `side` : ancré à gauche, contre le rail, la carte reste utilisable à côté.
 * `centered` : fenêtre modale au centre (focus piégé, voile sur la carte).
 * `floating` : carte flottante contre le rail, haute comme son contenu (défilement interne
 * au-delà de l'écran) ; la carte de jeu reste visible et cliquable autour.
 */
export type PanelMode = 'side' | 'centered' | 'floating';

export interface PanelShortcut {
  /** Code de raccourci (`shortcutCode` : `KeyX` pour la lettre tapée, AZERTY comme QWERTY). */
  code: string;
  /** Touche affichée et annoncée (`aria-keyshortcuts`). */
  label: string;
}

/** Ce qu'une action reçoit : la table (campagne, rôle, héros) et les panneaux. */
export interface TableActionContext {
  table: Table;
  panels: StoreApi<PanelState>;
}

interface FeatureBase {
  id: string;
  icon: LucideIcon;
  /** Touche de la fonction ; absente quand toutes les lettres sont prises (carte et panneaux). */
  shortcut?: PanelShortcut;
  /** Rôles qui voient cette fonction. */
  roles: readonly TableRole[];
  /**
   * Fonction en plus : absente de la barre tant que l'utilisateur ne l'y ajoute pas
   * (personnalisation de la barre) ; sa touche, si elle en a une, marche quand même.
   */
  extra?: boolean;
  /**
   * Surcouche toujours montée au-dessus de la carte, chez tous quel que soit leur rôle (minuteur
   * lancé par le MJ, vu des joueurs) : elle décide elle-même de ce qu'elle montre.
   */
  overlay?: LazyExoticComponent<ComponentType>;
}

/** Un panneau qui s'ouvre par-dessus la carte (chargé à la première ouverture, puis gardé). */
export interface PanelFeature extends FeatureBase {
  kind: 'panel';
  width: PanelWidth;
  mode: PanelMode;
  /**
   * Événements temps réel (`dice.rolled`, `note.*`) qui signalent du nouveau dans ce panneau
   * quand il est fermé : pastille de non-lus sur le rail. Ceux de l'utilisateur ne comptent pas.
   */
  activity?: readonly string[];
  /**
   * Filtre du domaine sur ces événements : ceux qui ne me concernent pas (un chuchotement entre
   * joueurs, dont le MJ reçoit l'id sans pouvoir le lire) ne comptent pas.
   */
  activityFilter?: (event: RealtimeEnvelope, viewer: { userId: string; gm: boolean }) => boolean;
  component: LazyExoticComponent<ComponentType>;
}

/** Un bouton qui agit tout de suite, sans panneau. */
export interface ActionFeature extends FeatureBase {
  kind: 'action';
  run(ctx: TableActionContext): void;
  /** Hook : le bouton est allumé (bascule active, minuteur lancé…). */
  useActive?(): boolean;
}

/**
 * Une fonction de la table. Son nom et sa phrase courte (infobulles, personnalisation du rail)
 * sont au catalogue : `table.panels.<id>.label` et `.description` (docs/i18n.md § 6).
 */
export type TableFeature = PanelFeature | ActionFeature;
