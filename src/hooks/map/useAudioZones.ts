import { useEffect, useRef } from 'react';
import { MusicZone, Point } from '@/app/[roomid]/map/types';

export const useAudioZones = (zones: MusicZone[], listenerPos: Point | null) => {
    const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

    // Sync Audio objects creation/deletion/url
    useEffect(() => {
        const currentIds = new Set(zones.map(z => z.id));
        const audioMap = audioRefs.current;

        // Cleanup removed zones
        for (const [id, audio] of audioMap.entries()) {
            if (!currentIds.has(id)) {
                audio.pause();
                audio.src = "";
                audioMap.delete(id);
            }
        }

        zones.forEach(zone => {
            let audio = audioMap.get(zone.id);
            if (!audio) {
                // New zone
                audio = new Audio(zone.url);
                audio.loop = true;
                // audio.crossOrigin = 'anonymous'; // Generally good for CORS
                audioMap.set(zone.id, audio);

                // Attempt to play (browser interaction policies may block this)
                audio.play().catch(e => {
                    console.warn(`Autoplay failed for zone ${zone.name} (${zone.id}):`, e);
                });
            } else {
                // Update URL if changed
                // Note: zone.url might be relative, audio.src absolute. 
                // Simple check using inclusion if relative, or full check.
                // Assuming standard URLs:
                if (audio.src !== zone.url && !audio.src.endsWith(zone.url)) {
                    audio.src = zone.url;
                    audio.play().catch(e => console.warn("Play failed after src change:", e));
                }
            }
        });

    }, [zones]);

    // Update volumes based on position
    useEffect(() => {
        if (!listenerPos) {
            // Mute all if no listener
            audioRefs.current.forEach(audio => {
                audio.volume = 0;
            });
            return;
        }

        zones.forEach(zone => {
            const audio = audioRefs.current.get(zone.id);
            if (audio) {
                const dx = zone.x - listenerPos.x;
                const dy = zone.y - listenerPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                let vol = 0;
                // Use 3x multiplier to account for coordinate system scaling
                // The visual radius is affected by zoom, but coordinates are in world space
                const audioRadius = zone.radius * 3;

                // Quadratic falloff for smoother, more progressive volume changes
                if (distance < audioRadius) {
                    const normalizedDistance = distance / audioRadius; // 0 at center, 1 at edge
                    const falloff = 1 - (normalizedDistance * normalizedDistance); // Quadratic
                    vol = zone.volume * falloff;
                }

                // Exponential/Logarithmic falloff feels more natural usually, but let's stick to linear for now as requested "plus ou moins"
                // Ideally: vol = zone.volume * Math.max(0, 1 - distance / zone.radius);

                // Ensure valid range
                vol = Math.max(0, Math.min(1, vol));

                // Apply
                audio.volume = vol;
            }
        });

    }, [listenerPos, zones]);

    // Global Cleanup
    useEffect(() => {
        return () => {
            audioRefs.current.forEach(audio => {
                audio.pause();
                audio.src = "";
            });
            audioRefs.current.clear();
        };
    }, []);
};
