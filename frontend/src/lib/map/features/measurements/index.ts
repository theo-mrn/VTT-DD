/**
 * Module « mesures » (docs/carte.md § 10, Mesures) : distance au clic (locale, depuis son
 * personnage ou le token sélectionné), outil Mesurer (Z : règle, cône, cercle, carré) au direct,
 * gabarits épinglés, effets animés. La logique est dans `engine/register.ts` (testée sans React) ; ici
 * on y ajoute l'interface.
 */
import { MeasureHost } from './ui/measure-host';
import { MeasureInspector } from './ui/measure-inspector';
import { MeasureOptions } from './ui/measure-options';
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { registerMeasurements } from './engine/register';

export const measurementsFeature: MapFeature = {
  id: 'measurements',
  register: (engine) =>
    registerMeasurements(engine, {
      options: MeasureOptions,
      inspector: MeasureInspector,
      host: MeasureHost,
    }),
};
