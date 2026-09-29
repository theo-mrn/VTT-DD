/**
 * État du module `tokens` pour un moteur : annuaire des personnages, client des PNJ, et état
 * de la bibliothèque du MJ (source armée, nombre d'exemplaires, camp, visibilité à la pose,
 * fiche ouverte). Un magasin zustand vanilla, lu par React par sélecteurs et par l'outil de
 * pose sans React.
 */
import type { CampaignSide, MapTokenShape, MapTokenVisibility, NpcSource } from '@vtt/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Point } from '../../engine/geometry';
import type { MapEngine } from '../../engine/map-engine';
import type { NpcApi } from './api';
import { CharacterDirectory } from './directory';

/** Ce qu'une carte de la bibliothèque pose : une source du contrat et son aperçu. */
export interface PlacementSource {
  /** Identifiant stable de la carte (`template:…`, `bestiary:…`, `quick:…`). */
  key: string;
  /** Nom du PNJ (brouillon, fantôme). */
  name: string;
  imageUrl: string | null;
  source: NpcSource;
}

export type LibraryTab = 'templates' | 'bestiary' | 'quick';

export interface LibraryState {
  tab: LibraryTab;
  /** Source armée : un clic sur la carte la pose (ou un glisser depuis la bibliothèque). */
  armed: PlacementSource | null;
  count: number;
  side: Exclude<CampaignSide, 'players'>;
  visibility: MapTokenVisibility;
  shape: MapTokenShape;
  /** Pose en cours (appel au serveur). */
  placing: boolean;
  /** Personnage dont la fiche est ouverte (panneau), ou null. */
  sheetFor: string | null;
}

/** Ce que la bibliothèque demande à l'outil de pose (glisser une carte vers la scène). */
export interface PlaceToolHandle {
  /** Fantôme au point du monde, ou rien (le glisser a quitté la carte). */
  hoverAt(world: Point | null, engine: MapEngine, free?: boolean): void;
  /** Pose la carte déposée ; null si une pose est déjà en cours. */
  dropAt(source: PlacementSource, world: Point, opts?: { free?: boolean }): Promise<boolean> | null;
}

export interface TokensState {
  engine: MapEngine;
  api: NpcApi;
  directory: CharacterDirectory;
  library: StoreApi<LibraryState>;
  /** Outil de pose, une fois créé par le moteur. */
  tool: PlaceToolHandle | null;
}

export function createTokensState(engine: MapEngine, api: NpcApi): TokensState {
  return {
    engine,
    api,
    directory: new CharacterDirectory(),
    tool: null,
    library: createStore<LibraryState>()(() => ({
      tab: 'templates',
      armed: null,
      count: 1,
      side: 'enemies',
      visibility: 'visible',
      shape: 'circle',
      placing: false,
      sheetFor: null,
    })),
  };
}

const states = new WeakMap<MapEngine, TokensState>();

export function attachTokensState(engine: MapEngine, state: TokensState): () => void {
  states.set(engine, state);
  return () => {
    if (states.get(engine) === state) states.delete(engine);
  };
}

/** État du module pour ce moteur (null si le module n'est pas chargé). */
export function tokensStateOf(engine: MapEngine): TokensState | null {
  return states.get(engine) ?? null;
}
