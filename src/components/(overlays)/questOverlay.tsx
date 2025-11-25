"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { auth, db, onAuthStateChanged, doc, getDoc, collection, onSnapshot, updateDoc } from "@/lib/firebase";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, Settings, EyeOff, Scroll } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

interface SubQuest {
  id: string;
  title: string;
  description: string;
  status: "not-started" | "in-progress" | "completed";
}

interface Quest {
  id: string;
  title: string;
  content: string;
  image?: string;
  questType: "principale" | "annexe";
  questStatus: "not-started" | "in-progress" | "completed";
  subQuests?: SubQuest[];
}

export default function QuestOverlay() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [character, setCharacter] = useState<string | null>(null);
  const [expandedQuestId, setExpandedQuestId] = useState<string | null>(null);
  
  // Filtres utilisateur
  const [showPrincipales, setShowPrincipales] = useState(true);
  const [showAnnexes, setShowAnnexes] = useState(true);
  const [hiddenQuestIds, setHiddenQuestIds] = useState<Set<string>>(new Set());

  // Récupération du room_id et du personnage de l'utilisateur connecté
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          setRoomId(String(userData.room_id));
          setCharacter(String(userData.perso));
        } else {
          console.error("Utilisateur non trouvé dans Firestore");
          setRoomId(null);
          setCharacter(null);
        }
      } else {
        setRoomId(null);
        setCharacter(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Récupérer les quêtes en cours depuis Firestore
  useEffect(() => {
    if (!roomId || !character) return;

    const notesCollectionRef = collection(db, 'Notes', roomId, character);

    const unsubscribe = onSnapshot(notesCollectionRef, (snapshot) => {
      try {
        const questsData = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            // Ne garder que les notes de type "quest"
            if (data.type !== "quest") return null;
            
            return {
              id: doc.id,
              title: data.title || "",
              content: data.content || "",
              image: data.image,
              questType: data.questType || "annexe",
              questStatus: data.questStatus || "not-started",
              subQuests: data.subQuests || [],
            } as Quest;
          })
          .filter((note): note is Quest => 
            note !== null && note.questStatus === "in-progress"
          )
          .sort((a, b) => {
            // Trier : quêtes principales en premier
            if (a.questType === "principale" && b.questType === "annexe") return -1;
            if (a.questType === "annexe" && b.questType === "principale") return 1;
            // Ensuite par ordre alphabétique
            return a.title.localeCompare(b.title);
          });
        
        setQuests(questsData);
      } catch (err) {
        console.error("Erreur lors du chargement des quêtes:", err);
      }
    });

    return () => unsubscribe();
  }, [roomId, character]);

  if (quests.length === 0) return null;

  const toggleQuest = (questId: string) => {
    setExpandedQuestId(expandedQuestId === questId ? null : questId);
  };

  const handleUpdateSubQuest = async (questId: string, subQuestId: string) => {
    if (!roomId || !character) return;
    
    try {
      const quest = quests.find(q => q.id === questId);
      if (!quest || !quest.subQuests) return;

      const updatedSubQuests = quest.subQuests.map(sq => {
        if (sq.id === subQuestId) {
          // Cycle des statuts : not-started → in-progress → completed → not-started
          let newStatus: "not-started" | "in-progress" | "completed";
          if (sq.status === "not-started") {
            newStatus = "in-progress";
          } else if (sq.status === "in-progress") {
            newStatus = "completed";
          } else {
            newStatus = "not-started";
          }
          return { ...sq, status: newStatus };
        }
        return sq;
      });

      const noteDocRef = doc(db, 'Notes', roomId, character, questId);
      await updateDoc(noteDocRef, { subQuests: updatedSubQuests });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la sous-quête:', error);
    }
  };

  // Filtrer les quêtes selon les préférences de l'utilisateur
  const filteredQuests = quests.filter(quest => {
    // Filtre par type
    if (quest.questType === "principale" && !showPrincipales) return false;
    if (quest.questType === "annexe" && !showAnnexes) return false;
    // Filtre par quêtes masquées individuellement
    if (hiddenQuestIds.has(quest.id)) return false;
    return true;
  });

  const toggleQuestVisibility = (questId: string) => {
    setHiddenQuestIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questId)) {
        newSet.delete(questId);
      } else {
        newSet.add(questId);
      }
      return newSet;
    });
  };

  return (
    <div className="fixed top-4 right-4 flex flex-col gap-2 max-w-md z-10">
      {/* Header avec filtres */}
      <div className="flex items-center justify-between bg-black/70 backdrop-blur-sm rounded-lg border border-white/20 px-3 py-2">
        <div className="flex items-center gap-2">
          {/* Menu de filtres */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0 hover:bg-white/10 rounded-full"
              >
                <Settings className="h-4 w-4 text-white/80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-gray-900/95 border-white/20 text-white">
              <div className="px-2 py-1.5 text-xs font-semibold text-white/70">
                Filtrer par type
              </div>
              <DropdownMenuCheckboxItem
                checked={showPrincipales}
                onCheckedChange={setShowPrincipales}
                className="text-xs text-white hover:bg-white/10"
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#c0a080]" />
                  Quêtes principales
                </div>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={showAnnexes}
                onCheckedChange={setShowAnnexes}
                className="text-xs text-white hover:bg-white/10"
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-[#5c6bc0]" />
                  Quêtes annexes
                </div>
              </DropdownMenuCheckboxItem>
              
              {quests.length > 0 && (
                <>
                  <DropdownMenuSeparator className="bg-white/20" />
                  <div className="px-2 py-1.5 text-xs font-semibold text-white/70">
                    Masquer des quêtes
                  </div>
                  {quests.map((quest) => (
                    <DropdownMenuCheckboxItem
                      key={quest.id}
                      checked={!hiddenQuestIds.has(quest.id)}
                      onCheckedChange={() => toggleQuestVisibility(quest.id)}
                      className="text-xs text-white hover:bg-white/10"
                    >
                      <div className="flex items-center gap-2 max-w-full">
                        <div className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          quest.questType === "principale" ? "bg-[#c0a080]" : "bg-[#5c6bc0]"
                        )} />
                        <span className="truncate">{quest.title}</span>
                      </div>
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs font-semibold text-white/90">Quêtes en cours</span>
        </div>
      </div>

      {/* Liste des quêtes avec scroll */}
      <div className="flex flex-col gap-2 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent scroll-smooth">
        {filteredQuests.length === 0 && quests.length > 0 && (
          <div className="bg-black/50 backdrop-blur-sm rounded-lg border border-white/20 p-4 text-center">
            <EyeOff className="h-8 w-8 text-white/40 mx-auto mb-2" />
            <p className="text-xs text-white/60">Toutes les quêtes sont masquées</p>
            <p className="text-[10px] text-white/40 mt-1">Utilisez les filtres pour afficher des quêtes</p>
          </div>
        )}
        {filteredQuests.map((quest) => {
          const completedSubQuests = quest.subQuests?.filter(sq => sq.status === "completed").length || 0;
          const totalSubQuests = quest.subQuests?.length || 0;
          const progress = totalSubQuests > 0 ? (completedSubQuests / totalSubQuests) * 100 : 0;
          const isExpanded = expandedQuestId === quest.id;
          
          // Vérifier si la quête a du contenu supplémentaire à afficher
          const hasExpandableContent = !!(quest.image || quest.content || (quest.subQuests && quest.subQuests.length > 0));

          return (
          <div
            key={quest.id}
            className={cn(
              "rounded-lg border backdrop-blur-sm transition-all",
              quest.questType === "principale"
                ? "bg-[#2a2a2a] border-[#c0a080]/60 shadow-lg shadow-[#c0a080]/20"
                : "bg-[#2a2a2a] border-[#5c6bc0]/60 shadow-lg shadow-[#5c6bc0]/20",
              isExpanded ? "max-w-md" : "max-w-xs",
              hasExpandableContent ? "cursor-pointer" : ""
            )}
          >
            {/* En-tête de la quête (toujours visible) */}
            <div
              className="flex items-center gap-2 p-2"
              onClick={() => hasExpandableContent && toggleQuest(quest.id)}
            >
              {/* Icône de quête */}
              <div
                className={cn(
                  "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
                  quest.questType === "principale"
                    ? "bg-[#c0a080]/30 text-[#c0a080]"
                    : "bg-[#5c6bc0]/30 text-[#5c6bc0]"
                )}
              >
                <Scroll className="h-4 w-4" />
              </div>

              {/* Contenu de la quête */}
              <div className="flex-1 min-w-0">
                {/* Titre */}
                <div className="flex items-center gap-1">
                  <p className={cn(
                    "text-xs font-semibold text-white",
                    !isExpanded ? "truncate" : ""
                  )}>
                    {quest.title}
                  </p>
                </div>

                {/* Barre de progression des sous-quêtes */}
                {totalSubQuests > 0 && (
                  <div className="mt-1 space-y-0.5">
                    <div className="w-full h-1 bg-black/30 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-300 rounded-full",
                          quest.questType === "principale"
                            ? "bg-[#c0a080]"
                            : "bg-[#5c6bc0]"
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-white/80">
                        {completedSubQuests}/{totalSubQuests}
                      </span>
                      {completedSubQuests === totalSubQuests && (
                        <CheckCircle2 className="h-3 w-3 text-green-400" />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Icône d'expansion - affichée seulement si la quête a du contenu supplémentaire */}
              {hasExpandableContent && (
                <div className="flex-shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-white/60" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-white/60" />
                  )}
                </div>
              )}
            </div>

            {/* Détails étendus */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-white/10 mt-2 pt-2">
                {/* Image */}
                {quest.image && (
                  <div className="relative w-full h-32 rounded-lg overflow-hidden">
                    <Image 
                      src={quest.image} 
                      alt={quest.title} 
                      fill 
                      className="object-cover"
                      sizes="(max-width: 448px) 100vw, 448px"
                    />
                  </div>
                )}

                {/* Description */}
                {quest.content && (
                  <div>
                    <p className="text-xs font-semibold text-white/90 mb-1">Description :</p>
                    <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">
                      {quest.content}
                    </p>
                  </div>
                )}

                {/* Sous-quêtes */}
                {quest.subQuests && quest.subQuests.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-white/90 mb-2">Sous-quêtes :</p>
                    <div className="space-y-2">
                      {quest.subQuests.map((subQuest) => (
                        <div
                          key={subQuest.id}
                          className="bg-black/20 rounded p-2 space-y-1"
                        >
                          <div className="flex items-start gap-2">
                            <button 
                              className="mt-0.5 cursor-pointer hover:scale-110 transition-transform focus:outline-none"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateSubQuest(quest.id, subQuest.id);
                              }}
                              title="Changer le statut"
                            >
                              {subQuest.status === "completed" && (
                                <CheckCircle2 className="h-3 w-3 text-green-400" />
                              )}
                              {subQuest.status === "in-progress" && (
                                <Clock className="h-3 w-3 text-yellow-400" />
                              )}
                              {subQuest.status === "not-started" && (
                                <Circle className="h-3 w-3 text-gray-400" />
                              )}
                            </button>
                            <div className="flex-1">
                              <p
                                className={cn(
                                  "text-xs font-medium text-white",
                                  subQuest.status === "completed" ? "line-through opacity-60" : ""
                                )}
                              >
                                {subQuest.title}
                              </p>
                              {subQuest.description && (
                                <p className="text-[10px] text-white/60 mt-0.5 whitespace-pre-wrap">
                                  {subQuest.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

