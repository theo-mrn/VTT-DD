'use client';

/**
 * Voix de la table côté React : une seule session pour l'onglet (`getVoice`), lue par
 * `useVoice`, et le pont des annonces de la salle (`useVoiceBridge`, monté par la table).
 */
import type { VoiceParticipant } from '@vtt/contracts';
import { useEffect } from 'react';
import { useStore } from 'zustand';

import { getAudioEngine } from '@/lib/audio/engine/engine';
import { useCampaignEvents } from '@/lib/realtime';
import { reportClientError } from '@/lib/telemetry/errors';

import { voiceApi } from './api';
import { VoiceSession, type VoiceState } from './session';

const VOICE_TYPES = ['voice.*'] as const;

let session: VoiceSession | null = null;

export function getVoice(): VoiceSession {
  session ??= new VoiceSession({
    signaling: voiceApi,
    async audio() {
      const engine = getAudioEngine();
      const release = engine.hold();
      try {
        await engine.unlock();
        const context = engine.context() as AudioContext | null;
        if (!context) throw new Error('Web Audio indisponible');
        return { context, bus: engine.bus('voice'), release };
      } catch (e) {
        release();
        throw e;
      }
    },
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    createPeer: (c) => new RTCPeerConnection(c),
    createAudioElement: () => new Audio(),
    report: (e) => reportClientError(e, 'voice'),
  });
  return session;
}

export function useVoice<T>(selector: (s: VoiceState) => T): T {
  return useStore(getVoice().store, selector);
}

/**
 * Relie la session aux annonces de la campagne ; quitter la table (ou fermer l'onglet) quitte
 * la salle vocale.
 */
export function useVoiceBridge(campaignId: string | null) {
  const joined = useVoice((s) => s.campaignId === campaignId && s.status === 'connected');

  useCampaignEvents<{ userId?: unknown; participant?: VoiceParticipant }>(
    campaignId,
    VOICE_TYPES,
    (e) => getVoice().onEvent(e.event.type, e.event.payload),
    { enabled: joined },
  );

  useEffect(() => {
    if (!campaignId) return;
    const onHide = () => {
      if (getVoice().state.campaignId === campaignId) void getVoice().leave();
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [campaignId]);
}
