'use client'

import { useState, useRef, useEffect } from 'react'
import { Music, Pause, Play, Plus, Edit, Trash, MoreHorizontal, type LucideIcon } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { auth, db, storage, onAuthStateChanged, addDoc, collection, getDoc, doc, onSnapshot, uploadBytes, getDownloadURL, where, query, updateDoc, setDoc, deleteDoc } from "@/lib/firebase"
import { ref } from "firebase/storage"
import { User } from 'firebase/auth';

let audioInstance: HTMLAudioElement | null = null

export default function SharedMusicPlayer() {
  const [music, setMusic] = useState<Array<{ id: string, name: string, fileUrl: string }>>([])
  const [newMusicName, setNewMusicName] = useState('')
  const [isPaused, setIsPaused] = useState(false)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null);
  const [currentTrack, setCurrentTrack] = useState<{ name: string; fileUrl: string } | null>(null)
  const [volume, setVolume] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [isMJ, setIsMJ] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser)
        const userDoc = await getDoc(doc(db, `users/${currentUser.uid}`))
        if (userDoc.exists()) {
          setRoomId(userDoc.data().room_id)
          setIsMJ(userDoc.data().perso === "MJ") // Vérifie si l'utilisateur est MJ
        }
      }
    })
    return () => unsubscribeAuth()
  }, [])

  useEffect(() => {
    if (!roomId) return

    const musicQuery = query(collection(db, 'music'), where('room_id', '==', roomId))
    const unsubscribeMusic = onSnapshot(musicQuery, (snapshot) => {
      const musicList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Array<{ id: string, name: string, fileUrl: string }>
      setMusic(musicList)
    })

    const roomDocRef = doc(db, `rooms/${roomId}`)
    const unsubscribeCurrentTrack = onSnapshot(roomDocRef, (doc) => {
      const data = doc.data()
      if (data && data.currentTrack) {
        if (!audioInstance || audioInstance.src !== data.currentTrack.fileUrl) {
          playNewTrack(data.currentTrack.fileUrl)
        }
        setCurrentTrack(data.currentTrack)
      }
      if (data && typeof data.isPaused === 'boolean') {
        setIsPaused(data.isPaused)
        if (audioInstance) {
          data.isPaused ? audioInstance.pause() : audioInstance.play()
        }
      }
    })

    return () => {
      unsubscribeMusic()
      unsubscribeCurrentTrack()
    }
  }, [roomId])

  const playNewTrack = (fileUrl: string) => {
    if (audioInstance) {
      audioInstance.pause()
      audioInstance.currentTime = 0
    }
    audioInstance = new Audio(fileUrl)
    audioInstance.volume = volume
    if (!isPaused) {
      audioInstance.play()
    }
  }

  // Permet aux MJ de sélectionner une piste et la jouer
  const selectTrack = async (track: { name: string; fileUrl: string }) => {
    if (!roomId) return
    setCurrentTrack(track) // Mettez à jour le state local pour la piste courante

    const roomDocRef = doc(db, `rooms/${roomId}`)
    await updateDoc(roomDocRef, { currentTrack: track, isPaused: false }) // Met à jour Firestore
  }

  const togglePauseState = async () => {
    if (!roomId) return

    const roomDocRef = doc(db, `rooms/${roomId}`)
    const roomDoc = await getDoc(roomDocRef)

    if (roomDoc.exists()) {
      await updateDoc(roomDocRef, { isPaused: !isPaused })
    } else {
      await setDoc(roomDocRef, { isPaused: !isPaused, currentTrack: currentTrack })
    }
  }

  const handleAddMusic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMusicName || !fileInputRef.current?.files?.[0] || !roomId) return

    const file = fileInputRef.current.files[0]
    const fileRef = ref(storage, `music/${roomId}/${file.name}`)

    await uploadBytes(fileRef, file)
    const fileUrl = await getDownloadURL(fileRef)

    await addDoc(collection(db, 'music'), {
      name: newMusicName,
      fileUrl,
      room_id: roomId
    })

    setNewMusicName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRename = async (id: string) => {
    if (!editingName) return
    const musicDocRef = doc(db, 'music', id)
    await updateDoc(musicDocRef, { name: editingName })
    setEditingId(null)
    setEditingName('')
  }

  const handleDelete = async (id: string) => {
    const musicDocRef = doc(db, 'music', id)
    await deleteDoc(musicDocRef)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (audioInstance) {
      audioInstance.volume = newVolume
    }
  }

  const MusicGrid = ({ items, Icon }: { items: typeof music, Icon: LucideIcon }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item.id} className="relative">
          <Button
            variant="outline"
            className={`h-20 w-full ${isPaused ? 'opacity-50' : ''}`}
            onClick={() => isMJ && selectTrack({ name: item.name, fileUrl: item.fileUrl })} // Assurez-vous que le clic fonctionne pour MJ
          >
            <Icon className="mr-2 h-4 w-4" />
            {editingId === item.id && isMJ ? (
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleRename(item.id)}
                autoFocus
              />
            ) : (
              item.name
            )}
          </Button>
          {isMJ && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="absolute top-1 right-1">
                  <Button variant="ghost">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => { setEditingId(item.id); setEditingName(item.name) }}>
                  <Edit className="mr-2 h-4 w-4" /> Renommer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(item.id)}>
                  <Trash className="mr-2 h-4 w-4" /> Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Musique Partagée</h1>
        {isMJ && (
          <Button
            variant={isPaused ? "destructive" : "default"}
            onClick={togglePauseState}
          >
            {isPaused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
            {isPaused ? "Reprendre" : "Pause"}
          </Button>
        )}
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Bibliothèque Musicale</CardTitle>
        </CardHeader>
        <CardContent>
          <MusicGrid items={music} Icon={Music} />
        </CardContent>
      </Card>

      <div className="flex items-center mb-6">
        <Label className="mr-4">Volume</Label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolumeChange}
          className="w-full"
        />
      </div>

      {isMJ && (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter une nouvelle musique</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddMusic} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="music-name">Nom de la musique</Label>
                <Input
                  id="music-name"
                  value={newMusicName}
                  onChange={(e) => setNewMusicName(e.target.value)}
                  placeholder="Ex: Symphonie relaxante"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="music-file">Fichier audio</Label>
                <Input
                  id="music-file"
                  type="file"
                  ref={fileInputRef}
                  accept="audio/*"
                />
              </div>
              <Button type="submit">
                <Plus className="mr-2 h-4 w-4" />
                Ajouter une musique
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
