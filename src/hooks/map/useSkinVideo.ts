
import { useState, useEffect } from 'react';

export const useSkinVideo = (selectedSkin: string) => {
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

    useEffect(() => {
        if (!selectedSkin) {
            setVideoElement(null);
            return;
        }

        const video = document.createElement('video');
        video.src = `/Effect/${selectedSkin}`;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;

        video.onloadeddata = () => {
            video.play().catch(e => console.error("Skin autoplay fail", e));
            setVideoElement(video);
        };

        return () => {
            video.pause();
            setVideoElement(null);
        };
    }, [selectedSkin]);

    return videoElement;
};
