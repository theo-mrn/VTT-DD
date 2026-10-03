"use client"

import React, { useEffect, useRef } from 'react';
import { db, collection, getDocs, query, where, doc, getDoc, onSnapshot, updateDoc, setDoc, deleteDoc, realtimeDb, dbRef, onValue, update as rtdbUpdate, set as rtdbSet, rtdbRemove } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';
import { useModules } from '@/modules/context';
import { moduleRegistry } from '@/modules/registry';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { rollComposedDicePool, rollSymbolDie, resolveSymbolDiceRoll } from '@/lib/rules-engine';
import { setMapViewFlags, resetMapViewFlags, getMapViewFlags } from '@/app/[roomid]/map/view-flags-store';
import { getMapCharacterPositions, subscribeMapCharacterPositions, getMapName, getSelectedCityId } from '@/app/[roomid]/map/character-positions-store';
import { getMapBackgroundSize, subscribeMapBackgroundSize } from '@/app/[roomid]/map/map-background-size-store';
import { setMapOverlays } from '@/app/[roomid]/map/map-overlay-store';
import { setWeather as setWeatherStore } from '@/app/[roomid]/map/weather-store';
import { setWeatherClimates } from '@/app/[roomid]/map/weather-climates-store';
import { setSheetBackgroundOptions } from '@/app/[roomid]/map/sheet-background-store';
import { setAudioMixerPanelOverride } from '@/app/[roomid]/map/audio-mixer-store';
import { executeBundleEntry } from './linker';
import type { BundleContributions, BundleScriptAPI } from './types';
import type { ScriptDoc } from '@/modules/game-content/types';
import type { GameSystemDefinition } from '@/modules/game-system/types';
import { toast } from 'sonner';

// Exécute les scripts du bundle de règles de la salle (content docs kind:'script', écrits à l'import
// d'un zip) et enregistre leurs contributions comme UN module synthétique `gamesystem:{systemId}`
// dans le moduleRegistry — Sidebar.tsx et map/layout.tsx les consomment ensuite par les rails
// existants des modules. Lecture one-shot : un changement de règles demande de re-entrer dans la
// salle (l'évaluation de code reste un événement unique et prévisible, pas une subscription).
export function ExtensionHost({ roomId }: { roomId: string | null }) {
  const { gameSystem, contentPath, isLoading } = useGameSystem(roomId);
  const { getModuleApi } = useModules();
  const { persoId } = useGame();

  // L'identité de l'objet gameSystem change à chaque snapshot d'overlay — l'effet est clé sur les
  // primitives stables (systemId/contentPath) et lit la définition courante via cette ref.
  const gameSystemRef = useRef<GameSystemDefinition>(gameSystem);
  gameSystemRef.current = gameSystem;
  const getModuleApiRef = useRef(getModuleApi);
  getModuleApiRef.current = getModuleApi;
  const persoIdRef = useRef(persoId);
  persoIdRef.current = persoId;

  const systemId = gameSystem.systemId;

  useEffect(() => {
    if (!roomId || isLoading || !systemId) return;
    const moduleId = `gamesystem:${systemId}`;
    let cancelled = false;
    let registered = false;
    // Les scripts appellent api.character.subscribe sans jamais se désabonner (ils n'ont pas de
    // cycle de vie propre) : l'hôte collecte chaque unsubscribe et les libère au cleanup — sinon
    // les listeners Firestore s'empilent à chaque montage (StrictMode, switch de système).
    const scriptSubscriptions = new Set<() => void>();

    const load = async () => {
      let scriptDocs: ScriptDoc[];
      try {
        const snap = await getDocs(query(collection(db, contentPath), where('kind', '==', 'script')));
        scriptDocs = snap.docs.map((d) => d.data() as ScriptDoc).filter((d) => typeof d.compiled === 'string');
      } catch {
        return; // droits/room absents : rien à charger, pas d'erreur bruyante
      }
      if (cancelled || scriptDocs.length === 0) return;

      const sdk = window.__VTT_SDK__;
      if (!sdk) return; // ModuleProvider pas encore monté — n'arrive pas en pratique (layout racine)

      const characterDocRef = () => {
        const pid = persoIdRef.current;
        return pid ? doc(db, `cartes/${roomId}/characters/${pid}`) : null;
      };
      const api: BundleScriptAPI = {
        ...getModuleApiRef.current(moduleId),
        gameSystem: gameSystemRef.current,
        dice: { rollComposedDicePool, rollSymbolDie, resolveSymbolDiceRoll },
        character: {
          get: async () => {
            const ref = characterDocRef();
            if (!ref) return null;
            const snap = await getDoc(ref);
            return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
          },
          subscribe: (cb) => {
            const ref = characterDocRef();
            if (!ref) { cb(null); return () => {}; }
            const unsubscribe = onSnapshot(ref, (snap) => {
              if (!cancelled) cb(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
            });
            scriptSubscriptions.add(unsubscribe);
            return () => { scriptSubscriptions.delete(unsubscribe); unsubscribe(); };
          },
        },
        roomCharacters: {
          subscribe: (cb) => {
            const unsubscribe = onSnapshot(collection(db, `cartes/${roomId}/characters`), (snap) => {
              if (!cancelled) cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })));
            });
            scriptSubscriptions.add(unsubscribe);
            return () => { scriptSubscriptions.delete(unsubscribe); unsubscribe(); };
          },
          update: (characterId, values) => updateDoc(doc(db, `cartes/${roomId}/characters/${characterId}`), values),
        },
        characterBonuses: {
          // Même format que les bonus d'objets/compétences (cf inventaire, useCalculatedBonuses) :
          // { [statKey]: number, active, category, name }. La collection est indexée par NOM de
          // personnage (Nomperso), pas par id de doc. setDoc sans merge = la source remplace tout son
          // contenu (un buff n'accumule pas avec sa version précédente).
          set: (characterName, sourceId, stats, label) =>
            setDoc(doc(db, `Bonus/${roomId}/${characterName}/${sourceId}`), {
              ...stats,
              active: true,
              category: 'Inventaire',
              name: label ?? sourceId,
            }),
          clear: (characterName, sourceId) =>
            deleteDoc(doc(db, `Bonus/${roomId}/${characterName}/${sourceId}`)),
        },
        sharedState: {
          set: (key, value) => rtdbUpdate(dbRef(realtimeDb, `rooms/${roomId}/bundleState`), { [key]: value }),
          subscribe: (key, cb) => {
            const unsubscribe = onValue(dbRef(realtimeDb, `rooms/${roomId}/bundleState/${key}`), (snap) => {
              if (!cancelled) cb(snap.val() ?? undefined);
            });
            scriptSubscriptions.add(unsubscribe);
            return () => { scriptSubscriptions.delete(unsubscribe); unsubscribe(); };
          },
        },
        scenes: {
          subscribe: (cb) => {
            let scenes: Array<{ id: string; name: string }> = [];
            let globalSceneId: string | null = null;
            const emit = () => { if (!cancelled) cb({ scenes, globalSceneId }); };
            const u1 = onSnapshot(collection(db, `cartes/${roomId}/cities`), (snap) => {
              scenes = snap.docs.map((d) => ({ id: d.id, name: (d.data() as { name?: string }).name ?? '' }));
              emit();
            });
            const u2 = onSnapshot(doc(db, `cartes/${roomId}/settings/general`), (snap) => {
              globalSceneId = (snap.data() as { currentCityId?: string } | undefined)?.currentCityId ?? null;
              emit();
            });
            const unsubscribe = () => { u1(); u2(); };
            scriptSubscriptions.add(unsubscribe);
            return () => { scriptSubscriptions.delete(unsubscribe); unsubscribe(); };
          },
        },
        groupEntities: {
          subscribe: (cb) => {
            const unsubscribe = onSnapshot(collection(db, `Salle/${roomId}/groupEntities`), (snap) => {
              if (!cancelled) cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })));
            });
            scriptSubscriptions.add(unsubscribe);
            return () => { scriptSubscriptions.delete(unsubscribe); unsubscribe(); };
          },
          update: (entityId, values) => updateDoc(doc(db, `Salle/${roomId}/groupEntities/${entityId}`), values),
        },
        locations: {
          subscribe: (cb) => {
            const unsubscribe = onSnapshot(query(collection(db, contentPath), where('kind', '==', 'location')), (snap) => {
              if (!cancelled) cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })));
            });
            scriptSubscriptions.add(unsubscribe);
            return () => { scriptSubscriptions.delete(unsubscribe); unsubscribe(); };
          },
        },
        map: {
          setViewFlags: setMapViewFlags,
          resetViewFlags: resetMapViewFlags,
          getViewFlags: getMapViewFlags,
          getCharacters: getMapCharacterPositions,
          subscribeCharacters: (cb) => {
            // Même hygiène que character.subscribe : les scripts ne se désabonnent jamais
            // d'eux-mêmes, l'hôte libère tout au cleanup.
            const listener = () => cb(getMapCharacterPositions());
            const unsubscribe = subscribeMapCharacterPositions(listener);
            scriptSubscriptions.add(unsubscribe);
            let disposed = false;
            // Livraison initiale en microtâche, comme les SDK Firebase : un abonnement pris pendant
            // un flush d'effets React ne doit pas déclencher un setState SYNCHRONE dans ce même
            // flush (ça alimente le compteur de mises à jour imbriquées de React).
            queueMicrotask(() => { if (!disposed && !cancelled) cb(getMapCharacterPositions()); });
            return () => { disposed = true; scriptSubscriptions.delete(unsubscribe); unsubscribe(); };
          },
          getMapName,
          getBackgroundSize: getMapBackgroundSize,
          subscribeBackgroundSize: (cb) => {
            const listener = () => cb(getMapBackgroundSize());
            const unsubscribe = subscribeMapBackgroundSize(listener);
            scriptSubscriptions.add(unsubscribe);
            let disposed = false;
            queueMicrotask(() => { if (!disposed && !cancelled) cb(getMapBackgroundSize()); });
            return () => { disposed = true; scriptSubscriptions.delete(unsubscribe); unsubscribe(); };
          },
          setOverlays: setMapOverlays,
          setMeasurement: (m) => {
            const measurement = {
              id: m.id,
              type: 'circle' as const,
              start: { x: m.x, y: m.y },
              end: { x: m.x + m.radius, y: m.y },
              ownerId: `script:${moduleId}`,
              // Doit correspondre à la scène AFFICHÉE côté client qui pose le gabarit — useMapData.ts
              // filtre les mesures par `m.cityId === selectedCityId` : un cityId figé à null rendrait
              // le gabarit invisible pour quiconque (dont son auteur) est sur une scène/ville.
              cityId: getSelectedCityId(),
              color: m.color ?? '#f59e0b',
              unitName: 'm',
              timestamp: Date.now(),
              permanent: true,
            };
            return rtdbSet(dbRef(realtimeDb, `rooms/${roomId}/measurements/${m.id}`), measurement).then(() => {});
          },
          clearMeasurement: (id) => rtdbRemove(dbRef(realtimeDb, `rooms/${roomId}/measurements/${id}`)).then(() => {}),
          registerWeather: (climates) => { if (!cancelled) setWeatherClimates(climates ?? []); },
          setWeather: (weather) => {
            if (cancelled) return;
            const type = weather?.type ?? 'none';
            const intensity = typeof weather?.intensity === 'number' ? weather.intensity : 1;
            // Optimiste (comme le picker), puis persistance par scène : scène active ⇒
            // cities/{sceneId}.weather, sinon fond global ⇒ settings/general.weather.
            setWeatherStore({ type, intensity });
            const sceneId = getSelectedCityId();
            const ref = sceneId
              ? doc(db, 'cartes', roomId, 'cities', sceneId)
              : doc(db, 'cartes', roomId, 'settings', 'general');
            setDoc(ref, { weather: { type, intensity } }, { merge: true }).catch((e) =>
              console.error('[bundle] setWeather échec', e),
            );
          },
        },
        sheet: {
          setBackgrounds: setSheetBackgroundOptions,
        },
        audio: {
          setMixerPanel: setAudioMixerPanelOverride,
        },
      };

      // État courant des contributions. register() REMPLACE la catégorie qu'il fournit et laisse
      // intactes celles qu'il omet — register() est ré-appelable (ex depuis api.character.subscribe
      // pour n'exposer un bouton qu'à certaines espèces) : un remplacement, jamais un cumul (sinon
      // le même bouton s'empile à chaque snapshot du personnage).
      const collected: Required<BundleContributions> = { sidebarTabs: [], sidebarActions: [], characterWidgets: [], creationTabs: [], searchDrawerTabs: [], interactionGames: [] };

      // (Ré)enregistre le module synthétique avec les contributions cumulées. register() peut être
      // appelé APRÈS l'exécution synchrone (ex depuis api.character.get().then(...) pour n'exposer un
      // bouton qu'à certaines espèces) : chaque appel remplace l'enregistrement, la sidebar se met à
      // jour via le registry. Un module sans contribution n'est pas enregistré (pas de bouton).
      // Ré-enregistrement STRICTEMENT identique (mêmes références, même ordre) : no-op — un script
      // qui rappelle register() avec le même contenu (ex à chaque snapshot du personnage) ne doit
      // pas provoquer un unregister+register, qui démonte/remonte tous ses panneaux en cascade
      // synchrone (useSyncExternalStore) jusqu'au « Maximum update depth exceeded » de React.
      const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
        a.length === b.length && a.every((x, i) => x === b[i]);
      let lastRegistered: Required<BundleContributions> | null = null;
      const syncRegistration = () => {
        if (cancelled) return;
        const hasContent = collected.sidebarTabs.length > 0 || collected.sidebarActions.length > 0
          || collected.characterWidgets.length > 0 || collected.creationTabs.length > 0
          || collected.searchDrawerTabs.length > 0 || collected.interactionGames.length > 0;
        if (registered && lastRegistered
          && sameList(lastRegistered.sidebarTabs, collected.sidebarTabs)
          && sameList(lastRegistered.sidebarActions, collected.sidebarActions)
          && sameList(lastRegistered.characterWidgets, collected.characterWidgets)
          && sameList(lastRegistered.creationTabs, collected.creationTabs)
          && sameList(lastRegistered.searchDrawerTabs, collected.searchDrawerTabs)
          && sameList(lastRegistered.interactionGames, collected.interactionGames)) {
          return;
        }
        if (registered) moduleRegistry.unregister(moduleId);
        registered = false;
        lastRegistered = null;
        if (!hasContent) return;
        moduleRegistry.register({
          manifest: {
            id: moduleId,
            name: gameSystemRef.current.systemId,
            version: '1.0.0',
            description: 'Scripts du bundle de règles de la salle',
            author: 'bundle',
            type: 'feature',
            defaultEnabled: true,
          },
          contributions: {
            sidebarTabs: [...collected.sidebarTabs],
            sidebarActions: [...collected.sidebarActions],
            characterWidgets: [...collected.characterWidgets],
            creationTabs: [...collected.creationTabs],
            searchDrawerTabs: [...collected.searchDrawerTabs],
            interactionGames: [...collected.interactionGames],
          },
        });
        registered = true;
        lastRegistered = {
          sidebarTabs: [...collected.sidebarTabs],
          sidebarActions: [...collected.sidebarActions],
          characterWidgets: [...collected.characterWidgets],
          creationTabs: [...collected.creationTabs],
          searchDrawerTabs: [...collected.searchDrawerTabs],
          interactionGames: [...collected.interactionGames],
        };
      };

      try {
        executeBundleEntry(scriptDocs, {
          React,
          api,
          ui: sdk.ui,
          icons: sdk.icons,
          gameSystem: gameSystemRef.current,
          register: (c) => {
            if (c.sidebarTabs) collected.sidebarTabs = [...c.sidebarTabs];
            if (c.sidebarActions) collected.sidebarActions = [...c.sidebarActions];
            if (c.characterWidgets) collected.characterWidgets = [...c.characterWidgets];
            if (c.creationTabs) collected.creationTabs = [...c.creationTabs];
            if (c.searchDrawerTabs) collected.searchDrawerTabs = [...c.searchDrawerTabs];
            if (c.interactionGames) collected.interactionGames = [...c.interactionGames];
            syncRegistration();
          },
        });
      } catch (error) {
        // Un bundle cassé ne doit JAMAIS empêcher la salle de charger : rien n'est enregistré.
        const message = error instanceof Error ? error.message : String(error);
        console.error('[bundle-scripts]', error);
        toast.error(`Script du système en échec : ${message}`);
      }
    };
    void load();

    return () => {
      cancelled = true;
      scriptSubscriptions.forEach((unsubscribe) => unsubscribe());
      scriptSubscriptions.clear();
      // Invariant unregister-first : gère le switch de système, la sortie de salle et le double
      // montage StrictMode/HMR (register warn-and-skip sur doublon côté registry).
      if (registered) moduleRegistry.unregister(moduleId);
      // Un flag de vue laissé actif (ex vision verte), la liste des fonds de fiche ou les overlays
      // de carte ne doivent pas survivre au changement de système ou à la sortie de salle — remise
      // à zéro systématique.
      resetMapViewFlags();
      setSheetBackgroundOptions([]);
      setMapOverlays([]);
      setWeatherClimates([]); // les climats bundle (ex 'alert'/'static') quittent le picker
      setAudioMixerPanelOverride(null);
    };
  }, [roomId, contentPath, systemId, isLoading]);

  return null;
}
