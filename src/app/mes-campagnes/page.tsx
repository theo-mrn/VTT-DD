'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Play, Plus, Shield, Gamepad2, ArrowLeft, Settings, ArrowRight } from 'lucide-react'
import { auth, db, collection, doc, getDocs, getDoc } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { RoomUsersManager } from '@/app/home/components/RoomUsersManager'
import { RoomChat } from '@/app/home/components/RoomChat'
import { RoomSessions } from '@/app/home/components/RoomSessions'
import { RoomSettingsManager } from '@/app/home/components/RoomSettingsManager'
import { AppBackground } from '@/components/ui/background-components'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
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
    <AppBackground className="text-[var(--text-primary)] font-body">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute top-0 left-1/4 w-[800px] h-[600px] z-0" style={{ backgroundImage: 'radial-gradient(ellipse 70% 50% at 30% 0%, rgba(192,160,128,0.1) 0%, transparent 70%)' }} />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[500px] h-[500px] z-0" style={{ backgroundImage: 'radial-gradient(ellipse at 100% 100%, rgba(192,160,128,0.04) 0%, transparent 60%)' }} />

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
                        <Button variant="outline" onClick={() => setIsSettingsOpen(true)} className="w-full h-12 gap-2 border-[var(--border-color)] text-[var(--text-primary)] hover:bg-white/10 font-bold">
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

              {/* Dialog de paramètres */}
              <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogContent className="max-w-2xl bg-[var(--bg-card)] border-[var(--border-color)] p-0 overflow-hidden">
                  <DialogHeader className="p-6 pb-0">
                    <DialogTitle className={`text-2xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>
                      Paramètres de la campagne
                    </DialogTitle>
                  </DialogHeader>
                  <div className="max-h-[80vh] overflow-y-auto">
                    <RoomSettingsManager roomId={selectedRoom.id} />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </>
        ) : (
          /* Vue liste des campagnes - split layout */
          <div className="container mx-auto px-6 pt-28 pb-24 min-h-[calc(100vh-4rem)]">
            <div className="max-w-7xl mx-auto grid lg:grid-cols-[380px_1fr] gap-10 items-start">

              {/* ── Left panel: Title + Actions ── */}
              <div className="lg:sticky lg:top-28 space-y-10">
                <div className="space-y-6">
                  <h1 className={`text-4xl lg:text-5xl font-bold gold-text-gradient leading-tight ${aclonica.className}`}>
                    Mes<br />campagnes
                  </h1>
                  <p className="text-[var(--text-secondary)] text-base leading-relaxed">
                    Retrouvez et gérez toutes vos parties en cours
                  </p>
                </div>

                {/* Quick actions */}
                <div className="space-y-3">
                  <Button
                    onClick={() => router.push('/creer')}
                    className="w-full h-13 gap-3 bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] text-base font-bold border-none shadow-[0_4px_25px_rgba(192,160,128,0.3)] hover:shadow-[0_4px_35px_rgba(192,160,128,0.5)] transition-all rounded-xl"
                  >
                    <Plus className="h-4 w-4" /> Créer une campagne
                  </Button>
                  <Button
                    onClick={() => router.push('/rejoindre')}
                    variant="outline"
                    className="w-full h-13 gap-3 border-[var(--border-color)] text-[var(--text-primary)] hover:bg-white/10 text-base font-bold transition-all rounded-xl"
                  >
                    <Play className="h-4 w-4" /> Rejoindre une partie
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-gradient-to-r from-[var(--accent-brown)]/30 to-transparent" />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-[var(--bg-card)]/40 backdrop-blur-sm border border-[var(--border-color)]">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-4 w-4 text-[var(--accent-brown)]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Créées</span>
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{myCreatedRooms.length}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-[var(--bg-card)]/40 backdrop-blur-sm border border-[var(--border-color)]">
                    <div className="flex items-center gap-2 mb-1">
                      <Gamepad2 className="h-4 w-4 text-[var(--accent-brown)]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Rejointes</span>
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{myJoinedRooms.length}</p>
                  </div>
                </div>
              </div>

              {/* ── Right panel: Campaign grid ── */}
              <div className="space-y-10">
                {userRooms.length === 0 ? (
                  <div className="text-center py-24 space-y-6 border border-dashed border-[var(--border-color)] rounded-2xl">
                    <div className="w-20 h-20 mx-auto rounded-2xl bg-[var(--accent-brown)]/5 border border-[var(--accent-brown)]/10 flex items-center justify-center">
                      <Gamepad2 className="h-10 w-10 text-[var(--text-secondary)] opacity-30" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-[var(--text-primary)] font-bold text-lg">Aucune campagne</p>
                      <p className="text-[var(--text-secondary)] text-sm max-w-sm mx-auto">
                        Vous n&apos;avez pas encore de campagne. Créez-en une ou rejoignez une partie !
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {myCreatedRooms.length > 0 && (
                      <div className="space-y-5">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-[var(--accent-brown)]/10 border border-[var(--accent-brown)]/20">
                            <Shield className="h-5 w-5 text-[var(--accent-brown)]" />
                          </div>
                          <div>
                            <h2 className={`text-2xl font-bold text-[var(--text-primary)] ${aclonica.className}`}>Campagnes créées</h2>
                            <p className="text-sm text-[var(--text-secondary)]">{myCreatedRooms.length} campagne{myCreatedRooms.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                          {myCreatedRooms.map((room) => (
                            <div
                              key={room.id}
                              onClick={() => setSelectedRoom(room)}
                              className="group cursor-pointer relative rounded-2xl overflow-hidden border border-[var(--border-color)] bg-[var(--bg-card)]/60 backdrop-blur-sm hover:border-[var(--accent-brown)]/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(192,160,128,0.08)]"
                            >
                              <div className="aspect-[16/10] overflow-hidden bg-[var(--bg-dark)] relative">
                                {room.imageUrl ? (
                                  <img src={room.imageUrl} alt={room.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--bg-dark)] to-[var(--bg-card)]">
                                    <Gamepad2 className="h-12 w-12 text-[var(--accent-brown)]/20" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-xs font-bold text-white flex items-center gap-1.5">
                                  <Users className="h-3 w-3" />
                                  {room.occupantsCount || 0}/{room.maxPlayers}
                                </div>
                                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[var(--accent-brown)]/40 backdrop-blur-sm border border-[var(--accent-brown)]/50 text-xs font-bold text-[var(--accent-brown)] flex items-center gap-1.5">
                                  <Shield className="h-3 w-3" />
                                  MJ
                                </div>
                              </div>
                              <div className="p-4 space-y-2">
                                <h3 className="font-bold text-base text-[var(--text-primary)] group-hover:text-[var(--accent-brown)] transition-colors line-clamp-1">{room.title}</h3>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-[var(--text-secondary)]">{room.isPublic ? 'Publique' : 'Privée'}</span>
                                  <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--accent-brown)] opacity-0 group-hover:opacity-100 transition-opacity">
                                    Détails <ArrowRight className="h-3.5 w-3.5" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {myJoinedRooms.length > 0 && (
                      <div className="space-y-5">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-[var(--accent-brown)]/10 border border-[var(--accent-brown)]/20">
                            <Gamepad2 className="h-5 w-5 text-[var(--accent-brown)]" />
                          </div>
                          <div>
                            <h2 className={`text-2xl font-bold text-[var(--text-primary)] ${aclonica.className}`}>Campagnes rejointes</h2>
                            <p className="text-sm text-[var(--text-secondary)]">{myJoinedRooms.length} campagne{myJoinedRooms.length !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                          {myJoinedRooms.map((room) => (
                            <div
                              key={room.id}
                              onClick={() => setSelectedRoom(room)}
                              className="group cursor-pointer relative rounded-2xl overflow-hidden border border-[var(--border-color)] bg-[var(--bg-card)]/60 backdrop-blur-sm hover:border-[var(--accent-brown)]/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(192,160,128,0.08)]"
                            >
                              <div className="aspect-[16/10] overflow-hidden bg-[var(--bg-dark)] relative">
                                {room.imageUrl ? (
                                  <img src={room.imageUrl} alt={room.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--bg-dark)] to-[var(--bg-card)]">
                                    <Gamepad2 className="h-12 w-12 text-[var(--accent-brown)]/20" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-xs font-bold text-white flex items-center gap-1.5">
                                  <Users className="h-3 w-3" />
                                  {room.occupantsCount || 0}/{room.maxPlayers}
                                </div>
                              </div>
                              <div className="p-4 space-y-2">
                                <h3 className="font-bold text-base text-[var(--text-primary)] group-hover:text-[var(--accent-brown)] transition-colors line-clamp-1">{room.title}</h3>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-[var(--text-secondary)]">{room.isPublic ? 'Publique' : 'Privée'}</span>
                                  <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--accent-brown)] opacity-0 group-hover:opacity-100 transition-opacity">
                                    Détails <ArrowRight className="h-3.5 w-3.5" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppBackground>
  )
}
