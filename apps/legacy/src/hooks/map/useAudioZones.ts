import { useEffect, useRef, useState } from 'react';
import { MusicZone, Point } from '@/app/[roomid]/map/types';
import { registerPendingPlay } from '@/utils/audioAutoplay';

// Helper to extract YouTube video ID
const extractVideoId = (url: string): string | null => {
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/, /^([a-zA-Z0-9_-]{11})$/];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) return match[1];
    }
    return null;
};

// Un seul graphe Web Audio par <audio> : MediaElementSource → Gain (volume) → StereoPanner → destination.
// Une fois createMediaElementSource() appelé sur un élément, audio.volume natif ne doit plus servir
// (sinon double contrôle du volume) — tout passe par le GainNode.
type AudioNodes = { gain: GainNode; panner: StereoPannerNode };


export const getSharedAudioContext = (() => {
    let ctx: AudioContext | null = null;
    let unlockAttached = false;

    // Un AudioContext démarre (ou repasse) 'suspended' tant qu'aucun geste utilisateur
    // n'a été vu par la page — indépendamment du blocage autoplay des <audio> géré par
    // audioAutoplay.ts. resume() appelé une seule fois à la connexion peut échouer
    // silencieusement si aucun geste n'a encore eu lieu ; sans ce hook, le contexte
    // reste gelé pour toujours et aucun son connecté au graphe ne sort.
    const attachUnlock = () => {
        if (unlockAttached || typeof window === 'undefined') return;
        unlockAttached = true;
        const tryResume = () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); };
        ['pointerdown', 'keydown'].forEach(evt =>
            window.addEventListener(evt, tryResume, { capture: true }),
        );
    };

    return () => {
        if (!ctx) {
            const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            ctx = new Ctor();
        }
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        attachUnlock();
        return ctx;
    };
})();

export const useAudioZones = (
    zones: MusicZone[],
    listenerPos: Point | null,
    isMusicLayerVisible: boolean = true,
    masterVolume: number = 1, // From audio mixer
    ytPlayersRef?: React.MutableRefObject<Map<string, any>> // Ref to YouTube players instances
) => {
    const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const nodesRefs = useRef<Map<string, AudioNodes>>(new Map());
    const [youtubeZones, setYoutubeZones] = useState<MusicZone[]>([]);

    // Branche un <audio> nouvellement créé sur Gain + StereoPanner pour permettre le panning.
    const connectSpatialNodes = (audio: HTMLAudioElement): AudioNodes => {
        const ctx = getSharedAudioContext();
        const source = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        const panner = ctx.createStereoPanner();
        source.connect(gain).connect(panner).connect(ctx.destination);
        return { gain, panner };
    };

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
                nodesRefs.current.delete(id);
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
                    nodesRefs.current.delete(zone.id);
                }

            } else {
                // This is a standard audio file zone
                // If it was previously a YouTube zone, it will be cleaned up by the component unmount/render
                let audio = audioMap.get(zone.id);
                if (!audio) {
                    // New zone — PAS de play() ici : c'est l'effet volume plus
                    // bas qui pilote la lecture (play si vol > 0, pause sinon).
                    // Lancer la lecture à la création faisait systématiquement
                    // courser play() par le pause() à volume 0 → AbortError
                    // console + registerPendingPlay parasite.
                    audio = new Audio(zone.url || undefined);
                    audio.loop = true;
                    audioMap.set(zone.id, audio);
                    // Les URLs de zones sont saisies librement par les utilisateurs (pas forcément
                    // CORS-friendly). crossOrigin='anonymous' sans en-têtes CORS côté serveur bloque
                    // le chargement entier (pas juste le panning) : on écoute 'error' et on repasse
                    // en <audio> simple (son sans panning) plutôt que de couper le son de la zone.
                    audio.crossOrigin = 'anonymous';
                    const plainAudio = audio;
                    const onCorsError = () => {
                        if (audioMap.get(zone.id) !== plainAudio) return;
                        nodesRefs.current.delete(zone.id);
                        const retry = new Audio(zone.url || undefined);
                        retry.loop = true;
                        audioMap.set(zone.id, retry);
                        console.warn(`Zone ${zone.id}: source non-CORS, lecture sans panning.`);
                    };
                    audio.addEventListener('error', onCorsError, { once: true });
                    try {
                        nodesRefs.current.set(zone.id, connectSpatialNodes(audio));
                    } catch (e) {
                        console.warn(`Spatial audio setup failed for zone ${zone.id}, falling back to plain volume:`, e);
                    }
                } else {
                    // Update URL if changed — la reprise éventuelle est gérée
                    // par l'effet volume (même commit).
                    const targetUrl = zone.url || "";
                    if (audio.src !== targetUrl && !audio.src.endsWith(targetUrl)) {
                        audio.src = targetUrl;
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

        // Pan gauche/droite selon la position horizontale de la zone par rapport à l'auditeur :
        // source à gauche → pan négatif, à droite → positif. Le spread est relatif au rayon de
        // la zone (pas une constante globale) : sinon, comme les rayons typiques (100-200px) sont
        // plus petits qu'un spread fixe, le joueur sort de la zone audible avant que le pan
        // n'approche ±1 — le panning restait quasi imperceptible en pratique.
        const calculatePan = (zone: MusicZone): number => {
            if (!listenerPos) return 0;
            const dx = zone.x - listenerPos.x;
            const spread = zone.radius * 0.6;
            return Math.max(-1, Math.min(1, dx / spread));
        };

        zones.forEach(zone => {
            const vol = calculateVolume(zone);
            const pan = calculatePan(zone);

            // Apply to standard HTML Audio
            const audio = audioRefs.current.get(zone.id);
            const nodes = nodesRefs.current.get(zone.id);
            if (audio) {
                if (nodes) {
                    // Graphe Web Audio connecté : volume + pan pilotés via les nodes,
                    // audio.volume natif doit rester à 1 pour ne pas doubler l'atténuation.
                    audio.volume = 1;
                    nodes.gain.gain.value = vol;
                    nodes.panner.pan.value = pan;
                } else {
                    // Fallback (CORS/connexion échouée) : volume natif seul, pas de panning.
                    audio.volume = vol;
                }
                // Volume 0 = pause réelle (comme les players YouTube plus bas) :
                // un <audio> qui joue à volume 0 garde son pipeline de décodage
                // actif en permanence — une zone = un décodeur qui chauffe pour rien.
                if (vol === 0) {
                    if (!audio.paused) audio.pause();
                } else if (audio.paused && audio.src) {
                    audio.play().catch(e => {
                        // AbortError = un pause() est arrivé avant le démarrage
                        // (résultat voulu, pas une erreur). registerPendingPlay
                        // est réservé au blocage d'autoplay : le déclencher sur
                        // AbortError relançait une zone censée rester en pause.
                        if (e.name === 'NotAllowedError') { registerPendingPlay(audio); return; }
                        if (e.name !== 'AbortError') console.warn(`Resume failed for zone ${zone.id}:`, e);
                    });
                }
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
            nodesRefs.current.clear();

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
