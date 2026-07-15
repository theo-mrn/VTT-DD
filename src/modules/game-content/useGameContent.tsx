'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { db, collection, onSnapshot, query, where } from '@/lib/firebase';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import type { ContentDoc, ContentKind } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Couche d'accès UNIQUE au contenu de jeu Firestore (sous-collection `content` du système actif,
// cf types.ts) — remplace progressivement les fetch('/tabs/*.json') éparpillés (SearchMenu, wiki,
// inventaire, CompetencesContext...). Abonnement LAZY par kind : le onSnapshot d'un kind n'est créé
// qu'au premier composant qui le demande — ouvrir l'inventaire ne charge pas le bestiaire.
// ─────────────────────────────────────────────────────────────────────────────

export type ContentDocWithId = ContentDoc & { id: string };

interface GameContentContextValue {
  contentPath: string;
  docsByKind: Partial<Record<ContentKind, ContentDocWithId[]>>;
  ensureSubscribed: (kind: ContentKind) => void;
}

const GameContentContext = createContext<GameContentContextValue | null>(null);

// Référence stable pour "aucun doc encore chargé pour ce kind" — évite qu'un `docs ?? []` inline crée
// un nouveau tableau (donc une nouvelle référence) à chaque render, ce qui déclencherait en boucle tout
// useEffect ayant `docs` en dépendance chez un consommateur (ex un système sans bestiaire configuré).
const EMPTY_DOCS: ContentDocWithId[] = [];

/** Lit ?roomId=... directement via window.location plutôt que useSearchParams() — évite d'exiger un
 *  <Suspense> autour du Provider racine (useSearchParams() suspend le rendu tant que les search params
 *  ne sont pas résolus, ce qui bloquait ici tout l'arbre indéfiniment). Recalculé au montage uniquement :
 *  cette page n'est de toute façon jamais navigée en interne (toujours ouverte via window.open), la
 *  query string ne change donc pas après le premier rendu. */
function useRoomIdFromUrl(): string | null {
  const params = useParams();
  const roomIdFromRouteParam = (params?.roomid as string) ?? null;
  const [roomIdFromQuery, setRoomIdFromQuery] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRoomIdFromQuery(new URLSearchParams(window.location.search).get('roomId'));
  }, []);

  return roomIdFromRouteParam ?? roomIdFromQuery;
}

function GameContentProviderInner({ roomId, children }: { roomId: string | null; children: React.ReactNode }) {
  const { contentPath } = useGameSystem(roomId);
  const [docsByKind, setDocsByKind] = useState<Partial<Record<ContentKind, ContentDocWithId[]>>>({});
  const subscriptionsRef = useRef<Map<ContentKind, () => void>>(new Map());
  const contentPathRef = useRef(contentPath);

  // Changement de système actif (donc de contentPath) : on repart de zéro — les abonnements en cours
  // pointent vers l'ancienne collection, le cache ne doit jamais mélanger deux systèmes.
  useEffect(() => {
    if (contentPathRef.current === contentPath) return;
    contentPathRef.current = contentPath;
    subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
    subscriptionsRef.current.clear();
    setDocsByKind({});
  }, [contentPath]);

  useEffect(() => {
    const subscriptions = subscriptionsRef.current;
    return () => subscriptions.forEach((unsubscribe) => unsubscribe());
  }, []);

  const ensureSubscribed = useCallback((kind: ContentKind) => {
    if (subscriptionsRef.current.has(kind)) return;
    const unsubscribe = onSnapshot(
      query(collection(db, contentPathRef.current), where('kind', '==', kind)),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContentDoc) })) as ContentDocWithId[];
        setDocsByKind((prev) => ({ ...prev, [kind]: docs }));
      },
      () => setDocsByKind((prev) => ({ ...prev, [kind]: [] })),
    );
    subscriptionsRef.current.set(kind, unsubscribe);
  }, []);

  return (
    <GameContentContext.Provider value={{ contentPath, docsByKind, ensureSubscribed }}>
      {children}
    </GameContentContext.Provider>
  );
}

/** Monté UNE FOIS au layout racine : lit le roomId depuis l'URL ([roomid] présent = en salle), avec un
 *  repli sur le query param ?roomId=... (utilisé par les pages hors salle comme /ressources, ouvertes
 *  via window.open depuis le panneau MJ avec ce param — cf panel.tsx/Glossary.tsx qui font le même
 *  repli) — sans quoi ces pages retombent silencieusement sur le système par défaut dnd-classic. */
export function GameContentProvider({ children }: { children: React.ReactNode }) {
  const roomId = useRoomIdFromUrl();
  return <GameContentProviderInner roomId={roomId}>{children}</GameContentProviderInner>;
}

export interface UseGameContentResult<T extends ContentDocWithId = ContentDocWithId> {
  /** Docs du kind demandé, temps réel — [] tant que rien n'est chargé (voir isLoading). */
  docs: T[];
  /** Vrai tant que le premier snapshot de ce kind n'est pas arrivé. */
  isLoading: boolean;
  /** Chemin de la sous-collection active — pour les écritures MJ (éditeurs de contenu). */
  contentPath: string;
}

export function useGameContent<T extends ContentDocWithId = ContentDocWithId>(kind: ContentKind): UseGameContentResult<T> {
  const ctx = useContext(GameContentContext);
  if (!ctx) {
    throw new Error('useGameContent doit être utilisé sous <GameContentProvider> (layout de salle).');
  }
  const { contentPath, docsByKind, ensureSubscribed } = ctx;

  useEffect(() => {
    ensureSubscribed(kind);
    // contentPath en dépendance : après un changement de système, le cache est vidé et il faut
    // recréer l'abonnement de ce kind sur la nouvelle collection.
  }, [kind, contentPath, ensureSubscribed]);

  const docs = docsByKind[kind];
  return { docs: (docs ?? EMPTY_DOCS) as T[], isLoading: docs === undefined, contentPath };
}
