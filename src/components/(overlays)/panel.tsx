"use client";

import React, { useEffect, useState } from "react";
import { User, LogOut, X, Clipboard, Share2, SquareUserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { auth, db, doc, getDoc, onAuthStateChanged, updateDoc, signOut, onSnapshot } from "@/lib/firebase";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import ProfileOverlay from "@/components/profile/ProfileOverlay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type SidebarProps = {
  onClose: () => void;
};

export default function Sidebar({ onClose }: SidebarProps) {
  const router = useRouter();
  const { isDialogOpen } = useDialogVisibility();
  const [userName, setUserName] = useState<string | null>(null);
  const [userTitle, setUserTitle] = useState<string | null>(null);
  const [userProfilePicture, setUserProfilePicture] = useState<string | null>(null);
  const [userBanner, setUserBanner] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>("");
  const [showPopover, setShowPopover] = useState<boolean>(false);
  const [showProfileOverlay, setShowProfileOverlay] = useState<boolean>(false);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    // Fetch user information
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Cleanup previous snapshot listener if it exists
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (user) {
        const userDocRef = doc(db, "users", user.uid);

        unsubscribeSnapshot = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserName(data.name || "Utilisateur");
            setUserTitle(data.titre || "Aucun titre");
            setUserProfilePicture(data.pp || null);
            setUserBanner(data.imageURL || null);
            setRoomId(data.room_id || "");
          } else {
            console.error("Utilisateur non trouvé dans Firestore");
          }
        }, (error) => {
          console.error("Erreur lors de l'écoute du profil:", error);
        });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
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
    setShowProfileOverlay(true);
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

  // Hide sidebar when dialog is open
  if (isDialogOpen) {
    return null;
  }

  return (
    <div className="fixed left-0 top-0 w-80 z-[1000] bg-[#242424] shadow-lg flex text-[#d4d4d4] flex-col h-screen animate-slideInFromLeft">
      <button
        className="absolute top-3 right-3 p-1 text-[#d4d4d4] hover:text-[#c0a080] transition-colors"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>

      <div className="relative p-4 border-b border-[#444444] w-full text-left overflow-hidden group">
        {/* Banner Background */}
        {userBanner && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url(${userBanner})` }}
            />
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" />
          </>
        )}

        <div className="relative flex items-center gap-3 z-10">
          <Avatar className="w-10 h-10 border-2 border-[#c0a080]/30 shadow-sm">
            <AvatarImage src={userProfilePicture || ""} alt="Profil" className="object-cover" />
            <AvatarFallback className="bg-[#c0a080] text-white font-bold">
              {(userName || "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="font-semibold text-[#c0a080] truncate max-w-[180px] drop-shadow-sm">{userName || "Utilisateur"}</h2>
            <p className="text-sm text-[#d4d4d4] truncate max-w-[180px] drop-shadow-sm">{userTitle || "Aucun titre"}</p>
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

      {/* Profile Overlay */}
      {showProfileOverlay && (
        <ProfileOverlay onClose={() => setShowProfileOverlay(false)} />
      )}
    </div>
  );
}
