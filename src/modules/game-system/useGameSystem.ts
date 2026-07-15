'use client';

import { useEffect, useState } from 'react';
import { db, doc, onSnapshot, auth, onAuthStateChanged } from '@/lib/firebase';
import { moduleRegistry } from '@/modules/registry';
import { dndClassicModule } from '@/modules/builtin/dnd-classic';
import type { GameSystemDefinition, StatDefinition } from './types';

const DEFAULT_GAME_SYSTEM_ID = 'dnd-classic';
const LOG_PREFIX = '[useGameSystem]';

export interface UseGameSystemResult {
  gameSystem: GameSystemDefinition;
  tableCustomStats: StatDefinition[];
  isLoading: boolean;
  /** Chemin Firestore de la sous-collection de CONTENU du système actif (voies, bestiaire,
   *  équipement... — cf src/modules/game-content/) : gameSystems/{id}/content pour un système du
   *  catalogue (y compris le contenu seedé d'un builtin comme dnd-classic), ou
   *  Salle/{roomId}/gameSystemOverrides/{id}/content pour un système legacy scopé à la salle. */
  contentPath: string;
}

/** Champs NARRATIFS d'un système — seuls champs qu'un doc Firestore peut superposer à un module
 *  builtin (le contenu seedé de dnd-classic vit dans gameSystems/dnd-classic) : jamais les stats,
 *  formules ou règles de création, qui restent la source de vérité du module en mémoire. */
function narrativeOverlay(data: Partial<GameSystemDefinition>): Partial<GameSystemDefinition> {
  const overlay: Partial<GameSystemDefinition> = {};
  if (Array.isArray(data.races)) overlay.races = data.races;
  if (Array.isArray(data.profiles)) overlay.profiles = data.profiles;
  if (Array.isArray(data.rules)) overlay.rules = data.rules;
  if (typeof data.raceLabel === 'string') overlay.raceLabel = data.raceLabel;
  if (typeof data.profileLabel === 'string') overlay.profileLabel = data.profileLabel;
  return overlay;
}

/** Vrai dès que Firebase Auth a résolu son état initial (connecté ou non). Un onSnapshot lancé avant
 *  cette résolution (ex nouvel onglet ouvert via window.open, session pas encore restaurée depuis le
 *  stockage local) peut essuyer un refus de permission transitoire — sans attendre ici, rien ne
 *  retenterait la lecture une fois réellement authentifié. */
function useAuthReady(): boolean {
  const [ready, setReady] = useState(() => {
    const initial = auth.currentUser !== null;
    console.log(`${LOG_PREFIX} useAuthReady init — auth.currentUser=${auth.currentUser?.uid ?? 'null'}, ready=${initial}`);
    return initial;
  });
  useEffect(() => {
    if (ready) return;
    console.log(`${LOG_PREFIX} useAuthReady: en attente de onAuthStateChanged...`);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log(`${LOG_PREFIX} onAuthStateChanged déclenché — user=${user?.uid ?? 'null'}`);
      setReady(true);
    });
    return () => unsubscribe();
  }, [ready]);
  return ready;
}

/** Résout le système de règles actif d'une room : d'abord gameSystemId (Salle/{roomId}), puis soit un
 *  module builtin en mémoire (dnd-classic) superposé de son contenu narratif seedé, soit un système
 *  custom lu dans le catalogue partagé gameSystems/{id} ou en legacy Salle/{roomId}/gameSystemOverrides.
 *  roomId=null (hors contexte de salle, ex page /ressources) => système par défaut immédiat, aucune
 *  lecture Firestore. */
export function useGameSystem(roomId: string | null): UseGameSystemResult {
  const authReady = useAuthReady();

  const [gameSystemId, setGameSystemId] = useState<string>(DEFAULT_GAME_SYSTEM_ID);
  const [tableCustomStats, setTableCustomStats] = useState<StatDefinition[]>([]);
  const [roomLoaded, setRoomLoaded] = useState(false);

  const [overrideDefinition, setOverrideDefinition] = useState<GameSystemDefinition | null>(null);
  const [overrideSource, setOverrideSource] = useState<'catalog' | 'legacy' | null>(null);
  const [builtinOverlay, setBuiltinOverlay] = useState<Partial<GameSystemDefinition> | null>(null);
  const [systemLoaded, setSystemLoaded] = useState(false);

  // Étape 1 : résoudre gameSystemId depuis Salle/{roomId}.
  useEffect(() => {
    if (!roomId) {
      console.log(`${LOG_PREFIX} [étape 1] roomId=null → système par défaut '${DEFAULT_GAME_SYSTEM_ID}', pas de lecture Firestore.`);
      setGameSystemId(DEFAULT_GAME_SYSTEM_ID);
      setTableCustomStats([]);
      setRoomLoaded(true);
      return;
    }
    if (!authReady) {
      console.log(`${LOG_PREFIX} [étape 1] roomId='${roomId}' mais authReady=false → on attend avant de lire Salle/${roomId}.`);
      return;
    }

    console.log(`${LOG_PREFIX} [étape 1] abonnement à Salle/${roomId}...`);
    setRoomLoaded(false);
    const unsubscribe = onSnapshot(
      doc(db, 'Salle', roomId),
      (snap) => {
        const data = snap.data();
        const resolvedId = (data?.gameSystemId as string) || DEFAULT_GAME_SYSTEM_ID;
        console.log(`${LOG_PREFIX} [étape 1] Salle/${roomId} résolu — gameSystemId='${resolvedId}', exists=${snap.exists()}`);
        setGameSystemId(resolvedId);
        setTableCustomStats((data?.customStats as StatDefinition[]) || []);
        setRoomLoaded(true);
      },
      (error) => {
        console.error(`${LOG_PREFIX} [étape 1] ERREUR lecture Salle/${roomId}:`, error.code, error.message);
        setGameSystemId(DEFAULT_GAME_SYSTEM_ID);
        setRoomLoaded(true);
      },
    );
    return () => unsubscribe();
  }, [roomId, authReady]);

  // Étape 2 : une fois gameSystemId connu, résoudre la définition du système (builtin + overlay narratif,
  // ou catalogue custom, ou legacy).
  useEffect(() => {
    if (!authReady || !roomLoaded) {
      console.log(`${LOG_PREFIX} [étape 2] en attente — authReady=${authReady}, roomLoaded=${roomLoaded}`);
      return;
    }

    const registered = moduleRegistry.getGameSystemModule(gameSystemId);
    console.log(`${LOG_PREFIX} [étape 2] gameSystemId='${gameSystemId}', module builtin trouvé=${!!registered}`);
    setSystemLoaded(false);

    if (registered) {
      setOverrideDefinition(null);
      setOverrideSource(null);
      const unsubscribe = onSnapshot(
        doc(db, 'gameSystems', gameSystemId),
        (snap) => {
          console.log(`${LOG_PREFIX} [étape 2] overlay narratif de '${gameSystemId}' — exists=${snap.exists()}`);
          setBuiltinOverlay(snap.exists() ? narrativeOverlay(snap.data() as Partial<GameSystemDefinition>) : null);
          setSystemLoaded(true);
        },
        (error) => {
          console.error(`${LOG_PREFIX} [étape 2] ERREUR overlay narratif '${gameSystemId}':`, error.code, error.message);
          setBuiltinOverlay(null);
          setSystemLoaded(true);
        },
      );
      return () => unsubscribe();
    }

    setBuiltinOverlay(null);
    if (!roomId) {
      setOverrideDefinition(null);
      setOverrideSource(null);
      setSystemLoaded(true);
      return;
    }

    // Système custom (pas de module builtin) : catalogue partagé gameSystems/{id} en priorité, sinon
    // repli sur l'ancien chemin scopé à la room Salle/{roomId}/gameSystemOverrides/{id}.
    let unsubscribeLegacy: (() => void) | null = null;
    const subscribeLegacy = () => onSnapshot(
      doc(db, `Salle/${roomId}/gameSystemOverrides`, gameSystemId),
      (legacySnap) => {
        console.log(`${LOG_PREFIX} [étape 2] legacy Salle/${roomId}/gameSystemOverrides/${gameSystemId} — exists=${legacySnap.exists()}`);
        setOverrideDefinition(legacySnap.exists() ? (legacySnap.data() as GameSystemDefinition) : null);
        setOverrideSource(legacySnap.exists() ? 'legacy' : null);
        setSystemLoaded(true);
      },
      (error) => {
        console.error(`${LOG_PREFIX} [étape 2] ERREUR legacy '${gameSystemId}':`, error.code, error.message);
        setOverrideDefinition(null);
        setOverrideSource(null);
        setSystemLoaded(true);
      },
    );

    const unsubscribeCatalog = onSnapshot(
      doc(db, 'gameSystems', gameSystemId),
      (catalogSnap) => {
        console.log(`${LOG_PREFIX} [étape 2] catalogue gameSystems/${gameSystemId} — exists=${catalogSnap.exists()}`);
        if (catalogSnap.exists()) {
          unsubscribeLegacy?.();
          unsubscribeLegacy = null;
          setOverrideDefinition(catalogSnap.data() as GameSystemDefinition);
          setOverrideSource('catalog');
          setSystemLoaded(true);
          return;
        }
        if (!unsubscribeLegacy) unsubscribeLegacy = subscribeLegacy();
      },
      (error) => {
        console.error(`${LOG_PREFIX} [étape 2] ERREUR catalogue '${gameSystemId}':`, error.code, error.message);
        if (!unsubscribeLegacy) unsubscribeLegacy = subscribeLegacy();
      },
    );

    return () => {
      unsubscribeCatalog();
      unsubscribeLegacy?.();
    };
  }, [roomId, gameSystemId, authReady, roomLoaded]);

  const registered = moduleRegistry.getGameSystemModule(gameSystemId);
  const gameSystem = registered
    ? { ...registered.gameSystem, ...(builtinOverlay ?? {}) }
    : overrideDefinition ?? dndClassicModule.gameSystem;

  const contentPath = !registered && overrideSource === 'legacy' && roomId
    ? `Salle/${roomId}/gameSystemOverrides/${gameSystemId}/content`
    : `gameSystems/${registered || overrideDefinition ? gameSystemId : DEFAULT_GAME_SYSTEM_ID}/content`;

  const isLoading = !roomLoaded || !systemLoaded;

  return { gameSystem, tableCustomStats, isLoading, contentPath };
}
