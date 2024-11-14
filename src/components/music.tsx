"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, Volume2 } from 'lucide-react'
import { useMusicPlayer } from "@/context/MusicPlayerContext"

// Simulons plusieurs playlists
const playlists = [
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

export default function Component() {
  const {
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
    playNextTrack,
    playPreviousTrack,
    formatTime,
    toggleShuffle,
    toggleRepeat
  } = useMusicPlayer()

  const currentPlaylist = playlists.find(playlist => playlist.id === currentPlaylistId) || playlists[0]

  useEffect(() => {
    setVolume(0.03); // Définir le volume par défaut à 10%
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <Card className="m-auto w-full max-w-4xl overflow-hidden">
        <CardContent className="p-6">
          <div className="mb-8 text-center">
            <h2 className="mb-2 text-3xl font-bold">{currentTrack.title}</h2>
          </div>
          <div className="mb-8">
            <Select value={currentPlaylistId.toString()} onValueChange={(value) => setCurrentPlaylistId(parseInt(value))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sélectionnez une playlist" />
              </SelectTrigger>
              <SelectContent>
                {playlists.map((playlist) => (
                  <SelectItem key={playlist.id} value={playlist.id.toString()}>
                    {playlist.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mb-8">
            <Slider
              value={[currentTime]}
              max={audioRef.current?.duration || 0}
              step={1}
              onValueChange={(value) => setCurrentTime(value[0])}
              className="w-full"
            />
            <div className="mt-2 flex justify-between text-sm">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(audioRef.current?.duration || 0)}</span>
            </div>
          </div>
          <div className="mb-8 flex items-center justify-center space-x-4">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleShuffle}
              className={isShuffle ? "bg-[hsl(var(--primary))] text-white" : ""}
            >
              <Shuffle />
            </Button>
            <Button variant="outline" size="icon" onClick={playPreviousTrack}>
              <SkipBack />
            </Button>
            <Button size="icon" onClick={togglePlay}>
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </Button>
            <Button variant="outline" size="icon" onClick={playNextTrack}>
              <SkipForward />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleRepeat}
              className={isRepeat ? "bg-[hsl(var(--primary))] text-white" : ""}
            >
              <Repeat />
            </Button>
          </div>
          <div className="mb-8 flex items-center space-x-2">
            <Volume2 className="h-5 w-5" />
            <Slider
              value={[volume *300]} // Ajuster la valeur maximale du volume
              max={20} 
              min={0}// Garder la valeur maximale du slider à 100
              step={0.5}
              onValueChange={(value) => setVolume(value[0] / 300)}
              className="w-full"
            />
          </div>
          <ScrollArea className="h-48">
            <div className="space-y-2">
              {currentPlaylist.tracks.map((track) => (
                <div
                  key={track.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                    currentTrack.id === track.id ? "bg-gray-200 dark:bg-gray-700" : ""
                  }`}
                  onClick={() => {
                    setCurrentTrack(track)
                    setIsPlaying(true)
                  }}
                >
                  <div>
                    <p className="font-medium">{track.title}</p>
                  </div>
                  {currentTrack.id === track.id && (
                    <span className="text-primary">En cours</span>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}