"use client";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth, db, onAuthStateChanged, doc, getDoc, collection, query, where, getDocs } from "@/lib/firebase";

// Définition du type Player pour mieux typer les données récupérées
type Player = {
  id: string;
  image: string;
  health: number;
  maxHealth: number;
};

export default function Component() {
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        onAuthStateChanged(auth, async (user) => {
          if (user) {
            // Récupérer le `room_id` de l'utilisateur
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);

            // Vérification de l'existence de room_id pour éviter les erreurs de type
            const room_id = userDoc.exists() ? userDoc.data()?.room_id : null;

            if (room_id) {
              // Requête pour récupérer les personnages de type "joueurs" dans la salle spécifiée
              const charactersRef = collection(db, `cartes/${room_id}/characters`);
              const q = query(charactersRef, where("type", "==", "joueurs"));
              const querySnapshot = await getDocs(q);

              // Mapping des personnages récupérés avec les types appropriés
              const fetchedPlayers: Player[] = querySnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                  id: doc.id,
                  image: data.imageURL || "/placeholder.svg", // Valeur par défaut en cas d'absence d'image
                  health: data.PV || 0,
                  maxHealth: data.PV_Max || 100,
                };
              });

              setPlayers(fetchedPlayers);
            }
          }
        });
      } catch (error) {
        console.error("Erreur lors de la récupération des données :", error);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="fixed top-4 left-4 flex gap-3 p-3 bg-black/70 backdrop-blur-sm rounded-lg border border-white/10">
      {players.map((player) => (
        <div key={player.id} className="flex flex-col items-center gap-1 group">
          <div className="relative">
            <Avatar className="h-12 w-12 border-2 border-white/20 group-hover:border-white/40 transition-colors">
              <AvatarImage src={player.image} alt={`Player ${player.id}`} />
              <AvatarFallback className="bg-primary-foreground text-xs">
                {player.id}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-300 ease-in-out rounded-full"
              style={{
                width: `${(player.health / player.maxHealth) * 100}%`,
                backgroundColor: `hsl(${(player.health / player.maxHealth) * 120}, 100%, 50%)`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
