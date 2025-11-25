'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import YouTube, { YouTubeProps, YouTubePlayer } from 'react-youtube';
import { realtimeDb, dbRef, onValue } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Music2 } from 'lucide-react';
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

interface PlayerMusicControlProps {
  roomId: string;
}

/**
 * Contrôle musical simple pour les JOUEURS
 * Affiche uniquement le volume et le titre de la musique
 * Synchronisé avec le MJ via Firebase
 */
export default function PlayerMusicControl({ roomId }: PlayerMusicControlProps) {
  const [musicState, setMusicState] = useState<MusicState>({
    videoId: null,
    videoTitle: '',
    isPlaying: false,
    timestamp: 0,
    volume: 80,
    lastUpdate: Date.now(),
    updatedBy: ''
  });
  const [isMuted, setIsMuted] = useState(false);
  const [localVolume, setLocalVolume] = useState(80);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const musicStateRef = useRef<string>(`rooms/${roomId}/music`);
  const isSyncingFromFirebase = useRef(false);
  const hasPlayerSyncedOnce = useRef(false);

  // Charger le volume depuis localStorage après le montage du composant
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('playerMusicVolume');
      if (saved) {
        const volume = parseInt(saved, 10);
        setLocalVolume(volume);
        setIsMuted(volume === 0);
      }
    }
  }, []);

  const handleVolumeChange = useCallback((value: number[]) => {
    const volume = value[0];
    setLocalVolume(volume);
    setIsMuted(volume === 0);

    // Sauvegarder dans localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('playerMusicVolume', volume.toString());
    }

    if (playerRef.current) {
      playerRef.current.setVolume(volume);
      if (volume > 0) {
        playerRef.current.unMute();
      } else {
        playerRef.current.mute();
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!playerRef.current) return;
    
    const newMuted = !isMuted;
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
    playerRef.current = event.target;
    const volume = isMuted ? 0 : localVolume;
    playerRef.current.setVolume(volume);
    if (!isMuted) {
      playerRef.current.unMute();
    }

    // Synchroniser immédiatement avec l'état Firebase existant
    if (musicState.videoId) {
      isSyncingFromFirebase.current = true;

      // Calculer la position actuelle en tenant compte du temps écoulé
      const timeSinceUpdate = (Date.now() - musicState.lastUpdate) / 1000;
      const targetTime = musicState.isPlaying ? musicState.timestamp + timeSinceUpdate : musicState.timestamp;

      // Se positionner au bon moment
      playerRef.current.seekTo(targetTime, true);

      // Jouer ou mettre en pause selon l'état
      if (musicState.isPlaying) {
        playerRef.current.playVideo();
      } else {
        playerRef.current.pauseVideo();
      }

      setTimeout(() => {
        isSyncingFromFirebase.current = false;
        hasPlayerSyncedOnce.current = true;
      }, 1000);
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

        // Ne synchroniser QUE si le player a déjà été synchronisé une fois (évite le reset initial)
        if (playerRef.current && data.videoId && typeof playerRef.current.playVideo === 'function' && hasPlayerSyncedOnce.current) {
          try {
            isSyncingFromFirebase.current = true;

            if (data.isPlaying) {
              playerRef.current.playVideo();
            } else {
              playerRef.current.pauseVideo();
            }

            const currentTime = playerRef.current.getCurrentTime();
            if (typeof currentTime === 'number') {
              const timeSinceUpdate = (Date.now() - data.lastUpdate) / 1000;
              const targetTime = data.isPlaying ? data.timestamp + timeSinceUpdate : data.timestamp;
              const adjustedDiff = Math.abs(currentTime - targetTime);

              if (adjustedDiff > 1) {
                playerRef.current.seekTo(targetTime, true);
              }
            }

            setTimeout(() => {
              isSyncingFromFirebase.current = false;
            }, 1000);
          } catch (error) {
            console.error('Error syncing player:', error);
            isSyncingFromFirebase.current = false;
          }
        }
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  return (
    <div className="w-full space-y-3">
      {/* Lecteur YouTube (invisible) */}
      {musicState.videoId && (
        <div className="hidden">
          <YouTube
            videoId={musicState.videoId}
            opts={opts}
            onReady={onPlayerReady}
          />
        </div>
      )}

      {/* Titre de la musique */}
      {musicState.videoId && musicState.videoTitle && (
        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
          <Music2 className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{musicState.videoTitle}</p>
            <p className="text-xs text-muted-foreground">
              {musicState.isPlaying ? '▶ En lecture' : '⏸ En pause'}
            </p>
          </div>
        </div>
      )}

      {/* Contrôle du volume */}
      <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          className="shrink-0 h-8 w-8"
          title={isMuted ? "Activer le son" : "Couper le son"}
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

        <span className="text-xs font-semibold w-10 text-right shrink-0">
          {Math.round(isMuted ? 0 : localVolume)}%
        </span>
      </div>

      {!musicState.videoId && (
        <div className="text-center text-muted-foreground py-8">
          <Music2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucune musique en cours</p>
        </div>
      )}
    </div>
  );
}

