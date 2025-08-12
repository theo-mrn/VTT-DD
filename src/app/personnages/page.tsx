'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { db, getDocs, collection, doc, setDoc } from '@/lib/firebase'
import { useGame } from '@/contexts/GameContext'

interface Character {
  id: string;
  Nomperso: string;
  imageURL?: string;
  type?: string;
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
  const [charactersLoading, setCharactersLoading] = useState(false)

  // Fonction mémorisée pour charger les personnages
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
      setCharactersLoading(false)
    }
  }, [])

  // Charger les personnages quand l'utilisateur et la room sont disponibles
  useEffect(() => {
    if (user?.uid && user?.roomId && user.roomId !== '0') {
      loadCharacters(user.uid, user.roomId)
    } else if (user && (!user.roomId || user.roomId === '0')) {
      console.log("No Room_id found for this user.")
      setCharacters([])
    }
  }, [user, loadCharacters])

  const saveSelectedCharacter = useCallback(async (character: Character) => {
    if (!character.Nomperso || !character.id) {
      console.error("Character data is incomplete:", character)
      return
    }

    if (!user) {
      throw new Error("User data is not available");
    }

    try {
      // Optimisation : utiliser les données déjà chargées
      const fullCharacterData = character;
      
      // Set context values avec toutes les données du personnage
      // Note: Ne pas modifier isMJ ici - laissez le contexte gérer la logique basée sur la base de données
      setPersoId(character.id);
      setPlayerData(fullCharacterData);
      
      console.log('Setting player data (OPTIMIZED):', {
        persoId: character.id,
        playerData: fullCharacterData
      });

      // Sauvegarder en base de données
      const userRef = doc(db, 'users', user.uid)
      await setDoc(userRef, { 
        perso: character.Nomperso, 
        persoId: character.id,
        role: null  // Supprimer le rôle MJ quand on sélectionne un personnage
      }, { merge: true })

      if (user.roomId) {
        const roomRef = doc(db, `salles/${user.roomId}/Noms/${user.uid}`)
        await setDoc(roomRef, { nom: character.Nomperso }, { merge: true })
      }

      console.log("Selected character saved:", character.Nomperso)
      
      // Redirection vers la carte
      router.push(`/${user.roomId}/map`);
    } catch (error) {
      console.error("Error saving selected character:", error)
    }
  }, [user, setIsMJ, setPersoId, setPlayerData, router])

  const startAsMJ = useCallback(async () => {
    if (!user) {
      throw new Error("User data is not available");
    }

    try {
      // Set context values
      setIsMJ(true);
      setPersoId(null);
      setPlayerData(null);

      const userRef = doc(db, 'users', user.uid)
      
      await setDoc(userRef, { 
        perso: 'MJ',
        role: 'MJ',
        persoId: null  // Supprimer le persoId quand on devient MJ
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

  // Mémorisation du rendu des personnages pour éviter les re-renders
  const charactersElements = useMemo(() => {
    return characters.map((character) => (
      <div
        key={character.id}
        className="group w-36 h-[500px] rounded-[50px] bg-cover bg-top relative overflow-hidden transition-all duration-500 ease-in-out cursor-pointer hover:w-96 flex flex-col justify-end items-start"
        style={{backgroundImage: `url(${character.imageURL || 'default-avatar.png'})`}}
        onClick={() => saveSelectedCharacter(character)}
      >
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black to-transparent"></div>
        <h3 className="absolute bottom-4 left-6 text-white text-lg font-semibold opacity-0 transition-opacity duration-500 group-hover:opacity-100">
          {character.Nomperso || 'Nom non défini'}
        </h3>
      </div>
    ))
  }, [characters, saveSelectedCharacter])

  // États de chargement
  if (isLoading) {
    return (
      <div className="relative w-full min-h-screen flex items-center justify-center bg-cover bg-center" style={{backgroundImage: "url(../images/index1.webp)"}}>
        <div className="text-white text-xl">Chargement...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="relative w-full min-h-screen flex items-center justify-center bg-cover bg-center" style={{backgroundImage: "url(../images/index1.webp)"}}>
        <div className="text-white text-xl">Veuillez vous connecter</div>
      </div>
    )
  }

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-start pt-20 bg-cover bg-center" style={{backgroundImage: "url(../images/index1.webp)"}}>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white opacity-0 transition-opacity duration-2000 delay-500" style={{fontFamily: "'Aclonica', sans-serif"}}>
          Choisissez votre personnage
        </h1>
      </div>
      
      {charactersLoading ? (
        <div className="text-white text-xl">Chargement des personnages...</div>
      ) : (
        <div className="flex flex-wrap justify-center w-4/5 gap-4">
          {charactersElements}
          <a
            href="/creation"
            className="group w-36 h-[500px] rounded-[50px] bg-white relative overflow-hidden transition-all duration-500 ease-in-out cursor-pointer hover:w-96 flex flex-col justify-center items-center"
          >
            <Plus className="w-12 h-12 text-black transition-transform duration-300 ease-in-out group-hover:scale-150" />
            <h3 className="absolute bottom-4 left-6 text-black opacity-0 transition-opacity duration-500 group-hover:opacity-100">Nouveau</h3>
          </a>
        </div>
      )}
      
      <button
        onClick={startAsMJ}
        className="bg-[#c0a080] mt-16 mb-16 text-[#1c1c1c] px-12 py-4 rounded-lg hover:bg-[#d4b48f] transition duration-300 text-lg font-bold"
      >
        Commencer en tant que MJ
      </button>
    </div>
  )
}
