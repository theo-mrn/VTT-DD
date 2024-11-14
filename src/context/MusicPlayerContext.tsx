"use client";
import { createContext, useContext, useState, useRef, useEffect, ReactNode, MutableRefObject } from "react"

interface Track {
  id: number;
  title: string;
  src: string;
}

interface Playlist {
  id: number;
  name: string;
  tracks: Track[];
}

interface MusicPlayerContextProps {
  currentPlaylistId: number;
  setCurrentPlaylistId: (id: number) => void;
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  currentTrack: Track;
  setCurrentTrack: (track: Track) => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  volume: number;
  setVolume: (volume: number) => void;
  isRepeat: boolean;
  setIsRepeat: (isRepeat: boolean) => void;
  isShuffle: boolean;
  setIsShuffle: (isShuffle: boolean) => void;
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  togglePlay: () => void;
  handleTimeUpdate: () => void;
  handleTrackEnd: () => void;
  playNextTrack: () => void;
  playPreviousTrack: () => void;
  formatTime: (time: number) => string;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextProps | null>(null)

const playlists: Playlist[] = [
  {
    id: 1,
    name: "Chill",
    tracks: [
      { id: 1, title: "Musique 1", src: "/Musics/chill/M1.mp3" },
      { id: 2, title: "Musique 2", src: "/Musics/chill/M2.mp3" },
      { id: 3, title: "Musique 3", src: "/Musics/chill/M3.mp3" },
      { id: 4, title: "Musique 4", src: "/Musics/chill/M4.mp3" },
      { id: 5, title: "Musique 5", src: "/Musics/chill/M5.mp3" },
      { id: 6, title: "Musique 6", src: "/Musics/chill/M6.mp3" },
      { id: 7, title: "Musique 7", src: "/Musics/chill/M7.mp3" },
      { id: 8, title: "Musique 8", src: "/Musics/chill/M8.mp3" },
      { id: 9, title: "Musique 9", src: "/Musics/chill/M9.mp3" },
      { id: 10, title: "Musique 10", src: "/Musics/chill/M10.mp3" },
      { id: 11, title: "Musique 11", src: "/Musics/chill/M11.mp3" },
      { id: 12, title: "Musique 12", src: "/Musics/chill/M12.mp3" },
      { id: 13, title: "Musique 13", src: "/Musics/chill/M13.mp3" },
    ]
  },
  {
    id: 2,
    name: "Combats",
    tracks: [
        { id: 1, title: "Musique 1", src: "/Musics/epic/M1.mp3" },
        { id: 2, title: "Musique 2", src: "/Musics/epic/M2.mp3" },
        { id: 3, title: "Musique 3", src: "/Musics/epic/M3.mp3" },
        { id: 4, title: "Musique 4", src: "/Musics/epic/M4.mp3" },
        { id: 5, title: "Musique 5", src: "/Musics/epic/M5.mp3" },
        { id: 6, title: "Musique 6", src: "/Musics/epic/M6.mp3" },
    ]
  },
  {
    id: 3,
    name: "Taverne",
    tracks: [
        { id: 1, title: "Musique 1", src: "/Musics/taverne/M1.mp3" },
        { id: 2, title: "Musique 2", src: "/Musics/taverne/M2.mp3" },
        { id: 3, title: "Musique 3", src: "/Musics/taverne/M3.mp3" },
        { id: 4, title: "Musique 4", src: "/Musics/taverne/M4.mp3" },
        { id: 5, title: "Musique 5", src: "/Musics/taverne/M5.mp3" },
    ]
  }
]

export const MusicPlayerProvider = ({ children }: { children: ReactNode }) => {
  const [currentPlaylistId, setCurrentPlaylistId] = useState(playlists[0].id)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState(playlists[0].tracks[0])
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isRepeat, setIsRepeat] = useState(false)
  const [isShuffle, setIsShuffle] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const currentPlaylist = playlists.find(playlist => playlist.id === currentPlaylistId) || playlists[0]

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  useEffect(() => {
    setCurrentTrack(currentPlaylist.tracks[0])
    if (audioRef.current) {
      audioRef.current.src = currentPlaylist.tracks[0].src
      if (isPlaying) {
        audioRef.current.play()
      }
    }
  }, [currentPlaylistId])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = currentTrack.src
      if (isPlaying) {
        audioRef.current.play()
      }
    }
  }, [currentTrack])

  useEffect(() => {
    const savedState = localStorage.getItem("musicPlayerState");
    if (savedState) {
      const { currentPlaylistId, currentTrack, currentTime, isPlaying, volume, isRepeat, isShuffle } = JSON.parse(savedState);
      setCurrentPlaylistId(currentPlaylistId);
      setCurrentTrack(currentTrack);
      setCurrentTime(currentTime);
      setIsPlaying(isPlaying);
      setVolume(volume);
      setIsRepeat(isRepeat);
      setIsShuffle(isShuffle);
    }
  }, []);

  useEffect(() => {
    const state = {
      currentPlaylistId,
      currentTrack,
      currentTime,
      isPlaying,
      volume,
      isRepeat,
      isShuffle,
    };
    localStorage.setItem("musicPlayerState", JSON.stringify(state));
  }, [currentPlaylistId, currentTrack, currentTime, isPlaying, volume, isRepeat, isShuffle]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleTrackEnd = () => {
    if (isRepeat) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play()
      }
    } else {
      playNextTrack()
    }
  }

  const playNextTrack = () => {
    const currentIndex = currentPlaylist.tracks.findIndex((track) => track.id === currentTrack.id)
    let nextIndex
    if (isShuffle) {
      do {
        nextIndex = Math.floor(Math.random() * currentPlaylist.tracks.length)
      } while (nextIndex === currentIndex)
    } else {
      nextIndex = (currentIndex + 1) % currentPlaylist.tracks.length
    }
    setCurrentTrack(currentPlaylist.tracks[nextIndex])
    setIsPlaying(true)
    if (audioRef.current) {
      audioRef.current.src = currentPlaylist.tracks[nextIndex].src
      audioRef.current.play() // Assurez-vous que la piste suivante est lue automatiquement
    }
  }

  const playPreviousTrack = () => {
    const currentIndex = currentPlaylist.tracks.findIndex((track) => track.id === currentTrack.id)
    const previousIndex = (currentIndex - 1 + currentPlaylist.tracks.length) % currentPlaylist.tracks.length
    setCurrentTrack(currentPlaylist.tracks[previousIndex])
    setIsPlaying(true)
    if (audioRef.current) {
      audioRef.current.src = currentPlaylist.tracks[previousIndex].src
      audioRef.current.play() // Assurez-vous que la piste précédente est lue automatiquement
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  const toggleShuffle = () => {
    setIsShuffle(!isShuffle)
  }

  const toggleRepeat = () => {
    setIsRepeat(!isRepeat)
  }

  return (
    <MusicPlayerContext.Provider value={{
      currentPlaylistId,
      setCurrentPlaylistId,
      isPlaying,
      setIsPlaying,
      currentTrack,
      setCurrentTrack,
      currentTime,
      setCurrentTime,
      volume,
      setVolume,
      isRepeat,
      setIsRepeat,
      isShuffle,
      setIsShuffle,
      audioRef,
      togglePlay,
      handleTimeUpdate,
      handleTrackEnd,
      playNextTrack,
      playPreviousTrack,
      formatTime,
      toggleShuffle,
      toggleRepeat
    }}>
      {children}
      <audio
        ref={audioRef}
        src={currentTrack.src}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleTrackEnd}
        className="hidden"
      />
    </MusicPlayerContext.Provider>
  )
}

export const useMusicPlayer = () => {
  const context = useContext(MusicPlayerContext)
  if (!context) {
    throw new Error("useMusicPlayer must be used within a MusicPlayerProvider")
  }
  return context
}