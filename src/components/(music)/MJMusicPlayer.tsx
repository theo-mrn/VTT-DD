'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import YouTube, { YouTubeProps, YouTubePlayer } from 'react-youtube';
import { realtimeDb, dbRef, set, onValue, update } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';



interface MusicState {
  videoId: string | null;
  videoTitle?: string;
  isPlaying: boolean;
  timestamp: number;
  volume: number;
  lastUpdate: number;
  updatedBy: string;
}

interface MJMusicPlayerProps {
  roomId: string;
  masterVolume?: number; // From audio mixer (0-1)
}

export default function MJMusicPlayer({ roomId, masterVolume = 1 }: MJMusicPlayerProps) {
  const { user, isMJ } = useGame();

  // State minimal pour la synchronisation
  const [musicState, setMusicState] = useState<MusicState>({
    videoId: null,
    videoTitle: '',
    isPlaying: false,
    timestamp: 0,
    volume: 80,
    lastUpdate: Date.now(),
    updatedBy: ''
  });



  // Refs pour éviter les closures périmées dans les callbacks
  const playerRef = useRef<YouTubePlayer | null>(null);
  const musicStateRef = useRef<string>(`rooms/${roomId}/music`);


  // Flags pour éviter les boucles de feedback
  const isSyncingFromFirebase = useRef(false);
  const isLocalUpdate = useRef(false);
  const hasPlayerSyncedOnce = useRef(false);

  // Mettre à jour Firebase quand l'état change localement (play/pause/timestamp)
  const updateMusicState = useCallback(async (updates: Partial<MusicState>) => {
    if (!user) return;
    isLocalUpdate.current = true;
    try {
      await update(dbRef(realtimeDb, musicStateRef.current), {
        ...updates,
        lastUpdate: Date.now(),
        updatedBy: user.uid
      });
    } catch (error) {
      console.error('Erreur update music:', error);
    } finally {
      setTimeout(() => { isLocalUpdate.current = false; }, 500);
    }
  }, [user]);

  // Options du lecteur YouTube (invisible, mute au démarrage pour éviter le blast)
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

  // Synchronisation DOWN: Firebase -> Player
  useEffect(() => {
    const musicRef = dbRef(realtimeDb, musicStateRef.current);

    const unsubscribe = onValue(musicRef, (snapshot) => {
      const data = snapshot.val() as MusicState | null;
      if (data) {
        setMusicState(data);

        // Si on a un player prêt
        if (playerRef.current && typeof playerRef.current.playVideo === 'function' && hasPlayerSyncedOnce.current) {
          // Si c'est une mise à jour locale (le MJ vient de cliquer sur pause), on ignore l'event Firebase qui revient
          if (isLocalUpdate.current) return;

          try {
            isSyncingFromFirebase.current = true;

            // Gestion Play/Pause
            if (data.isPlaying) playerRef.current.playVideo();
            else playerRef.current.pauseVideo();

            // Gestion Timestamp (Seek si décalage > 1.5s)
            const currentTime = playerRef.current.getCurrentTime();
            if (typeof currentTime === 'number') {
              const targetTime = data.timestamp;

              if (Math.abs(currentTime - targetTime) > 1.5) {
                playerRef.current.seekTo(targetTime, true);
              }
            }

            setTimeout(() => { isSyncingFromFirebase.current = false; }, 1000);
          } catch (error) {
            console.error(error);
            isSyncingFromFirebase.current = false;
          }
        }
      }
    });

    return () => unsubscribe();
  }, [roomId]);



  // Synchronisation UP: Player -> Firebase (Timestamp périodique pour MJ seulement)
  useEffect(() => {
    if (!musicState.isPlaying || !user || !isMJ) return;

    const interval = setInterval(async () => {
      if (playerRef.current && !isSyncingFromFirebase.current && !isLocalUpdate.current) {
        const currentTime = playerRef.current.getCurrentTime();
        // On push juste le timestamp sans changer l'état play/pause pour éviter les conflits
        if (typeof currentTime === 'number') {
          await update(dbRef(realtimeDb, musicStateRef.current), {
            timestamp: currentTime,
            lastUpdate: Date.now()
          });
        }
      }
    }, 4000); // Toutes les 4s

    return () => clearInterval(interval);
  }, [musicState.isPlaying, user, isMJ]);

  // Initialisation du Player
  const onPlayerReady: YouTubeProps['onReady'] = async (event) => {
    playerRef.current = event.target;

    // Appliquer le volume master
    const safeVolume = Math.max(0, Math.min(100, masterVolume * 100));
    playerRef.current.setVolume(safeVolume);
    if (safeVolume > 0) playerRef.current.unMute();
    else playerRef.current.mute();

    // Mettre à jour le titre si manquant
    try {
      const videoData = await event.target.getVideoData();
      if (videoData && videoData.title && user && isMJ) {
        // Si le titre stocké est vide ou différent, on le met à jour
        if (musicState.videoTitle !== videoData.title) {
          updateMusicState({ videoTitle: videoData.title });
        }


      }
    } catch (e) { }

    // Synchronisation initiale (Seek + Play)
    if (musicState.videoId) {
      isSyncingFromFirebase.current = true;
      const targetTime = musicState.timestamp;

      playerRef.current.seekTo(targetTime, true);
      if (musicState.isPlaying) playerRef.current.playVideo();
      else playerRef.current.pauseVideo();

      setTimeout(() => {
        isSyncingFromFirebase.current = false;
        hasPlayerSyncedOnce.current = true;
      }, 1000);
    } else {
      hasPlayerSyncedOnce.current = true;
    }
  };

  // Gestion des changements d'état (Fin de vidéo, Pause manuelle imprévue, Buffering)
  const onPlayerStateChange: YouTubeProps['onStateChange'] = async (event) => {
    const playerState = event.data;

    // Ignore si c'est nous qui pilotons le player via code
    if (isLocalUpdate.current || isSyncingFromFirebase.current) return;

    // MJ Only: Si l'état change (ex: buffering fini, ou pause utilisateur direct sur l'iframe invisible - impossible mais bon)
    if (user && isMJ) {
      const isPlaying = playerState === 1; // 1 = Playing

      // Si l'état diffère de notre state local, on met à jour Firebase
      if (isPlaying !== musicState.isPlaying && (playerState === 1 || playerState === 2)) { // 1 play, 2 pause
        await updateMusicState({
          isPlaying,
          timestamp: event.target.getCurrentTime()
        });
      }
    }
  };

  // Appliquer les changements de volume Master
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      const safeVolume = Math.max(0, Math.min(100, masterVolume * 100));
      playerRef.current.setVolume(safeVolume);

      if (safeVolume > 0) playerRef.current.unMute();
      else playerRef.current.mute();
    }
  }, [masterVolume]);

  // Rendu minimaliste (invisible) : L'iframe est présente mais cachée
  return (
    <div className="hidden">
      {musicState.videoId && (
        <YouTube
          videoId={musicState.videoId}
          opts={opts}
          onReady={onPlayerReady}
          onStateChange={onPlayerStateChange}
        />
      )}
    </div>
  );
}
