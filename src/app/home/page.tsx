'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Play, Users, ArrowLeft, Settings, Gamepad2, ArrowRight, Globe } from 'lucide-react'
import { auth, db, collection, doc, getDocs, getDoc, setDoc } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { RoomUsersManager } from '@/app/home/components/RoomUsersManager'
import { RoomChat } from '@/app/home/components/RoomChat'
import { RoomSessions } from '@/app/home/components/RoomSessions'
import { AppBackground } from '@/components/ui/background-components'
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

  const availablePublicRooms = publicRooms

  // ─── Detail view (room selected) ───
  if (selectedRoom) {
    return (
      <AppBackground className="text-[var(--text-primary)] font-body">
        <div
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] z-0"
          style={{ backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(192,160,128,0.08) 0%, transparent 70%)' }}
        />
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

          {/* Sticky header */}
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

          <div className="container mx-auto px-6 py-8">
            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-[var(--accent-brown)]/20 via-[var(--accent-brown)]/40 to-[var(--accent-brown)]/20 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm" />
                  <div className="relative aspect-video rounded-xl overflow-hidden border border-[var(--border-color)] shadow-2xl bg-[var(--bg-dark)]">
                    <img src={selectedRoom.imageUrl || '/placeholder.svg'} alt={selectedRoom.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  </div>
                </div>
                <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
                  <CardContent className="p-8">
                    <h3 className={`text-xl font-bold mb-4 text-[var(--accent-brown)] ${aclonica.className}`}>Description</h3>
                    <p className="text-[var(--text-secondary)] leading-relaxed text-lg">{selectedRoom.description}</p>
                  </CardContent>
                </Card>
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
                  <RoomChat roomId={selectedRoom.id} isOwner={selectedRoom.creatorId === userId} />
                </div>
              </div>

              <div className="space-y-6">
                <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
                  <CardHeader>
                    <CardTitle className={`flex items-center gap-2 text-[var(--accent-brown)] ${aclonica.className}`}>
                      <Gamepad2 className="h-5 w-5" /> Informations
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

                <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl overflow-hidden">
                  <CardHeader><CardTitle className={`text-[var(--accent-brown)] ${aclonica.className}`}>Actions</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <Button onClick={() => handleJoin(selectedRoom)} className="w-full gap-2 h-12 bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] border-none font-bold shadow-[0_0_20px_rgba(192,160,128,0.2)]" size="lg">
                      <Play className="h-4 w-4" /> Rejoindre la partie
                    </Button>
                    {selectedRoom.creatorId === userId && (
                      <Button variant="outline" onClick={() => router.push(`/creer`)} className="w-full h-12 gap-2 border-[var(--border-color)] text-[var(--text-primary)] hover:bg-white/10 font-bold">
                        <Settings className="h-4 w-4" /> Gérer la salle
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
                  <RoomSessions roomId={selectedRoom.id} isOwner={selectedRoom.creatorId === userId} />
                </div>

                {creatorInfo && (
                  <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl">
                    <CardHeader><CardTitle className={`text-[var(--accent-brown)] ${aclonica.className}`}>Créateur</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <img src={creatorInfo.pp} alt={creatorInfo.name} className="w-14 h-14 rounded-full border-2 border-[var(--accent-brown)]/30 shadow-md" />
                          <div className="absolute -inset-0.5 rounded-full bg-[var(--accent-brown)]/20 blur-sm -z-10" />
                        </div>
                        <div>
                          <p className="font-bold text-[var(--text-primary)] text-lg">{creatorInfo.name}</p>
                          <p className="text-sm text-[var(--accent-brown)] font-medium">Maître de jeu</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden">
                  <RoomUsersManager roomId={selectedRoom.id} isOwner={selectedRoom.creatorId === userId} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppBackground>
    )
  }

  // ─── Main view (join / browse) ───
  return (
    <AppBackground className="text-[var(--text-primary)] font-body">
      {/* Multiple ambient glows */}
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

        {/* ── Split layout: Code left / Campaigns right ── */}
        <div className="container mx-auto px-6 pt-28 pb-24 min-h-[calc(100vh-4rem)]">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-[380px_1fr] gap-10 items-start">

            {/* ── Left panel: Join with code ── */}
            <div className="lg:sticky lg:top-28 space-y-10">
              <div className="space-y-6">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent-brown)]/70">
                  Rejoindre une aventure
                </p>
                <h1 className={`text-4xl lg:text-5xl font-bold gold-text-gradient leading-tight ${aclonica.className}`}>
                  Entrez dans<br />l&apos;arène
                </h1>
                <p className="text-[var(--text-secondary)] text-base leading-relaxed">
                  Saisissez votre code d&apos;invitation pour retrouver vos compagnons d&apos;aventure
                </p>
              </div>

              {/* Code input */}
              <div className="space-y-4">
                <Input
                  type="text"
                  placeholder="Code de campagne"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom(roomCode)}
                  maxLength={6}
                  className="text-xl font-mono tracking-[0.3em] text-center h-14 bg-[var(--bg-card)]/60 backdrop-blur-md border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] focus:shadow-[0_0_30px_rgba(192,160,128,0.15)] transition-all rounded-xl"
                />
                <Button
                  onClick={() => handleJoinRoom(roomCode)}
                  size="lg"
                  className="w-full h-13 gap-3 bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] text-base font-bold border-none shadow-[0_4px_25px_rgba(192,160,128,0.3)] hover:shadow-[0_4px_35px_rgba(192,160,128,0.5)] transition-all rounded-xl"
                >
                  Rejoindre <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Divider ornament */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-[var(--accent-brown)]/30 to-transparent" />
              </div>
            </div>

            {/* ── Right panel: Live campaigns grid ── */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[var(--accent-brown)]/10 border border-[var(--accent-brown)]/20">
                    <Globe className="h-5 w-5 text-[var(--accent-brown)]" />
                  </div>
                  <div>
                    <h2 className={`text-2xl font-bold text-[var(--text-primary)] ${aclonica.className}`}>Campagnes en ligne</h2>
                    <p className="text-sm text-[var(--text-secondary)]">{availablePublicRooms.length} partie{availablePublicRooms.length !== 1 ? 's' : ''} disponible{availablePublicRooms.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>

              {availablePublicRooms.length > 0 ? (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {availablePublicRooms.map((room) => (
                    <div
                      key={room.id}
                      onClick={() => handleJoinRoom(room.id)}
                      className="group cursor-pointer relative rounded-2xl overflow-hidden border border-[var(--border-color)] bg-[var(--bg-card)]/60 backdrop-blur-sm hover:border-[var(--accent-brown)]/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(192,160,128,0.08)]"
                    >
                      {/* Room image */}
                      <div className="aspect-[16/10] overflow-hidden bg-[var(--bg-dark)] relative">
                        {room.imageUrl ? (
                          <img src={room.imageUrl} alt={room.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--bg-dark)] to-[var(--bg-card)]">
                            <Gamepad2 className="h-12 w-12 text-[var(--accent-brown)]/20" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        {/* Player count badge */}
                        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-xs font-bold text-white flex items-center gap-1.5">
                          <Users className="h-3 w-3" />
                          {room.occupantsCount || 0}/{room.maxPlayers}
                        </div>
                        {/* Live indicator */}
                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-green-500/20 backdrop-blur-sm border border-green-500/30 text-xs font-bold text-green-400 flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          En ligne
                        </div>
                      </div>

                      {/* Room info */}
                      <div className="p-4 space-y-2">
                        <h3 className="font-bold text-base text-[var(--text-primary)] group-hover:text-[var(--accent-brown)] transition-colors line-clamp-1">
                          {room.title}
                        </h3>
                        <div className="flex items-center justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs border-[var(--border-color)] hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)] font-bold transition-all h-8"
                          >
                            Rejoindre <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-24 space-y-6 border border-dashed border-[var(--border-color)] rounded-2xl">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-[var(--accent-brown)]/5 border border-[var(--accent-brown)]/10 flex items-center justify-center">
                    <Globe className="h-10 w-10 text-[var(--text-secondary)] opacity-30" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[var(--text-primary)] font-bold text-lg">Aucune campagne publique</p>
                    <p className="text-[var(--text-secondary)] text-sm max-w-sm mx-auto">
                      Il n&apos;y a pas de campagne publique pour le moment. Utilisez un code d&apos;invitation pour rejoindre une partie privée.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppBackground>
  )
}
