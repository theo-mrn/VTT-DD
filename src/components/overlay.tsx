"use client";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Sidebar from "@/components/Sidebar2";
import { auth, db, onAuthStateChanged, doc, getDoc, collection, query, where, onSnapshot } from "@/lib/firebase";

type Player = {
  id: string;
  name: string;
  image: string;
  health: number;
  maxHealth: number;
};

export default function Component() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Étape 1 : Récupération du `room_id` de l'utilisateur connecté
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const room_id = userDoc.data()?.room_id || null;
          setRoomId(room_id);
        } else {
          console.error("Utilisateur non trouvé dans Firestore");
          setRoomId(null);
        }
      } else {
        setRoomId(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Étape 2 : Récupérer les informations des personnages depuis Firestore
  useEffect(() => {
    if (!roomId) return;

    const charactersRef = collection(db, `cartes/${roomId}/characters`);
    const q = query(charactersRef, where("type", "==", "joueurs"));

    const unsubscribeSnapshot = onSnapshot(q, (querySnapshot) => {
      const fetchedPlayers: Player[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.Nomperso || "Joueur",
          image: data.imageURL || "/placeholder.svg",
          health: data.PV || 0,
          maxHealth: data.PV_Max || 100,
        };
      });

      setPlayers(fetchedPlayers);
    });

    return () => unsubscribeSnapshot();
  }, [roomId]);

  // Étape 3 : Affichage des joueurs
  return (
    <>
      {isSidebarOpen && <Sidebar onClose={() => setIsSidebarOpen(false)} />}

      <div className="fixed top-4 flex gap-3 p-3 bg-black/70 backdrop-blur-sm rounded-lg border border-white/10 items-center">
        {/* Bouton pour ouvrir la sidebar */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="flex items-center justify-center h-10 w-10 bg-gray-900 text-white rounded-full hover:bg-gray-700 transition-transform transform hover:scale-105 shadow-lg focus:outline-none"
        >
          <span className="text-xl">☰</span>
        </button>

        {players.map((player) => (
          <div key={player.id} className="flex flex-col items-center gap-1 group relative">
            <div className="relative">
              <Avatar className="h-12 w-12 border-2 border-white/20 group-hover:border-white/40 transition-colors">
                <AvatarImage src={player.image} alt={player.name} />
                <AvatarFallback className="bg-primary-foreground text-xs">
                  {player.name[0]}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Barre de santé */}
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300 ease-in-out rounded-full"
                style={{
                  width: `${(player.health / player.maxHealth) * 100}%`,
                  backgroundColor: `hsl(${(player.health / player.maxHealth) * 120}, 100%, 50%)`,
                }}
              />
            </div>

            {/* Affichage de la santé en nombre */}
            <span className="absolute top-full mt-1 text-xs text-white bg-black/80 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
              {player.health}/{player.maxHealth}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
