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

        const unsubscribe = onSnapshot(doc(db, 'global_sounds', roomId), (docSnap) => {
            const data = docSnap.data();
            if (!data) return;

            // Only act if it is a YOUTUBE type sound and it's new
            if (data.type === 'youtube' && data.soundUrl && data.timestamp > lastPlayedTimestamp.current) {
                lastPlayedTimestamp.current = data.timestamp;
                setVideoState({ id: data.soundUrl, timestamp: data.timestamp });
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
