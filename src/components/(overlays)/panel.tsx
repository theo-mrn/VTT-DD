"use client";

import React, { useEffect, useState } from "react";
import { Check, User, Users, LogOut, X, Clipboard, Share2, SquareUserRound, Settings, Palette, BookOpen, ImageIcon, Store, Zap, ShoppingCart, Library } from "lucide-react";
import { useRouter } from "next/navigation";
import { auth, db, doc, onAuthStateChanged, updateDoc, signOut, onSnapshot } from "@/lib/firebase";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import { useGame } from "@/contexts/GameContext";
import ProfileOverlay from "@/components/profile/ProfileOverlay";
import GlobalSettingsDialog from "@/components/(map)/GlobalSettingsDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ProfileCard } from "@/components/ui/profile-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogOverlay } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings2 } from "lucide-react";
import { useTheme } from "next-themes";
import { ThemeName } from "@/lib/saveSettings";
import { cn } from "@/lib/utils";

import Marketplace from "@/components/(infos)/Information";
import Capacites from "@/components/(infos)/capacites";
import Images from "@/components/(infos)/images";
import Wiki from "@/components/(infos)/wiki";
import Boutique from "@/components/(infos)/boutique";
import { RoomUsersManager } from "@/app/Salle/components/RoomUsersManager";
import { RoomSettingsManager } from "@/app/Salle/components/RoomSettingsManager";
import { ChallengesButton } from '@/components/(challenges)/challenges-button';
import FileLibrary from '@/components/(infos)/FileLibrary';

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
  const [userTimeSpent, setUserTimeSpent] = useState<number>(0);
  const [userBio, setUserBio] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [showPremiumBadge, setShowPremiumBadge] = useState<boolean>(true);
  const [userBorderType, setUserBorderType] = useState<string>("none");
  const [showMyProfileCard, setShowMyProfileCard] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string | null>("");
  const [showPopover, setShowPopover] = useState<boolean>(false);
  const [showProfileOverlay, setShowProfileOverlay] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const { isMJ, isOwner } = useGame();

  // Theme state for custom switcher in sidebar
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const currentTheme = (mounted ? (resolvedTheme ?? theme) : 'dark') as ThemeName;

  const THEMES: { key: ThemeName; label: string; accent: string; bg: string; text: string }[] = [
    { key: 'dark', label: 'Défaut', accent: '#c0a080', bg: '#18181b', text: '#d4d4d4' },
    { key: 'forest', label: 'Forêt', accent: '#6abf6a', bg: '#162016', text: '#c8d8c0' },
    { key: 'crimson', label: 'Feu', accent: '#c0504a', bg: '#201212', text: '#d8c8c0' },
    { key: 'parchment', label: 'Parchemin', accent: '#8b5e2c', bg: '#f5eedc', text: '#2c1e0e' },
    { key: 'midnight', label: 'Minuit', accent: '#4aa8d8', bg: '#121c30', text: '#c8d8e8' },
  ];

  const handleThemeChange = async (newTheme: ThemeName) => {
    setTheme(newTheme);
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        // We import saveUserSettings in a dynamic way to prevent circular deps or we can do it via firestore directly
        const userDocRef = doc(db, "users", user.uid);
        try {
          // Requires full path or similar to saveUserSettings. For now, doing direct update.
          await updateDoc(userDocRef, { "settings.theme": newTheme });
        } catch (error) {
          console.error("Erreur lors de la sauvegarde du thème:", error);
        }
      }
    });
  };

  const activeThemeObj = THEMES.find(t => t.key === currentTheme) || THEMES[0];

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
            setUserTimeSpent(data.timeSpent || 0);
            setUserBio(data.bio || null);
            setIsPremium(data.premium || false);
            setShowPremiumBadge(data.showPremiumBadge ?? true);
            setUserBorderType(data.borderType || "none");
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
    <div className="fixed left-0 top-0 w-80 z-[1000] bg-[var(--bg-card)] shadow-lg flex text-[var(--text-primary)] flex-col h-screen animate-slideInFromLeft">
      <button
        className="absolute top-3 right-3 p-1 text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>

      <div
        className="relative p-4 border-b border-[var(--border-color)] w-full text-left overflow-hidden group cursor-pointer hover:bg-white/5 transition-colors duration-300"
        onClick={() => setShowMyProfileCard(true)}
      >
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
          <div className="relative">
            <Avatar className="w-11 h-11 border-2 border-[var(--accent-brown)]/50 shadow-sm">
              <AvatarImage src={userProfilePicture || ""} alt="Profil" className="object-cover" />
              <AvatarFallback className="bg-[var(--accent-brown)] text-[var(--bg-dark)] font-bold">
                {(userName || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold h-6 w-6 rounded-full flex items-center justify-center border-2 border-card shadow-xs">
              {Math.floor(userTimeSpent / 120) + 1}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[var(--accent-brown)] truncate max-w-[180px] drop-shadow-sm">{userName || "Utilisateur"}</h2>
            <p className="text-sm text-[var(--text-primary)] truncate max-w-[180px] drop-shadow-sm">{userTitle || "Aucun titre"}</p>
            {/* Experience bar */}
            <div className="mt-1.5 cursor-help" title={`Encore ${120 - (userTimeSpent % 120)} minutes de jeu pour atteindre le niveau ${Math.floor(userTimeSpent / 120) + 2}`}>
              <div className="flex items-center justify-between mb-1 px-0.5">
                <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-widest font-bold">Niv. {Math.floor(userTimeSpent / 120) + 1}</span>
                <span className="text-[9px] text-[var(--text-secondary)] font-bold">{userTimeSpent % 120} / 120 min</span>
              </div>
              <div className="h-1.5 bg-zinc-800/80 rounded-full overflow-hidden border border-[var(--border-color)]">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 via-orange-500 to-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)] transition-all duration-300 ease-out"
                  style={{ width: `${Math.floor(((userTimeSpent % 120) / 120) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-grow p-2">
        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
          onClick={handleVoirProfil}
        >
          <User className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
          <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Voir le profil</span>
        </button>


        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
          onClick={handlechangecharacter}
        >
          <SquareUserRound className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
          <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Changer de personnage</span>
        </button>

        {/* Separator to differentiate settings from info buttons */}
        <div className="my-2 border-t border-white/10 mx-2" />

        <div className="w-full">
          <ChallengesButton variant="sidebar" />
        </div>

        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
          onClick={() => setOpenDialog("capacites")}
        >
          <Zap className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
          <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Capacités</span>
        </button>

        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
          onClick={() => setOpenDialog("images")}
        >
          <ImageIcon className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
          <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Images</span>
        </button>

        {isMJ && (
          <button
            className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
            onClick={() => setOpenDialog("bibliotheque")}
          >
            <Library className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
            <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Bibliothèque</span>
          </button>
        )}

        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
          onClick={() => setOpenDialog("information")}
        >
          <Store className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
          <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Marché</span>
        </button>

        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
          onClick={() => setOpenDialog("wiki")}
        >
          <BookOpen className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
          <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Wiki</span>
        </button>

        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
          onClick={() => setOpenDialog("boutique")}
        >
          <ShoppingCart className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
          <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Boutique</span>
        </button>

        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
          onClick={() => setOpenDialog("joueurs")}
        >
          <Users className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
          <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Joueurs</span>
        </button>

        <div className="my-2 border-t border-white/10 mx-2" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center justify-between p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors group">
              <div className="flex items-center gap-3">
                <Palette className="w-5 h-5 text-[var(--text-primary)] group-hover:text-[var(--accent-brown)] transition-colors" />
                <div className="flex flex-col items-start leading-none">
                  <span className="text-sm md:text-base font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-brown)] transition-colors">Thème</span>
                  <span className="text-xs font-semibold mt-1 text-[var(--accent-brown)]">{activeThemeObj.label}</span>
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-auto min-w-[380px] max-w-[90vw] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] z-[1050] p-4 shadow-xl" side="right" align="start" sideOffset={10}>
            <div className="flex items-center gap-1.5 mb-4 opacity-70">
              <Palette className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Thème de l'interface</span>
            </div>

            <div className="flex flex-row overflow-x-auto gap-1 p-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {THEMES.map((t) => {
                const isActive = currentTheme === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => handleThemeChange(t.key)}
                    className={cn(
                      "group relative flex flex-col items-center gap-2 rounded-xl p-2.5 transition-all shrink-0 w-[96px]",
                      "hover:bg-[var(--border-color)] focus-visible:outline-none",
                      isActive && "bg-[var(--border-color)]"
                    )}
                    style={isActive ? { boxShadow: `0 0 0 2px ${t.accent}` } : {}}
                  >
                    <div
                      className="relative flex h-12 w-16 items-center justify-center overflow-hidden rounded-lg border border-white/10 shadow-sm transition-transform group-hover:scale-105"
                      style={{ backgroundColor: t.bg }}
                    >
                      {/* Mini preview layout perfectly matching standard */}
                      <div className="flex w-full flex-col gap-1 px-2 py-1.5">
                        <div
                          className="h-1.5 w-8 rounded-full"
                          style={{ backgroundColor: t.text }}
                        />
                        <div
                          className="h-1.5 w-6 rounded-full"
                          style={{ backgroundColor: t.text, opacity: 0.6 }}
                        />
                        <div className="mt-1 flex gap-1">
                          <div
                            className="h-2 flex-1 rounded-sm"
                            style={{ backgroundColor: t.accent }}
                          />
                          <div
                            className="h-2 flex-1 rounded-sm border border-black/10"
                            style={{ backgroundColor: t.bg, borderColor: t.text }}
                          />
                        </div>
                      </div>

                      {isActive && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full shadow-lg" style={{ backgroundColor: t.accent }}>
                            <Check className="h-3.5 w-3.5" style={{ color: t.bg }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-semibold leading-none mt-1 transition-colors",
                        isActive ? "text-white" : "text-gray-400 group-hover:text-gray-200"
                      )}
                      style={{ color: isActive ? t.accent : undefined }}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
          onClick={() => setShowSettings(true)}
        >
          <Settings className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
          <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Paramètres du plateau</span>
        </button>


        {/* Invite Button with Inline Room ID and Copy Icon */}
        <div className="relative">
          <button
            className="w-full flex items-center gap-3 p-2 hover:bg-[var(--bg-canvas)] rounded-lg transition-colors"
            onClick={() => setShowPopover(!showPopover)}
          >
            <Share2 className="w-5 h-5 text-[var(--text-primary)] hover:text-[var(--accent-brown)]" />
            <span className="text-[var(--text-primary)] hover:text-[var(--accent-brown)] transition-colors">Inviter dans la partie</span>
          </button>
          {showPopover && (
            <div className="absolute left-0 mt-2 w-full bg-[var(--bg-darker)] border border-[var(--border-color)] p-3 rounded shadow-lg flex items-center justify-between z-[1001]">
              <span className="text-[var(--text-primary)] opacity-80 text-sm">Code :</span>
              <p className="text-[var(--text-primary)] text-sm font-semibold">{roomId || "Aucun room_id disponible"}</p>
              <button onClick={handleCopyRoomId} className="hover:opacity-70 transition-opacity">
                <Clipboard className="w-5 h-6 text-[var(--accent-brown)]" />
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="p-4 border-t border-[var(--border-color)]">
        <button
          className="w-full flex items-center justify-center gap-3 p-2 text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] rounded-lg transition-colors group"
          onClick={handleSignOut}
        >
          <LogOut className="w-5 h-5 text-[var(--text-primary)] group-hover:text-white" />
          <span className="text-[var(--text-primary)] group-hover:text-white transition-colors">Se déconnecter</span>
        </button>
      </div>
      <div className="p-4 border-t border-[var(--border-color)]">
        <button
          className="w-full flex items-center justify-center gap-3 p-2 hover:bg-red-500/10 rounded-lg transition-colors group"
          onClick={handleQuitterLaPartie}
        >
          <LogOut className="w-5 h-5 text-red-500 group-hover:scale-110 transition-transform" />
          <span className="text-red-500 font-medium">Quitter la partie</span>
        </button>
      </div>

      {/* Profile Overlay */}
      {showProfileOverlay && (
        <ProfileOverlay onClose={() => setShowProfileOverlay(false)} />
      )}

      {/* Global Settings Dialog */}
      <GlobalSettingsDialog
        isOpen={showSettings}
        onOpenChange={setShowSettings}
        isMJ={isOwner}
      />

      {/* Info Full Screen Overlays */}
      {openDialog === 'capacites' && (
        <div className="fixed inset-0 z-[5000] bg-[var(--bg-dark)] overflow-y-auto w-screen h-screen slide-in-from-bottom-2 animate-in duration-300">
          <button onClick={() => setOpenDialog(null)} className="fixed top-6 right-6 z-[5010] p-3 bg-black/60 hover:bg-red-500/80 text-white rounded-full transition-all backdrop-blur-md shadow-lg group">
            <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
          <Capacites />
        </div>
      )}

      {openDialog === 'images' && (
        <div className="fixed inset-0 z-[5000] bg-[var(--bg-dark)] overflow-y-auto w-screen h-screen slide-in-from-bottom-2 animate-in duration-300">
          <button onClick={() => setOpenDialog(null)} className="fixed top-6 right-6 z-[5010] p-3 bg-black/60 hover:bg-red-500/80 text-white rounded-full transition-all backdrop-blur-md shadow-lg group">
            <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
          <Images />
        </div>
      )}

      {openDialog === 'information' && (
        <div className="fixed inset-0 z-[5000] bg-[var(--bg-dark)] overflow-y-auto w-screen h-screen slide-in-from-bottom-2 animate-in duration-300">
          <button onClick={() => setOpenDialog(null)} className="fixed top-6 right-6 z-[5010] p-3 bg-black/60 hover:bg-red-500/80 text-white rounded-full transition-all backdrop-blur-md shadow-lg group">
            <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
          <Marketplace />
        </div>
      )}

      {openDialog === 'wiki' && (
        <div className="fixed inset-0 z-[5000] bg-[var(--bg-dark)] overflow-y-auto w-screen h-screen slide-in-from-bottom-2 animate-in duration-300">
          <button onClick={() => setOpenDialog(null)} className="fixed top-6 right-6 z-[5010] p-3 bg-black/60 hover:bg-red-500/80 text-white rounded-full transition-all backdrop-blur-md shadow-lg group">
            <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
          <Wiki />
        </div>
      )}

      {openDialog === 'boutique' && (
        <div className="fixed inset-0 z-[5000] bg-[var(--bg-dark)] overflow-y-auto w-screen h-screen slide-in-from-bottom-2 animate-in duration-300">
          <button onClick={() => setOpenDialog(null)} className="fixed top-6 right-6 z-[5010] p-3 bg-black/60 hover:bg-red-500/80 text-white rounded-full transition-all backdrop-blur-md shadow-lg group">
            <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
          <Boutique />
        </div>
      )}

      {openDialog === 'bibliotheque' && (
        <div className="fixed inset-0 z-[5000] bg-[var(--bg-dark)] overflow-hidden w-screen h-screen slide-in-from-bottom-2 animate-in duration-300">
          <button onClick={() => setOpenDialog(null)} className="fixed top-6 right-6 z-[5010] p-3 bg-black/60 hover:bg-red-500/80 text-white rounded-full transition-all backdrop-blur-md shadow-lg group">
            <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
          <FileLibrary />
        </div>
      )}

      <Dialog open={openDialog === 'joueurs'} onOpenChange={(open) => !open && setOpenDialog(null)}>
        <DialogContent className="sm:max-w-md bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-dark)]/50">
            <DialogTitle className="text-xl font-serif text-[var(--accent-brown)] flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gestion de la salle
            </DialogTitle>
            <DialogDescription className="hidden">Gérer les joueurs et les paramètres de la salle</DialogDescription>
          </DialogHeader>
          <div className="p-0 max-h-[80vh] overflow-y-auto">
            {roomId ? (
              <Tabs defaultValue="players" className="w-full">
                {isOwner && (
                  <TabsList className="w-full justify-start rounded-none border-b border-[var(--border-color)] bg-transparent p-0 h-12">
                    <TabsTrigger
                      value="players"
                      className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-brown)] data-[state=active]:bg-white/5 opacity-70 data-[state=active]:opacity-100 transition-all h-full"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Joueurs
                    </TabsTrigger>
                    <TabsTrigger
                      value="settings"
                      className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-brown)] data-[state=active]:bg-white/5 opacity-70 data-[state=active]:opacity-100 transition-all h-full"
                    >
                      <Settings2 className="h-4 w-4 mr-2" />
                      Paramètres
                    </TabsTrigger>
                  </TabsList>
                )}

                <TabsContent value="players" className="m-0 focus-visible:outline-none">
                  <RoomUsersManager roomId={roomId} compact />
                </TabsContent>

                {isOwner && (
                  <TabsContent value="settings" className="m-0 focus-visible:outline-none">
                    <RoomSettingsManager roomId={roomId} />
                  </TabsContent>
                )}
              </Tabs>
            ) : (
              <p className="text-muted-foreground italic p-6 text-center">Aucune salle en cours...</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile Card Preview Dialog */}
      <Dialog open={showMyProfileCard} onOpenChange={setShowMyProfileCard}>
        <DialogContent unstyled className="sm:max-w-md p-0 bg-transparent border-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Mon profil</DialogTitle>
            <DialogDescription>Aperçu de mon profil</DialogDescription>
          </DialogHeader>
          <ProfileCard
            name={userName || undefined}
            avatarUrl={userProfilePicture || undefined}
            backgroundUrl={userBanner || undefined}
            characterName={userTitle || undefined}
            bio={userBio || undefined}
            timeSpent={userTimeSpent}
            borderType={userBorderType as any}
            isPremium={isPremium && showPremiumBadge}
            isInitialFriend={true}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
