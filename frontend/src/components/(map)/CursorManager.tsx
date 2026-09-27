import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useCampaignEphemeral } from '@/lib/realtime';
import { getContrastColor } from '@/utils/imageUtils';

// Curseurs des autres : canal éphémère du temps réel (l'ancien nœud RTDB `rooms/{roomId}/cursors`).
// Messages `cursor` (position, scène, nom et couleurs) et `cursor.remove` ; rien n'est gardé côté
// serveur, un curseur muet depuis 30 s disparaît (le départ d'un onglet n'est pas signalé).

/** Équivalent de lodash.throttle (appel en tête et en fin de fenêtre), avec `cancel()`. */
function throttle<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const run = () => {
    last = Date.now();
    timer = null;
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
    }
  };
  const throttled = (...args: A) => {
    pending = args;
    const remaining = wait - (Date.now() - last);
    if (remaining <= 0) {
      if (timer) clearTimeout(timer);
      run();
    } else if (!timer) {
      timer = setTimeout(run, remaining);
    }
  };
  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return throttled;
}

interface Cursor {
  x: number;
  y: number;
  lastUpdate: number;
  cityId: string | null; // 🆕 Track scene/city
  user: {
    name: string;
    color: string;
    textColor?: string;
    id: string;
  };
}

interface CursorManagerProps {
  roomId: string;
  userId: string;
  userName: string;
  cityId: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  offset: { x: number; y: number };
  zoom: number;
  bgImageObject: HTMLImageElement | HTMLVideoElement | null;
  showCursor: boolean;
  showOtherCursors: boolean;
  userColor: string; // 🆕 Dynamic color
  userTextColor?: string; // 🆕 Dynamic text color
}

const getMediaDimensions = (media: HTMLImageElement | HTMLVideoElement) => {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight };
  }
  return { width: media.width, height: media.height };
};

// Generate a random color for the user if they don't have one - Fallback
const getRandomColor = () => {
  const colors = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#33FFF5', '#F5FF33'];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Égalité sur les seuls champs qui influencent le rendu (position + identité + scène). On ignore
// délibérément `lastUpdate` : un heartbeat qui ne bouge pas le curseur ne doit pas provoquer de
// re-render, sinon on réintroduit la boucle de mises à jour. Utilisé pour court-circuiter setCursors.
const cursorsEqual = (a: Record<string, Cursor>, b: Record<string, Cursor>) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const ca = a[key];
    const cb = b[key];
    if (!cb) return false;
    if (ca.x !== cb.x || ca.y !== cb.y || ca.cityId !== cb.cityId) return false;
    if (
      ca.user.name !== cb.user.name ||
      ca.user.color !== cb.user.color ||
      ca.user.textColor !== cb.user.textColor
    )
      return false;
  }
  return true;
};

export const CursorManager = React.memo<CursorManagerProps>(
  ({
    roomId,
    userId,
    userName,
    cityId,
    containerRef,
    offset,
    zoom,
    bgImageObject,
    showCursor,
    showOtherCursors,
    userColor, // 🆕
    userTextColor, // 🆕
  }) => {
    const [cursors, setCursors] = useState<Record<string, Cursor>>({});
    // const userColorRef = useRef(getRandomColor()); // Removed, using prop now

    // 1. Listen to cursors from the realtime ephemeral channel
    const receivedRef = useRef<Record<string, Cursor>>({});
    const showOtherRef = useRef(showOtherCursors);
    showOtherRef.current = showOtherCursors;
    const cityIdRef = useRef(cityId);
    cityIdRef.current = cityId;

    const refreshCursors = useCallback(() => {
      // userId vide (auth pas encore résolue, passé comme '' par le parent) : ne PAS afficher. Sinon le
      // filtre `key !== userId` ci-dessous (key !== '') laisse passer NOTRE propre curseur.
      if (!roomId || !userId || !showOtherRef.current) {
        setCursors((prev) => (Object.keys(prev).length ? {} : prev));
        return;
      }
      const activeCursors: Record<string, Cursor> = {};
      const now = Date.now();
      Object.entries(receivedRef.current).forEach(([key, value]) => {
        const isSameScene = (value.cityId || null) === (cityIdRef.current || null);
        if (key !== userId && now - value.lastUpdate < 30000 && isSameScene) {
          activeCursors[key] = value;
        }
      });

      // Ne remplacer le state QUE si le contenu pertinent a réellement changé (sinon boucle de
      // re-renders : l'effet de broadcast se réattache à chaque render du parent).
      setCursors((prev) => (cursorsEqual(prev, activeCursors) ? prev : activeCursors));
    }, [roomId, userId]);

    const { send } = useCampaignEphemeral<Record<string, unknown>>(
      roomId || null,
      ['cursor', 'cursor.remove'],
      (m) => {
        const id = m.from.userId;
        if (m.kind === 'cursor.remove') {
          if (!receivedRef.current[id]) return;
          const next = { ...receivedRef.current };
          delete next[id];
          receivedRef.current = next;
        } else {
          const c = m.data as unknown as Cursor;
          if (typeof c?.x !== 'number' || typeof c?.y !== 'number') return;
          // Horodatage de réception : l'expiration ne dépend pas de l'horloge de l'autre
          receivedRef.current = { ...receivedRef.current, [id]: { ...c, lastUpdate: Date.now() } };
        }
        refreshCursors();
      },
    );
    const sendRef = useRef(send);
    sendRef.current = send;

    useEffect(() => {
      refreshCursors();
      const t = setInterval(refreshCursors, 5000);
      return () => clearInterval(t);
    }, [refreshCursors, cityId, showOtherCursors]);

    // En quittant la carte, les autres retirent notre curseur
    useEffect(() => () => sendRef.current('cursor.remove', {}), []);

    // 🐛 DEBUG: Log color props
    useEffect(() => {}, [userColor, userTextColor, userName]);

    // 2. Track and broadcast our cursor position
    const lastSentPosRef = useRef<{ x: number; y: number } | null>(null);
    const lastSentTimeRef = useRef<number>(0);
    const isVisibleRef = useRef(true);

    useEffect(() => {
      const handleVisibilityChange = () => {
        isVisibleRef.current = document.visibilityState === 'visible';
        if (!isVisibleRef.current && roomId && userId) {
          sendRef.current('cursor.remove', {});
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [roomId, userId]);

    useEffect(() => {
      if (!roomId || !userId || !containerRef.current || !bgImageObject) return;

      if (!showCursor) {
        sendRef.current('cursor.remove', {});
        return;
      }

      const container = containerRef.current;

      const updateCursorPosition = throttle((worldX: number, worldY: number) => {
        if (!isVisibleRef.current) return;

        const now = Date.now();
        const lastPos = lastSentPosRef.current;
        const lastTime = lastSentTimeRef.current;

        // distance threshold check (2 units)
        const dx = lastPos ? worldX - lastPos.x : Infinity;
        const dy = lastPos ? worldY - lastPos.y : Infinity;
        const distSq = dx * dx + dy * dy;

        // Heartbeat: update every 10s even if stationary
        const isHeartbeat = now - lastTime > 10000;
        const movedEnough = distSq > 4; // 2^2

        if (!movedEnough && !isHeartbeat) return;

        sendRef.current('cursor', {
          x: worldX,
          y: worldY,
          lastUpdate: now,
          cityId: cityId || null,
          user: {
            name: userName || 'Anonymous',
            color: userColor,
            textColor: userTextColor,
            id: userId,
          },
        });
        lastSentPosRef.current = { x: worldX, y: worldY };
        lastSentTimeRef.current = now;
      }, 1000);

      const handleMouseMove = (e: MouseEvent) => {
        if (!bgImageObject || !isVisibleRef.current) return;

        const { width: imgWidth, height: imgHeight } = getMediaDimensions(bgImageObject);
        const rect = container.getBoundingClientRect();
        const { clientWidth: containerWidth, clientHeight: containerHeight } = container;

        // Calculate scale - same logic as in page.tsx
        const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
        const scaledWidth = imgWidth * scale * zoom;
        const scaledHeight = imgHeight * scale * zoom;

        // Calculate mouse position relative to the container center/offset
        // This needs to match the reverse transformation in render logic
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Transform Screen Coords -> World Coords
        const worldX = ((mouseX + offset.x) / scaledWidth) * imgWidth;
        const worldY = ((mouseY + offset.y) / scaledHeight) * imgHeight;

        updateCursorPosition(worldX, worldY);
      };

      container.addEventListener('mousemove', handleMouseMove);

      return () => {
        container.removeEventListener('mousemove', handleMouseMove);
        updateCursorPosition.cancel();
      };
    }, [
      roomId,
      userId,
      userName,
      cityId,
      offset,
      zoom,
      bgImageObject,
      showCursor,
      userColor,
      userTextColor,
    ]);

    // 3. Render foreign cursors
    if (!bgImageObject) return null;
    const { width: imgWidth, height: imgHeight } = getMediaDimensions(bgImageObject);
    const container = containerRef.current;
    if (!container) return null;

    const { clientWidth: containerWidth, clientHeight: containerHeight } = container;
    const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
    const scaledWidth = imgWidth * scale * zoom;
    const scaledHeight = imgHeight * scale * zoom;

    return (
      <div
        className="cursors-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 10,
          overflow: 'hidden',
        }}
      >
        {Object.values(cursors).map((cursor) => {
          // Transform World -> Screen
          const screenX = (cursor.x / imgWidth) * scaledWidth - offset.x;
          const screenY = (cursor.y / imgHeight) * scaledHeight - offset.y;

          return (
            <div
              key={cursor.user.id}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: `translate(${screenX}px, ${screenY}px)`,
                transition: 'transform 1s linear', // Smooth interpolation matching 1s throttle
              }}
            >
              {/* SVG Cursor */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.3))' }}
              >
                <path
                  d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19823L11.7841 12.3673H5.65376Z"
                  fill={cursor.user.color}
                  stroke="white"
                  strokeWidth="1"
                />
              </svg>

              {/* Name Label */}
              <div
                style={{
                  position: 'absolute',
                  left: 16,
                  top: 16,
                  backgroundColor: cursor.user.color,
                  color: cursor.user.textColor || getContrastColor(cursor.user.color), // 🆕 Dynamic Text Color
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  boxShadow: '0px 2px 2px rgba(0,0,0,0.2)',
                }}
              >
                {cursor.user.name}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
);
