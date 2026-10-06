/**
 * Contexte du module « mesures » pour un moteur : préférences, réglages de l'outil, mesure
 * locale (en cours, récente, poignée), mesures des autres, persistance des gabarits.
 */
import type { StoreApi } from 'zustand/vanilla';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { Persistence } from '@/lib/map/store/commands';
import type { ClickDistance } from './click-distance';
import type { RemoteMeasures } from './live-measures';
import type { MeasureSpec, MeasurementData } from './model';
import type { MeasurePrefs } from './prefs';
import type { MeasureSettings } from './settings';

/**
 * Ma mesure : `drawing` pendant le geste, `recent` après le lâcher (6 s, « Épingler »),
 * `reshape` pendant la poignée d'un gabarit épinglé (le gabarit est masqué, l'aperçu la montre).
 */
export interface LocalMeasure {
  id: string;
  phase: 'drawing' | 'recent' | 'reshape';
  spec: MeasureSpec;
  color: string;
  skin: string | null;
  /** Lâcher (phase `recent`), horloge du moteur. */
  releasedAt: number;
}

export interface LocalState {
  measure: LocalMeasure | null;
}

export interface MeasureModule {
  engine: MapEngine;
  prefs: StoreApi<MeasurePrefs>;
  settings: StoreApi<MeasureSettings>;
  clickDistance: ClickDistance;
  remote: RemoteMeasures;
  local: StoreApi<LocalState>;
  persistence: Persistence<MeasurementData>;
}
