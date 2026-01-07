
import { useState, useEffect, useRef } from 'react';
import { SharedMeasurement } from '@/app/[roomid]/map/measurements';

export const useMeasurementSkins = (measurements: SharedMeasurement[]) => {
  const [skinElements, setSkinElements] = useState<Record<string, HTMLVideoElement>>({});
  const loadedSkins = useRef<Set<string>>(new Set());

  useEffect(() => {
    const requiredSkins = new Set<string>();

    // Identify all unique skins needed
    measurements.forEach(m => {
      if (m.skin) requiredSkins.add(m.skin);
    });

    // Load new skins
    requiredSkins.forEach(skinFilename => {
      if (!loadedSkins.current.has(skinFilename)) {

        const video = document.createElement('video');
        video.src = `/Effect/${skinFilename}`;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;

        // Autoplay when ready
        video.onloadeddata = () => {
          video.play().catch(e => console.error(`Autoplay failed for ${skinFilename}`, e));
          setSkinElements(prev => ({
            ...prev,
            [skinFilename]: video
          }));
        };

        loadedSkins.current.add(skinFilename);
      }
    });

    // Cleanup unused skins? 
    // For now, keep them cached to avoid reloading if they toggle visibility.
    // In a long session, might want to prune.

  }, [measurements]);

  return skinElements;
};
