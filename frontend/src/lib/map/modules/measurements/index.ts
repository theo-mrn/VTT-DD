/**
 * Module « mesures » (docs/carte.md § 10, Mesures) : distance au clic (locale, depuis son
 * personnage ou le token sélectionné), outil Mesurer (Z : règle, cône, cercle, carré) au direct,
 * gabarits épinglés, effets animés. La logique est dans `register.ts` (testée sans React) ; ici
 * on y ajoute l'interface.
 */
import { MeasureHost } from '@/components/map/measurements/measure-host';
import { MeasureInspector } from '@/components/map/measurements/measure-inspector';
import { MeasureOptions } from '@/components/map/measurements/measure-options';
import type { MapModule } from '../../engine/map-engine';
import { registerMeasurements } from './register';

export const measurementsModule: MapModule = {
  id: 'measurements',
  register: (engine) =>
    registerMeasurements(engine, {
      options: MeasureOptions,
      inspector: MeasureInspector,
      host: MeasureHost,
    }),
};
