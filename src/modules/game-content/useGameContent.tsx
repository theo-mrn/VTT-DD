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
//
// IMPORTANT (bug corrigé) : un SEUL effet gère tout l'abonnement (déclenché par contentPath ET par la
// liste de kinds demandés) — reset + resouscription complète à chaque changement, jamais de logique
// répartie entre un effet "reset" et un effet "ensureSubscribed" séparés : l'ordre d'exécution
// parent/enfant de React entre ces deux effets créait une course où le nettoyage arrivait après la
// tentative de resouscription, laissant le cache vidé indéfiniment (isLoading bloqué à true).
// ─────────────────────────────────────────────────────────────────────────────

export type ContentDocWithId = ContentDoc & { id: string };

interface GameContentContextValue {
  contentPath: string;
  docsByKind: Partial<Record<ContentKind, ContentDocWithId[]>>;
  requestKind: (kind: ContentKind) => void;
}

const GameContentContext = createContext<GameContentContextValue | null>(null);
const LOG_PREFIX = '[useGameContent]';

const EMPTY_DOCS: ContentDocWithId[] = [];

/** Lit ?roomId=... directement via window.location plutôt que useSearchParams() — évite d'exiger un
 *  <Suspense> autour du Provider racine. Recalculé au montage uniquement : cette page est toujours
 *  ouverte via window.open (jamais de navigation interne qui changerait la query string ensuite). */
function useRoomIdFromUrl(): string | null {
  const params = useParams();
  const roomIdFromRouteParam = (params?.roomid as string) ?? null;
  const [roomIdFromQuery, setRoomIdFromQuery] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromQuery = new URLSearchParams(window.location.search).get('roomId');
    setRoomIdFromQuery(fromQuery);
  }, [roomIdFromRouteParam]);

  return roomIdFromRouteParam ?? roomIdFromQuery;
}

function GameContentProviderInner({ roomId, children }: { roomId: string | null; children: React.ReactNode }) {
  const { contentPath } = useGameSystem(roomId);
  const [docsByKind, setDocsByKind] = useState<Partial<Record<ContentKind, ContentDocWithId[]>>>({});
  // Kinds demandés par au moins un consommateur monté — en state (pas juste un ref) pour que son
  // changement redéclenche bien l'effet d'abonnement ci-dessous.
  const [requestedKinds, setRequestedKinds] = useState<ContentKind[]>([]);
  const subscriptionsRef = useRef<Map<ContentKind, () => void>>(new Map());

  const requestKind = useCallback((kind: ContentKind) => {
    setRequestedKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
  }, []);

  // SEUL effet qui (re)souscrit : se redéclenche sur changement de contentPath (nouveau système) OU de
  // requestedKinds (nouveau consommateur) — reset complet + resouscription de TOUS les kinds demandés
  // à chaque fois, jamais de logique partielle qui dépendrait de l'état d'un abonnement précédent.
  useEffect(() => {
    setDocsByKind({});
    subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
    subscriptionsRef.current.clear();

    for (const kind of requestedKinds) {
      const unsubscribe = onSnapshot(
        query(collection(db, contentPath), where('kind', '==', kind)),
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContentDoc) })) as ContentDocWithId[];
          setDocsByKind((prev) => ({ ...prev, [kind]: docs }));
        },
        (error) => {
          console.error(`${LOG_PREFIX} ERREUR snapshot('${kind}') sur '${contentPath}':`, error.code, error.message);
          setDocsByKind((prev) => ({ ...prev, [kind]: [] }));
        },
      );
      subscriptionsRef.current.set(kind, unsubscribe);
    }

    return () => {
      subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
      subscriptionsRef.current.clear();
    };
  }, [contentPath, requestedKinds]);

  return (
    <GameContentContext.Provider value={{ contentPath, docsByKind, requestKind }}>
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

  useEffect(() => {
    if (!ctx) {
      console.error(`${LOG_PREFIX} useGameContent('${kind}') appelé hors de <GameContentProvider> — vérifier que le Provider est bien monté au-dessus dans l'arbre (layout racine).`);
      return;
    }
    ctx.requestKind(kind);
  }, [kind, ctx]);

  if (!ctx) {
    // Ne jamais planter toute la page pour ça : un composant qui rend avant l'hydratation complète du
    // Provider (ou un mismatch HMR en dev) doit dégrader proprement plutôt que de casser tout l'arbre.
    return { docs: EMPTY_DOCS as T[], isLoading: true, contentPath: '' };
  }

  const docs = ctx.docsByKind[kind];
  return { docs: (docs ?? EMPTY_DOCS) as T[], isLoading: docs === undefined, contentPath: ctx.contentPath };
}
