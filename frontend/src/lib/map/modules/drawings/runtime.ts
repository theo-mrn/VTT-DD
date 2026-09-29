/**
 * Ce que le module « dessins » garde pour un moteur : réglages des outils, éditeur de texte en
 * place, persistances des couches `drawings` et `notes`. Les composants React (barres
 * contextuelles, inspecteur, éditeur) le retrouvent par le moteur.
 */
import type { MapEngine } from '../../engine/map-engine';
import type { Persistence } from '../../store/commands';
import type { MapDto } from '../../store/map-store';
import type { NoteEditor } from './note-editor';
import type { DrawSettingsStore } from './settings';
import type { DrawingData, NoteData } from './types';

export interface DrawingsRuntime {
  readonly engine: MapEngine;
  readonly settings: DrawSettingsStore;
  readonly editor: NoteEditor;
  readonly drawings: Persistence<DrawingData>;
  readonly notes: Persistence<NoteData>;
}

const runtimes = new WeakMap<MapEngine, DrawingsRuntime>();

export function attachRuntime(runtime: DrawingsRuntime): () => void {
  runtimes.set(runtime.engine, runtime);
  return () => {
    if (runtimes.get(runtime.engine) === runtime) runtimes.delete(runtime.engine);
  };
}

/** Le module de ce moteur (null s'il n'est pas chargé). */
export const drawingsRuntime = (engine: MapEngine): DrawingsRuntime | null =>
  runtimes.get(engine) ?? null;

/** Persistance d'une couche : celle du serveur, ou un refus clair sans serveur. */
export function persistenceOf<D extends MapDto>(engine: MapEngine, key: string): Persistence<D> {
  const p = engine.backend?.collection(key);
  if (p) return p as unknown as Persistence<D>;
  const offline = async (): Promise<never> => {
    throw new Error('La carte n’est pas reliée au serveur.');
  };
  return { create: offline, update: offline, remove: offline };
}
