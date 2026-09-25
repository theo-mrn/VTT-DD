'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { moduleRegistry } from './registry';
import { gameEventBus } from './event-bus';
import type { ModuleDefinition, ModuleAPI, GameEvent, InstalledModule } from './types';

// Side-effect: register all built-in modules (must run client-side)
import './loader';
import { useGame } from '@/contexts/GameContext';
import { toast } from 'sonner';
import { realtimeDb, dbRef, onValue, update } from '@/lib/firebase';
import { initSDK } from './sdk';
import { loadExternalModules } from './dynamic-loader';

interface ModuleContextType {
  modules: ModuleDefinition[];
  enabledModules: ModuleDefinition[];
  enableModule: (id: string) => void;
  disableModule: (id: string) => void;
  isModuleEnabled: (id: string) => boolean;
  getModuleApi: (moduleId: string) => ModuleAPI;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  const { user, isMJ, persoId } = useGame();
  const roomId = (user as { roomId?: string } | null)?.roomId ?? null;

  // Module data storage (per-room, synced from RTDB)
  const [moduleData, setModuleData] = useState<Record<string, Record<string, unknown>>>({});

  // Track which modules have been activated (to avoid re-running onActivate)
  const activatedRef = useRef<Set<string>>(new Set());

  // Initialize SDK on mount
  const sdkInitRef = useRef(false);
  useEffect(() => {
    if (!sdkInitRef.current) {
      initSDK();
      sdkInitRef.current = true;
    }
  }, []);

  // Subscribe to registry changes
  const snapshotSubscribe = useCallback(
    (cb: () => void) => moduleRegistry.subscribe(cb),
    []
  );
  const snapshotGet = useCallback(() => moduleRegistry.getSnapshot(), []);

  useSyncExternalStore(snapshotSubscribe, snapshotGet, snapshotGet);

  const modules = moduleRegistry.getAllModules();
  const enabledModules = moduleRegistry.getEnabledModules();

  // Load module data from RTDB
  useEffect(() => {
    if (!roomId) return;
    const dataRef = dbRef(realtimeDb, `rooms/${roomId}/modules`);
    const unsub = onValue(dataRef, (snapshot) => {
      setModuleData((snapshot.val() as Record<string, Record<string, unknown>>) || {});
    });
    return () => unsub();
  }, [roomId]);

  // Create module API factory
  const getModuleApi = useCallback((moduleId: string): ModuleAPI => ({
    moduleId,

    on: ((eventType: string, handler: (payload: unknown) => void) =>
      gameEventBus.on(eventType as GameEvent['type'], handler as never)) as ModuleAPI['on'],
    emit: (event) => gameEventBus.emit(event),

    getData: <T = unknown>(key: string): T | undefined => {
      return moduleData[moduleId]?.[key] as T | undefined;
    },
    setData: async (key: string, value: unknown) => {
      if (!roomId) return;
      const path = `rooms/${roomId}/modules/${moduleId}`;
      await update(dbRef(realtimeDb, path), { [key]: value });
    },
    getCharacterData: <T = unknown>(characterId: string, key: string): T | undefined => {
      const chars = moduleData[moduleId]?.characters as Record<string, Record<string, unknown>> | undefined;
      return chars?.[characterId]?.[key] as T | undefined;
    },
    setCharacterData: async (characterId: string, key: string, value: unknown) => {
      if (!roomId) return;
      const path = `rooms/${roomId}/modules/${moduleId}/characters/${characterId}`;
      await update(dbRef(realtimeDb, path), { [key]: value });
    },

    getGameState: () => ({
      isMJ,
      userId: user?.uid ?? null,
      roomId,
      persoId,
    }),

    getSetting: <T = unknown>(settingId: string): T => {
      const settings = moduleData[moduleId]?.settings as Record<string, unknown> | undefined;
      return settings?.[settingId] as T;
    },
    setSetting: async (settingId: string, value: unknown) => {
      if (!roomId) return;
      const path = `rooms/${roomId}/modules/${moduleId}/settings`;
      await update(dbRef(realtimeDb, path), { [settingId]: value });
    },

    showToast: (message, options) => {
      if (options?.type === 'error') toast.error(message, { duration: options?.duration });
      else if (options?.type === 'success') toast.success(message, { duration: options?.duration });
      else toast(message, { duration: options?.duration });
    },
  }), [moduleData, roomId, isMJ, user, persoId]);

  // Run lifecycle hooks for newly enabled modules
  useEffect(() => {
    for (const mod of enabledModules) {
      if (!activatedRef.current.has(mod.manifest.id)) {
        activatedRef.current.add(mod.manifest.id);
        mod.onActivate?.(getModuleApi(mod.manifest.id));
      }
    }
  }, [enabledModules, getModuleApi]);

  // Room join lifecycle
  useEffect(() => {
    if (!roomId) return;
    for (const mod of enabledModules) {
      mod.onRoomJoin?.(getModuleApi(mod.manifest.id), roomId);
    }
  }, [roomId, enabledModules, getModuleApi]);

  // Auto-load installed external modules
  const loadedExternalsRef = useRef(false);
  useEffect(() => {
    if (loadedExternalsRef.current) return;
    const installed = moduleData['module-manager']?.installed as Record<string, InstalledModule> | undefined;
    if (!installed) return;

    const urls = Object.values(installed)
      .filter(m => m.enabled && m.url)
      .map(m => m.url);

    if (urls.length === 0) return;
    loadedExternalsRef.current = true;

    loadExternalModules(urls).then(results => {
      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        console.warn('[VTT Modules] Some external modules failed to load:', failed);
      }
    });
  }, [moduleData]);

  const enableModule = useCallback((id: string) => {
    moduleRegistry.enable(id);
  }, []);

  const disableModule = useCallback((id: string) => {
    const mod = moduleRegistry.getModule(id);
    if (mod) {
      mod.onDeactivate?.(getModuleApi(id));
      activatedRef.current.delete(id);
    }
    moduleRegistry.disable(id);
  }, [getModuleApi]);

  const isModuleEnabled = useCallback((id: string) => {
    return moduleRegistry.isEnabled(id);
  }, []);

  return (
    <ModuleContext.Provider value={{
      modules,
      enabledModules,
      enableModule,
      disableModule,
      isModuleEnabled,
      getModuleApi,
    }}>
      {children}
    </ModuleContext.Provider>
  );
}

export function useModules() {
  const context = useContext(ModuleContext);
  if (!context) throw new Error('useModules must be used within ModuleProvider');
  return context;
}
