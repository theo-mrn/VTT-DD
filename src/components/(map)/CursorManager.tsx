
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

export const CursorManager: React.FC<CursorManagerProps> = ({
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
    userColor // 🆕
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

    // 2. Track and broadcast our cursor position
    useEffect(() => {
        if (!roomId || !userId || !containerRef.current || !bgImageObject) return;

        const cursorRef = ref(realtimeDb, `rooms/${roomId}/cursors/${userId}`);

        if (!showCursor) {
            remove(cursorRef).catch(console.error);
            return;
        }

        const container = containerRef.current;

        const updateCursorPosition = throttle((worldX: number, worldY: number) => {
            set(cursorRef, {
                x: worldX,
                y: worldY,
                lastUpdate: Date.now(),
                cityId: cityId || null,
                user: {
                    name: userName || 'Anonymous',
                    color: userColor, // 🆕 Use calculated color
                    id: userId
                }
            }).catch(console.error);
        }, 50);

        const handleMouseMove = (e: MouseEvent) => {
            if (!bgImageObject) return;

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
    }, [roomId, userId, userName, cityId, offset, zoom, bgImageObject, showCursor, userColor]);


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
            zIndex: 100,
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
                            transition: 'transform 0.1s linear' // Smooth interpolation
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
                                color: getContrastColor(cursor.user.color), // 🆕 Dynamic Text Color
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
};
