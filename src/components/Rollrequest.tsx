"use client";
import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { auth, db, onAuthStateChanged, doc, getDoc, collection, addDoc, onSnapshot, deleteDoc, getDocs, query, where, updateDoc, setDoc } from '@/lib/firebase'

type Player = {
  id: string;
  name: string;
  image: string;
  roll?: number;
  abilities: Record<string, number>;
}

type AbilityScore = 'CON' | 'DEX' | 'FOR' | 'SAG' | 'INT' | 'CHA'
type Role = 'MJ' | 'Joueur'

// Fonction pour supprimer une requête complète (le document `requete/{requestId}` et tous les documents dans `results`)
async function deleteRequestAndResults(roomId: string, requestId: string) {
  const resultsCollectionRef = collection(db, `Rollsrequests/${roomId}/requete/${requestId}/results`)
  
  // Supprime tous les documents dans la sous-collection "results"
  const resultsSnapshot = await getDocs(resultsCollectionRef)
  const deletePromises = resultsSnapshot.docs.map((doc) => deleteDoc(doc.ref))
  await Promise.all(deletePromises)

  // Supprime le document principal de la requête
  await deleteDoc(doc(db, `Rollsrequests/${roomId}/requete`, requestId))
}

function DiceRollComponent({ role, roomId, playerId }: { role: Role, roomId: string, playerId: string }) {
  const [selectedAbility, setSelectedAbility] = useState<AbilityScore | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [isRequesting, setIsRequesting] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [lastRequestedAbility, setLastRequestedAbility] = useState<AbilityScore | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)

  // Charger les informations des joueurs en fonction du roomId
  useEffect(() => {
    if (!roomId) return

    const charactersRef = collection(db, `cartes/${roomId}/characters`)
    const q = query(charactersRef, where("type", "==", "joueurs"))

    const unsubscribeSnapshot = onSnapshot(q, (querySnapshot) => {
      const fetchedPlayers: Player[] = querySnapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          name: data.Nomperso || "Joueur",
          image: data.imageURL || "/placeholder.svg",
          abilities: {
            CON: data.CON || 10,
            DEX: data.DEX || 10,
            FOR: data.FOR || 10,
            SAG: data.SAG || 10,
            INT: data.INT || 10,
            CHA: data.CHA || 10,
          },
        }
      })

      setPlayers(fetchedPlayers)
    })

    return () => unsubscribeSnapshot()
  }, [roomId])

  // Écoute des demandes de lancer dans Firestore
  useEffect(() => {
    if (!roomId) return

    const requestsRef = collection(db, `Rollsrequests/${roomId}/requete`)
    const unsubscribe = onSnapshot(requestsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const data = change.doc.data()
          setSelectedAbility(data.ability as AbilityScore)
          setRequestId(change.doc.id)
          setIsRequesting(data.isRequesting)
          setIsCompleted(data.isCompleted || false)
        }
      })
    })

    return () => unsubscribe()
  }, [roomId])

  // Écoute des réponses des joueurs pour afficher les résultats
  useEffect(() => {
    if (!roomId || !requestId) return

    const resultsRef = collection(db, `Rollsrequests/${roomId}/requete/${requestId}/results`)
    const unsubscribeResults = onSnapshot(resultsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const playerId = change.doc.id
          const data = change.doc.data()
          const result = data.result

          // Mettre à jour le roll du joueur dans la liste
          setPlayers((prevPlayers) =>
            prevPlayers.map((player) =>
              player.id === playerId ? { ...player, roll: result } : player
            )
          )
        }
      })
    })

    return () => unsubscribeResults()
  }, [roomId, requestId])

  const handleRequest = async () => {
    if (!selectedAbility || !roomId) return

    setIsRequesting(true)

    // Supprimer toute l'ancienne requête, y compris ses sous-collections, si elle existe
    if (requestId) {
      await deleteRequestAndResults(roomId, requestId)
    }

    // Créer une nouvelle requête de lancer de dés dans Firestore
    const requestRef = await addDoc(collection(db, `Rollsrequests/${roomId}/requete`), {
      ability: selectedAbility,
      isRequesting: true,
      isCompleted: false,
      timestamp: new Date()
    })
    setRequestId(requestRef.id)
    setLastRequestedAbility(selectedAbility)
  }

  const handleRoll = async () => {
    if (!isRequesting || !requestId || !roomId || !playerId || !selectedAbility) return

    const player = players.find(p => p.id === playerId)
    if (!player) return

    const abilityValue = player.abilities[selectedAbility]
    const modifier = Math.floor((abilityValue - 10) / 2)
    const dice = Math.floor(Math.random() * 20) + 1
    const result = dice + modifier

    // Enregistrer le résultat, la valeur brute du dé et le modificateur dans Firestore
    await setDoc(doc(db, `Rollsrequests/${roomId}/requete/${requestId}/results`, playerId), {
      result: result,
      dice: dice,
      modifier: modifier
    })

    // Mettre à jour le roll du joueur localement
    setPlayers(players.map(p => 
      p.id === playerId ? { ...p, roll: result } : p
    ))
  }

  const handleCompleteRequest = async () => {
    if (!requestId || !roomId) return

    // Marquer la demande comme terminée pour empêcher les autres réponses
    await updateDoc(doc(db, `Rollsrequests/${roomId}/requete`, requestId), {
      isCompleted: true,
      isRequesting: false
    })

    setIsRequesting(false)
    setIsCompleted(true)
  }

  const handleNewTest = async () => {
    if (!requestId || !roomId) return

    // Supprimer toute l'ancienne requête, y compris ses sous-collections
    await deleteRequestAndResults(roomId, requestId)

    // Réinitialiser l'état pour un nouveau test
    setSelectedAbility(null)
    setLastRequestedAbility(null)
    setIsRequesting(false)
    setIsCompleted(false)
    setRequestId(null)

    // Réinitialiser les lancers des joueurs
    setPlayers(players.map(player => ({ ...player, roll: undefined })))
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Lancer de dés</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {role === 'MJ' && !isRequesting && !isCompleted && (
            <div className="flex space-x-2">
              <Select 
                onValueChange={(value) => setSelectedAbility(value as AbilityScore)} 
                value={selectedAbility || undefined}
              >
                <SelectTrigger className="flex-grow">
                  <SelectValue placeholder="Choisir une caractéristique" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CON">Constitution</SelectItem>
                  <SelectItem value="DEX">Dextérité</SelectItem>
                  <SelectItem value="FOR">Force</SelectItem>
                  <SelectItem value="SAG">Sagesse</SelectItem>
                  <SelectItem value="INT">Intelligence</SelectItem>
                  <SelectItem value="CHA">Charisme</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleRequest} disabled={!selectedAbility}>
                Demander
              </Button>
            </div>
          )}

          {role === 'MJ' && isRequesting && !isCompleted && (
            <Button onClick={handleCompleteRequest}>
              Terminer
            </Button>
          )}

          {role === 'MJ' && isCompleted && (
            <Button onClick={handleNewTest}>
              Nouveau test
            </Button>
          )}

          <div className="space-y-3">
            {players.map((player) => (
              <div key={player.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/50">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={player.image} alt={player.name} />
                    <AvatarFallback>{player.name[0]}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{player.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="min-w-[80px] text-right">
                    {isRequesting && player.roll === undefined ? 'En attente...' : 
                     player.roll !== undefined ? `${player.roll} ${lastRequestedAbility || ''}` : ''}
                  </div>
                  {role === 'Joueur' && isRequesting && !isCompleted && player.id === playerId && player.roll === undefined && (
                    <Button onClick={handleRoll} size="sm">
                      Lancer
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Component() {
  const [role, setRole] = useState<Role>('Joueur')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)

  // Définir le rôle en fonction de Firestore et récupérer l'id du personnage
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid)
        const userDoc = await getDoc(userDocRef)

        if (userDoc.exists()) {
          const data = userDoc.data()
          setRole(data.perso === 'MJ' ? 'MJ' : 'Joueur')
          setRoomId(data.room_id || null)
          setPlayerId(data.persoId || null)
        } else {
          console.error("Utilisateur non trouvé dans Firestore")
        }
      }
    })

    return () => unsubscribeAuth()
  }, [])

  return (
    <div className="space-y-8">
      {roomId && playerId && <DiceRollComponent role={role} roomId={roomId} playerId={playerId} />}
    </div>
  )
}
