'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Plus, ImagePlus, Users, Globe, Sparkles, ArrowRight, Gamepad2 } from 'lucide-react'
import { auth, db, doc, getDoc, setDoc, storage } from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { onAuthStateChanged } from 'firebase/auth'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { AppBackground } from '@/components/ui/background-components'
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

  const imagePreview = useMemo(() => {
    if (!imageFile) return null
    return URL.createObjectURL(imageFile)
  }, [imageFile])

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

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

        {/* ── Split layout: Info left / Form right ── */}
        <div className="container mx-auto px-6 pt-28 pb-24 min-h-[calc(100vh-4rem)]">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-[380px_1fr] gap-10 items-start">

            {/* ── Left panel: Title + Preview ── */}
            <div className="lg:sticky lg:top-28 space-y-10">
              <div className="space-y-6">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent-brown)]/70">
                  Nouvelle campagne
                </p>
                <h1 className={`text-4xl lg:text-5xl font-bold gold-text-gradient leading-tight ${aclonica.className}`}>
                  Forgez votre<br />aventure
                </h1>
                <p className="text-[var(--text-secondary)] text-base leading-relaxed">
                  Configurez votre campagne et invitez vos joueurs a rejoindre la quete
                </p>
              </div>

              {/* Live preview card */}
              <div className="rounded-2xl overflow-hidden border border-[var(--border-color)] bg-[var(--bg-card)]/60 backdrop-blur-sm">
                <div className="aspect-[16/10] overflow-hidden bg-[var(--bg-dark)] relative">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--bg-dark)] to-[var(--bg-card)]">
                      <Gamepad2 className="h-12 w-12 text-[var(--accent-brown)]/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 text-xs font-bold text-white flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    0/{newRoom.maxPlayers}
                  </div>
                  {newRoom.isPublic && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-green-500/20 backdrop-blur-sm border border-green-500/30 text-xs font-bold text-green-400 flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      Publique
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-1">
                  <h3 className="font-bold text-base text-[var(--text-primary)] line-clamp-1">
                    {newRoom.title || 'Titre de la campagne'}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                    {newRoom.description || 'La description apparaîtra ici...'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-[var(--accent-brown)]/30 to-transparent" />
              </div>
            </div>

            {/* ── Right panel: Form ── */}
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[var(--accent-brown)]/10 border border-[var(--accent-brown)]/20">
                  <Plus className="h-5 w-5 text-[var(--accent-brown)]" />
                </div>
                <h2 className={`text-2xl font-bold text-[var(--text-primary)] ${aclonica.className}`}>Configuration</h2>
              </div>

              <form onSubmit={handleCreateRoom} className="space-y-6">
                {/* Title + Players */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="title" className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] ml-1">Titre *</label>
                    <Input
                      type="text"
                      id="title"
                      name="title"
                      value={newRoom.title}
                      onChange={handleInputChange}
                      placeholder="Le Secret des Anciens"
                      required
                      className="h-12 bg-[var(--bg-card)]/60 backdrop-blur-sm border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] focus:shadow-[0_0_15px_rgba(192,160,128,0.1)] transition-all rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="maxPlayers" className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] ml-1">Joueurs max *</label>
                    <Input
                      type="number"
                      id="maxPlayers"
                      name="maxPlayers"
                      value={newRoom.maxPlayers}
                      onChange={handleInputChange}
                      min="1"
                      max="12"
                      required
                      className="h-12 bg-[var(--bg-card)]/60 backdrop-blur-sm border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] focus:shadow-[0_0_15px_rgba(192,160,128,0.1)] transition-all rounded-xl"
                    />
                  </div>
                </div>

                {/* Description */}
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
                    className="bg-[var(--bg-card)]/60 backdrop-blur-sm border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] focus:shadow-[0_0_15px_rgba(192,160,128,0.1)] transition-all resize-none p-4 rounded-xl"
                  />
                </div>

                {/* Image upload */}
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)] ml-1">Image de couverture *</label>
                  <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-[var(--border-color)] rounded-xl cursor-pointer hover:border-[var(--accent-brown)] hover:bg-[var(--accent-brown)]/5 transition-all bg-[var(--bg-card)]/30 backdrop-blur-sm group">
                    <div className="flex items-center gap-3">
                      <ImagePlus className="w-6 h-6 text-[var(--text-secondary)] group-hover:text-[var(--accent-brown)] transition-colors" />
                      <p className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                        {imageFile ? imageFile.name : "Cliquez pour uploader une image"}
                      </p>
                    </div>
                    <input type="file" className="hidden" onChange={handleFileChange} accept="image/*" required />
                  </label>
                </div>

                {/* Toggles */}
                <div className="grid gap-3">
                  <div className="flex items-center justify-between p-4 bg-[var(--bg-card)]/40 backdrop-blur-sm border border-[var(--border-color)] rounded-xl hover:border-[var(--accent-brown)]/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-[var(--accent-brown)]/10">
                        <Globe className="h-4 w-4 text-[var(--accent-brown)]" />
                      </div>
                      <div className="space-y-0.5">
                        <label className="font-bold text-sm text-[var(--text-primary)]">Campagne publique</label>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Visible dans les campagnes en ligne
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="isPublic"
                      checked={newRoom.isPublic}
                      onCheckedChange={handleToggleChange}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[var(--bg-card)]/40 backdrop-blur-sm border border-[var(--border-color)] rounded-xl hover:border-[var(--accent-brown)]/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-[var(--accent-brown)]/10">
                        <Sparkles className="h-4 w-4 text-[var(--accent-brown)]" />
                      </div>
                      <div className="space-y-0.5">
                        <label className="font-bold text-sm text-[var(--text-primary)]">Création libre</label>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Les joueurs peuvent créer un personnage
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="allowCharacterCreation"
                      checked={newRoom.allowCharacterCreation}
                      onCheckedChange={handleToggleCreationChange}
                    />
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full h-14 gap-3 bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] text-lg font-bold border-none shadow-[0_4px_25px_rgba(192,160,128,0.3)] hover:shadow-[0_4px_35px_rgba(192,160,128,0.5)] transition-all rounded-xl"
                >
                  Créer la campagne <ArrowRight className="h-5 w-5" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppBackground>
  )
}
