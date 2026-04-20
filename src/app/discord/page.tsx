'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { setupDiscord, isDiscordActivity } from '@/lib/discord'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRight, Loader2, Link2, Gamepad2 } from 'lucide-react'
import { toast } from 'sonner'

interface Room {
  id: string
  title: string
  imageUrl?: string
  discordChannelId?: string
  creatorId?: string
}

type Step = 'auth-choice' | 'email-login' | 'room-choice' | 'existing-rooms' | 'create-room'

function DiscordActivityContent() {
  const [step, setStep] = useState<Step>('auth-choice')
  const [loading, setLoading] = useState(false)
  const [discordAuthLoading, setDiscordAuthLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userInfo, setUserInfo] = useState<{ name: string; isDiscord: boolean } | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userRooms, setUserRooms] = useState<Room[]>([])
  const [discordRoom, setDiscordRoom] = useState<Room | null>(null)
  const [linkingRoom, setLinkingRoom] = useState<string | null>(null)
  const [newRoomTitle, setNewRoomTitle] = useState('')
  const [newRoomMax, setNewRoomMax] = useState(4)
  const router = useRouter()
  const searchParams = useSearchParams()
  const channelId = searchParams.get('channel_id')

  const handleDiscordLogin = async () => {
    setDiscordAuthLoading(true)
    try {
      const { access_token } = await setupDiscord()
      const res = await fetch('/api/discord/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token }),
      })
      const { uid, user } = await res.json()
      if (!uid) throw new Error('No uid')
      setUserId(uid)
      setUserInfo({ name: user?.name || uid, isDiscord: true })
      setStep('room-choice')
    } catch {
      toast.error("Connexion Discord échouée")
    } finally {
      setDiscordAuthLoading(false)
    }
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/discord/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const { uid, error } = await res.json()
      if (error) { toast.error(error); return }
      setUserId(uid)
      setUserInfo({ name: email, isDiscord: false })
      setStep('room-choice')
    } catch {
      toast.error("Erreur de connexion")
    } finally {
      setLoading(false)
    }
  }

  const loadRooms = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/discord/rooms${channelId ? `?channel_id=${channelId}` : ''}`)
      const { discordRoom: dr, rooms } = await res.json()
      if (dr) setDiscordRoom(dr)
      setUserRooms(rooms || [])
    } catch {
      toast.error("Erreur lors du chargement des salles")
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRoom = async (roomId: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/discord/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      })
      const { error } = await res.json()
      if (error) { toast.error(error); setLoading(false); return }
      router.push(`/personnages`)
    } catch {
      toast.error("Erreur lors de la connexion")
      setLoading(false)
    }
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomTitle.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/discord/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newRoomTitle, maxPlayers: newRoomMax, channelId }),
      })
      const { error } = await res.json()
      if (error) { toast.error(error); setLoading(false); return }
      router.push(`/personnages`)
    } catch {
      toast.error("Erreur lors de la création")
      setLoading(false)
    }
  }

  const handleLinkChannel = async (roomId: string) => {
    if (!channelId) { toast.error("Aucun channel Discord détecté"); return }
    setLinkingRoom(roomId)
    try {
      const res = await fetch('/api/discord/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, linkChannelId: channelId }),
      })
      const { error } = await res.json()
      if (error) { toast.error(error); return }
      toast.success("Salle liée à ce channel !")
      setDiscordRoom(userRooms.find(r => r.id === roomId) || null)
    } catch {
      toast.error("Erreur lors de la liaison")
    } finally {
      setLinkingRoom(null)
    }
  }

  // ── Étape 1 : Choix auth ──
  if (step === 'auth-choice') {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-3xl font-bold text-[var(--accent-brown)]">Yner Activity</h1>
        <p className="text-[var(--text-secondary)] text-sm text-center mb-4">Comment veux-tu te connecter ?</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {isDiscordActivity() && (
            <Button onClick={handleDiscordLogin} disabled={discordAuthLoading} size="lg" className="gap-2">
              {discordAuthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '🎮'}
              Continuer avec Discord
            </Button>
          )}
          <Button onClick={() => setStep('email-login')} variant="outline" size="lg" className="gap-2">
            <ArrowRight className="h-4 w-4" /> J&apos;ai un compte Yner
          </Button>
        </div>
      </div>
    )
  }

  // ── Étape 2 : Login email ──
  if (step === 'email-login') {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-3xl font-bold text-[var(--accent-brown)]">Connexion</h1>
        <form onSubmit={handleEmailLogin} className="flex flex-col gap-4 w-full max-w-sm">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12" />
          <Input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-12" />
          <Button type="submit" disabled={loading} size="lg" className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Se connecter
          </Button>
        </form>
        <button onClick={() => setStep('auth-choice')} className="text-sm text-[var(--text-secondary)] underline">Retour</button>
      </div>
    )
  }

  // ── Étape 3 : Choix salle ──
  if (step === 'room-choice') {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-3xl font-bold text-[var(--accent-brown)]">Rejoindre une partie</h1>
        {userInfo && (
          <p className="text-xs text-[var(--text-secondary)] bg-white/5 px-3 py-1 rounded-full mb-2">
            {userInfo.isDiscord ? '🎮 Discord' : '📧 Email'} — {userInfo.name}
          </p>
        )}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={() => setStep('create-room')} size="lg" className="gap-2">
            <ArrowRight className="h-4 w-4" /> Créer une nouvelle partie
          </Button>
          <Button onClick={async () => { await loadRooms(); setStep('existing-rooms') }} size="lg" variant="outline" className="gap-2">
            <Gamepad2 className="h-4 w-4" /> Rejoindre une salle existante
          </Button>
        </div>
        <button onClick={() => setStep('auth-choice')} className="text-sm text-[var(--text-secondary)] underline mt-4">
          Changer de compte
        </button>
      </div>
    )
  }

  // ── Étape 4 : Liste des salles ──
  if (step === 'existing-rooms') {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] flex flex-col items-center justify-start gap-6 p-6 pt-10">
        <h1 className="text-2xl font-bold text-[var(--accent-brown)]">Mes salles</h1>
        {loading && <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-brown)]" />}

        {discordRoom && (
          <div className="w-full max-w-sm">
            <p className="text-xs text-[var(--text-secondary)] uppercase tracking-widest mb-2">Partie Discord active</p>
            <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--accent-brown)]/40 bg-[var(--accent-brown)]/5">
              <span className="font-bold text-[var(--text-primary)]">{discordRoom.title}</span>
              <Button size="sm" onClick={() => handleJoinRoom(discordRoom.id)} disabled={loading} className="gap-1">
                <ArrowRight className="h-3 w-3" /> Rejoindre
              </Button>
            </div>
          </div>
        )}

        {userRooms.length > 0 && (
          <div className="w-full max-w-sm flex flex-col gap-2">
            {userRooms.map(room => (
              <div key={room.id} className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/60">
                <div className="flex items-center gap-3">
                  {room.imageUrl && !room.imageUrl.includes('firebasestorage.googleapis.com')
                    ? <img src={room.imageUrl} className="w-10 h-10 rounded-lg object-cover" alt="" />
                    : <div className="w-10 h-10 rounded-lg bg-[var(--accent-brown)]/10 flex items-center justify-center"><Gamepad2 className="h-5 w-5 text-[var(--accent-brown)]/40" /></div>
                  }
                  <span className="font-medium text-[var(--text-primary)] text-sm">{room.title}</span>
                </div>
                <div className="flex gap-2">
                  {room.creatorId === userId && channelId && room.discordChannelId !== channelId && (
                    <Button size="sm" variant="outline" onClick={() => handleLinkChannel(room.id)} disabled={linkingRoom === room.id} className="gap-1 text-xs">
                      {linkingRoom === room.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                      Lier
                    </Button>
                  )}
                  <Button size="sm" onClick={() => handleJoinRoom(room.id)} disabled={loading}>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && userRooms.length === 0 && !discordRoom && (
          <p className="text-[var(--text-secondary)] text-sm text-center">Aucune salle disponible.<br />Demande le code à ton MJ.</p>
        )}

        <button onClick={() => setStep('room-choice')} className="text-sm text-[var(--text-secondary)] underline">Retour</button>
      </div>
    )
  }

  // ── Étape : Créer une nouvelle salle ──
  if (step === 'create-room') {
    return (
      <div className="min-h-screen bg-[var(--bg-dark)] flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-2xl font-bold text-[var(--accent-brown)]">Nouvelle partie</h1>
        <form onSubmit={handleCreateRoom} className="flex flex-col gap-4 w-full max-w-sm">
          <Input placeholder="Nom de la partie" value={newRoomTitle} onChange={(e) => setNewRoomTitle(e.target.value)} required className="h-12" />
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--text-secondary)] whitespace-nowrap">Joueurs max</label>
            <Input type="number" min={1} max={12} value={newRoomMax} onChange={(e) => setNewRoomMax(parseInt(e.target.value))} className="h-12" />
          </div>
          <Button type="submit" disabled={loading || !newRoomTitle.trim()} size="lg" className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Créer et rejoindre
          </Button>
        </form>
        <button onClick={() => setStep('room-choice')} className="text-sm text-[var(--text-secondary)] underline">Retour</button>
      </div>
    )
  }

  return null
}

export default function DiscordActivityPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg-dark)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-brown)]" />
      </div>
    }>
      <DiscordActivityContent />
    </Suspense>
  )
}
