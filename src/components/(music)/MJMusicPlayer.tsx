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
  type?: 'youtube' | 'file';
}

interface MJMusicPlayerProps {
  roomId: string;
  masterVolume?: number; // From audio mixer (0-1)
}

export default function MJMusicPlayer({ roomId, masterVolume = 1 }: MJMusicPlayerProps) {
  const { user, isMJ } = useGame();

  const [musicState, setMusicState] = useState<MusicState>({
    videoId: null,
    videoTitle: '',
    isPlaying: false,
    timestamp: 0,
    volume: 80,
    lastUpdate: Date.now(),
    updatedBy: '',
    type: 'youtube',
  });

  // Refs pour éviter les closures périmées dans les callbacks
  const playerRef = useRef<YouTubePlayer | null>(null);
  const musicStateRef = useRef<string>(`rooms/${roomId}/music`);

  // Audio HTML pour les fichiers (R2)
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const initialVideoId = useRef<string | null>(null);
  if (!initialVideoId.current && musicState.videoId) {
    initialVideoId.current = musicState.videoId;
  }
  const latestMusicState = useRef(musicState);
  latestMusicState.current = musicState;
  const currentVideoIdRef = useRef<string | null>(null);


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

  // --- Gestion Audio HTML (fichiers R2) ---
  const syncFileAudio = useCallback((data: MusicState) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = Math.max(0, Math.min(1, masterVolume));
    }

    const audio = audioRef.current;

    // Changer la source si nécessaire
    if (audio.src !== data.videoId) {
      audio.src = data.videoId ?? '';
      audio.load();
    }

    if (data.isPlaying) {
      audio.play().catch(e => console.error('[MJMusicPlayer] Audio play error:', e));
    } else {
      audio.pause();
    }
  }, [masterVolume]);

  // Nettoyer l'audio HTML quand on passe à YouTube
  const stopFileAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

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

        const isFileType = data.type === 'file';

        // --- Gestion fichier audio (R2) ---
        if (isFileType) {
          // Stopper le lecteur YouTube s'il tourne
          if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
            try { playerRef.current.pauseVideo(); } catch (_) { }
          }
          syncFileAudio(data);
          return;
        }

        // --- Gestion YouTube ---
        stopFileAudio();

        if (playerRef.current && typeof playerRef.current.playVideo === 'function' && hasPlayerSyncedOnce.current) {
          if (isLocalUpdate.current) return;

          try {
            isSyncingFromFirebase.current = true;

            if (data.videoId !== currentVideoIdRef.current) {
              currentVideoIdRef.current = data.videoId;
              if (data.isPlaying) playerRef.current.loadVideoById(data.videoId, data.timestamp);
              else playerRef.current.cueVideoById(data.videoId, data.timestamp);
            } else {
              if (data.isPlaying) playerRef.current.playVideo();
              else playerRef.current.pauseVideo();

              const currentTime = playerRef.current.getCurrentTime();
              if (typeof currentTime === 'number') {
                const targetTime = data.timestamp;
                if (Math.abs(currentTime - targetTime) > 1.5) {
                  playerRef.current.seekTo(targetTime, true);
                }
              }
            }

            setTimeout(() => { isSyncingFromFirebase.current = false; }, 1000);
          } catch (error) {
            console.error(error);
            isSyncingFromFirebase.current = false;
          }
        } else if (data.videoId && !currentVideoIdRef.current) {
          currentVideoIdRef.current = data.videoId;
        }
      }
    });

    return () => {
      unsubscribe();
      stopFileAudio();
    };
  }, [roomId, syncFileAudio, stopFileAudio]);



  // Synchronisation UP: Player -> Firebase (Timestamp périodique pour MJ seulement)
  useEffect(() => {
    if (!musicState.isPlaying || !user || !isMJ) return;

    const interval = setInterval(async () => {
      if (musicState.type === 'file') {
        // Pour les fichiers audio, sync le timestamp depuis l'élément Audio
        if (audioRef.current && !audioRef.current.paused) {
          await update(dbRef(realtimeDb, musicStateRef.current), {
            timestamp: audioRef.current.currentTime,
            lastUpdate: Date.now()
          });
        }
        return;
      }

      if (playerRef.current && !isSyncingFromFirebase.current && !isLocalUpdate.current) {
        const currentTime = playerRef.current.getCurrentTime();
        if (typeof currentTime === 'number') {
          await update(dbRef(realtimeDb, musicStateRef.current), {
            timestamp: currentTime,
            lastUpdate: Date.now()
          });
        }
      }
    }, 4000); // Toutes les 4s

    return () => clearInterval(interval);
  }, [musicState.isPlaying, musicState.type, user, isMJ]);

  // Appliquer le volume master sur le fichier audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, masterVolume));
    }
  }, [masterVolume]);

  // Initialisation du Player YouTube
  const onPlayerReady: YouTubeProps['onReady'] = async (event) => {
    playerRef.current = event.target;

    const safeVolume = Math.max(0, Math.min(100, masterVolume * 100));
    playerRef.current.setVolume(safeVolume);
    if (safeVolume > 0) playerRef.current.unMute();
    else playerRef.current.mute();

    const state = latestMusicState.current;

    // Si c'est un fichier audio, ne pas initialiser le lecteur YouTube
    if (state.type === 'file') {
      hasPlayerSyncedOnce.current = true;
      return;
    }

    try {
      const videoData = await event.target.getVideoData();
      if (videoData && videoData.title && user && isMJ) {
        if (state.videoTitle !== videoData.title) {
          updateMusicState({ videoTitle: videoData.title });
        }
      }
    } catch (e) { }

    currentVideoIdRef.current = state.videoId;

    if (state.videoId) {
      isSyncingFromFirebase.current = true;

      if (initialVideoId.current !== state.videoId) {
        if (state.isPlaying) playerRef.current.loadVideoById(state.videoId, state.timestamp);
        else playerRef.current.cueVideoById(state.videoId, state.timestamp);
      } else {
        playerRef.current.seekTo(state.timestamp, true);
        if (state.isPlaying) playerRef.current.playVideo();
        else playerRef.current.pauseVideo();
      }

      setTimeout(() => {
        isSyncingFromFirebase.current = false;
        hasPlayerSyncedOnce.current = true;
      }, 1000);
    } else {
      hasPlayerSyncedOnce.current = true;
    }
  };

  const onPlayerStateChange: YouTubeProps['onStateChange'] = async (event) => {
    const playerState = event.data;

    if (isLocalUpdate.current || isSyncingFromFirebase.current) return;

    if (user && isMJ) {
      const isPlaying = playerState === 1;

      if (isPlaying !== musicState.isPlaying && (playerState === 1 || playerState === 2)) {
        await updateMusicState({
          isPlaying,
          timestamp: event.target.getCurrentTime()
        });
      }
    }
  };

  // Appliquer les changements de volume Master sur YouTube
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      const safeVolume = Math.max(0, Math.min(100, masterVolume * 100));
      playerRef.current.setVolume(safeVolume);
      if (safeVolume > 0) playerRef.current.unMute();
      else playerRef.current.mute();
    }
  }, [masterVolume]);

  const isFileMode = musicState.type === 'file';

  return (
    <div className="hidden">
      {/* Lecteur YouTube (uniquement si mode YouTube) */}
      {!isFileMode && initialVideoId.current && (
        <YouTube
          videoId={initialVideoId.current}
          opts={opts}
          onReady={onPlayerReady}
          onStateChange={onPlayerStateChange}
        />
      )}
    </div>
  );
}
