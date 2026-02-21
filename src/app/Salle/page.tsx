'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Users, Trash, Plus, Search, Play, Settings, Eye, Gamepad2 } from 'lucide-react'
import { auth, db, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { onAuthStateChanged } from 'firebase/auth'
import { AlertTitle } from "@/components/ui/alert"
import { cn } from '@/lib/utils'


interface Room {
  id: string;
  title: string;
  description: string;
  maxPlayers: number;
  imageUrl?: string;
  isPublic: boolean;
  creatorId?: string;
  allowCharacterCreation?: boolean;
}

// Composant pour la confirmation de suppression de salle
function DialogDeleteConfirmation({ onConfirm }: { onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  const openDialog = () => dialogRef.current?.showModal()
  const closeDialog = () => dialogRef.current?.close()

  return (
    <>
      <dialog ref={dialogRef} className="p-6 text-center bg-card border border-border rounded-xl backdrop-blur-sm">
        <h2 className="text-xl font-semibold text-foreground mb-4">Confirmer la suppression</h2>
        <p className="text-muted-foreground mb-6">Êtes-vous sûr de vouloir supprimer cette salle ? Cette action est irréversible.</p>
        <div className="flex space-x-4 justify-center">
          <Button onClick={() => { onConfirm(); closeDialog() }} variant="destructive" className="px-6">
            Confirmer
          </Button>
          <Button variant="outline" onClick={closeDialog}>
            Annuler
          </Button>
        </div>
      </dialog>
      <Button variant="ghost" size="sm" onClick={openDialog} className="text-destructive hover:text-destructive hover:bg-destructive/10">
        <Trash className="h-4 w-4 mr-2" /> Supprimer
      </Button>
    </>
  )
}

const fetchCreatorInfo = async (creatorId: string) => {
  const creatorDoc = await getDoc(doc(db, 'users', creatorId))
  if (creatorDoc.exists()) {
    return creatorDoc.data() as { name: string; pp: string }
  }
  return null
}

const fetchRoomByCode = async (code: string): Promise<Room | null> => {
  if (!code || code.trim() === '') return null
  const roomDoc = await getDoc(doc(db, 'Salle', code))
  if (roomDoc.exists()) {
    return { id: roomDoc.id, ...roomDoc.data() } as Room
  }
  return null
}

// Composant pour afficher les informations de la salle et les actions disponibles
function RoomPresentation({ room, onBack, onEdit }: { room: Room; onBack: () => void; onEdit: () => void }) {
  const [creatorInfo, setCreatorInfo] = useState<{ name: string; pp: string } | null>(null)
  const router = useRouter()

  useEffect(() => {
    const getCreatorInfo = async () => {
      if (room.creatorId) {
        const info = await fetchCreatorInfo(room.creatorId)
        if (info) {
          setCreatorInfo(info)
        }
      }
    }
    getCreatorInfo()
  }, [room.creatorId])

  const handleDeleteRoom = async () => {
    try {
      await deleteDoc(doc(db, 'Salle', room.id))
      onBack()
    } catch (error) {
      console.error("Error deleting room:", error)
    }
  }

  const handleJoin = async () => {
    const user = auth.currentUser
    if (!user) {
      console.error("User is not logged in")
      return
    }

    try {
      const userRoomListRef = doc(db, `users/${user.uid}/rooms`, room.id)
      const userRef = doc(db, 'users', user.uid)

      // 1. Ajouter d'abord la salle à la liste "Mes parties"
      await setDoc(userRoomListRef, { id: room.id }, { merge: true })

      // 2. Mettre à jour la salle actuelle de l'utilisateur
      await setDoc(userRef, { room_id: room.id }, { merge: true })

      router.push(`/personnages`)
    } catch (error) {
      console.error("Error joining room:", error)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
            <div className="h-6 w-px bg-border" />
            <h1 className="text-2xl font-bold text-foreground">{room.title}</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Image principale */}
          <div className="lg:col-span-2">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm"></div>
              <div className="relative aspect-video rounded-xl overflow-hidden border border-border">
                <img
                  src={room.imageUrl || '/placeholder.svg'}
                  alt={`Image de la salle ${room.title}`}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            </div>

            {/* Description */}
            <Card className="mt-6">
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-3 text-foreground">Description</h3>
                <p className="text-muted-foreground leading-relaxed">{room.description}</p>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar avec infos et actions */}
          <div className="space-y-6">
            {/* Infos de la salle */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5" />
                  Informations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Joueurs max</span>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-medium">{room.maxPlayers}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Visibilité</span>
                  <span className={cn("px-2 py-1 rounded-full text-xs font-medium",
                    room.isPublic ? "bg-green-500/10 text-green-500" : "bg-orange-500/10 text-orange-500"
                  )}>
                    {room.isPublic ? "Publique" : "Privée"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={handleJoin} className="w-full gap-2" size="lg">
                  <Play className="h-4 w-4" />
                  Rejoindre la partie
                </Button>
                {room.creatorId === auth.currentUser?.uid && (
                  <div className="space-y-2">
                    <Button variant="outline" onClick={onEdit} className="w-full gap-2">
                      <Settings className="h-4 w-4" />
                      Modifier
                    </Button>
                    <DialogDeleteConfirmation onConfirm={handleDeleteRoom} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Créateur */}
            {creatorInfo && (
              <Card>
                <CardHeader>
                  <CardTitle>Créateur</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={creatorInfo.pp}
                        alt={`Image de ${creatorInfo.name}`}
                        className="w-12 h-12 rounded-full border-2 border-border"
                      />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{creatorInfo.name}</p>
                      <p className="text-sm text-muted-foreground">Maître de jeu</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div >
  )
}

// Composant principal pour gérer la création, édition et affichage des salles
export default function Component() {
  const [roomCode, setRoomCode] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [publicRooms, setPublicRooms] = useState<Room[]>([])
  const [userRooms, setUserRooms] = useState<Room[]>([])
  const [newRoom, setNewRoom] = useState<Omit<Room, 'id' | 'imageUrl'>>({
    title: '',
    description: '',
    maxPlayers: 4,
    isPublic: false,
    allowCharacterCreation: true,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [showAlert, setShowAlert] = useState(false)

  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUserId(user ? user.uid : null)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const fetchPublicRooms = async () => {
      const roomCollection = collection(db, 'Salle')
      const roomSnapshot = await getDocs(roomCollection)
      const publicRoomList = roomSnapshot.docs
        .filter((doc) => doc.data().isPublic)
        .map((doc) => ({ id: doc.id, ...doc.data() } as Room))
      setPublicRooms(publicRoomList)
    }

    fetchPublicRooms()
  }, [])

  useEffect(() => {
    if (!userId) return

    const fetchUserRooms = async () => {
      const userRoomsCollection = collection(db, `users/${userId}/rooms`)
      const userRoomsSnapshot = await getDocs(userRoomsCollection)

      const userRoomIds = userRoomsSnapshot.docs.map((doc) => doc.id)

      const userRoomData: Room[] = []
      for (const roomId of userRoomIds) {
        const roomDoc = await getDoc(doc(db, 'Salle', roomId))
        if (roomDoc.exists()) {
          userRoomData.push({ id: roomId, ...roomDoc.data() } as Room)
        }
      }
      setUserRooms(userRoomData)
    }

    fetchUserRooms()
  }, [userId])

  const generateRoomCode = async (): Promise<string> => {
    let code: string = "";
    let exists = true;

    while (exists) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      const docRef = doc(db, 'Salle', code);
      const docSnap = await getDoc(docRef);
      exists = docSnap.exists();
    }

    return code;
  };

  const handleJoinRoom = async (code: string) => {
    if (!code || code.trim() === '') {
      setShowAlert(true)
      setTimeout(() => setShowAlert(false), 2000)
      return
    }
    const room = await fetchRoomByCode(code)
    if (room) {
      setSelectedRoom(room)
    } else {
      setShowAlert(true)
      setTimeout(() => setShowAlert(false), 2000)
    }
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) {
      console.error("User is not logged in")
      return
    }

    const code = await generateRoomCode()
    let imageUrl = ''

    if (imageFile) {
      const imageRef = ref(storage, `Salle/${code}/room-image`)
      await uploadBytes(imageRef, imageFile)
      imageUrl = await getDownloadURL(imageRef)
    }

    const roomData = { ...newRoom, imageUrl, creatorId: userId }
    await setDoc(doc(db, 'Salle', code), roomData)
    setRooms([...rooms, { id: code, ...newRoom, imageUrl, creatorId: userId }])

    const userRoomRef = doc(db, `users/${userId}`)
    await setDoc(userRoomRef, { room_id: code }, { merge: true })
    await setDoc(doc(db, `users/${userId}/rooms`, code), { id: code })

    setNewRoom({ title: '', description: '', maxPlayers: 4, isPublic: true, allowCharacterCreation: true })
    setImageFile(null)
    router.push(`/personnages`)
  }

  const handleEditRoom = () => {
    if (!selectedRoom) return
    setNewRoom(selectedRoom)
    setIsEditing(true)
  }

  const handleSaveRoom = async () => {
    if (!selectedRoom || !userId) return

    const updatedRoomData: Partial<Room> = {
      title: newRoom.title,
      description: newRoom.description,
      maxPlayers: newRoom.maxPlayers,
      isPublic: newRoom.isPublic,
      allowCharacterCreation: newRoom.allowCharacterCreation,
      creatorId: selectedRoom.creatorId,
    }

    if (imageFile) {
      const imageRef = ref(storage, `Salle/${selectedRoom.id}/room-image`)
      await uploadBytes(imageRef, imageFile)
      const imageUrl = await getDownloadURL(imageRef)
      updatedRoomData.imageUrl = imageUrl
    }

    await updateDoc(doc(db, 'Salle', selectedRoom.id), updatedRoomData)

    setUserRooms(userRooms.map((room) => (room.id === selectedRoom.id ? { ...room, ...updatedRoomData } : room)))
    setSelectedRoom({ ...selectedRoom, ...updatedRoomData })
    setIsEditing(false)
    setImageFile(null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setNewRoom((prev) => ({ ...prev, [name]: name === 'maxPlayers' ? parseInt(value) : value }))
  }

  const handleToggleChange = () => {
    setNewRoom((prev) => ({ ...prev, isPublic: !prev.isPublic }))
  }

  const handleToggleCreationChange = () => {
    setNewRoom((prev) => ({ ...prev, allowCharacterCreation: !prev.allowCharacterCreation }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0])
    }
  }

  if (selectedRoom) {
    return isEditing ? (
      <div className="container mx-auto p-4 min-h-screen bg-[#1c1c1c] text-[#d4d4d4]">
        <h2 className="text-2xl font-bold text-[#c0a0a0] mb-4">Modifier la salle</h2>
        <form onSubmit={(e) => { e.preventDefault(); handleSaveRoom() }} className="space-y-4">
          <Input name="title" placeholder="Titre" value={newRoom.title} onChange={handleInputChange} required />
          <Textarea name="description" placeholder="Description" value={newRoom.description} onChange={handleInputChange} required />
          <Input type="number" name="maxPlayers" placeholder="Nombre maximum de joueurs" value={newRoom.maxPlayers} onChange={handleInputChange} min="1" required />
          <Input type="file" onChange={handleFileChange} />
          <div className="flex items-center space-x-2">
            <label htmlFor="isPublic" className="text-[#a0a0a0]">Salle publique</label>
            <Switch
              id="isPublic"
              checked={newRoom.isPublic}
              onCheckedChange={handleToggleChange}
              className="text-[#d4d4d4]"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label htmlFor="allowCharacterCreation" className="text-[#a0a0a0]">Création de perso autorisée</label>
            <Switch
              id="allowCharacterCreation"
              checked={newRoom.allowCharacterCreation}
              onCheckedChange={handleToggleCreationChange}
              className="text-[#d4d4d4]"
            />
          </div>
          <div className="flex space-x-2">
            <Button type="submit" className="bg-[#c0a080] text-[#1c1c1c] px-4 py-2 rounded-lg hover:bg-[#d4b48f]">Sauvegarder</Button>
            <Button variant="outline" onClick={() => setIsEditing(false)} className="text-[#d4d4d4] border border-[#5c6bc0] hover:bg-[#5c6bc0]">Annuler</Button>
            <DialogDeleteConfirmation onConfirm={() => setSelectedRoom(null)} />
          </div>
        </form>
      </div>
    ) : (
      <RoomPresentation room={selectedRoom} onBack={() => setSelectedRoom(null)} onEdit={handleEditRoom} />
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header moderne */}
      <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Trouvez une partie
            </h1>
            <p className="text-muted-foreground text-lg">
              Rejoignez une aventure ou créez votre propre monde
            </p>
          </div>
        </div>
      </div>

      {/* Alert moderne */}
      {showAlert && (
        <div className="fixed top-4 right-4 bg-destructive text-destructive-foreground p-4 rounded-lg shadow-lg z-50 border border-destructive/20">
          <AlertTitle className="mb-1">Aucune salle trouvée</AlertTitle>
          <p className="text-sm opacity-90">Le code entré ne correspond à aucune salle existante.</p>
        </div>
      )}

      <div className="container mx-auto px-6 py-8">
        <Tabs defaultValue="rejoindre" className="w-full max-w-6xl mx-auto">
          <TabsList className="grid w-full grid-cols-3 h-12 bg-muted/50">
            <TabsTrigger value="rejoindre" className="gap-2">
              <Search className="h-4 w-4" />
              Rejoindre
            </TabsTrigger>
            <TabsTrigger value="creer" className="gap-2">
              <Plus className="h-4 w-4" />
              Créer
            </TabsTrigger>
            <TabsTrigger value="mes-salles" className="gap-2">
              <Eye className="h-4 w-4" />
              Mes parties
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rejoindre" className="mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Rejoindre par code */}
              <Card className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Entrez un code
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Input
                      type="text"
                      placeholder="Code à 6 chiffres"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                      maxLength={6}
                      className="text-xl font-mono tracking-wider text-center h-12"
                    />
                    <Button
                      onClick={() => handleJoinRoom(roomCode)}
                      size="lg"
                      className="w-full gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Rejoindre
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Salles publiques */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Salles publiques
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {publicRooms.length > 0 ? (
                      publicRooms.map((room) => (
                        <div key={room.id} className="group relative">
                          <div className="absolute bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg opacity-0 group-hover:opacity-100 transition duration-300" />
                          <div className="relative flex items-center justify-between p-3 bg-card border border-border rounded-lg hover:shadow-md transition-all duration-200">
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                              <span className="font-medium">{room.title}</span>
                            </div>
                            <Button
                              onClick={() => handleJoinRoom(room.id)}
                              variant="outline"
                              size="sm"
                              className="gap-2"
                            >
                              <Play className="h-3 w-3" />
                              Rejoindre
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">Aucune salle publique disponible</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="creer" className="mt-6">
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Créer une nouvelle partie
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateRoom} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="title" className="text-sm font-medium text-foreground">Titre *</label>
                      <Input
                        type="text"
                        id="title"
                        name="title"
                        value={newRoom.title}
                        onChange={handleInputChange}
                        placeholder="Ma super aventure"
                        required
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="maxPlayers" className="text-sm font-medium text-foreground">Joueurs max *</label>
                      <Input
                        type="number"
                        id="maxPlayers"
                        name="maxPlayers"
                        value={newRoom.maxPlayers}
                        onChange={handleInputChange}
                        min="1"
                        max="12"
                        required
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="description" className="text-sm font-medium text-foreground">Description *</label>
                    <Textarea
                      id="description"
                      name="description"
                      value={newRoom.description}
                      onChange={handleInputChange}
                      placeholder="Décrivez votre aventure, le style de jeu, l'ambiance..."
                      rows={4}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="image" className="text-sm font-medium text-foreground">Image de la salle *</label>
                    <Input
                      type="file"
                      id="image"
                      onChange={handleFileChange}
                      accept="image/*"
                      required
                      className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-muted file:text-muted-foreground hover:file:bg-muted/80"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Salle publique</label>
                      <p className="text-xs text-muted-foreground">
                        Les salles publiques apparaissent dans la liste pour tous les joueurs
                      </p>
                    </div>
                    <Switch
                      id="isPublic"
                      checked={newRoom.isPublic}
                      onCheckedChange={handleToggleChange}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-foreground">Création de personnages</label>
                      <p className="text-xs text-muted-foreground">
                        Autorise les joueurs à créer de nouveaux personnages
                      </p>
                    </div>
                    <Switch
                      id="allowCharacterCreation"
                      checked={newRoom.allowCharacterCreation}
                      onCheckedChange={handleToggleCreationChange}
                    />
                  </div>

                  <Button type="submit" className="w-full gap-2 h-11" size="lg">
                    <Plus className="h-4 w-4" />
                    Créer la salle
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mes-salles" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Mes parties
                </CardTitle>
              </CardHeader>
              <CardContent>
                {userRooms.length > 0 ? (
                  <div className="grid gap-4">
                    {userRooms.map((room) => (
                      <div key={room.id} className="group relative">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 rounded-xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm" />
                        <Card className="relative border-border/50 hover:border-primary/30 transition-all duration-300">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div>
                                  <h3 className="font-semibold text-foreground">{room.title}</h3>
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {room.maxPlayers} joueurs
                                    </span>
                                    <span className={cn("px-2 py-0.5 rounded-full text-xs",
                                      room.isPublic ? "bg-green-500/10 text-green-500" : "bg-orange-500/10 text-orange-500"
                                    )}>
                                      {room.isPublic ? "Publique" : "Privée"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Button
                                onClick={() => setSelectedRoom(room)}
                                variant="outline"
                                size="sm"
                                className="gap-2"
                              >
                                <Eye className="h-3 w-3" />
                                Voir
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Gamepad2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">Aucune partie trouvée</h3>
                    <p className="text-muted-foreground mb-4">
                      Vous n&apos;avez pas encore de salles. Rejoignez ou créez une salle pour commencer.
                    </p>
                    <Button variant="outline" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Créer ma première salle
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
