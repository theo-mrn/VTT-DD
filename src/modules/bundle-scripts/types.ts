import type React from 'react';
import type { GameSystemDefinition } from '@/modules/game-system/types';
import type { ModuleAPI, SidebarTabContribution, SidebarActionContribution } from '@/modules/types';
import type { VTTModuleSDK } from '@/modules/sdk';
import type { rollComposedDicePool, rollSymbolDie, resolveSymbolDiceRoll } from '@/lib/rules-engine';
import type { MapViewFlags } from '@/app/[roomid]/map/view-flags-store';

// Types du runtime des scripts de bundle (scripts/main.tsx d'un zip de règles). Le point d'entrée
// exporte par défaut une fonction register : `export default (ctx: BundleScriptContext) => void`.
// Confiance totale (même modèle que les modules externes) — mais l'API ci-dessous couvre les usages
// courants sans toucher à Firebase directement.

/** Contributions déclarées par un bundle — collectées puis enregistrées comme UN module synthétique
 *  `gamesystem:{systemId}` dans le moduleRegistry existant (mêmes rails que les modules externes :
 *  Sidebar.tsx et map/layout.tsx les consomment sans travail supplémentaire). */
export interface BundleContributions {
  /** Panneaux React complets, ouverts par un onglet sidebar (rendu bout-en-bout déjà en place). */
  sidebarTabs?: SidebarTabContribution[];
  /** Boutons sidebar à comportement libre, éventuellement cycliques (states). */
  sidebarActions?: SidebarActionContribution[];
}

/** API fournie aux scripts de bundle — ModuleAPI existant (events, données de salle RTDB, toasts)
 *  étendu de ce qu'un bundle de règles manipule le plus. */
export interface BundleScriptAPI extends ModuleAPI {
  /** Définition du système de règles actif au moment du chargement (lecture seule). */
  gameSystem: GameSystemDefinition;
  /** Moteur de dés du projet (src/lib/rules-engine) — mêmes fonctions que le DiceRoller natif. */
  dice: {
    rollComposedDicePool: typeof rollComposedDicePool;
    rollSymbolDie: typeof rollSymbolDie;
    resolveSymbolDiceRoll: typeof resolveSymbolDiceRoll;
  };
  /** Personnage incarné par l'utilisateur courant (doc brut cartes/{roomId}/characters/{persoId}) —
   *  null pour un MJ sans personnage incarné. */
  character: {
    get: () => Promise<Record<string, unknown> | null>;
    subscribe: (cb: (data: Record<string, unknown> | null) => void) => () => void;
  };
  /** Contrôle du rendu de la carte pour l'utilisateur COURANT (local, non partagé). Un script écrit
   *  ces flags pour un mode de vision alternatif ; la boucle de rendu les applique aussitôt.
   *  - revealAll : voir tout (au-delà du rayon, personnages cachés / dans le brouillard).
   *  - noShadows : ne pas dessiner les ombres portées (voir "à travers les murs").
   *  - noFog     : ne pas dessiner le brouillard.
   *  - tint      : teinte cosmétique du canvas (ex '#00ff88' pour une vision verte), null = aucune. */
  map: {
    setViewFlags: (flags: Partial<MapViewFlags>) => void;
    resetViewFlags: () => void;
    getViewFlags: () => MapViewFlags;
  };
}

/** Contexte passé à la fonction register du point d'entrée (export default de scripts/main.*). */
export interface BundleScriptContext {
  React: typeof React;
  ui: VTTModuleSDK['ui'];
  icons: VTTModuleSDK['icons'];
  api: BundleScriptAPI;
  /** Définition du système actif au moment du chargement (lecture seule). */
  gameSystem: GameSystemDefinition;
  /** Déclare les contributions du bundle — appelable plusieurs fois, les listes se cumulent. */
  register: (contributions: BundleContributions) => void;
}
