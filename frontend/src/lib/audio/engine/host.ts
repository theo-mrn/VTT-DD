/** Ce que les lecteurs (canaux, effets, zones) demandent au moteur. */
import type { BusName } from '@vtt/contracts';
import type { ServerClock } from '../sync/clock';
import type { BufferCache } from './cache';
import type { AudioBus } from './graph';
import type { ElementPool } from './voices';

export interface EngineHost {
  clock: ServerClock;
  /** Contexte audio (créé à la demande) ; null si Web Audio est indisponible. */
  context(): BaseAudioContext | null;
  /** Le contexte tourne (déverrouillé) : on peut jouer. */
  running(): boolean;
  bus(name: AudioBus): AudioNode;
  pool(): ElementPool;
  cache(): BufferCache;
  /** Gain d'un bus hors graphe (YouTube) : volume × master, coupures comprises. */
  externalGain(bus: BusName): number;
  /** Quelque chose devrait s'entendre : bandeau « activer le son » si le moteur est verrouillé. */
  wantSound(): void;
  reportError?(message: string): void;
}
