'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Users, Trash } from 'lucide-react'
import { auth, db, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { onAuthStateChanged } from 'firebase/auth'

interface Room {
  id: string;
  title: string;
  description: string;
  maxPlayers: number;
  imageUrl?: string;
  isPublic: boolean;
  creatorId?: string;
}

// Composant pour la confirmation de suppression de salle
function DialogDeleteConfirmation({ onConfirm }: { onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  const openDialog = () => dialogRef.current?.showModal()
  const closeDialog = () => dialogRef.current?.close()

  return (
    <>
      <dialog ref={dialogRef} className="p-4 text-center bg-[#2a2a2a] rounded-md">
        <h2 className="text-xl font-semibold text-[#c0a0a0] mb-4">Confirmer la suppression</h2>
        <p className="text-[#a0a0a0] mb-6">Êtes-vous sûr de vouloir supprimer cette salle ? Cette action est irréversible.</p>
        <div className="flex space-x-4 justify-center">
          <Button onClick={() => { onConfirm(); closeDialog() }} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">Confirmer</Button>
          <Button variant="outline" onClick={closeDialog} className="text-[#d4d4d4] border border-[#5c6bc0] hover:bg-[#5c6bc0]">Annuler</Button>
        </div>
      </dialog>
      <Button variant="ghost" onClick={openDialog} className="text-red-600 hover:bg-[#5c5c5c]">
        <Trash className="h-5 w-5" /> Supprimer
      </Button>
    </>
  )
}

// Composant pour afficher les informations de la salle et les actions disponibles
function RoomPresentation({ room, onBack, onEdit }: { room: Room; onBack: () => void; onEdit: () => void }) {
  const router = useRouter()

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
      await updateDoc(doc(db, 'users', user.uid), { room_id: room.id })
      router.push('/personnages')
    } catch (error) {
      console.error("Error updating room_id:", error)
    }
  }

  return (
    <div className="flex w-full h-screen bg-[#2a2a2a] text-[#d4d4d4] p-6 flex-col">
      <div className="flex items-center space-x-4 mb-6">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Retour
        </Button>
        <h1 className="text-4xl font-bold text-[#c0a0a0]">{room.title}</h1>
      </div>
      <hr className="border-t border-[#3a3a3a] my-2" />
      <div className="flex flex-1 mt-4">
        <div className="w-3/5 pr-8 space-y-6 flex flex-col justify-center">
          <p className="text-lg text-[#a0a0a0]">{room.description}</p>
          <div className="flex items-center space-x-3">
            <Users className="h-5 w-5 text-[#c0a0a0]" />
            <span>Joueurs : {room.maxPlayers}</span>
          </div>
          <div className="flex space-x-4 mt-4">
            <Button onClick={handleJoin} className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f] transition duration-300">Rejoindre la partie</Button>
            {room.creatorId === auth.currentUser?.uid && (
              <>
                <Button variant="outline" onClick={onEdit} className="text-[#d4d4d4] border border-[#5c6bc0] hover:bg-[#5c6bc0]">Modifier</Button>
                <DialogDeleteConfirmation onConfirm={handleDeleteRoom} />
              </>
            )}
          </div>
        </div>
        <div className="w-2/5 flex justify-center items-center">
          <img src={room.imageUrl} alt={`Image de la salle ${room.title}`} className="w-full h-auto object-cover rounded-lg border border-[#3a3a3a]" />
        </div>
      </div>
    </div>
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
    isPublic: true,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

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

  const handleJoinRoom = (code: string) => {
    const room = publicRooms.find((r) => r.id === code)
    if (room) {
      setSelectedRoom(room)
    } else {
      console.log(`Aucune salle trouvée avec le code: ${code}`)
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

    setNewRoom({ title: '', description: '', maxPlayers: 4, isPublic: true })
    setImageFile(null)
    router.push('/personnages')
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
    <div className="container mx-auto p-4 min-h-screen bg-[#1c1c1c] text-[#d4d4d4]">
      <h1 className="text-3xl font-bold mb-6 text-[#c0a0a0]">Trouvez une partie</h1>
      
      <Tabs defaultValue="rejoindre" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rejoindre">Rejoindre</TabsTrigger>
          <TabsTrigger value="creer">Créer</TabsTrigger>
          <TabsTrigger value="mes-salles">Mes parties</TabsTrigger>
        </TabsList>
        
        <TabsContent value="rejoindre">
          <Card className="bg-[#2a2a2a] text-[#d4d4d4] border border-[#3a3a3a]">
            <CardHeader>
              <CardTitle className="text-[#c0a0a0]">Rejoindre une partie</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-[#a0a0a0]">Entrez un code</h3>
                  <div className="flex space-x-2">
                    <Input
                      type="text"
                      placeholder="Code à 6 chiffres"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value)}
                      maxLength={6}
                      className="text-2xl font-bold tracking-wider bg-[#1c1c1c] text-[#d4d4d4]"
                    />
                    <Button onClick={() => handleJoinRoom(roomCode)} size="lg" className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]">
                      Rejoindre
                    </Button>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-[#a0a0a0]">Salles publiques</h3>
                  <ul className="space-y-2">
                    {publicRooms.map((room) => (
                      <li key={room.id} className="flex justify-between items-center bg-[#2a2a2a] p-2 rounded border border-[#3a3a3a]">
                        <span className="text-[#d4d4d4]">{room.title}</span>
                        <Button onClick={() => handleJoinRoom(room.id)} variant="outline" size="sm" className="text-[#d4d4d4] border border-[#5c6bc0] hover:bg-[#5c6bc0]">
                          Rejoindre
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="creer">
          <Card className="bg-[#2a2a2a] text-[#d4d4d4] border border-[#3a3a3a]">
            <CardHeader>
              <CardTitle className="text-[#c0a0a0]">Créer une partie</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-[#a0a0a0]">Titre</label>
                  <Input
                    type="text"
                    id="title"
                    name="title"
                    value={newRoom.title}
                    onChange={handleInputChange}
                    required
                    className="bg-[#1c1c1c] text-[#d4d4d4]"
                  />
                </div>
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-[#a0a0a0]">Description</label>
                  <Textarea
                    id="description"
                    name="description"
                    value={newRoom.description}
                    onChange={handleInputChange}
                    required
                    className="bg-[#1c1c1c] text-[#d4d4d4]"
                  />
                </div>
                <div>
                  <label htmlFor="image" className="block text-sm font-medium text-[#a0a0a0]">Image de la salle</label>
                  <Input
                    type="file"
                    id="image"
                    onChange={handleFileChange}
                    required
                    className="bg-[#1c1c1c] text-[#d4d4d4]"
                  />
                </div>
                <div>
                  <label htmlFor="maxPlayers" className="block text-sm font-medium text-[#a0a0a0]">Nombre maximum de joueurs</label>
                  <Input
                    type="number"
                    id="maxPlayers"
                    name="maxPlayers"
                    value={newRoom.maxPlayers}
                    onChange={handleInputChange}
                    min="1"
                    required
                    className="bg-[#1c1c1c] text-[#d4d4d4]"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <label className="block text-sm font-medium text-[#a0a0a0]">Salle publique</label>
                  <Switch
                    id="isPublic"
                    checked={newRoom.isPublic}
                    onCheckedChange={handleToggleChange}
                    className="text-[#d4d4d4]"
                  />
                </div>
                <Button type="submit" className="w-full bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]">
                  Créer la salle
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="mes-salles">
          <Card className="bg-[#2a2a2a] text-[#d4d4d4] border border-[#3a3a3a]">
            <CardHeader>
              <CardTitle className="text-[#c0a0a0]">Mes parties</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                {userRooms.length > 0 ? (
                  <ul className="space-y-2">
                    {userRooms.map((room) => (
                      <li key={room.id} className="flex justify-between items-center bg-secondary p-2 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
                        <span>{room.title}</span>
                        <Button onClick={() => setSelectedRoom(room)} variant="outline" size="sm" className="text-[#d4d4d4] border border-[#5c6bc0] hover:bg-[#5c6bc0]">
                          Voir
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#a0a0a0]">Vous n'avez pas encore de salles. Rejoignez ou créez une salle pour commencer.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
