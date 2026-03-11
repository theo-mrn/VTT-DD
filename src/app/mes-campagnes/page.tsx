'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Play, Plus, Shield, Gamepad2, Eye, ArrowLeft, Settings } from 'lucide-react'
import { auth, db, collection, doc, getDocs, getDoc } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { RoomUsersManager } from '@/app/home/components/RoomUsersManager'
import { RoomChat } from '@/app/home/components/RoomChat'
import { RoomSessions } from '@/app/home/components/RoomSessions'
import { cn } from '@/lib/utils'
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
  occupantsCount?: number;
}

const fetchCreatorInfo = async (creatorId: string) => {
  const creatorDoc = await getDoc(doc(db, 'users', creatorId))
  if (creatorDoc.exists()) {
    return creatorDoc.data() as { name: string; pp: string }
  }
  return null
}

export default function MesCampagnesPage() {
  const [userRooms, setUserRooms] = useState<Room[]>([])
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [creatorInfo, setCreatorInfo] = useState<{ name: string; pp: string } | null>(null)
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
    if (!userId) return

    const fetchUserRooms = async () => {
      const userRoomsCollection = collection(db, `users/${userId}/rooms`)
      const userRoomsSnapshot = await getDocs(userRoomsCollection)

      const userRoomIds = userRoomsSnapshot.docs.map((doc) => doc.id)

      const userRoomData: Room[] = []
      for (const roomId of userRoomIds) {
        const roomDoc = await getDoc(doc(db, 'Salle', roomId))
        if (roomDoc.exists()) {
          const data = roomDoc.data()
          const nomsSnapshot = await getDocs(collection(db, `salles/${roomId}/Noms`))
          const playersOnly = nomsSnapshot.docs.filter(doc => doc.data().nom !== 'MJ').length
          userRoomData.push({ id: roomId, ...data, occupantsCount: playersOnly } as Room)
        }
      }
      setUserRooms(userRoomData)
    }

    fetchUserRooms()
  }, [userId])

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

  const myCreatedRooms = userRooms.filter(r => r.creatorId === userId)
  const myJoinedRooms = userRooms.filter(r => r.creatorId !== userId)

  const isOwner = selectedRoom?.creatorId === userId

  return (
    <div 
      className="min-h-screen text-[var(--text-primary)] font-body relative"
      style={{
        backgroundImage: `url('https://assets.yner.fr/images/index6.webp')`,
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

        {selectedRoom ? (
          <>
            {/* Header */}
            <div className="border-b border-[var(--border-color)] bg-[var(--bg-card)]/80 backdrop-blur-md sticky top-0 z-50 mt-16 shadow-lg">
              <div className="container mx-auto px-6 py-4">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedRoom(null)} className="gap-2 text-[var(--text-primary)] hover:bg-white/10">
                    <ArrowLeft className="h-4 w-4" /> Retour
                  </Button>
                  <div className="h-6 w-px bg-[var(--border-color)]" />
                  <h1 className={`text-2xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>{selectedRoom.title}</h1>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-6 py-8">
              <div className="grid lg:grid-cols-3 gap-8">
                {/* Image principale */}
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
                    <RoomChat roomId={selectedRoom.id} isOwner={isOwner} />
                  </div>
                </div>

                {/* Sidebar avec infos et actions */}
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

                      {isOwner && (
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
                        onClick={() => router.push(`/${selectedRoom.id}/map`)}
                        className="w-full gap-2 h-12 bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] border-none font-bold"
                        size="lg"
                      >
                        <Play className="h-4 w-4" />
                        {isOwner ? 'Jouer (MJ)' : 'Jouer'}
                      </Button>
                      {isOwner && (
                        <Button variant="outline" onClick={() => router.push(`/creer`)} className="w-full h-12 gap-2 border-[var(--border-color)] text-[var(--text-primary)] hover:bg-white/10 font-bold">
                          <Settings className="h-4 w-4" />
                          Gérer la salle
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {/* Sessions */}
                  <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
                     <RoomSessions roomId={selectedRoom.id} isOwner={isOwner} />
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
                      isOwner={isOwner}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Vue liste des campagnes */
          <div className="container mx-auto px-6 py-8 pt-32 pb-24">
            <div className="max-w-6xl mx-auto space-y-12">
              <div className="space-y-2 text-center md:text-left">
                <h1 className={`text-4xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>Mes campagnes</h1>
                <p className="text-[var(--text-secondary)] text-lg">Gérez toutes vos parties en cours</p>
              </div>

              {userRooms.length === 0 ? (
                <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
                  <CardContent className="p-16 text-center space-y-6">
                    <Gamepad2 className="h-20 w-20 mx-auto text-[var(--text-secondary)] opacity-50" />
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold text-[var(--text-primary)]">Aucune campagne</h3>
                      <p className="text-[var(--text-secondary)] text-lg max-w-md mx-auto">
                        Vous n&apos;avez pas encore de campagne. Créez-en une ou rejoignez une partie !
                      </p>
                    </div>
                    <div className="flex gap-4 justify-center pt-4">
                      <Button onClick={() => router.push('/creer')} className="h-12 px-8 gap-2 bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] border-none font-bold">
                        <Plus className="h-5 w-5" />
                        Créer une campagne
                      </Button>
                      <Button onClick={() => router.push('/rejoindre')} variant="outline" className="h-12 px-8 gap-2 border-[var(--border-color)] text-[var(--text-primary)] hover:bg-white/10 font-bold">
                        <Play className="h-5 w-5" />
                        Rejoindre une partie
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-12">
                  {myCreatedRooms.length > 0 && (
                    <div className="space-y-6">
                      <h2 className={`text-2xl font-bold flex items-center gap-3 text-[var(--accent-brown)] ${aclonica.className}`}>
                        <Shield className="h-6 w-6" />
                        Campagnes créées ({myCreatedRooms.length})
                      </h2>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {myCreatedRooms.map((room) => (
                          <Card key={room.id} className="group cursor-pointer border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent-brown)] transition-all duration-300 shadow-xl overflow-hidden">
                            <CardContent className="p-5 space-y-4">
                              <div className="aspect-video rounded-xl overflow-hidden bg-[var(--bg-dark)] border border-[var(--border-color)]/30">
                                <img
                                  src={room.imageUrl || '/placeholder.svg'}
                                  alt={room.title}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                />
                              </div>
                              <div className="space-y-2">
                                 <h3 className="font-bold text-xl text-[var(--text-primary)] line-clamp-1">{room.title}</h3>
                                 <p className="text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{room.description}</p>
                              </div>
                              <div className="flex items-center justify-between pt-2">
                                <span className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                                  <Users className="h-4 w-4" />
                                  {room.occupantsCount || 0}/{room.maxPlayers}
                                </span>
                                <Button
                                  onClick={() => setSelectedRoom(room)}
                                  variant="outline"
                                  size="sm"
                                  className="gap-2 border-[var(--border-color)] group-hover:border-[var(--accent-brown)] group-hover:text-[var(--accent-brown)] font-bold transition-all"
                                >
                                  <Eye className="h-4 w-4" />
                                  Détails
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {myJoinedRooms.length > 0 && (
                    <div className="space-y-6">
                      <h2 className={`text-2xl font-bold flex items-center gap-3 text-[var(--accent-brown)] ${aclonica.className}`}>
                        <Gamepad2 className="h-6 w-6" />
                        Campagnes rejointes ({myJoinedRooms.length})
                      </h2>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {myJoinedRooms.map((room) => (
                          <Card key={room.id} className="group cursor-pointer border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent-brown)] transition-all duration-300 shadow-xl overflow-hidden">
                            <CardContent className="p-5 space-y-4">
                              <div className="aspect-video rounded-xl overflow-hidden bg-[var(--bg-dark)] border border-[var(--border-color)]/30">
                                <img
                                  src={room.imageUrl || '/placeholder.svg'}
                                  alt={room.title}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                />
                              </div>
                              <div className="space-y-2">
                                 <h3 className="font-bold text-xl text-[var(--text-primary)] line-clamp-1">{room.title}</h3>
                                 <p className="text-sm text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{room.description}</p>
                              </div>
                              <div className="flex items-center justify-between pt-2">
                                <span className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
                                  <Users className="h-4 w-4" />
                                  {room.occupantsCount || 0}/{room.maxPlayers}
                                </span>
                                <Button
                                  onClick={() => setSelectedRoom(room)}
                                  variant="outline"
                                  size="sm"
                                  className="gap-2 border-[var(--border-color)] group-hover:border-[var(--accent-brown)] group-hover:text-[var(--accent-brown)] font-bold transition-all"
                                >
                                  <Eye className="h-4 w-4" />
                                  Détails
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
