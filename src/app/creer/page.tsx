'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Plus } from 'lucide-react'
import { auth, db, doc, getDoc, setDoc, storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { onAuthStateChanged } from 'firebase/auth'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
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

export default function CreerPageComponent() {
  const [newRoom, setNewRoom] = useState<Omit<Room, 'id' | 'imageUrl'>>({
    title: '',
    description: '',
    maxPlayers: 4,
    isPublic: false,
    allowCharacterCreation: true,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
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

  const generateRoomCode = async (): Promise<string> => {
    let code: string = ""
    let exists = true

    while (exists) {
      code = Math.floor(100000 + Math.random() * 900000).toString()
      const docRef = doc(db, 'Salle', code)
      const docSnap = await getDoc(docRef)
      exists = docSnap.exists()
    }

    return code
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) {
      toast.error("Vous devez être connecté")
      return
    }

    if (!imageFile) {
      toast.error("Veuillez sélectionner une image")
      return
    }

    try {
      const code = await generateRoomCode()
      let imageUrl = ''

      if (imageFile) {
        const imageRef = ref(storage, `Salle/${code}/room-image`)
        await uploadBytes(imageRef, imageFile)
        imageUrl = await getDownloadURL(imageRef)
      }

      const roomData = { ...newRoom, imageUrl, creatorId: userId }
      await setDoc(doc(db, 'Salle', code), roomData)

      const userRoomRef = doc(db, `users/${userId}`)
      await setDoc(userRoomRef, { room_id: code }, { merge: true })
      await setDoc(doc(db, `users/${userId}/rooms`, code), { id: code })

      setNewRoom({ title: '', description: '', maxPlayers: 4, isPublic: false, allowCharacterCreation: true })
      setImageFile(null)

      toast.success("Salle créée avec succès !")
      router.push(`/personnages`)
    } catch (error) {
      console.error("Error creating room:", error)
      toast.error("Erreur lors de la création de la salle")
    }
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

        <div className="container mx-auto px-6 py-8 pt-32 pb-24">
          <div className="max-w-3xl mx-auto space-y-12">
            <div className="space-y-2 text-center md:text-left">
              <h1 className={`text-4xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>Créer une campagne</h1>
              <p className="text-[var(--text-secondary)] text-lg">Configurez votre partie et invitez vos joueurs</p>
            </div>

            <Card className="border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-brown)]/5 to-transparent pointer-events-none" />

              <CardHeader className="relative z-10 pb-0">
                <CardTitle className={`text-2xl font-bold flex items-center gap-3 text-[var(--accent-brown)] ${aclonica.className}`}>
                  <Plus className="h-6 w-6" />
                  Nouvelle partie
                </CardTitle>
              </CardHeader>

              <CardContent className="relative z-10 p-8 pt-6">
                <form onSubmit={handleCreateRoom} className="space-y-8">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label htmlFor="title" className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] ml-1">Titre de la campagne *</label>
                      <Input
                        type="text"
                        id="title"
                        name="title"
                        value={newRoom.title}
                        onChange={handleInputChange}
                        placeholder="Ex: Le Secret des Anciens"
                        required
                        className="h-12 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="maxPlayers" className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] ml-1">Nombre de joueurs *</label>
                      <Input
                        type="number"
                        id="maxPlayers"
                        name="maxPlayers"
                        value={newRoom.maxPlayers}
                        onChange={handleInputChange}
                        min="1"
                        max="12"
                        required
                        className="h-12 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="description" className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] ml-1">Description *</label>
                    <Textarea
                      id="description"
                      name="description"
                      value={newRoom.description}
                      onChange={handleInputChange}
                      placeholder="Décrivez votre aventure, l'ambiance, les prérequis..."
                      rows={4}
                      required
                      className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] transition-all resize-none p-4"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="image" className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] ml-1">Image de couverture *</label>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[var(--border-color)] rounded-xl cursor-pointer hover:bg-[var(--bg-darker)]/40 hover:border-[var(--accent-brown)] transition-all bg-[var(--bg-dark)]/50 group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Plus className="w-8 h-8 text-[var(--text-secondary)] group-hover:text-[var(--accent-brown)] mb-2 transition-colors" />
                        <p className="text-sm text-[var(--text-secondary)]">
                          {imageFile ? imageFile.name : "Cliquez pour uploader une image"}
                        </p>
                      </div>
                      <input type="file" id="image" className="hidden" onChange={handleFileChange} accept="image/*" required />
                    </label>
                  </div>

                  <div className="grid gap-4">
                    <div className="flex items-center justify-between p-5 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-xl">
                      <div className="space-y-1">
                        <label className="font-bold text-[var(--text-primary)]">Rendre la salle publique</label>
                        <p className="text-xs text-[var(--text-secondary)] opacity-80">
                          Apparaîtra dans la liste des campagnes ouvertes
                        </p>
                      </div>
                      <Switch
                        id="isPublic"
                        checked={newRoom.isPublic}
                        onCheckedChange={handleToggleChange}
                      />
                    </div>

                    <div className="flex items-center justify-between p-5 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-xl">
                      <div className="space-y-1">
                        <label className="font-bold text-[var(--text-primary)]">Autoriser la création libre</label>
                        <p className="text-xs text-[var(--text-secondary)] opacity-80">
                          Les joueurs peuvent créer un personnage en rejoignant
                        </p>
                      </div>
                      <Switch
                        id="allowCharacterCreation"
                        checked={newRoom.allowCharacterCreation}
                        onCheckedChange={handleToggleCreationChange}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full h-14 gap-3 bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] text-lg font-bold border-none shadow-xl transition-all">
                    <Plus className="h-5 w-5" />
                    Créer la campagne
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
