/**
 * Module « voix » de la carte (docs/voix.md § 4) : la voix à la table selon la scène.
 *
 * - Réglage durable de la scène (`maps.voice`) : Table (tout le monde s'entend) ou Proximité
 *   (distance et murs, deux portées en cases) ; le MJ le règle par le bouton « Voix de la scène »
 *   (commande annulable).
 * - Écoute : en Proximité, chaque voix reçue est mixée selon la position de l'auditeur et celle
 *   du token de l'orateur (`engine/mix.ts`, courbe et murs repris des zones sonores) ; le
 *   composant `MapVoices` le transmet à la session vocale (`lib/voice`).
 */
import { translate } from '@/i18n/runtime';
import { Ear } from 'lucide-react';
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { MapVoices } from './ui/map-voices';
import { VoiceControls } from './ui/voice-menu';

export const voiceFeature: MapFeature = {
  id: 'voice',
  register: (engine) => [
    engine.registerOverlay({ id: 'voice.listen', slot: 'none', component: MapVoices }),
    engine.registerToolbarEntry({
      kind: 'custom',
      id: 'voice:menu',
      label: translate('map.voice.title'),
      icon: Ear,
      group: 'view',
      order: 16,
      component: VoiceControls,
    }),
  ],
};
