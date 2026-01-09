
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

        // Autoplay when ready
        video.onloadeddata = () => {
          video.play().catch(e => console.error(`Autoplay failed for ${skinFilename}`, e));
        };

        loadedSkins.current.add(skinFilename);
      }
    });

    // Cleanup unused skins? 
    // For now, keep them cached to avoid reloading if they toggle visibility.
    // In a long session, might want to prune.

  }, [measurements, effects, isLoading]);

  return skinElements;
};
