import { useEffect, useRef, useState } from 'react';
import { MusicZone, Point } from '@/app/[roomid]/map/types';

// Helper to extract YouTube video ID
const extractVideoId = (url: string): string | null => {
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/, /^([a-zA-Z0-9_-]{11})$/];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
};

export const useAudioZones = (
    zones: MusicZone[],
    listenerPos: Point | null,
    isMusicLayerVisible: boolean = true,
    masterVolume: number = 1, // From audio mixer
    ytPlayersRef?: React.MutableRefObject<Map<string, any>> // Ref to YouTube players instances
) => {
    const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const [youtubeZones, setYoutubeZones] = useState<MusicZone[]>([]);

    // Sync Audio objects creation/deletion/url
    useEffect(() => {
        const currentIds = new Set(zones.map(z => z.id));
        const audioMap = audioRefs.current;
        const ytMap = ytPlayersRef?.current;

        // Cleanup removed standard zones
        for (const [id, audio] of audioMap.entries()) {
            if (!currentIds.has(id)) {
                audio.pause();
                audio.src = "";
                audioMap.delete(id);
            }
        }

        // Cleanup removed YouTube zones from ref
        if (ytMap) {
            for (const [id, player] of ytMap.entries()) {
                if (!currentIds.has(id)) {
                    try { player.pauseVideo(); } catch (e) { }
                    ytMap.delete(id);
                }
            }
        }

        const newYoutubeZones: MusicZone[] = [];

        zones.forEach(zone => {
            if (!zone.url) return;

            const ytId = extractVideoId(zone.url);

            if (ytId) {
                // This is a YouTube zone
                newYoutubeZones.push({ ...zone, trackId: ytId });

                // If it was previously an HTMLAudioElement, clear it
                if (audioMap.has(zone.id)) {
                    const audio = audioMap.get(zone.id)!;
                    audio.pause();
                    audio.src = "";
                    audioMap.delete(zone.id);
                }

            } else {
                // This is a standard audio file zone
                // If it was previously a YouTube zone, it will be cleaned up by the component unmount/render
                let audio = audioMap.get(zone.id);
                if (!audio) {
                    // New zone
                    audio = new Audio(zone.url || undefined);
                    audio.loop = true;
                    // audio.crossOrigin = 'anonymous'; // Generally good for CORS
                    audioMap.set(zone.id, audio);

                    // Attempt to play (browser interaction policies may block this)
                    if (zone.url) {
                        audio.play().catch(e => {
                            console.warn(`Autoplay failed for zone ${zone.name} (${zone.id}):`, e);
                        });
                    }
                } else {
                    // Update URL if changed
                    const targetUrl = zone.url || "";
                    if (audio.src !== targetUrl && !audio.src.endsWith(targetUrl)) {
                        audio.src = targetUrl;
                        if (targetUrl) {
                            audio.play().catch(e => console.warn("Play failed after src change:", e));
                        }
                    }
                }
            }
        });

        setYoutubeZones(newYoutubeZones);

    }, [zones, ytPlayersRef]);

    // Update volumes based on position AND layer visibility AND master volume
    useEffect(() => {
        // Function to clamp and calculate volume 0.0 - 1.0
        const calculateVolume = (zone: MusicZone): number => {
            if (!isMusicLayerVisible || !listenerPos) return 0;

            const dx = zone.x - listenerPos.x;
            const dy = zone.y - listenerPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            let vol = 0;
            const audioRadius = zone.radius;

            if (distance < audioRadius) {
                const normalizedDistance = distance / audioRadius;
                const falloff = 1 - (normalizedDistance * normalizedDistance);
                vol = zone.volume * falloff * masterVolume;
            }

            return Math.max(0, Math.min(1, vol));
        };

        zones.forEach(zone => {
            const vol = calculateVolume(zone);

            // Apply to standard HTML Audio
            const audio = audioRefs.current.get(zone.id);
            if (audio) {
                audio.volume = vol;
            }

            // Apply to YouTube player
            const isYt = extractVideoId(zone.url || "");
            if (isYt && ytPlayersRef?.current) {
                const player = ytPlayersRef.current.get(zone.id);
                if (player && typeof player.setVolume === 'function') {
                    // YouTube volume is 0-100
                    try {
                        player.setVolume(vol * 100);
                        const state = player.getPlayerState();
                        // state: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
                        if (vol > 0 && [0, 2, 5, -1].includes(state)) {
                            player.playVideo();
                        } else if (vol === 0 && [1, 3].includes(state)) {
                            player.pauseVideo();
                        }
                    } catch (e) {
                        // ignore errors if player API isn't ready
                    }
                }
            }
        });

    }, [listenerPos, zones, isMusicLayerVisible, masterVolume, ytPlayersRef]);

    // Global Cleanup
    useEffect(() => {
        return () => {
            audioRefs.current.forEach(audio => {
                audio.pause();
                audio.src = "";
            });
            audioRefs.current.clear();

            if (ytPlayersRef?.current) {
                ytPlayersRef.current.forEach(player => {
                    try { player.pauseVideo(); } catch (e) { }
                });
                ytPlayersRef.current.clear();
            }
        };
    }, [ytPlayersRef]);

    return { youtubeZones };
};
