
import { useState, useEffect } from 'react';
import { useEffects, getEffectUrl } from './useEffects';

export const useSkinVideo = (selectedSkin: string, active: boolean = true) => {
    const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

    // Load all effects from R2
    const { effects, isLoading } = useEffects();

    useEffect(() => {
        // `active` = l'outil mesure est réellement en cours d'utilisation.
        // Sans ce garde, la vidéo du skin sélectionné jouait en boucle (décodage
        // permanent) dès la sélection, même sans aucune mesure à l'écran.
        if (!active || !selectedSkin || isLoading || effects.length === 0) {
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

        // Autoplay when ready — AbortError ignoré : si le mode mesure est
        // désactivé pendant le chargement, le pause() du cleanup interrompt ce
        // play() avant démarrage, c'est le comportement voulu.
        video.onloadeddata = () => {
            video.play().catch(e => {
                if (e?.name !== 'AbortError') console.error("Skin autoplay fail", e);
            });
        };

        return () => {
            video.pause();
            video.src = ''; // Clear the source to stop loading
            setVideoElement(null);
        };
    }, [active, selectedSkin, effects, isLoading]);

    return videoElement;
};
