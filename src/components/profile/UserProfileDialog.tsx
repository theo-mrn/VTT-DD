import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { doc, getDoc, collection, getDocs, db } from "@/lib/firebase";
import { ProfileCard } from "@/components/ui/profile-card";
import { Loader2 } from "lucide-react";

interface UserProfileDialogProps {
  userId?: string | null;
  characterName?: string | null;
  roomId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfileDialog({ userId, characterName, roomId, isOpen, onClose }: UserProfileDialogProps) {
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || (!userId && (!characterName || !roomId))) {
      setUserData(null);
      return;
    }
    const fetchUser = async () => {
      setLoading(true);
      try {
        let actualUserId = userId;

        if (!actualUserId && characterName && roomId) {
          if (characterName === "MJ" || characterName.toLowerCase() === "mj") {
            const roomDoc = await getDoc(doc(db, "Salle", roomId));
            if (roomDoc.exists()) {
              actualUserId = roomDoc.data().creatorId;
            }
          } else {
            const nomsSnap = await getDocs(collection(db, `salles/${roomId}/Noms`));
            nomsSnap.forEach(docSnap => {
              if (docSnap.data().nom === characterName) {
                actualUserId = docSnap.id;
              }
            });
          }
        }

        if (!actualUserId) {
          setUserData(null);
          setLoading(false);
          return;
        }

        const userDoc = await getDoc(doc(db, "users", actualUserId));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        } else {
          setUserData(null);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [userId, characterName, roomId, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent unstyled className="sm:max-w-md p-0 bg-transparent border-none outline-none overflow-visible z-[1000] fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <DialogHeader className="sr-only">
          <DialogTitle>Profil Joueur</DialogTitle>
          <DialogDescription>Aperçu du profil</DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="flex justify-center items-center h-[400px] w-[350px] bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl mx-auto">
            <Loader2 className="w-10 h-10 animate-spin text-primary opacity-80" />
          </div>
        )}
        {!loading && userData && (
          <ProfileCard
            name={userData.name}
            avatarUrl={userData.pp}
            backgroundUrl={userData.imageURL}
            characterName={userData.titre}
            bio={userData.bio}
            timeSpent={userData.timeSpent || 0}
            borderType={userData.borderType || "none"}
            isPremium={userData.premium && (userData.showPremiumBadge ?? true)}
            isInitialFriend={true}
          />
        )}
        {!loading && !userData && (
          <div className="flex justify-center items-center h-[200px] w-[350px] bg-zinc-900/80 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl mx-auto text-zinc-400">
            Utilisateur introuvable.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
