
import { useState, useEffect, useRef } from 'react';
import { SharedMeasurement } from '@/app/[roomid]/map/measurements';
import { useEffects, getEffectUrl } from './useEffects';

export const useMeasurementSkins = (measurements: SharedMeasurement[]) => {
  const [skinElements, setSkinElements] = useState<Record<string, HTMLVideoElement>>({});
  const loadedSkins = useRef<Set<string>>(new Set());

  // Load all effects from R2
  const { effects, isLoading } = useEffects();

  useEffect(() => {
    if (isLoading || effects.length === 0) return;

    const requiredSkins = new Set<string>();

    // Identify all unique skins needed
    measurements.forEach(m => {
      if (m.skin) requiredSkins.add(m.skin);
    });

    // Load new skins
    requiredSkins.forEach(skinFilename => {
      if (!loadedSkins.current.has(skinFilename)) {

        const video = document.createElement('video');
        // Get the R2 URL for this effect
        video.src = getEffectUrl(skinFilename, effects);
        video.loop = true;
        video.muted = true;
        video.playsInline = true;

        // Add to state immediately so it's available for rendering
        setSkinElements(prev => ({
          ...prev,
          [skinFilename]: video
        }));

        // Autoplay when ready — AbortError ignoré : si la mesure a expiré
        // pendant le chargement, l'effet de pause plus bas interrompt ce play()
        // avant démarrage, c'est le comportement voulu.
        video.onloadeddata = () => {
          video.play().catch(e => {
            if (e?.name !== 'AbortError') console.error(`Autoplay failed for ${skinFilename}`, e);
          });
        };

        loadedSkins.current.add(skinFilename);
      }
    });

  }, [measurements, effects, isLoading]);

  // Pause/reprise selon le besoin réel : les vidéos restent en cache (pas de
  // re-téléchargement) mais ne décodent plus quand plus aucune mesure ne les
  // affiche — les mesures temporaires expirent en ~6s, sans cette pause chaque
  // skin utilisé une fois continuait de boucler jusqu'à la fin de la session.
  useEffect(() => {
    const required = new Set<string>();
    measurements.forEach(m => { if (m.skin) required.add(m.skin); });

    Object.entries(skinElements).forEach(([name, video]) => {
      if (!required.has(name)) {
        if (!video.paused) video.pause();
      } else if (video.paused) {
        video.play().catch(() => { });
      }
    });
  }, [measurements, skinElements]);

  return skinElements;
};
