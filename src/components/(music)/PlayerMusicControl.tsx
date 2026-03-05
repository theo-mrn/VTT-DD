'use client'

import React, { useState, useEffect, useRef } from 'react';
import YouTube, { YouTubeProps, YouTubePlayer } from 'react-youtube';
import { realtimeDb, dbRef, onValue } from '@/lib/firebase';
import { Music2 } from 'lucide-react';

import { useAudioMixer } from '@/components/(audio)/AudioMixerPanel';

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

interface PlayerMusicControlProps {
  roomId: string;
}

/**
 * Contrôle musical simple pour les JOUEURS
 * Affiche le titre de la musique et utilise le volume du mixeur global
 * Supporte YouTube et les fichiers audio (R2)
 */
export default function PlayerMusicControl({ roomId }: PlayerMusicControlProps) {
  const { volumes: audioVolumes } = useAudioMixer();

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

  const playerRef = useRef<YouTubePlayer | null>(null);
  const musicStateRef = useRef<string>(`rooms/${roomId}/music`);
  const isSyncingFromFirebase = useRef(false);
  const hasPlayerSyncedOnce = useRef(false);

  // Audio HTML pour les fichiers (R2)
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const initialVideoId = useRef<string | null>(null);
  if (!initialVideoId.current && musicState.videoId && musicState.type !== 'file') {
    initialVideoId.current = musicState.videoId;
  }
  const latestMusicState = useRef(musicState);
  latestMusicState.current = musicState;
  const currentVideoIdRef = useRef<string | null>(null);

  // --- Helpers Audio fichier ---
  const syncFileAudio = (data: MusicState, volume: number) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.volume = Math.max(0, Math.min(1, volume));

    if (audio.src !== data.videoId) {
      audio.src = data.videoId ?? '';
      audio.load();
    }

    if (data.isPlaying) {
      audio.play().catch(e => console.error('[PlayerMusicControl] Audio play error:', e));
    } else {
      audio.pause();
    }
  };

  const stopFileAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  };

  // Appliquer le volume du mixeur
  useEffect(() => {
    if (musicState.type === 'file') {
      if (audioRef.current) {
        audioRef.current.volume = Math.max(0, Math.min(1, audioVolumes.backgroundMusic));
      }
    } else {
      if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
        const volume = audioVolumes.backgroundMusic * 100;
        playerRef.current.setVolume(volume);
        if (volume > 0) playerRef.current.unMute();
        else playerRef.current.mute();
      }
    }
  }, [audioVolumes.backgroundMusic, musicState.type]);

  // Configuration du lecteur YouTube
  const onPlayerReady: YouTubeProps['onReady'] = async (event) => {
    playerRef.current = event.target;
    const safeVolume = Math.max(0, Math.min(100, audioVolumes.backgroundMusic * 100));
    playerRef.current.setVolume(safeVolume);
    if (safeVolume > 0) playerRef.current.unMute();
    else playerRef.current.mute();

    const state = latestMusicState.current;

    if (state.type === 'file') {
      hasPlayerSyncedOnce.current = true;
      return;
    }

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

      if (data) {
        setMusicState(data);

        const isFileType = data.type === 'file';
        const volume = audioVolumes.backgroundMusic;

        // --- Gestion fichier audio (R2) ---
        if (isFileType) {
          if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
            try { playerRef.current.pauseVideo(); } catch (_) { }
          }
          syncFileAudio(data, volume);
          return;
        }

        // --- Gestion YouTube ---
        stopFileAudio();

        if (playerRef.current && data.videoId && typeof playerRef.current.playVideo === 'function' && hasPlayerSyncedOnce.current) {
          try {
            isSyncingFromFirebase.current = true;

            if (data.videoId !== currentVideoIdRef.current) {
              currentVideoIdRef.current = data.videoId;
              if (data.isPlaying) playerRef.current.loadVideoById(data.videoId, data.timestamp);
              else playerRef.current.cueVideoById(data.videoId, data.timestamp);
            } else {
              if (data.isPlaying) {
                playerRef.current.playVideo();
              } else {
                playerRef.current.pauseVideo();
              }

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
            console.error('Error syncing player:', error);
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
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFileMode = musicState.type === 'file';

  return (
    <div className="w-full space-y-3">
      {/* Lecteur YouTube (invisible, uniquement si mode YouTube) */}
      {!isFileMode && initialVideoId.current && (
        <div className="hidden">
          <YouTube
            videoId={initialVideoId.current}
            opts={opts}
            onReady={onPlayerReady}
          />
        </div>
      )}

      {/* Titre de la musique */}
      {musicState.videoId && musicState.videoTitle ? (
        <div className="flex items-center gap-3 p-4 bg-[#1a1a1a] rounded-lg border border-[#333]">
          <div className={`p-2 rounded-full ${musicState.isPlaying ? 'bg-[#c0a080]/20' : 'bg-[#333]'}`}>
            <Music2 className={`h-5 w-5 ${musicState.isPlaying ? 'text-[#c0a080] animate-pulse' : 'text-gray-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate text-[#e0e0e0]">{musicState.videoTitle}</p>
            <p className="text-xs text-gray-400">
              {musicState.isPlaying ? 'Lecture en cours' : 'En pause'}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-500 py-8 px-4 bg-[#1a1a1a] rounded-lg border border-[#222]">
          <Music2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune musique d&apos;ambiance</p>
          <p className="text-xs mt-1 opacity-60">Le MJ n&apos;a pas lancé de musique</p>
        </div>
      )}
    </div>
  );
}
