"use client"

import React, { useEffect, useRef } from 'react';
import { db, collection, getDocs, query, where, doc, getDoc, onSnapshot } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';
import { useModules } from '@/modules/context';
import { moduleRegistry } from '@/modules/registry';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { rollComposedDicePool, rollSymbolDie, resolveSymbolDiceRoll } from '@/lib/rules-engine';
import { setMapViewFlags, resetMapViewFlags, getMapViewFlags } from '@/app/[roomid]/map/view-flags-store';
import { setSheetBackgroundOptions } from '@/app/[roomid]/map/sheet-background-store';
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
        map: {
          setViewFlags: setMapViewFlags,
          resetViewFlags: resetMapViewFlags,
          getViewFlags: getMapViewFlags,
        },
        sheet: {
          setBackgrounds: setSheetBackgroundOptions,
        },
      };

      // État courant des contributions. register() REMPLACE la catégorie qu'il fournit et laisse
      // intactes celles qu'il omet — register() est ré-appelable (ex depuis api.character.subscribe
      // pour n'exposer un bouton qu'à certaines espèces) : un remplacement, jamais un cumul (sinon
      // le même bouton s'empile à chaque snapshot du personnage).
      const collected: Required<BundleContributions> = { sidebarTabs: [], sidebarActions: [] };

      // (Ré)enregistre le module synthétique avec les contributions cumulées. register() peut être
      // appelé APRÈS l'exécution synchrone (ex depuis api.character.get().then(...) pour n'exposer un
      // bouton qu'à certaines espèces) : chaque appel remplace l'enregistrement, la sidebar se met à
      // jour via le registry. Un module sans contribution n'est pas enregistré (pas de bouton).
      const syncRegistration = () => {
        if (cancelled) return;
        const hasContent = collected.sidebarTabs.length > 0 || collected.sidebarActions.length > 0;
        if (registered) moduleRegistry.unregister(moduleId);
        registered = false;
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
          },
        });
        registered = true;
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
      // Un flag de vue laissé actif (ex vision verte) ni la liste des fonds de fiche ne doivent
      // survivre au changement de système ou à la sortie de salle — remise à zéro systématique.
      resetMapViewFlags();
      setSheetBackgroundOptions([]);
    };
  }, [roomId, contentPath, systemId, isLoading]);

  return null;
}
