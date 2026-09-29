/**
 * Module « mesures » (docs/carte.md § 10, Mesures) : distance au clic (locale, depuis son
 * personnage ou le token sélectionné). La logique est dans `register.ts` (testée sans React).
 */
import type { MapModule } from '../../engine/map-engine';
import { registerMeasurements } from './register';

export const measurementsModule: MapModule = {
  id: 'measurements',
  register: (engine) => registerMeasurements(engine),
};
