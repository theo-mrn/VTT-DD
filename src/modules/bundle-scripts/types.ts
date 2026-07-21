import type React from 'react';
import type { GameSystemDefinition } from '@/modules/game-system/types';
import type { ModuleAPI, SidebarTabContribution, SidebarActionContribution, CharacterWidgetContribution, CreationTabContribution, SearchDrawerTabContribution } from '@/modules/types';
import type { VTTModuleSDK } from '@/modules/sdk';
import type { rollComposedDicePool, rollSymbolDie, resolveSymbolDiceRoll } from '@/lib/rules-engine';
import type { ComponentType } from 'react';
import type { MapViewFlags } from '@/app/[roomid]/map/view-flags-store';
import type { MapCharacterPosition } from '@/app/[roomid]/map/character-positions-store';
import type { MapOverlayOption } from '@/app/[roomid]/map/map-overlay-store';

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
  /** Widgets de fiche personnage (react-grid-layout) — la fiche les propose dans son sélecteur
   *  "ajouter un widget" comme ceux des modules (ex widget Obligation d'un bundle Star Wars). */
  characterWidgets?: CharacterWidgetContribution[];
  /** Onglets supplémentaires du flux de création de personnage (/creation) — le composant remplit
   *  un brouillon générique de champs fusionné dans le doc personnage à la sauvegarde (ex l'étape
   *  Obligation d'un bundle Star Wars). */
  creationTabs?: CreationTabContribution[];
  /** Onglets supplémentaires du drawer "Recherche unifiée" de la carte (MJ, ajout de PNJ/objets/sons
   *  par drag-and-drop) — pour les propres éléments déposables sur la carte d'un bundle (ex les
   *  vaisseaux d'un système Star Wars, référençant Salle/{roomId}/groupEntities). */
  searchDrawerTabs?: SearchDrawerTabContribution[];
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
    /** Positions résolues des personnages de la carte courante (Firestore + surcharges par carte +
     *  temps réel RTDB, fusion faite par la page). Liste vide hors de la carte. Un script côté
     *  joueur doit filtrer les visibilités 'hidden'/'gm_only'/'invisible' avant affichage. */
    getCharacters: () => MapCharacterPosition[];
    /** S'abonne aux mises à jour de positions ; cb est appelé immédiatement avec l'état courant,
     *  puis à chaque changement. Retourne la fonction de désabonnement (l'hôte la rappelle aussi au
     *  déchargement du bundle). */
    subscribeCharacters: (cb: (chars: MapCharacterPosition[]) => void) => () => void;
    /** Nom de la scène/ville courante ('' pour la carte principale). Les abonnés de
     *  subscribeCharacters sont aussi réveillés quand il change. */
    getMapName: () => string;
    /** Dimensions (px) de l'image/vidéo de fond actuellement chargée — null hors de la carte ou
     *  avant chargement. Nécessaire pour convertir un pourcentage (0-100) en coordonnées "px monde"
     *  comparables aux x/y de getCharacters() (ex un gabarit de zone défini en % d'un pad UI). */
    getBackgroundSize: () => { width: number; height: number } | null;
    /** S'abonne aux changements de dimensions du fond ; cb est appelé immédiatement avec l'état
     *  courant, puis à chaque changement (nouveau fond, redimensionnement de la vidéo...). */
    subscribeBackgroundSize: (cb: (size: { width: number; height: number } | null) => void) => () => void;
    /** Overlays permanents rendus par le layout de la carte dans une pile fixe en haut à droite
     *  (pointer-events-none — un overlay réactive les siens au besoin). Remplacement complet,
     *  no-op si liste identique ; vidé au déchargement du bundle. */
    setOverlays: (overlays: MapOverlayOption[]) => void;
    /** Pose un gabarit de zone circulaire RÉEL sur la carte (même canal RTDB que l'outil de mesure
     *  natif — SharedMeasurement type 'circle', visible par tous les participants), à des
     *  coordonnées x/y en px monde (voir getBackgroundSize pour convertir un %). `radius` en px
     *  monde. `id` doit être stable pour pouvoir le mettre à jour/l'effacer ensuite (rappeler
     *  setMeasurement avec le même id remplace le gabarit). Note : posé avec cityId=null, donc
     *  visible seulement quand la carte principale (pas une scène/ville) est affichée. */
    setMeasurement: (m: { id: string; x: number; y: number; radius: number; color?: string }) => Promise<void>;
    /** Efface un gabarit posé par setMeasurement (no-op s'il n'existe déjà plus). */
    clearMeasurement: (id: string) => Promise<void>;
  };
  /** Petit état PARTAGÉ de salle pour les scripts (RTDB rooms/{roomId}/bundleState/{key}) —
   *  synchronisé en temps réel entre TOUS les clients, contrairement à getData (instantané au
   *  chargement) et aux flags de vue (locaux). Ex : niveau de brouillage des comms posé par le MJ,
   *  lu en live par le radar/l'overlay de chaque joueur. Indépendant du systemId : survit aux
   *  ré-imports de règles. */
  sharedState: {
    set: (key: string, value: string | number | boolean | null) => Promise<void>;
    /** cb est appelé immédiatement avec la valeur courante (undefined si absente), puis à chaque
     *  changement. L'hôte libère l'abonnement au déchargement du bundle. */
    subscribe: (key: string, cb: (value: unknown) => void) => () => void;
  };
  /** Scènes/villes de la salle (cartes/{roomId}/cities) + scène GLOBALE du groupe
   *  (settings/general.currentCityId — celle des personnages sans affectation explicite
   *  currentSceneId). Pour les overlays qui localisent chaque personnage (ex secteur par joueur
   *  du panneau comlink MJ). cb est appelé à chaque changement de l'une ou l'autre source. */
  scenes: {
    subscribe: (cb: (data: { scenes: Array<{ id: string; name: string }>; globalSceneId: string | null }) => void) => () => void;
  };
  /** Entités de groupe de la salle (Salle/{roomId}/groupEntities — vaisseaux, base...). Un panneau
   *  de bundle les affiche aux joueurs (flotte acquise, catalogue) ; update sert aux actions MJ du
   *  panneau (ex basculer `acquis`) — c'est au script de gater sur getGameState().isMJ. Chaque
   *  doc : {id, label, image?, acquis?, values}. */
  groupEntities: {
    subscribe: (cb: (docs: Array<{ id: string } & Record<string, unknown>>) => void) => () => void;
    /** Merge partiel sur un doc (updateDoc Firestore). */
    update: (entityId: string, values: Record<string, unknown>) => Promise<void>;
  };
  /** Documents BRUTS de tous les personnages de la salle (cartes/{roomId}/characters) — pour les
   *  widgets de fiche d'un bundle qui lisent/écrivent des champs custom (ex Obligation) sur
   *  n'importe quel personnage, pas seulement le sien. Même modèle de confiance totale que le reste
   *  des scripts. */
  roomCharacters: {
    /** cb reçoit id + données de chaque doc, immédiatement puis à chaque changement. L'hôte libère
     *  l'abonnement au déchargement du bundle. */
    subscribe: (cb: (docs: Array<{ id: string } & Record<string, unknown>>) => void) => () => void;
    /** Merge partiel sur un doc personnage (updateDoc Firestore). */
    update: (characterId: string, values: Record<string, unknown>) => Promise<void>;
  };
  /** Bonus de stats d'un personnage (collection Bonus/{roomId}/{characterName}/{sourceId}) — le
   *  MÊME mécanisme que les bonus d'objets/compétences du jeu : chaque doc porte des paires
   *  {statKey: number} agrégées dans les stats finales par useCalculatedBonuses (donc pris en compte
   *  par le combat, la fiche...). Permet à un bundle d'appliquer un buff RÉELLEMENT intégré (ex un
   *  droïde tactique +1 aux dégâts). IMPORTANT : la clé est le NOM du personnage (character.Nomperso),
   *  pas son id de doc — c'est ainsi qu'est indexée la collection Bonus. `sourceId` identifie la
   *  source du bonus (ex 'droid-tactique') : réécrire la même source remplace, clear la retire. */
  characterBonuses: {
    /** Pose/remplace le bonus de cette source. `stats` = paires {statKey: number} (clés du système
     *  actif, ex 'Distance', 'vigueur'). `label` habille le bonus dans les récapitulatifs. */
    set: (characterName: string, sourceId: string, stats: Record<string, number>, label?: string) => Promise<void>;
    /** Retire le bonus de cette source (supprime le doc). */
    clear: (characterName: string, sourceId: string) => Promise<void>;
  };
  /** Fonds de fiche : un script FOURNIT une liste de fonds animés (composants React, ex shaders
   *  WebGL). La FICHE elle-même les rend derrière son contenu, propose un sélecteur au joueur et
   *  persiste le choix par personnage — le script n'affiche rien. Chaque option = {id, label,
   *  Component|null}. La fiche préfixe toujours une option "Aucun". */
  sheet: {
    setBackgrounds: (options: SheetBackgroundOption[]) => void;
  };
  /** Remplacement du panneau de mixeur audio natif par un composant du bundle — rendu par
   *  MapDialogs avec les MÊMES props {isOpen, onClose} que l'AudioMixerPanel natif : le raccourci
   *  clavier, le bouton tool_mixer et le toggle existants continuent de fonctionner tels quels,
   *  seul le visuel change. null (ou déchargement du bundle) restaure le panneau natif. */
  audio: {
    setMixerPanel: (component: ComponentType<{ isOpen: boolean; onClose: () => void }> | null) => void;
  };
}

export interface SheetBackgroundOption {
  id: string;
  label: string;
  Component: ComponentType | null;
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
