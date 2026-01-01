import { useEffect, useRef } from 'react';

export const useBackgroundAudio = (
    audioUrl: string | null,
    volume: number = 0.5,
    isEnabled: boolean = true
) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Create/update audio element
    useEffect(() => {
        if (!audioUrl || !isEnabled) {
            // Cleanup if no URL or disabled
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = "";
                audioRef.current = null;
            }
            return;
        }

        // Initialize audio if needed
        if (!audioRef.current) {
            const audio = new Audio(audioUrl);
            audio.loop = true;
            audio.volume = volume;
            audioRef.current = audio;

            // Auto-play (may be blocked by browser policies)
            audio.play().catch(e => {
                console.warn('Background audio autoplay failed:', e);
            });
        } else {
            // Update URL if changed
            if (audioRef.current.src !== audioUrl && !audioRef.current.src.endsWith(audioUrl)) {
                audioRef.current.src = audioUrl;
                audioRef.current.play().catch(e => {
                    console.warn('Background audio play failed after URL change:', e);
                });
            }
        }
    }, [audioUrl, isEnabled]);

    // Update volume
    useEffect(() => {
        if (audioRef.current && isEnabled) {
            audioRef.current.volume = Math.max(0, Math.min(1, volume));
        }
    }, [volume, isEnabled]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = "";
                audioRef.current = null;
            }
        };
    }, []);

    return audioRef;
};
