'use client'

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { db, auth, onAuthStateChanged, getDocs, collection, doc, getDoc, setDoc } from '@/lib/firebase'

interface Character {
  id: string;
  Nomperso: string;
  imageURL?: string;
  type?: string;
}

export default function CharacterSelection() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [roomId, setRoomId] = useState<string | null>(null)
  const [user, setUser] = useState<{ uid: string } | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user)
        const roomId = await getRoomId(user)
        setRoomId(roomId)
        loadCharacters(user.uid, roomId)
      } else {
        console.log("No user is signed in.")
      }
    })

    return () => unsubscribe()
  }, [])

  async function getRoomId(user: { uid: string }): Promise<string | null> {
    const userRef = doc(db, 'users', user.uid)
    const userDoc = await getDoc(userRef)
    if (userDoc.exists()) {
      return userDoc.data().room_id as string
    } else {
      throw new Error("User document not found")
    }
  }

  async function loadCharacters(uid: string, roomId: string | null) {
    if (roomId && roomId !== '0') {
      const charactersCollection = collection(db, `cartes/${roomId}/characters`)
      const charactersSnapshot = await getDocs(charactersCollection)

      // Retrieve characters where type is "joueurs" and add the document ID
      const charactersData: Character[] = charactersSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Character))
        .filter(character => character.type === "joueurs") // Filter by type "joueurs"

      setCharacters(charactersData)
    } else {
      console.log("No Room_id found for this user.")
    }
  }
  async function saveSelectedCharacter(character: Character) {
    try {
      // Check if character.Nomperso and character.id are defined
      if (!character.Nomperso || !character.id) {
        console.error("Character data is incomplete:", character)
        return // Exit if data is incomplete
      }
  
      if (!user) {
        throw new Error("User is not defined");
      }
  
      const userRef = doc(db, 'users', user.uid)
  
      // Save both `perso` (character name) and `persoId` (character ID) to the user's document
      await setDoc(userRef, { 
        perso: character.Nomperso, 
        persoId: character.id
      }, { merge: true })
  
      const roomRef = doc(db, `salles/${roomId}/Noms/${user.uid}`)
      await setDoc(roomRef, { nom: character.Nomperso }, { merge: true })
  
      console.log("Selected character saved:", character.Nomperso)
  
      // Redirect to "map" if window.top exists
      if (window.top) {
        window.top.location.href = "map"
      } else {
        console.warn("window.top is null; cannot navigate to 'map'")
      }
    } catch (error) {
      console.error("Error saving selected character:", error)
    }
  }
  

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-start pt-20 bg-cover bg-center" style={{backgroundImage: "url(../images/index1.webp)"}}>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white opacity-0 transition-opacity duration-2000 delay-500" style={{fontFamily: "'Aclonica', sans-serif"}}>
          Choisissez votre personnage
        </h1>
      </div>
      <div className="flex flex-wrap justify-center w-4/5 gap-4">
        {characters.map((character, index) => (
          <div
            key={index}
            className="group w-36 h-[500px] rounded-[50px] bg-cover bg-top relative overflow-hidden transition-all duration-500 ease-in-out cursor-pointer hover:w-96 flex flex-col justify-end items-start"
            style={{backgroundImage: `url(${character.imageURL || 'default-avatar.png'})`}}
            onClick={() => saveSelectedCharacter(character)}
          >
            <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black to-transparent"></div>
            <h3 className="absolute bottom-4 left-6 text-white text-lg font-semibold opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              {character.Nomperso || 'Nom non défini'}
            </h3>
          </div>
        ))}
        <a
          href="/creation"
          className="group w-36 h-[500px] rounded-[50px] bg-white relative overflow-hidden transition-all duration-500 ease-in-out cursor-pointer hover:w-96 flex flex-col justify-center items-center"
        >
          <Plus className="w-12 h-12 text-black transition-transform duration-300 ease-in-out group-hover:scale-150" />
          <h3 className="absolute bottom-4 left-6 text-black opacity-0 transition-opacity duration-500 group-hover:opacity-100">Nouveau</h3>
        </a>
      </div>
    </div>
  )
}
