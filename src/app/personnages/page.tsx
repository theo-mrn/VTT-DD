'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Crown, Loader2, LogIn, CircleCheck, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { db, getDocs, collection, doc, setDoc, getDoc, onSnapshot } from '@/lib/firebase'
import { useGame } from '@/contexts/GameContext'
import { cn } from '@/lib/utils'
import { AppBackground } from '@/components/ui/background-components'
import { ProfileCard } from '@/components/ui/profile-card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

interface Character {
  id: string;
  Nomperso: string;
  imageURL?: string;
  type?: string;
  Race?: string;
  Profile?: string;
}

interface RoomData {
  allowCharacterCreation?: boolean;
  creatorId?: string;
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
  const [takenCharacters, setTakenCharacters] = useState<Record<string, { name: string, uid: string, pp?: string, titre?: string, imageURL?: string, bio?: string, timeSpent?: number, borderType?: "none" | "blue" | "orange" | "magic" | "magic_purple" | "magic_green" | "magic_red" | "magic_double" | "magic_shine" | "magic_shine_aurora" | "magic_shine_solar" | "magic_shine_twilight" }>>({})
  const [charactersLoading, setCharactersLoading] = useState(true)
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [mjLoading, setMjLoading] = useState(false)
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [viewingOccupant, setViewingOccupant] = useState<{
    name: string;
    uid: string;
    pp?: string;
    titre?: string;
    imageURL?: string;
    bio?: string;
    timeSpent?: number;
    borderType?: "none" | "blue" | "orange" | "magic" | "magic_purple" | "magic_green" | "magic_red" | "magic_double" | "magic_shine" | "magic_shine_aurora" | "magic_shine_solar" | "magic_shine_twilight";
  } | null>(null)



  useEffect(() => {
    if (user?.uid && user?.roomId && user.roomId !== '0') {
      const roomId = user.roomId;
      setCharactersLoading(true);

      // Fetch current user name
      getDoc(doc(db, 'users', user.uid)).then(snap => {
        if (snap.exists()) {
          setCurrentUserName(snap.data().name || '');
        }
      });

      // Listener for characters
      const charactersCollection = collection(db, `cartes/${roomId}/characters`);
      const unsubscribeChars = onSnapshot(charactersCollection, (snapshot) => {
        const charactersData: Character[] = snapshot.docs
          .map(doc => ({
            id: doc.id,
            Nomperso: doc.data().Nomperso || 'Nom non défini',
            ...doc.data()
          } as Character))
          .filter(character => character.type === "joueurs");

        setCharacters(charactersData);
        setCharactersLoading(false);
      }, (error) => {
        console.error("Error listening to characters:", error);
        setCharactersLoading(false);
      });

      // Fetch room data
      const fetchRoom = async () => {
        try {
          const roomDoc = await getDoc(doc(db, 'Salle', roomId))
          if (roomDoc.exists()) {
            setRoomData(roomDoc.data() as RoomData)
          }
        } catch (e) {
          console.error(e)
        }
      }
      fetchRoom();

      // Listener for taken characters in this room
      const roomNomsCollection = collection(db, `salles/${roomId}/Noms`);
      const unsubscribeNoms = onSnapshot(roomNomsCollection, async (snapshot) => {
        const takenMap: Record<string, { name: string, uid: string, pp?: string, titre?: string, imageURL?: string, bio?: string, timeSpent?: number, borderType?: "none" | "blue" | "orange" | "magic" | "magic_purple" | "magic_green" | "magic_red" | "magic_double" | "magic_shine" | "magic_shine_aurora" | "magic_shine_solar" | "magic_shine_twilight" }> = {};

        const fetchTasks = snapshot.docs.map(async (d) => {
          const data = d.data();
          if (data.nom && data.nom !== 'MJ') {
            try {
              const userDoc = await getDoc(doc(db, 'users', d.id));
              const userData = userDoc.exists() ? userDoc.data() : null;

              takenMap[data.nom] = {
                name: userData?.name || data.userName || "Joueur",
                uid: d.id,
                pp: userData?.pp || "",
                titre: userData?.titre || "",
                imageURL: userData?.imageURL || "",
                bio: userData?.bio || "",
                timeSpent: userData?.timeSpent || 0,
                borderType: userData?.borderType || "none"
              };
            } catch (e) {
              takenMap[data.nom] = { name: data.userName || "Joueur", uid: d.id };
            }
          }
        });

        await Promise.all(fetchTasks);
        setTakenCharacters({ ...takenMap });
      });

      return () => {
        unsubscribeChars();
        unsubscribeNoms();
      };
    } else if (user && (!user.roomId || user.roomId === '0')) {
      setCharacters([]);
      setCharactersLoading(false);
    }
  }, [user?.uid, user?.roomId]);

  // Select character
  const saveSelectedCharacter = useCallback(async (character: Character) => {
    if (!character.Nomperso || !character.id || !user) return
    setSelectedCharId(character.id)
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
        await setDoc(roomRef, {
          nom: character.Nomperso,
          userName: currentUserName || "Joueur"
        }, { merge: true })
      }

      router.push(`/${user.roomId}/map`);
    } catch (error) {
      console.error("Error saving selected character:", error)
      setSelectedCharId(null)
    }
  }, [user, setPersoId, setPlayerData, router])

  // Start as MJ
  const startAsMJ = useCallback(async () => {
    if (!user) return
    setMjLoading(true)
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
      setMjLoading(false)
    }
  }, [user, setIsMJ, setPersoId, setPlayerData, router])

  // ── Loading / Auth screen ──────────────────────────────────────────────────
  if (isLoading || !isAuthenticated) {
    return (
      <AppBackground>
        <div className="w-full h-screen flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-5">
            <div className="w-16 h-16 rounded-full border-4 border-[#c0a080]/20 border-t-[#c0a080] animate-spin" />
            <p className="text-[#c0a080] font-serif text-lg tracking-widest animate-pulse">
              {isLoading ? "CHARGEMENT…" : "AUTHENTIFICATION REQUISE"}
            </p>
          </div>
        </div>
      </AppBackground>
    )
  }

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <AppBackground>
      <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center mb-14"
        >
          <h1
            className="text-4xl md:text-6xl font-bold tracking-tight mb-3"
            style={{
              fontFamily: "'Aclonica', sans-serif",
              background: 'linear-gradient(135deg, #e8d5b7 0%, #c0a080 50%, #8a6a4b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Qui joue&nbsp;?
          </h1>
          <p className="text-zinc-400 text-base md:text-lg font-light tracking-wide">
            Choisissez votre incarnation pour cette aventure
          </p>
        </motion.div>

        {/* Profiles grid */}
        {charactersLoading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-[#c0a080] animate-spin" />
            <p className="text-zinc-500 text-sm animate-pulse">Invocation des héros…</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-wrap justify-center gap-8 md:gap-10"
          >
            {/* Existing character profiles */}
            {characters.map((character, i) => {
              const occupant = takenCharacters[character.Nomperso];
              const isTakenByOther = occupant && occupant.uid !== user?.uid;
              const isTakenByMe = occupant && occupant.uid === user?.uid;

              return (
                <div key={character.id} className="flex flex-col items-center gap-6">
                  <CharacterCard
                    character={character}
                    isSelected={selectedCharId === character.id}
                    isActive={isTakenByMe}
                    isTaken={isTakenByOther}
                    occupantName={occupant?.name}
                    index={i}
                    onClick={() => !selectedCharId && !isTakenByOther && saveSelectedCharacter(character)}
                  />

                  {isTakenByOther && occupant && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                    >
                      <button
                        onClick={() => setViewingOccupant(occupant)}
                        className={cn(
                          "group flex items-center gap-2 px-4 py-2 rounded-full",
                          "bg-[#c0a080]/10 border border-[#c0a080]/20 hover:border-[#c0a080]/50",
                          "transition-all duration-300 backdrop-blur-sm"
                        )}
                      >
                        <User className="w-4 h-4 text-[#c0a080]" />
                        <span className="text-xs font-semibold text-[#e8d5b7] tracking-wide">
                          Voir le profil
                        </span>
                      </button>
                    </motion.div>
                  )}
                </div>
              );
            })}

            {/* Add character card */}
            {(roomData?.allowCharacterCreation !== false || user?.uid === roomData?.creatorId) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: characters.length * 0.06 + 0.1 }}
                className="flex flex-col items-center gap-3 group"
              >
                <a
                  href="/creation"
                  aria-label="Créer un nouveau personnage"
                  className={cn(
                    "relative h-28 w-28 md:h-36 md:w-36 rounded-full",
                    "flex items-center justify-center",
                    "border-2 border-dashed border-zinc-700 hover:border-[#c0a080]",
                    "bg-white/5 hover:bg-white/10",
                    "transition-all duration-300 ease-out hover:-translate-y-2",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c0a080]"
                  )}
                >
                  <Plus className="w-8 h-8 text-zinc-600 group-hover:text-[#c0a080] transition-colors duration-300" />
                  {/* Glow ring on hover */}
                  <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-[0_0_25px_rgba(192,160,128,0.2)]" />
                </a>
                <p className="text-sm text-zinc-500 group-hover:text-[#c0a080] transition-colors duration-200 font-medium">
                  Nouveau héros
                </p>
              </motion.div>
            )}

            {/* MJ card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: (characters.length + 1) * 0.06 + 0.1 }}
              className="flex flex-col items-center gap-3 group"
            >
              <button
                onClick={startAsMJ}
                disabled={mjLoading}
                aria-label="Entrer comme Maître du Jeu"
                className={cn(
                  "relative h-28 w-28 md:h-36 md:w-36 rounded-full",
                  "flex items-center justify-center",
                  "bg-gradient-to-br from-[#1e1810] via-[#2a2010] to-[#1a140a]",
                  "border border-[#c0a080]/30 hover:border-[#c0a080]/80",
                  "transition-all duration-300 ease-out hover:-translate-y-2",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c0a080]",
                  "shadow-lg hover:shadow-[0_0_30px_rgba(192,160,128,0.15)]"
                )}
              >
                {mjLoading ? (
                  <Loader2 className="w-8 h-8 text-[#c0a080] animate-spin" />
                ) : (
                  <Crown className="w-8 h-8 text-[#c0a080] group-hover:text-[#e0c090] transition-colors duration-300" />
                )}
              </button>
              <p className="text-sm text-zinc-500 group-hover:text-[#c0a080] transition-colors duration-200 font-medium">
                Maître du Jeu
              </p>
            </motion.div>

          </motion.div>
        )}

        {/* Profile Dialog */}
        <Dialog open={!!viewingOccupant} onOpenChange={(open) => !open && setViewingOccupant(null)}>
          <DialogContent unstyled className="sm:max-w-md p-0 bg-transparent border-none">
            <DialogHeader className="sr-only">
              <DialogTitle>Profil de {viewingOccupant?.name}</DialogTitle>
              <DialogDescription>Détails du profil du joueur</DialogDescription>
            </DialogHeader>
            {viewingOccupant && (
              <ProfileCard
                name={viewingOccupant.name}
                avatarUrl={viewingOccupant.pp}
                backgroundUrl={viewingOccupant.imageURL}
                bio={viewingOccupant.bio}
                timeSpent={viewingOccupant.timeSpent}
                borderType={viewingOccupant.borderType}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppBackground>
  )
}

// ── Character Card Sub-component ─────────────────────────────────────────────

interface CharacterCardProps {
  character: Character;
  isSelected: boolean; // Loading state
  isActive?: boolean;   // Already my character
  isTaken?: boolean;
  occupantName?: string;
  index: number;
  onClick: () => void;
}

function CharacterCard({ character, isSelected, isActive, isTaken, occupantName, index, onClick }: CharacterCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className={cn("flex flex-col items-center gap-3 group", isTaken && "opacity-40 grayscale-[0.8]")}
    >
      <button
        onClick={onClick}
        aria-label={`Jouer en tant que ${character.Nomperso}`}
        disabled={isSelected || isTaken}
        className={cn(
          "relative h-28 w-28 md:h-36 md:w-36 rounded-full overflow-hidden",
          "transition-all duration-300 ease-out hover:-translate-y-2",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c0a080] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          (isSelected || isTaken) && "scale-95",
          isTaken && "cursor-not-allowed hover:translate-y-0"
        )}
      >
        {/* Avatar background */}
        <div className="absolute inset-0 rounded-full bg-zinc-800" />

        {/* Avatar image */}
        {character.imageURL ? (
          <img
            src={character.imageURL}
            alt={character.Nomperso}
            className="absolute inset-0 w-full h-full object-cover object-top rounded-full"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-full">
            <span className="text-4xl md:text-5xl font-bold text-zinc-400 font-serif select-none">
              {character.Nomperso.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Hover ring glow */}
        <div
          className={cn(
            "absolute inset-0 rounded-full ring-2 ring-transparent",
            "group-hover:ring-[#c0a080]/60 group-hover:shadow-[0_0_30px_rgba(192,160,128,0.25)]",
            "transition-all duration-300"
          )}
        />

        {/* Loading / selected overlay */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center z-20"
            >
              <Loader2 className="w-8 h-8 text-[#c0a080] animate-spin" />
            </motion.div>
          )}
          {isActive && !isSelected && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 rounded-full border-4 border-[#c0a080] bg-[#c0a080]/10 flex flex-col items-center justify-center z-10 p-2 text-center"
            >
              <CircleCheck className="w-8 h-8 text-[#c0a080] mb-1" />
              <span className="text-[10px] text-[#e8d5b7] font-bold uppercase leading-tight tracking-wider">
                Votre héros
              </span>
            </motion.div>
          )}
          {isTaken && !isSelected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center z-10 p-2 text-center"
            >
              <LogIn className="w-6 h-6 text-zinc-400 opacity-50 mb-1" />
              <span className="text-[9px] text-zinc-300 font-bold uppercase leading-tight">
                Occupé par
                <br />
                <span className="text-zinc-100">{occupantName || "un joueur"}</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Name */}
      <div className="text-center">
        <p className="text-sm md:text-base font-medium text-zinc-400 group-hover:text-white transition-colors duration-200 truncate max-w-[120px] md:max-w-[140px]">
          {character.Nomperso}
        </p>
        {(character.Race || character.Profile) && (
          <p className="text-[10px] md:text-xs text-zinc-600 group-hover:text-[#c0a080]/70 transition-colors duration-200 truncate max-w-[120px] md:max-w-[140px] mt-0.5">
            {[character.Race, character.Profile].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </motion.div>
  )
}
