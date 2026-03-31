'use client';

import React, { useEffect, useRef, useState } from 'react';
import YouTube, { YouTubeProps, YouTubePlayer } from 'react-youtube';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface YouTubeSFXPlayerProps {
    roomId: string;
    volume?: number;
}

export default function YouTubeSFXPlayer({ roomId, volume = 0.5 }: YouTubeSFXPlayerProps) {
    const [videoState, setVideoState] = useState<{ id: string, timestamp: number } | null>(null);
    const playerRef = useRef<YouTubePlayer | null>(null);
    const lastPlayedTimestamp = useRef<number>(0);

    // Initial setup: Mute/Set Volume
    const onPlayerReady: YouTubeProps['onReady'] = (event) => {
        playerRef.current = event.target;
        const safeVolume = Math.max(0, Math.min(100, volume * 100));
        event.target.setVolume(safeVolume);

        if (videoState?.id) {
            event.target.playVideo();
        }
    };

    // Update volume when prop changes
    useEffect(() => {
        if (playerRef.current) {
            const safeVolume = Math.max(0, Math.min(100, volume * 100));
            playerRef.current.setVolume(safeVolume);
        }
    }, [volume]);

    // Listener for Global SFX
    useEffect(() => {
        if (!roomId) return;

        let isFirst = true;

        const unsubscribe = onSnapshot(doc(db, 'global_sounds', roomId), (docSnap) => {
            const data = docSnap.data();
            if (!data) return;

            const newTimestamp = data.timestamp || 0;

            // Skip initial snapshot(s) to avoid auto-playing on page load
            if (isFirst) {
                isFirst = false;
                lastPlayedTimestamp.current = newTimestamp;
                return;
            }

            // Ignore stale events
            if (newTimestamp <= lastPlayedTimestamp.current) return;
            lastPlayedTimestamp.current = newTimestamp;

            // Stop if sound was cleared
            if (!data.soundUrl) {
                playerRef.current?.stopVideo();
                setVideoState(null);
                return;
            }

            // Play if it's a YouTube type sound
            if (data.type === 'youtube') {
                setVideoState({ id: data.soundUrl, timestamp: newTimestamp });
            }
        });

        return () => unsubscribe();
    }, [roomId]);

    // Cleanup or Stop Logic?
    // Sound Effects are usually "play once". YouTube player plays until end.
    // If a new sound comes in, it replaces the state, causing the player to load the new ID.

    if (!videoState) return null;

    return (
        <div className="hidden">
            <YouTube
                key={videoState.id + videoState.timestamp} // Force remount on new play request even if same ID? Or just use ID. Timestamp ensures re-play.
                videoId={videoState.id}
                opts={{
                    height: '0',
                    width: '0',
                    playerVars: {
                        autoplay: 1,
                        controls: 0,
                        disablekb: 1,
                        fs: 0,
                        modestbranding: 1,
                        rel: 0,
                    },
                }}
                onReady={onPlayerReady}
                onEnd={() => setVideoState(null)} // Unmount/Clear when done
            />
        </div>
    );
}
