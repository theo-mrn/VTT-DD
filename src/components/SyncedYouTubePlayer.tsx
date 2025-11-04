'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import YouTube, { YouTubeProps, YouTubePlayer } from 'react-youtube';
import { realtimeDb, dbRef, set, onValue, update } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface MusicState {
  videoId: string | null;
  videoTitle?: string;
  isPlaying: boolean;
  timestamp: number;
  volume: number;
  lastUpdate: number;
  updatedBy: string;
}

interface SyncedYouTubePlayerProps {
  roomId: string;
}

export default function SyncedYouTubePlayer({ roomId }: SyncedYouTubePlayerProps) {
  const { user, isMJ } = useGame();
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [musicState, setMusicState] = useState<MusicState>({
    videoId: null,
    videoTitle: '',
    isPlaying: false,
    timestamp: 0,
    volume: 80,
    lastUpdate: Date.now(),
    updatedBy: ''
  });
  const [isLocalUpdate, setIsLocalUpdate] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [localVolume, setLocalVolume] = useState(80); // Volume local non synchronisé
  const playerRef = useRef<YouTubePlayer | null>(null);
  const musicStateRef = useRef<string>(`rooms/${roomId}/music`);
  const isInitialLoad = useRef(true);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingFromFirebase = useRef(false); // Nouveau flag pour éviter les boucles

  // Fonction pour extraire l'ID vidéo YouTube d'une URL
  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  // Fonction pour mettre à jour l'état de la musique dans Firebase
  const updateMusicState = useCallback(async (updates: Partial<MusicState>) => {
    if (!user) return;
    
    setIsLocalUpdate(true);
    const musicRef = dbRef(realtimeDb, musicStateRef.current);
    
    try {
      await update(musicRef, {
        ...updates,
        lastUpdate: Date.now(),
        updatedBy: user.uid
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la musique:', error);
    } finally {
      setTimeout(() => setIsLocalUpdate(false), 500);
    }
  }, [user]);

  // Chargement d'une nouvelle vidéo YouTube
  const loadVideo = useCallback(async () => {
    const videoId = extractVideoId(youtubeUrl);
    
    if (!videoId) {
      console.error('URL YouTube invalide');
      return;
    }

    console.log('📼 Loading video:', videoId);
    
    await updateMusicState({
      videoId,
      isPlaying: false, // Ne pas auto-play immédiatement
      timestamp: 0,
      volume: 80
    });

    setYoutubeUrl('');
  }, [youtubeUrl, updateMusicState]);

  // Fonction pour forcer le démarrage avec interaction utilisateur
  const forcePlay = useCallback(async () => {
    if (!playerRef.current) {
      console.error('Lecteur non prêt');
      return;
    }

    try {
      console.log('▶️ Force play with user interaction');
      
      // Activer le flag pour éviter les conflits
      isSyncingFromFirebase.current = true;
      
      // Configurer et démarrer le lecteur
      playerRef.current.unMute();
      playerRef.current.setVolume(localVolume);
      playerRef.current.playVideo();
      
      // Attendre un peu que le lecteur démarre
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Mettre à jour Firebase
      await updateMusicState({
        isPlaying: true,
        timestamp: playerRef.current.getCurrentTime()
      });
      
      // Désactiver le flag après un délai
      setTimeout(() => {
        isSyncingFromFirebase.current = false;
      }, 2000);
    } catch (error) {
      console.error('Error force playing:', error);
      isSyncingFromFirebase.current = false;
    }
  }, [musicState.volume, updateMusicState]);

  // Gestionnaires de contrôle du lecteur
  const handlePlayPause = useCallback(async () => {
    if (!playerRef.current) return;
    
    const newIsPlaying = !musicState.isPlaying;
    
    console.log('🎛️ Play/Pause clicked:', newIsPlaying ? 'PLAY' : 'PAUSE');
    
    // Mettre à jour immédiatement localement
    isSyncingFromFirebase.current = true;
    if (newIsPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
    
    // Attendre un petit délai pour que l'état se stabilise
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Récupérer le timestamp APRÈS le changement d'état
    const currentTime = playerRef.current.getCurrentTime();
    
    // Mettre à jour Firebase avec le timestamp précis
    await updateMusicState({
      isPlaying: newIsPlaying,
      timestamp: currentTime
    });
    
    setTimeout(() => {
      isSyncingFromFirebase.current = false;
    }, 1000);
  }, [musicState.isPlaying, updateMusicState]);

  const handleSeek = useCallback(async (seconds: number) => {
    if (!playerRef.current) return;
    
    const currentTime = playerRef.current.getCurrentTime();
    const newTime = Math.max(0, currentTime + seconds);
    
    playerRef.current.seekTo(newTime, true);
    await updateMusicState({
      timestamp: newTime
    });
  }, [updateMusicState]);

  const handleVolumeChange = useCallback((value: number[]) => {
    const volume = value[0];
    console.log('🔊 Volume changed to:', volume, '(LOCAL - pas synchronisé)');
    setLocalVolume(volume);
    setIsMuted(volume === 0);
    
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
      if (volume > 0) {
        playerRef.current.unMute();
      } else {
        playerRef.current.mute();
      }
    }
    
    // Pas de mise à jour Firebase pour le volume - c'est local !
  }, []);

  const toggleMute = useCallback(() => {
    if (!playerRef.current) return;
    
    const newMuted = !isMuted;
    console.log('🔇 Toggle mute:', newMuted, '(LOCAL)');
    setIsMuted(newMuted);
    
    if (newMuted) {
      playerRef.current.mute();
    } else {
      playerRef.current.unMute();
      playerRef.current.setVolume(localVolume);
    }
  }, [isMuted, localVolume]);

  // Configuration du lecteur YouTube
  const onPlayerReady: YouTubeProps['onReady'] = async (event) => {
    console.log('🎵 Player ready!');
    playerRef.current = event.target;
    
    // Récupérer le titre de la vidéo
    try {
      const videoData = await event.target.getVideoData();
      console.log('📹 Video data:', videoData);
      
      if (videoData && videoData.title && user) {
        await updateMusicState({
          videoTitle: videoData.title
        });
      }
    } catch (error) {
      console.error('Error getting video title:', error);
    }
    
    // Appliquer le volume local UNIQUEMENT au premier chargement
    if (isInitialLoad.current) {
      const volume = isMuted ? 0 : localVolume;
      console.log('🔊 Initial volume setup:', volume, '(LOCAL)');
      playerRef.current.setVolume(volume);
      if (!isMuted) {
        playerRef.current.unMute();
      }
      isInitialLoad.current = false;
      console.log('⏸️ Initial load complete');
    } else {
      // Lors du changement de vidéo, garder le volume actuel de l'utilisateur
      console.log('🔊 Keeping current local volume:', localVolume);
      const currentVol = isMuted ? 0 : localVolume;
      playerRef.current.setVolume(currentVol);
      if (!isMuted) {
        playerRef.current.unMute();
      }
    }
  };

  const onPlayerStateChange: YouTubeProps['onStateChange'] = async (event) => {
    const playerState = event.data;
    console.log('🎮 Player state changed:', playerState, {
      '-1': 'unstarted',
      '0': 'ended',
      '1': 'playing',
      '2': 'paused',
      '3': 'buffering',
      '5': 'video cued'
    }[playerState]);
    
    // Éviter les boucles infinies de synchronisation
    if (isLocalUpdate || isSyncingFromFirebase.current) {
      console.log('⏭️ Skipping state change - syncing from Firebase or local update');
      return;
    }
    
    const isPlaying = playerState === 1; // 1 = playing, 2 = paused
    
    // Ne mettre à jour que pour les états stables (playing/paused), pas buffering
    if ((playerState === 1 || playerState === 2) && isPlaying !== musicState.isPlaying && user && isMJ) {
      const currentTime = event.target.getCurrentTime();
      console.log('📡 MJ updating music state:', { isPlaying, currentTime });
      await updateMusicState({
        isPlaying,
        timestamp: currentTime
      });
    }
  };

  // Options du lecteur YouTube (invisible)
  const opts: YouTubeProps['opts'] = {
    height: '0',
    width: '0',
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
    },
  };

  // Synchronisation avec Firebase
  useEffect(() => {
    const musicRef = dbRef(realtimeDb, musicStateRef.current);
    
    const unsubscribe = onValue(musicRef, (snapshot) => {
      const data = snapshot.val() as MusicState | null;
      
      console.log('🔥 Firebase data received:', data);
      
      if (data) {
        // Mettre à jour l'état local
        setMusicState(data);

        if (playerRef.current && data.videoId) {
          console.log('🎬 Syncing player state:', {
            isPlaying: data.isPlaying,
            timestamp: data.timestamp,
            volume: data.volume
          });
          
          // Activer le flag de synchronisation pour éviter les boucles
          isSyncingFromFirebase.current = true;
          
          // Synchroniser l'état de lecture
          if (data.isPlaying) {
            console.log('▶️ Firebase says: PLAY');
            playerRef.current.playVideo();
          } else {
            console.log('⏸️ Firebase says: PAUSE');
            playerRef.current.pauseVideo();
          }

          // Synchroniser le timestamp (avec une tolérance de 1 seconde)
          const currentTime = playerRef.current.getCurrentTime();
          const timeDiff = Math.abs(currentTime - data.timestamp);
          
          // Calculer le délai depuis la dernière mise à jour
          const timeSinceUpdate = (Date.now() - data.lastUpdate) / 1000;
          
          // Ajuster le timestamp cible en fonction du délai
          const targetTime = data.isPlaying ? data.timestamp + timeSinceUpdate : data.timestamp;
          const adjustedDiff = Math.abs(currentTime - targetTime);
          
          if (adjustedDiff > 1) {
            console.log('⏩ Seeking to:', targetTime, '(current:', currentTime, 'diff:', adjustedDiff.toFixed(2), 's)');
            playerRef.current.seekTo(targetTime, true);
          }

          // Ne PAS appliquer le volume ici - il est géré localement par l'utilisateur
          // Le volume est appliqué uniquement via handleVolumeChange et onPlayerReady
          
          // Désactiver le flag après un court délai
          setTimeout(() => {
            isSyncingFromFirebase.current = false;
            console.log('✅ Sync from Firebase complete');
          }, 1000);
        }
      }
    });

    return () => unsubscribe();
  }, [roomId, user]); // Retrait de isMuted et localVolume pour éviter les re-syncs

  // Synchronisation périodique du timestamp (toutes les 3 secondes pour le MJ uniquement)
  useEffect(() => {
    if (!musicState.isPlaying || !playerRef.current || !user || !isMJ) return;

    const interval = setInterval(async () => {
      if (playerRef.current && !isSyncingFromFirebase.current) {
        const currentTime = playerRef.current.getCurrentTime();
        // Mettre à jour uniquement le timestamp sans déclencher d'événements
        const musicRef = dbRef(realtimeDb, musicStateRef.current);
        await update(musicRef, {
          timestamp: currentTime,
          lastUpdate: Date.now()
        });
      }
    }, 3000); // Réduit à 3 secondes pour meilleure sync

    return () => clearInterval(interval);
  }, [musicState.isPlaying, user, isMJ]);

  return (
    <div className="w-full space-y-4">
        {/* Chargement d'une URL YouTube */}
        {isMJ && (
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Coller l'URL YouTube ici..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  loadVideo();
                }
              }}
            />
            <Button onClick={loadVideo} disabled={!youtubeUrl}>
              Charger
            </Button>
          </div>
        )}

        {/* Lecteur YouTube (invisible) */}
        {musicState.videoId && (
          <div className="hidden">
            <YouTube
              videoId={musicState.videoId}
              opts={opts}
              onReady={onPlayerReady}
              onStateChange={onPlayerStateChange}
            />
          </div>
        )}

        {/* Contrôles du lecteur */}
        {musicState.videoId && (
          <div className="space-y-3">
            {/* Titre de la vidéo et Bouton Play/Pause sur la même ligne */}
            <div className="flex items-center gap-3">
              {/* Bouton Play/Pause - MJ UNIQUEMENT */}
              {isMJ && (
                <Button
                  variant="default"
                  size="icon"
                  onClick={handlePlayPause}
                  className="h-10 w-10 shrink-0 hover:opacity-100"
                >
                  {musicState.isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5" />
                  )}
                </Button>
              )}
              
              {/* Titre de la vidéo */}
              {musicState.videoTitle && (
                <div className="text-sm font-medium truncate flex-1">
                  {musicState.videoTitle}
                </div>
              )}
            </div>

            {/* Contrôle du volume - POUR TOUS */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="hover:bg-transparent hover:opacity-100"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>

              <Slider
                value={[isMuted ? 0 : localVolume]}
                min={0}
                max={100}
                step={1}
                onValueChange={handleVolumeChange}
                className="flex-1"
              />

              <span className="text-xs text-muted-foreground w-10 text-right">
                {Math.round(isMuted ? 0 : localVolume)}%
              </span>
            </div>
          </div>
        )}
      </div>
  );
}

