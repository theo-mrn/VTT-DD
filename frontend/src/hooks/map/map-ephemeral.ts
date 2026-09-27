'use client';

/**
 * Canal éphémère de la carte (service realtime, jamais enregistré) : ce que
 * l'ancienne app faisait transiter par la RTDB sans le garder longtemps.
 *
 * - `measure.set` / `measure.remove` : gabarits non permanents (effacés après 6 s) ;
 * - `token.drag` : position d'un token pendant qu'on le glisse (l'état final
 *   passe par `POST …/tokens/move`) ;
 * - `sound.global` : son ponctuel lancé pour toute la table (`global_sounds`).
 *
 * Les curseurs (`cursor`) et les bulles (`bubble`) ont leurs propres hooks.
 * Le débit est limité par le serveur (20 messages/s par connexion) : les
 * émetteurs à haute fréquence sont bridés ici.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useCampaignEphemeral, type EphemeralMessage } from '@/lib/realtime';
import type { SharedMeasurement } from '@/app/(campaigns)/campaigns/[id]/play/map/measurements';

type Sender = (kind: string, data: unknown, options?: { gmOnly?: boolean }) => void;

const senders = new Map<string, Sender>();

/** Envoie sur le canal éphémère de la campagne (rien si la connexion n'est pas prête). */
export function sendMapEphemeral(
  campaignId: string,
  kind: string,
  data: unknown,
  options?: { gmOnly?: boolean },
) {
  senders.get(campaignId)?.(kind, data, options);
}

// ─── Gabarits éphémères ──────────────────────────────────────────────────────

let measures: Record<string, SharedMeasurement> = {};
let measureList: SharedMeasurement[] = [];
const measureListeners = new Set<() => void>();

function commitMeasures(next: Record<string, SharedMeasurement>) {
  measures = next;
  measureList = Object.values(next);
  for (const l of measureListeners) l();
}

/** Gabarits éphémères connus (les miens et ceux des autres). */
export function useEphemeralMeasurements(): SharedMeasurement[] {
  return useSyncExternalStore(
    (l) => {
      measureListeners.add(l);
      return () => void measureListeners.delete(l);
    },
    () => measureList,
    () => measureList,
  );
}

const lastMeasureSent = new Map<string, number>();
const pendingMeasure = new Map<string, ReturnType<typeof setTimeout>>();
const MEASURE_INTERVAL_MS = 80;

/** Crée ou met à jour un gabarit éphémère (local tout de suite, diffusé au plus ~12 fois/s). */
export function publishMeasurement(campaignId: string, m: SharedMeasurement) {
  commitMeasures({ ...measures, [m.id]: m });
  const send = () => {
    lastMeasureSent.set(m.id, Date.now());
    pendingMeasure.delete(m.id);
    const current = measures[m.id];
    if (current) sendMapEphemeral(campaignId, 'measure.set', current);
  };
  const wait = MEASURE_INTERVAL_MS - (Date.now() - (lastMeasureSent.get(m.id) ?? 0));
  if (wait <= 0) send();
  else if (!pendingMeasure.has(m.id)) pendingMeasure.set(m.id, setTimeout(send, wait));
}

/** Modifie des champs d'un gabarit éphémère connu. */
export function patchMeasurement(
  campaignId: string,
  id: string,
  patch: Partial<SharedMeasurement>,
) {
  const current = measures[id];
  if (current) publishMeasurement(campaignId, { ...current, ...patch });
}

export function removeMeasurement(campaignId: string, id: string) {
  if (!measures[id]) return;
  const next = { ...measures };
  delete next[id];
  commitMeasures(next);
  const t = pendingMeasure.get(id);
  if (t) clearTimeout(t);
  pendingMeasure.delete(id);
  sendMapEphemeral(campaignId, 'measure.remove', { id });
}

export function isEphemeralMeasurement(id: string) {
  return !!measures[id];
}

export function getEphemeralMeasurement(id: string): SharedMeasurement | undefined {
  return measures[id];
}

/** Identifiant local d'un gabarit éphémère (l'ancien `push().key` RTDB). */
export function newMeasurementId() {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Glissement de tokens ────────────────────────────────────────────────────

export interface DragPosition {
  characterId: string;
  mapId: string | null;
  x: number;
  y: number;
  at: number;
}

let drags: Record<string, DragPosition> = {};
const dragListeners = new Set<() => void>();

function commitDrags(next: Record<string, DragPosition>) {
  drags = next;
  for (const l of dragListeners) l();
}

export function getDragPositions() {
  return drags;
}

export function onDragPositions(listener: () => void) {
  dragListeners.add(listener);
  return () => void dragListeners.delete(listener);
}

/** Oublie la position de glissement d'un token (arrivée de l'état final). */
export function clearDragPosition(characterId: string) {
  if (!drags[characterId]) return;
  const next = { ...drags };
  delete next[characterId];
  commitDrags(next);
}

let lastDragSent = 0;
const DRAG_INTERVAL_MS = 100;

/** Diffuse la position de tokens en cours de glissement (au plus 10 fois/s). */
export function sendDragPositions(
  campaignId: string,
  mapId: string | null,
  moves: { characterId: string; x: number; y: number }[],
  gmOnly: boolean,
) {
  const now = Date.now();
  if (now - lastDragSent < DRAG_INTERVAL_MS || !moves.length) return;
  lastDragSent = now;
  sendMapEphemeral(campaignId, 'token.drag', { mapId, moves: moves.slice(0, 40) }, { gmOnly });
}

// ─── Sons ponctuels ──────────────────────────────────────────────────────────

const soundListeners = new Set<(data: { soundUrl: string | null; timestamp: number }) => void>();

export function onGlobalSound(
  listener: (data: { soundUrl: string | null; timestamp: number }) => void,
) {
  soundListeners.add(listener);
  return () => void soundListeners.delete(listener);
}

// ─── Branchement (une fois par carte ouverte) ────────────────────────────────

const KINDS = ['measure.set', 'measure.remove', 'token.drag', 'sound.global'] as const;
const DRAG_TTL_MS = 5_000;

/** Écoute le canal éphémère de la carte et enregistre l'émetteur de la campagne. */
export function useMapEphemeralChannel(campaignId: string) {
  const { send } = useCampaignEphemeral(campaignId, KINDS, (m: EphemeralMessage) => {
    const data = m.data as Record<string, unknown> | null;
    if (!data) return;
    switch (m.kind) {
      case 'measure.set': {
        const ms = data as unknown as SharedMeasurement;
        if (ms.id) commitMeasures({ ...measures, [ms.id]: ms });
        break;
      }
      case 'measure.remove': {
        const id = String(data.id);
        if (!measures[id]) break;
        const next = { ...measures };
        delete next[id];
        commitMeasures(next);
        break;
      }
      case 'token.drag': {
        const moves = (data.moves as { characterId: string; x: number; y: number }[]) ?? [];
        const next = { ...drags };
        for (const mv of moves)
          next[mv.characterId] = {
            characterId: mv.characterId,
            mapId: (data.mapId as string | null) ?? null,
            x: mv.x,
            y: mv.y,
            at: Date.now(),
          };
        commitDrags(next);
        break;
      }
      case 'sound.global':
        for (const l of soundListeners)
          l({
            soundUrl: (data.soundUrl as string | null) ?? null,
            timestamp: Number(data.timestamp),
          });
        break;
    }
  });

  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const sender: Sender = (kind, data, options) => sendRef.current(kind, data, options);
    senders.set(campaignId, sender);
    return () => {
      if (senders.get(campaignId) === sender) senders.delete(campaignId);
    };
  }, [campaignId]);

  // Un glissement dont on ne reçoit plus rien est oublié (perte de connexion de l'autre)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      const stale = Object.values(drags).filter((d) => now - d.at > DRAG_TTL_MS);
      if (!stale.length) return;
      const next = { ...drags };
      for (const d of stale) delete next[d.characterId];
      commitDrags(next);
    }, 1_000);
    return () => clearInterval(t);
  }, []);
}
