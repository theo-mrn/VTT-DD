"use client";

import React, { useEffect, useState } from "react";
import { User, LogOut, X, Clipboard, Share2,SquareUserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { auth, db, doc, getDoc, onAuthStateChanged, updateDoc, signOut } from "@/lib/firebase";

type SidebarProps = {
  onClose: () => void;
};

export default function Sidebar({ onClose }: SidebarProps) {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [userTitle, setUserTitle] = useState<string | null>(null);
  const [userProfilePicture, setUserProfilePicture] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>("");
  const [showPopover, setShowPopover] = useState<boolean>(false);

  useEffect(() => {
    // Fetch user information
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserName(data.name || "Utilisateur");
          setUserTitle(data.titre || "Aucun titre");
          setUserProfilePicture(data.pp || "/placeholder.svg");
          setRoomId(data.room_id || "");
        } else {
          console.error("Utilisateur non trouvé dans Firestore");
        }
      }
    });
  }, []);

  const handleQuitterLaPartie = async () => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);

        try {
          await updateDoc(userDocRef, { room_id: "" });
          router.push("/");
        } catch (error) {
          console.error("Erreur lors de la mise à jour du room_id :", error);
        }
      }
    });
  };

  const handlechangecharacter = () => {
    router.push("/personnages");
  };
  
  const handleVoirProfil = () => {
    router.push("/profile");
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId || "").then(() => {
      alert("Room ID copié dans le presse-papiers !");
    });
    setShowPopover(false); // Close popover after copying
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push("/auth");
    } catch (error) {
      console.error("Erreur lors de la déconnexion :", error);
    }
  };

  return (
    <div className="fixed left-0 top-0 w-80 z-50 bg-[#242424] shadow-lg flex text-[#d4d4d4] flex-col">
      <button
        className="absolute top-3 right-3 p-1 text-[#d4d4d4] hover:text-[#c0a080] transition-colors"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>

      <div className="p-4 border-b border-[#444444] w-full text-left">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center">
            <img src={userProfilePicture || "/placeholder.svg"} alt="Profil" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="font-semibold text-[#c0a080]">{userName || "Utilisateur"}</h2>
            <p className="text-sm text-[#d4d4d4]">{userTitle || "Aucun titre"}</p>
          </div>
        </div>
      </div>

      <nav className="flex-grow p-2">
        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[#333333] rounded-lg transition-colors"
          onClick={handleVoirProfil}
        >
          <User className="w-5 h-5 text-[#d4d4d4] hover:text-[#c0a080]" />
          <span className="text-[#d4d4d4] hover:text-[#c0a080]">Voir le profil</span>
        </button>


        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[#333333] rounded-lg transition-colors"
          onClick={handlechangecharacter}
        >
          <SquareUserRound className="w-5 h-5 text-[#d4d4d4] hover:text-[#c0a080]" />
          <span className="text-[#d4d4d4] hover:text-[#c0a080]">Changer de personnage</span>
        </button>
        
        
        {/* Invite Button with Inline Room ID and Copy Icon */}
        <div className="relative">
          <button
            className="w-full flex items-center gap-3 p-2 hover:bg-[#333333] rounded-lg transition-colors"
            onClick={() => setShowPopover(!showPopover)}
          >
            <Share2 className="w-5 h-5 text-[#d4d4d4] hover:text-[#c0a080]" />
            <span className="text-[#d4d4d4] hover:text-[#c0a080]">Inviter dans la partie</span>
          </button>
          {showPopover && (
            <div className="absolute left-0 mt-2 w-full bg-[#2a2a2a] p-2 rounded shadow-lg flex items-center justify-between">
              Code salle : 
              <p className="text-white text-sm font-semibold">{roomId || "Aucun room_id disponible"}</p>
              <button onClick={handleCopyRoomId}>
                <Clipboard className="w-5 h-6 text-white hover:text-[#c0a080]" />
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="p-4 border-t border-[#444444]">
        <button
          className="w-full flex items-center justify-center gap-3 p-2 text-[#d4d4d4] hover:bg-[#333333] rounded-lg transition-colors"
          onClick={handleSignOut}
        >
          <LogOut className="w-5 h-5 text-[#d4d4d4]" />
          <span className="text-[#d4d4d4]">Se déconnecter</span>
        </button>
      </div>
      <div className="p-4 border-t border-[#444444]">
        <button
          className="w-full flex items-center justify-center gap-3 p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
          onClick={handleQuitterLaPartie}
        >
          <LogOut className="w-5 h-5 text-red-500" />
          <span className="text-red-500">Quitter la partie</span>
        </button>
      </div>

     
    </div>
  );
}
