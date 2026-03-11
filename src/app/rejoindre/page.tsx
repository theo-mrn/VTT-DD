'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, Play, Users, Eye, ArrowLeft, Settings, Shield, Gamepad2 } from 'lucide-react'
import { auth, db, collection, doc, getDocs, getDoc, setDoc } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { RoomUsersManager } from '@/app/home/components/RoomUsersManager'
import { RoomChat } from '@/app/home/components/RoomChat'
import { RoomSessions } from '@/app/home/components/RoomSessions'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Aclonica } from "next/font/google"

const aclonica = Aclonica({ weight: '400', subsets: ['latin'] })

interface Room {
  id: string;
  title: string;
  description: string;
  maxPlayers: number;
  imageUrl?: string;
  isPublic: boolean;
  creatorId?: string;
  allowCharacterCreation?: boolean;
  bannedUsers?: string[];
  occupantsCount?: number;
}

const fetchRoomByCode = async (code: string): Promise<Room | null> => {
  if (!code || code.trim() === '') return null
  const roomDoc = await getDoc(doc(db, 'Salle', code))
  if (roomDoc.exists()) {
    const data = roomDoc.data()
    const nomsSnapshot = await getDocs(collection(db, `salles/${code}/Noms`))
    const playersOnly = nomsSnapshot.docs.filter(doc => doc.data().nom !== 'MJ').length
    return { id: roomDoc.id, ...data, occupantsCount: playersOnly } as Room
  }
  return null
}

const fetchCreatorInfo = async (creatorId: string) => {
  const creatorDoc = await getDoc(doc(db, 'users', creatorId))
  if (creatorDoc.exists()) {
    return creatorDoc.data() as { name: string; pp: string }
  }
  return null
}

export default function RejoindrePageComponent() {
  const [roomCode, setRoomCode] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [creatorInfo, setCreatorInfo] = useState<{ name: string; pp: string } | null>(null)
  const [publicRooms, setPublicRooms] = useState<Room[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [userData, setUserData] = useState<any>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isStoreOpen, setIsStoreOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid)
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          setUserData(userDoc.data())
        }
      } else {
        setUserId(null)
        setUserData(null)
      }
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const fetchPublicRooms = async () => {
      const roomCollection = collection(db, 'Salle')
      const roomSnapshot = await getDocs(roomCollection)
      const publicRoomList: Room[] = []

      for (const roomDoc of roomSnapshot.docs) {
        const data = roomDoc.data()
        if (data.isPublic) {
          const nomsSnapshot = await getDocs(collection(db, `salles/${roomDoc.id}/Noms`))
          const playersOnly = nomsSnapshot.docs.filter(doc => doc.data().nom !== 'MJ').length
          publicRoomList.push({ id: roomDoc.id, ...data, occupantsCount: playersOnly } as Room)
        }
      }
      setPublicRooms(publicRoomList)
    }

    fetchPublicRooms()
  }, [])

  useEffect(() => {
    if (selectedRoom && selectedRoom.creatorId) {
      const getCreatorInfo = async () => {
        const info = await fetchCreatorInfo(selectedRoom.creatorId!)
        if (info) {
          setCreatorInfo(info)
        }
      }
      getCreatorInfo()
    }
  }, [selectedRoom])

  const handleJoinRoom = async (code: string) => {
    if (!code || code.trim() === '') {
      toast.error("Veuillez entrer un code valide")
      return
    }
    const room = await fetchRoomByCode(code)
    if (room) {
      setSelectedRoom(room)
    } else {
      toast.error("Aucune salle trouvée avec ce code")
    }
  }

  const handleJoin = async (room: Room) => {
    const user = auth.currentUser
    if (!user) {
      toast.error("Vous devez être connecté")
      return
    }

    try {
      const roomRef = doc(db, 'Salle', room.id)
      const roomDoc = await getDoc(roomRef)

      if (roomDoc.exists()) {
        const roomData = roomDoc.data() as Room

        if (roomData.bannedUsers?.includes(user.uid)) {
          toast.error("Vous avez été banni de cette salle.")
          return
        }

        const isOwner = roomData.creatorId === user.uid
        const userRoomListRef = doc(db, `users/${user.uid}/rooms`, room.id)
        const userRoomDoc = await getDoc(userRoomListRef)
        const alreadyInRoom = userRoomDoc.exists()

        if (!isOwner && !alreadyInRoom) {
          const nomsSnapshot = await getDocs(collection(db, `salles/${room.id}/Noms`))
          const playersOnly = nomsSnapshot.docs.filter(doc => doc.data().nom !== 'MJ').length

          if (playersOnly >= roomData.maxPlayers) {
            toast.error("Désolé, cette salle a atteint sa limite de joueurs.")
            return
          }
        }
      }

      const userRoomListRef = doc(db, `users/${user.uid}/rooms`, room.id)
      const userRef = doc(db, 'users', user.uid)

      await setDoc(userRoomListRef, { id: room.id }, { merge: true })
      await setDoc(userRef, { room_id: room.id }, { merge: true })

      router.push(`/personnages`)
    } catch (error) {
      console.error("Error joining room:", error)
      toast.error("Erreur lors de la connexion à la salle")
    }
  }

  const availablePublicRooms = publicRooms.filter(r => r.creatorId !== userId)

  return (
    <div
      className="min-h-screen text-[var(--text-primary)] font-body relative"
      style={{
        backgroundImage: `url('https://assets.yner.fr/images/index2.webp')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="absolute inset-0 bg-[var(--bg-canvas)]/80 backdrop-blur-sm z-0"></div>
      <div className="relative z-10">
        <AppNavbar
          variant="home"
          isUserLoggedIn={userId !== null}
          userData={userData}
          onOpenAuth={() => router.push('/auth')}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenStore={() => setIsStoreOpen(true)}
        />
        {isProfileOpen && <UserProfileDialog isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} userId={userId} />}
        <StoreModal isOpen={isStoreOpen} onClose={() => setIsStoreOpen(false)} />

        <div className="container mx-auto px-6 py-8 pt-32">
          {selectedRoom ? (
            <>
              {/* Header logic matches mes-campagnes */}
              <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" onClick={() => setSelectedRoom(null)} className="gap-2 hover:bg-white/10 text-[var(--text-primary)]">
                  <ArrowLeft className="h-4 w-4" /> Retour
                </Button>
                <div className="h-6 w-px bg-[var(--border-color)]" />
                <h1 className={`text-2xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>{selectedRoom.title}</h1>
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-8">
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-[var(--accent-brown)]/20 via-[var(--accent-brown)]/40 to-[var(--accent-brown)]/20 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm"></div>
                    <div className="relative aspect-video rounded-xl overflow-hidden border border-[var(--border-color)] shadow-2xl bg-[var(--bg-dark)]">
                      <img
                        src={selectedRoom.imageUrl || '/placeholder.svg'}
                        alt={`Image de la salle ${selectedRoom.title}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
                    <CardContent className="p-8">
                      <h3 className={`text-xl font-bold mb-4 text-[var(--accent-brown)] ${aclonica.className}`}>Description</h3>
                      <p className="text-[var(--text-secondary)] leading-relaxed text-lg">{selectedRoom.description}</p>
                    </CardContent>
                  </Card>

                  {/* Chat */}
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
                    <RoomChat roomId={selectedRoom.id} isOwner={selectedRoom.creatorId === userId} />
                  </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                  {/* Infos de la salle */}
                  <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
                    <CardHeader>
                      <CardTitle className={`flex items-center gap-2 text-[var(--accent-brown)] ${aclonica.className}`}>
                        <Gamepad2 className="h-5 w-5" />
                        Informations
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)] font-medium">Joueurs</span>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-[var(--accent-brown)]" />
                          <span className={cn("font-bold", (selectedRoom.occupantsCount || 0) >= selectedRoom.maxPlayers ? "text-destructive" : "text-[var(--text-primary)]")}>
                            {selectedRoom.occupantsCount || 0} / {selectedRoom.maxPlayers}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)] font-medium">Visibilité</span>
                        <span className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                          selectedRoom.isPublic ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-orange-500/10 text-orange-500 border border-orange-500/20"
                        )}>
                          {selectedRoom.isPublic ? "Publique" : "Privée"}
                        </span>
                      </div>

                      {selectedRoom.creatorId === userId && (
                        <div className="pt-4 border-t border-[var(--border-color)]">
                          <p className="text-sm font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-widest">Code de la salle :</p>
                          <code className="bg-[var(--bg-dark)] px-4 py-3 rounded-lg text-lg font-mono block text-center border border-[var(--border-color)] text-[var(--accent-brown)] font-bold shadow-inner">{selectedRoom.id}</code>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Actions */}
                  <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl overflow-hidden">
                    <CardHeader>
                      <CardTitle className={`text-[var(--accent-brown)] ${aclonica.className}`}>Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        onClick={() => handleJoin(selectedRoom)}
                        className="w-full gap-2 h-12 bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] border-none font-bold"
                        size="lg"
                      >
                        <Play className="h-4 w-4" />
                        Rejoindre la partie
                      </Button>
                      {selectedRoom.creatorId === userId && (
                        <Button variant="outline" onClick={() => router.push(`/creer`)} className="w-full h-12 gap-2 border-[var(--border-color)] text-[var(--text-primary)] hover:bg-white/10 font-bold">
                          <Settings className="h-4 w-4" />
                          Gérer la salle
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {/* Sessions */}
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
                    <RoomSessions roomId={selectedRoom.id} isOwner={selectedRoom.creatorId === userId} />
                  </div>

                  {/* Créateur */}
                  {creatorInfo && (
                    <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
                      <CardHeader>
                        <CardTitle className={`text-[var(--accent-brown)] ${aclonica.className}`}>Créateur</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <img
                              src={creatorInfo.pp}
                              alt={`Image de ${creatorInfo.name}`}
                              className="w-14 h-14 rounded-full border-2 border-[var(--border-color)] shadow-md"
                            />
                          </div>
                          <div>
                            <p className="font-bold text-[var(--text-primary)] text-lg">{creatorInfo.name}</p>
                            <p className="text-sm text-[var(--accent-brown)] font-medium">Maître de jeu</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Gestionnaire de Joueurs */}
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
                    <RoomUsersManager
                      roomId={selectedRoom.id}
                      isOwner={selectedRoom.creatorId === userId}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="max-w-6xl mx-auto space-y-12">
              <div className="space-y-2">
                <h1 className={`text-4xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>Rejoindre une partie</h1>
                <p className="text-[var(--text-secondary)] text-lg">Entrez un code ou choisissez parmi les campagnes actives</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-brown)]/5 to-transparent pointer-events-none" />
                  <CardHeader>
                    <CardTitle className={`text-2xl font-bold flex items-center gap-3 text-[var(--accent-brown)] ${aclonica.className}`}>
                      <Search className="h-6 w-6" />
                      Entrez un code
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <Input
                        type="text"
                        placeholder="Ex: 123456"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value)}
                        maxLength={6}
                        className="text-2xl font-mono tracking-widest text-center h-16 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] transition-all"
                      />
                      <Button
                        onClick={() => handleJoinRoom(roomCode)}
                        size="lg"
                        className="w-full h-14 gap-3 bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] text-lg font-bold border-none"
                      >
                        <Play className="h-5 w-5" />
                        Rejoindre
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
                  <CardHeader>
                    <CardTitle className={`text-2xl font-bold flex items-center gap-3 text-[var(--accent-brown)] ${aclonica.className}`}>
                      <Users className="h-6 w-6" />
                      Campagnes publiques
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                      {availablePublicRooms.length > 0 ? (
                        availablePublicRooms.map((room) => (
                          <div key={room.id} className="relative group">
                            <div className="relative flex items-center justify-between p-4 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-xl hover:border-[var(--accent-brown)] transition-all duration-300">
                              <div className="flex items-center gap-4">
                                <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                                <div className="flex flex-col">
                                  <span className="font-bold text-[var(--text-primary)]">{room.title}</span>
                                  <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-1">
                                    <Users className="h-3 w-3" />
                                    {room.occupantsCount || 0}/{room.maxPlayers}
                                  </span>
                                </div>
                              </div>
                              <Button
                                onClick={() => handleJoinRoom(room.id)}
                                variant="outline"
                                size="sm"
                                className="gap-2 border-[var(--border-color)] hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)] font-bold transition-all"
                              >
                                <Eye className="h-4 w-4" />
                                Voir
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-12 space-y-4 opacity-50">
                          <Users className="h-12 w-12 mx-auto text-[var(--text-secondary)]" />
                          <p className="text-[var(--text-secondary)] font-medium">Aucune campagne publique disponible</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
