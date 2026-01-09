
import { useState, useEffect } from 'react';
import { useEffects, getEffectUrl } from './useEffects';

export const useSkinVideo = (selectedSkin: string) => {
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

    // Load all effects from R2
    const { effects, isLoading } = useEffects();

    useEffect(() => {
        if (!selectedSkin || isLoading || effects.length === 0) {
            setVideoElement(null);
            return;
        }

        const video = document.createElement('video');
        // Get the R2 URL for this effect
        video.src = getEffectUrl(selectedSkin, effects);
        video.loop = true;
        video.muted = true;
        video.playsInline = true;

        // Set immediately so it's available for rendering
        setVideoElement(video);

        // Autoplay when ready
        video.onloadeddata = () => {
            video.play().catch(e => console.error("Skin autoplay fail", e));
        };

        return () => {
            video.pause();
            video.src = ''; // Clear the source to stop loading
            setVideoElement(null);
        };
    }, [selectedSkin, effects, isLoading]);

    return videoElement;
};
