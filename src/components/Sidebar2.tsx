// Sidebar.tsx
"use client";

import React, { useEffect, useState } from "react"; // Importation de useEffect et useState
import { User, Settings, LogOut, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { auth, db, doc, getDoc, onAuthStateChanged, updateDoc } from "@/lib/firebase";

type SidebarProps = {
  onClose: () => void;
};

export default function Sidebar({ onClose }: SidebarProps) {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [userTitle, setUserTitle] = useState<string | null>(null);
  const [userProfilePicture, setUserProfilePicture] = useState<string | null>(null);

  useEffect(() => {
    // Récupérer les informations de l'utilisateur connecté
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserName(data.name || "Utilisateur");
          setUserTitle(data.titre || "Aucun titre");
          setUserProfilePicture(data.pp || "/placeholder.svg");
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

  const handleVoirProfil = () => {
    router.push("/profile");
  };

  return (
    <div className="fixed left-0 top-0 w-64 z-50 bg-[#242424]  shadow-lg flex text-[#d4d4d4] flex-col">
      {/* Bouton de fermeture */}
      <button
        className="absolute top-3 right-3 p-1 text-[#d4d4d4] hover:text-[#c0a080] transition-colors"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>

      {/* En-tête avec image de profil et nom de l'utilisateur */}
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

      {/* Menu principal */}
      <nav className="flex-grow p-2">
        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[#333333] rounded-lg transition-colors"
          onClick={handleVoirProfil}
        >
          <User className="w-5 h-5 text-[#d4d4d4] hover:text-[#c0a080]" />
          <span className="text-[#d4d4d4] hover:text-[#c0a080]">Voir le profil</span>
        </button>
      </nav>

      {/* Bouton Quitter */}
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
