
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { realtimeDb } from '@/lib/firebase';
import { ref, onValue, set, remove, onDisconnect } from 'firebase/database';
import throttle from 'lodash.throttle';
import { getContrastColor } from '@/utils/imageUtils';

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

export const CursorManager = React.memo<CursorManagerProps>(({
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
    userTextColor // 🆕
}) => {
    const [cursors, setCursors] = useState<Record<string, Cursor>>({});
    // const userColorRef = useRef(getRandomColor()); // Removed, using prop now

    // 1. Listen to cursors from Realtime Database
    useEffect(() => {
        if (!roomId || !showOtherCursors) {
            setCursors({});
            return;
        }

        const cursorsRef = ref(realtimeDb, `rooms/${roomId}/cursors`);

        const unsubscribe = onValue(cursorsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const now = Date.now();
                const activeCursors: Record<string, Cursor> = {};

                Object.entries(data).forEach(([key, value]: [string, any]) => {
                    const isSameScene = (value.cityId || null) === (cityId || null);
                    if (key !== userId && (now - value.lastUpdate < 30000) && isSameScene) {
                        activeCursors[key] = value;
                    }
                });

                setCursors(activeCursors);
            } else {
                setCursors({});
            }
        });

        return () => unsubscribe();
    }, [roomId, userId, cityId, showOtherCursors]);

    // 🐛 DEBUG: Log color props
    useEffect(() => {
    }, [userColor, userTextColor, userName]);

    // 2. Track and broadcast our cursor position
    const lastSentPosRef = useRef<{ x: number, y: number } | null>(null);
    const lastSentTimeRef = useRef<number>(0);
    const isVisibleRef = useRef(true);

    useEffect(() => {
        const handleVisibilityChange = () => {
            isVisibleRef.current = document.visibilityState === 'visible';
            if (!isVisibleRef.current && roomId && userId) {
                const cursorRef = ref(realtimeDb, `rooms/${roomId}/cursors/${userId}`);
                remove(cursorRef).catch(console.error);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [roomId, userId]);

    useEffect(() => {
        if (!roomId || !userId || !containerRef.current || !bgImageObject) return;

        const cursorRef = ref(realtimeDb, `rooms/${roomId}/cursors/${userId}`);

        if (!showCursor) {
            remove(cursorRef).catch(console.error);
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

            set(cursorRef, {
                x: worldX,
                y: worldY,
                lastUpdate: now,
                cityId: cityId || null,
                user: {
                    name: userName || 'Anonymous',
                    color: userColor,
                    textColor: userTextColor,
                    id: userId
                }
            }).then(() => {
                lastSentPosRef.current = { x: worldX, y: worldY };
                lastSentTimeRef.current = now;
            }).catch(console.error);
        }, 1500);

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

        // Set up disconnect handler
        const disconnectRef = ref(realtimeDb, `rooms/${roomId}/cursors/${userId}`);
        onDisconnect(disconnectRef).remove();

        return () => {
            container.removeEventListener('mousemove', handleMouseMove);
            updateCursorPosition.cancel();
            // Remove cursor on unmount effectively
            remove(disconnectRef).catch(console.error);
        };
    }, [roomId, userId, userName, cityId, offset, zoom, bgImageObject, showCursor, userColor, userTextColor]);


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
        <div className="cursors-layer" style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 10,
            overflow: 'hidden'
        }}>
            {Object.values(cursors).map(cursor => {
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
                            transition: 'transform 1.5s linear' // Smooth interpolation matching 1.5s throttle
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
                                boxShadow: '0px 2px 2px rgba(0,0,0,0.2)'
                            }}
                        >
                            {cursor.user.name}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});
