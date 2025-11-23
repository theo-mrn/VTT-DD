'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react';
import YouTube, { YouTubeProps, YouTubePlayer } from 'react-youtube';
import { realtimeDb, dbRef, set, onValue, update } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Pause, Volume2, VolumeX, Plus, Trash2, Music2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface MusicTrack {
  id: string;
  videoId: string;
  title: string;
  thumbnail?: string;
  addedAt: number;
}

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
}

export default function MJMusicPlayer({ roomId }: MJMusicPlayerProps) {
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
  const [playlist, setPlaylist] = useState<MusicTrack[]>([]);
  const [isLocalUpdate, setIsLocalUpdate] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [localVolume, setLocalVolume] = useState(80);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const musicStateRef = useRef<string>(`rooms/${roomId}/music`);
  const playlistRef = useRef<string>(`rooms/${roomId}/playlist`);
  const isInitialLoad = useRef(true);
  const isSyncingFromFirebase = useRef(false);

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

  // Ajouter un morceau à la bibliothèque
  const addToPlaylist = useCallback(async () => {
    const videoId = extractVideoId(youtubeUrl);
    
    if (!videoId || !user) {
      console.error('URL YouTube invalide ou utilisateur non connecté');
      return;
    }

    // Vérifier si le morceau n'est pas déjà dans la playlist
    if (playlist.some(track => track.videoId === videoId)) {
      console.log('Ce morceau est déjà dans la playlist');
      setYoutubeUrl('');
      return;
    }

    const newTrack: MusicTrack = {
      id: `${Date.now()}_${videoId}`,
      videoId,
      title: 'Chargement...',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      addedAt: Date.now()
    };

    try {
      const playlistDbRef = dbRef(realtimeDb, playlistRef.current);
      const updatedPlaylist = [...playlist, newTrack];
      await set(playlistDbRef, updatedPlaylist);
      setYoutubeUrl('');
    } catch (error) {
      console.error('Erreur lors de l\'ajout à la playlist:', error);
    }
  }, [youtubeUrl, playlist, user]);

  // Supprimer un morceau de la bibliothèque
  const removeFromPlaylist = useCallback(async (trackId: string) => {
    if (!user) return;
    
    try {
      const playlistDbRef = dbRef(realtimeDb, playlistRef.current);
      const updatedPlaylist = playlist.filter(track => track.id !== trackId);
      await set(playlistDbRef, updatedPlaylist);
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    }
  }, [playlist, user]);

  // Charger et jouer un morceau de la playlist
  const playTrack = useCallback(async (videoId: string) => {
    if (!isMJ) return;
    
    console.log('🎵 Playing track:', videoId);
    
    await updateMusicState({
      videoId,
      isPlaying: true,
      timestamp: 0
    });
  }, [isMJ, updateMusicState]);

  // Gestionnaire Play/Pause
  const handlePlayPause = useCallback(async () => {
    if (!playerRef.current || !isMJ) return;
    
    const newIsPlaying = !musicState.isPlaying;
    console.log('🎛️ Play/Pause clicked:', newIsPlaying ? 'PLAY' : 'PAUSE');
    
    isSyncingFromFirebase.current = true;
    if (newIsPlaying) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
    const currentTime = playerRef.current.getCurrentTime();
    
    await updateMusicState({
      isPlaying: newIsPlaying,
      timestamp: currentTime
    });
    
    setTimeout(() => {
      isSyncingFromFirebase.current = false;
    }, 1000);
  }, [musicState.isPlaying, updateMusicState, isMJ]);

  const handleVolumeChange = useCallback((value: number[]) => {
    const volume = value[0];
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
    console.log('🎵 Player ready!');
    playerRef.current = event.target;
    
    // Récupérer le titre de la vidéo
    try {
      const videoData = await event.target.getVideoData();
      if (videoData && videoData.title && user) {
        await updateMusicState({
          videoTitle: videoData.title
        });
        
        // Mettre à jour le titre dans la playlist si c'est un nouveau morceau
        const trackIndex = playlist.findIndex(t => t.videoId === musicState.videoId);
        if (trackIndex !== -1 && playlist[trackIndex].title === 'Chargement...') {
          const updatedPlaylist = [...playlist];
          updatedPlaylist[trackIndex].title = videoData.title;
          const playlistDbRef = dbRef(realtimeDb, playlistRef.current);
          await set(playlistDbRef, updatedPlaylist);
        }
      }
    } catch (error) {
      console.error('Error getting video title:', error);
    }
    
    const volume = isMuted ? 0 : localVolume;
    playerRef.current.setVolume(volume);
    if (!isMuted) {
      playerRef.current.unMute();
    }
  };

  const onPlayerStateChange: YouTubeProps['onStateChange'] = async (event) => {
    const playerState = event.data;
    
    if (isLocalUpdate || isSyncingFromFirebase.current) {
      return;
    }
    
    const isPlaying = playerState === 1;
    
    if ((playerState === 1 || playerState === 2) && isPlaying !== musicState.isPlaying && user && isMJ) {
      const currentTime = event.target.getCurrentTime();
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

  // Synchronisation avec Firebase - Music State
  useEffect(() => {
    const musicRef = dbRef(realtimeDb, musicStateRef.current);
    
    const unsubscribe = onValue(musicRef, (snapshot) => {
      const data = snapshot.val() as MusicState | null;
      
      if (data) {
        setMusicState(data);

        // Vérifier que le player existe ET est prêt avant de synchroniser
        if (playerRef.current && data.videoId && typeof playerRef.current.playVideo === 'function') {
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
  }, [roomId, user]);

  // Synchronisation avec Firebase - Playlist
  useEffect(() => {
    const playlistDbRef = dbRef(realtimeDb, playlistRef.current);
    
    const unsubscribe = onValue(playlistDbRef, (snapshot) => {
      const data = snapshot.val() as MusicTrack[] | null;
      if (data) {
        setPlaylist(Array.isArray(data) ? data : []);
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // Synchronisation périodique du timestamp pour le MJ
  useEffect(() => {
    if (!musicState.isPlaying || !playerRef.current || !user || !isMJ) return;

    const interval = setInterval(async () => {
      if (playerRef.current && !isSyncingFromFirebase.current) {
        const currentTime = playerRef.current.getCurrentTime();
        const musicRef = dbRef(realtimeDb, musicStateRef.current);
        await update(musicRef, {
          timestamp: currentTime,
          lastUpdate: Date.now()
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [musicState.isPlaying, user, isMJ]);

  if (!isMJ) {
    return (
      <div className="text-center p-8">
        <p>Cette interface est réservée au Maître du Jeu.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col gap-4">
      {/* Add Music Section */}
      <div className="bg-white/10 backdrop-blur-md rounded-lg p-3">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Coller l'URL YouTube ou l'ID de la vidéo..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addToPlaylist();
              }
            }}
          />
          <Button 
            onClick={addToPlaylist} 
            disabled={!youtubeUrl}
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left Side - Current Track & Controls */}
        <div className="flex flex-col gap-3 w-[300px]">
          {/* Current Track Display */}
          <div className="bg-black/40 backdrop-blur-sm rounded-lg p-3">
            {musicState.videoId ? (
              <div className="space-y-2">
                <div className="aspect-video bg-black rounded-lg overflow-hidden">
                  <img 
                    src={`https://img.youtube.com/vi/${musicState.videoId}/maxresdefault.jpg`}
                    alt={musicState.videoTitle || 'Miniature vidéo'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes('hqdefault')) {
                        target.src = `https://img.youtube.com/vi/${musicState.videoId}/hqdefault.jpg`;
                      }
                    }}
                  />
                </div>
                <div>
                  <h3 className="font-bold text-base truncate text-white drop-shadow-md">
                    {musicState.videoTitle || 'Sans titre'}
                  </h3>
                  <p className="text-xs text-white/90 font-semibold mt-0.5">En cours de lecture</p>
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-white/10 rounded-lg flex items-center justify-center">
                <div className="text-center text-white/70">
                  <Music2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-semibold">Aucun morceau sélectionné</p>
                </div>
              </div>
            )}
          </div>

          {/* Player Controls */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-3">
            <div className="flex items-center gap-3">
              {/* Play/Pause Button */}
              <Button
                onClick={handlePlayPause}
                disabled={!musicState.videoId}
                size="icon"
                className="shrink-0"
              >
                {musicState.isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </Button>

              {/* Volume Control */}
              <div className="flex items-center gap-2 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="shrink-0 h-8 w-8"
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

                <span className="text-xs font-bold text-white drop-shadow-md w-10 text-right shrink-0">
                  {Math.round(isMuted ? 0 : localVolume)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Playlist */}
        <div className="flex-1 min-h-0 overflow-hidden bg-white/10 backdrop-blur-md rounded-lg p-3">
          <div className="h-full overflow-y-auto">
            {playlist.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-white/70">
                  <Music2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm font-bold">Aucun morceau dans la bibliothèque</p>
                  <p className="text-xs font-semibold mt-1">Ajoutez une URL YouTube ci-dessus</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {playlist.map((track) => (
                  <div
                    key={track.id}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer group ${
                      musicState.videoId === track.videoId
                        ? 'bg-white/25 ring-2 ring-white/50'
                        : 'hover:bg-white/15'
                    }`}
                    onClick={() => playTrack(track.videoId)}
                  >
                    <div className="w-16 h-12 rounded overflow-hidden flex-shrink-0 bg-black">
                      <img 
                        src={track.thumbnail || `https://img.youtube.com/vi/${track.videoId}/mqdefault.jpg`}
                        alt={track.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `https://img.youtube.com/vi/${track.videoId}/default.jpg`;
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm truncate text-white drop-shadow-md">
                        {track.title}
                      </h4>
                      <p className="text-xs text-white/80 font-semibold mt-0.5">
                        {track.videoId}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromPlaylist(track.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-white hover:bg-red-500/30 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}
