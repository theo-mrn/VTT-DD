'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Crown, ChevronRight, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { db, getDocs, collection, doc, setDoc } from '@/lib/firebase'
import { useGame } from '@/contexts/GameContext'

interface Character {
  id: string;
  Nomperso: string;
  imageURL?: string;
  type?: string;
  Race?: string;
  Profile?: string;
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 50, damping: 15 } }
}

const hoverEffect = {
  scale: 1.05,
  transition: { duration: 0.3 }
}

export default function CharacterSelection() {
  const router = useRouter();
  const {
    user,
    isAuthenticated,
    isLoading,
    setIsMJ,
    setPersoId,
    setPlayerData
  } = useGame();

  const [characters, setCharacters] = useState<Character[]>([])
  const [charactersLoading, setCharactersLoading] = useState(true) // Start true for smoother load
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)

  // Load Characters
  const loadCharacters = useCallback(async (uid: string, roomId: string) => {
    setCharactersLoading(true)
    try {
      const charactersCollection = collection(db, `cartes/${roomId}/characters`)
      const charactersSnapshot = await getDocs(charactersCollection)

      const charactersData: Character[] = charactersSnapshot.docs
        .map(doc => ({
          id: doc.id,
          Nomperso: doc.data().Nomperso || 'Nom non défini',
          ...doc.data()
        } as Character))
        .filter(character => character.type === "joueurs")

      setCharacters(charactersData)
    } catch (error) {
      console.error("Error loading characters:", error)
      setCharacters([])
    } finally {
      // Small delay for smooth transition even if fast
      setTimeout(() => setCharactersLoading(false), 500)
    }
  }, [])

  useEffect(() => {
    if (user?.uid && user?.roomId && user.roomId !== '0') {
      loadCharacters(user.uid, user.roomId)
    } else if (user && (!user.roomId || user.roomId === '0')) {
      setCharacters([])
      setCharactersLoading(false)
    }
  }, [user, loadCharacters])

  // Actions
  const saveSelectedCharacter = useCallback(async (character: Character) => {
    if (!character.Nomperso || !character.id || !user) return

    setSelectedCharId(character.id) // Trigger loading state on card

    try {
      setPersoId(character.id);
      setPlayerData(character);

      const userRef = doc(db, 'users', user.uid)
      await setDoc(userRef, {
        perso: character.Nomperso,
        persoId: character.id,
        role: null
      }, { merge: true })

      if (user.roomId) {
        const roomRef = doc(db, `salles/${user.roomId}/Noms/${user.uid}`)
        await setDoc(roomRef, { nom: character.Nomperso }, { merge: true })
      }

      router.push(`/${user.roomId}/map`);
    } catch (error) {
      console.error("Error saving selected character:", error)
      setSelectedCharId(null)
    }
  }, [user, setPersoId, setPlayerData, router])

  const startAsMJ = useCallback(async () => {
    if (!user) return
    try {
      setIsMJ(true);
      setPersoId(null);
      setPlayerData(null);

      const userRef = doc(db, 'users', user.uid)
      await setDoc(userRef, {
        perso: 'MJ',
        role: 'MJ',
        persoId: null
      }, { merge: true })

      if (user.roomId) {
        const roomRef = doc(db, `salles/${user.roomId}/Noms/${user.uid}`)
        await setDoc(roomRef, { nom: 'MJ' }, { merge: true })
      }

      router.push(`/${user.roomId}/map`);
    } catch (error) {
      console.error("Error setting MJ role:", error)
    }
  }, [user, setIsMJ, setPersoId, setPlayerData, router])

  // Filtering
  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters
    return characters.filter(character =>
      character.Nomperso.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [characters, searchQuery])

  // Loading Screen
  if (isLoading || !isAuthenticated) {
    return (
      <div className="relative w-full h-screen flex flex-col items-center justify-center bg-[#0a0a0a] overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent z-10" />
          {/* Background Image fallback or nice gradient */}
          <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-800 via-black to-black" />
        </div>
        <div className="z-10 flex flex-col items-center gap-4">
          {/* Spinner */}
          <div className="w-16 h-16 border-4 border-[#c0a080]/30 border-t-[#c0a080] rounded-full animate-spin" />
          <p className="text-[#c0a080] font-serif text-xl tracking-widest animate-pulse">
            {isLoading ? "CHARGEMENT DES ARCHIVES..." : "AUTHENTIFICATION REQUISE"}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full bg-[#050505] text-white overflow-x-hidden font-sans selection:bg-[#c0a080] selection:text-black">

      {/* Cinematic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40 scale-105"
          style={{ backgroundImage: "url(../images/index1.webp)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-[#050505]" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 min-h-screen flex flex-col">

        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-center gap-6 mb-12 mt-4">
          <div className="text-center md:text-left">
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#e0c0a0] via-[#c0a080] to-[#8a6a4b]"
              style={{ fontFamily: "'Aclonica', sans-serif" }}
            >
              Destinée
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.7 }}
              className="text-gray-400 mt-2 text-lg font-light tracking-wide"
            >
              Choisissez votre incarnation pour cette aventure
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-4"
          >
            <button
              onClick={startAsMJ}
              className="group relative px-6 py-3 bg-[#1a1a1a] hover:bg-[#252525] border border-[#c0a080]/30 rounded-lg transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 w-0 bg-[#c0a080]/10 transition-all duration-[250ms] ease-out group-hover:w-full" />
              <div className="flex items-center gap-3 relative z-10">
                <Crown className="w-5 h-5 text-[#c0a080]" />
                <span className="text-[#e0e0e0] font-medium group-hover:text-white transition-colors">Maître du Jeu</span>
              </div>
            </button>
          </motion.div>
        </header>



        {/* Content Area */}
        {charactersLoading ? (
          <div className="flex-1 flex justify-center items-center pb-20">
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-[#c0a080] animate-spin mb-4" />
              <p className="text-gray-400 animate-pulse">Invocation des héros...</p>
            </div>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="flex flex-wrap justify-center gap-6 pb-12 w-full max-w-[95vw] mx-auto"
          >
            {/* New Character Card */}
            <motion.a
              variants={cardVariants}
              href="/creation"
              className="group relative h-[500px] w-24 sm:w-32 hover:w-80 md:hover:w-96 rounded-[40px] border-2 border-dashed border-[#c0a080]/30 hover:border-[#c0a080]/80 bg-white/5 hover:bg-white/10 transition-all duration-500 ease-out flex flex-col items-center justify-center cursor-pointer overflow-hidden backdrop-blur-sm"
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 group-hover:opacity-0">
                <Plus className="w-8 h-8 text-[#c0a080]" />
                <span className="text-[#c0a080]/50 text-xs font-bold uppercase tracking-widest rotate-[-90deg] mt-16 whitespace-nowrap">Créer un héros</span>
              </div>

              <div className="opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100 flex flex-col items-center min-w-[300px]">
                <div className="bg-[#c0a080]/10 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Plus className="w-10 h-10 text-[#c0a080]" />
                </div>
                <h3 className="text-xl font-bold text-[#c0a080] group-hover:text-white transition-colors">Créer un Héros</h3>
                <p className="text-gray-500 mt-2 text-sm max-w-[200px] text-center group-hover:text-gray-300 transition-colors">
                  Façonnez une nouvelle légende pour parcourir ce monde.
                </p>
              </div>

              {/* Decorative glow effect */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#c0a080]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </motion.a>

            {/* Existing Characters */}
            {filteredCharacters.map((character) => (
              <motion.div
                key={character.id}
                variants={cardVariants}
                className="group relative h-[500px] w-24 sm:w-32 hover:w-80 md:hover:w-96 rounded-[40px] overflow-hidden cursor-pointer shadow-2xl border border-white/5 hover:border-[#c0a080]/50 transition-all duration-500 ease-out bg-[#121212]"
                onClick={() => !selectedCharId && saveSelectedCharacter(character)}
              >
                {/* Background Image */}
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-110"
                  style={{ backgroundImage: `url(${character.imageURL || 'default-avatar.png'})` }}
                >
                  {/* Dark Gradient Overlay - Always visible but stronger at bottom */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-100" />
                </div>

                {/* Vertical Text (Collapsed State) */}
                <div className="absolute inset-0 flex items-end justify-center pb-8 group-hover:opacity-0 transition-opacity duration-300">
                  <h3 className="text-xl font-bold text-white/80 tracking-widest uppercase rotate-[-90deg] whitespace-nowrap origin-bottom translate-y-[-40px]" style={{ fontFamily: "'Aclonica', sans-serif" }}>
                    {character.Nomperso}
                  </h3>
                </div>

                {/* Content Overlay (Expanded State) */}
                <div className="absolute inset-0 p-8 flex flex-col justify-end z-10 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100 min-w-[300px]">



                  {/* Text Content */}
                  <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                    <h3 className="text-3xl font-bold text-white mb-2 group-hover:text-[#c0a080] transition-colors" style={{ fontFamily: "'Aclonica', sans-serif" }}>
                      {character.Nomperso}
                    </h3>
                    <div className="h-1 w-12 bg-[#c0a080] mb-4 group-hover:w-24 transition-all duration-700 ease-out" />

                    <p className="text-[#c0a080] text-sm font-medium uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-200 mb-6">
                      {character.Race || 'Inconnu'} • {character.Profile || 'Aventurier'}
                    </p>

                    <button className="w-full py-4 bg-[#c0a080] text-black font-bold rounded-xl opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 delay-300 flex items-center justify-center gap-3 hover:bg-[#d4b48f] hover:shadow-[0_0_20px_rgba(192,160,128,0.4)]">
                      {selectedCharId === character.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <span className="uppercase tracking-wide text-sm">Sélectionner</span>
                          <ChevronRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Loading / Selection Overlay */}
                <AnimatePresence>
                  {selectedCharId === character.id && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center"
                    >
                      <Loader2 className="w-12 h-12 text-[#c0a080] animate-spin mb-4" />
                      <span className="text-[#c0a080] font-medium tracking-wider animate-pulse">LIAISON DE L'ÂME...</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
