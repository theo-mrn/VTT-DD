"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Sidebar from "@/components/(overlays)/panel";
import { db, doc, updateDoc, collection, addDoc, serverTimestamp } from "@/lib/firebase";
import { useMapControl } from "@/contexts/MapControlContext";
import { useGame } from "@/contexts/GameContext";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import { useMapData } from "@/hooks/map/useMapData";
import { useGameSystem } from "@/modules/game-system/useGameSystem";
import { getFormulaDependencies } from "@/lib/rules-engine";
import { getDominantColor, getContrastColor } from "@/utils/imageUtils";
import { motion, AnimatePresence } from "framer-motion";
import { User, Users, Eye, Heart, FileText, MessageSquare, Minus, Plus, Send, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

type Player = {
  id: string;
  name: string;
  image: string;
  health: number;
  maxHealth: number;
  // Sens du "bon état" pour cette jauge (cf StatDefinition.recoversToZero) : vrai si 0 = meilleur état
  // (ex Blessures EotE), faux si le MAX = meilleur état (ex PV D&D, comportement historique).
  recoversToZero: boolean;
  // Clés Firestore de la stat vitale principale — nécessaires pour écrire l'ajustement de vie
  // directement (health/maxHealth ne sont que des valeurs dérivées, pas des noms de champs).
  vitalKey: string | null;
  vitalMaxKey: string | null;
  type?: string;
  currentSceneId?: string;
};

type OverlayProps = {
  onPanelToggle?: (isOpen: boolean) => void;
};

export default function Component({ onPanelToggle }: OverlayProps) {
  // Documents BRUTS conservés tels quels (pas encore convertis en Player) : la conversion dépend de
  // primaryVitalStat (dérivé de gameSystem, chargé en async). Si on convertit dans le callback
  // useMapData (rappelé seulement sur un nouveau snapshot Firestore), un gameSystem qui finit de
  // charger APRÈS le premier snapshot des personnages ne redéclenche jamais la conversion — la barre de
  // vie restait figée à 0/1 (donc invisible/grise) pour tout le monde sauf le personnage dont un second
  // snapshot Firestore arrivait par hasard après coup. En dérivant Player[] à chaque render à partir des
  // docs bruts, la conversion suit systématiquement gameSystem dès qu'il devient disponible.
  const [rawPlayerDocs, setRawPlayerDocs] = useState<Record<string, unknown>[]>([]);
  const [rawNpcDocs, setRawNpcDocs] = useState<Record<string, unknown>[]>([]);
  const params = useParams();
  const roomId = params.roomid as string;
  const [isSidebarOpen, _setIsSidebarOpen] = useState(false);
  const setIsSidebarOpen = (open: boolean) => {
    _setIsSidebarOpen(open);
    onPanelToggle?.(open);
  };
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const { centerOnCharacter, selectedCityId } = useMapControl();
  const { user, isMJ, playerData } = useGame();
  const { isDialogOpen } = useDialogVisibility();
  const [mode, setMode] = useState<'joueurs' | 'pnj'>('joueurs');
  const [globalCityId, setGlobalCityId] = useState<string | null>(null);
  const { gameSystem } = useGameSystem(roomId);

  // Drawer d'ajustement rapide de la vie (déclenché depuis le dropdown d'un avatar).
  const [healthTarget, setHealthTarget] = useState<Player | null>(null);
  const [healthDelta, setHealthDelta] = useState(0);

  // Mode "écrire en privé" : la top bar morphe SANS changer de largeur — on fige la largeur naturelle de
  // la barre (mesurée juste avant d'ouvrir) et le contenu message occupe ce même gabarit, ce qui évite
  // les à-coups d'une animation de width. L'animation se fait uniquement À L'INTÉRIEUR (crossfade).
  const [messageTarget, setMessageTarget] = useState<Player | null>(null);
  const [messageText, setMessageText] = useState("");
  const topBarRef = useRef<HTMLDivElement>(null);
  const [lockedBarWidth, setLockedBarWidth] = useState<number | null>(null);
  // Teinte de la barre en mode message, dérivée de la couleur dominante de l'avatar cible. `text` est
  // calculé par contraste (blanc/noir) pour rester lisible quelle que soit la couleur — null tant que
  // l'extraction n'a pas abouti (on garde alors le fond noir par défaut).
  const [messageTint, setMessageTint] = useState<{ bg: string; text: string } | null>(null);

  // Stat vitale "principale" du système actif (ex PV pour D&D, Blessures pour EotE) : la première
  // stat 'vital' dont la borne max référence une autre stat — même mécanisme générique que WidgetVitals
  // (FicheWidgets.tsx) — jamais "PV"/"PV_Max" en dur, sans quoi la barre de vie resterait invisible ou
  // trompeuse pour tout système custom qui nomme ses stats différemment.
  const primaryVitalStat = (() => {
    for (const stat of gameSystem.stats) {
      if (stat.category !== 'vital' || !stat.maxFormula) continue;
      const [maxKey] = getFormulaDependencies(stat.maxFormula);
      if (maxKey) return { key: stat.key, maxKey, recoversToZero: !!stat.recoversToZero };
    }
    return null;
  })();

  // 🔄 Use centralized Map Data Hook — ne fait plus que stocker les docs bruts, la conversion en
  // Player[] (dépendante de primaryVitalStat) se fait ci-dessous à chaque render.
  useMapData(roomId, selectedCityId, {
    setGlobalCityId,
    setRawPlayers: (docs: any[]) => {
      setRawPlayerDocs(docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    setRawNPCs: (parsedChars: any[]) => {
      setRawNpcDocs(parsedChars);
    },
    parseCharacterDocRef: {
      current: (doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          Nomperso: data.Nomperso || "NPC",
        } as any;
      }
    }
  });

  const toPlayer = (data: Record<string, any>, fallbackName: string): Player => ({
    id: data.id,
    name: data.Nomperso || fallbackName,
    image: data.imageURLFinal || data.imageURL2 || data.imageURL || "/placeholder.svg",
    health: primaryVitalStat ? (data[primaryVitalStat.key] || 0) : 0,
    maxHealth: primaryVitalStat ? (data[primaryVitalStat.maxKey] || 1) : 1,
    recoversToZero: !!primaryVitalStat?.recoversToZero,
    vitalKey: primaryVitalStat?.key ?? null,
    vitalMaxKey: primaryVitalStat?.maxKey ?? null,
    type: data.type,
    currentSceneId: data.currentSceneId,
  });

  const players = rawPlayerDocs.map((data) => toPlayer(data, "Joueur"));
  const npcs = rawNpcDocs.map((data) => toPlayer(data as Record<string, any>, "NPC"));

  // Valeur "pleine vie" selon le sens de la stat : pour une stat qui se rétablit vers 0 (ex Blessures
  // EotE : 0 = indemne, max = seuil de blessure), remettre à 0 ; sinon (PV D&D classiques), au maximum.
  const fullHealthValue = (p: Player) => (p.recoversToZero ? 0 : p.maxHealth);

  // Écrit la nouvelle valeur de la stat vitale d'un personnage dans Firestore et journalise le changement.
  const applyHealth = async (p: Player, newValueRaw: number) => {
    if (!roomId || !p.vitalKey) return;
    const newValue = Math.max(0, Math.min(newValueRaw, p.maxHealth));
    const prevValue = p.health;
    await updateDoc(doc(db, "cartes", roomId, "characters", p.id), { [p.vitalKey]: newValue });
    if (newValue !== prevValue) {
      const diff = newValue - prevValue;
      // Import paresseux (comme ailleurs dans l'app) pour ne pas alourdir le bundle de l'overlay.
      import("@/lib/historiqueTrackerService").then(({ logHistoryEvent }) => {
        logHistoryEvent({
          roomId,
          type: !p.recoversToZero && newValue <= 0 ? "mort" : "combat",
          message: `**MJ** ajuste ${p.vitalKey} de **${p.name}** : ${diff > 0 ? "+" : ""}${diff} (${newValue}).`,
          characterId: p.id,
          characterName: p.name,
          characterType: p.type,
        });
      });
    }
  };

  // Ouvre le mode message (morph de la barre) sur un joueur. On fige d'abord la largeur courante de la
  // barre pour que le passage en mode saisie ne redimensionne pas le conteneur, puis on extrait la couleur
  // dominante de l'avatar pour teinter la barre (avec un texte contrasté garanti lisible).
  const openMessage = (p: Player) => {
    if (topBarRef.current) setLockedBarWidth(topBarRef.current.offsetWidth);
    setMessageText("");
    setMessageTarget(p);
    setMessageTint(null); // repart du fond par défaut le temps de l'extraction (async)
    if (p.image) {
      getDominantColor(p.image)
        .then((bg) => {
          // On ignore le résultat s'il ne cible plus ce joueur (fermé/rechangé entre-temps).
          setMessageTarget((current) => {
            if (current?.id === p.id) setMessageTint({ bg, text: getContrastColor(bg) });
            return current;
          });
        })
        .catch(() => { /* CORS/erreur : on garde le fond par défaut */ });
    }
  };
  const closeMessage = () => {
    setMessageTarget(null);
    setMessageText("");
    setLockedBarWidth(null);
    setMessageTint(null);
  };

  // Envoi d'un message PRIVÉ depuis la barre morphée — même collection et même forme que Chat.tsx
  // (recipients = [Nomperso], seul identifiant que le filtre de réception sait matcher).
  const sendPrivateMessage = async () => {
    const text = messageText.trim();
    if (!text || !messageTarget || !roomId || !user?.uid) return;
    await addDoc(collection(db, `rooms/${roomId}/chat`), {
      sender: isMJ ? "MJ" : (playerData?.Nomperso || "Joueur"),
      uid: user.uid,
      text,
      timestamp: serverTimestamp(),
      recipients: [messageTarget.name],
    });
    closeMessage();
  };

  // Allow opening the panel from elsewhere (e.g. the mobile dock) via a window event,
  // since the top bar that hosts the ☰ button is hidden on mobile.
  useEffect(() => {
    const open = () => setIsSidebarOpen(true);
    window.addEventListener('vtt-open-map-panel', open);
    return () => window.removeEventListener('vtt-open-map-panel', open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleList = mode === 'joueurs'
    ? players.filter(player => {
      // 1. Explicitly assigned to this scene
      if (player.currentSceneId === selectedCityId) return true;
      // 2. Implicitly following the group (no assignment) AND this is the group scene
      if (!player.currentSceneId && globalCityId === selectedCityId) return true;

      return false;
    })
    : npcs;

  // Si le destinataire ciblé quitte la liste visible (changement de scène/mode), on referme le morph
  // pour ne pas laisser la barre en mode message sans avatar.
  useEffect(() => {
    if (messageTarget && !visibleList.some((p) => p.id === messageTarget.id)) {
      closeMessage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageTarget, visibleList]);

  // Hide overlay when dialog is open
  if (isDialogOpen) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={0}>
      {isSidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[100]" onClick={() => setIsSidebarOpen(false)} />
          <div className="sidebar z-[101]">
            <Sidebar onClose={() => setIsSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Top bar — hidden on mobile (use the dock to open the panel instead).
          Elle MORPHE en place quand on choisit "Écrire en privé" : SANS changer de fond, de bordure ni de
          border-radius. On garde le menu ☰ + le séparateur ; seuls les avatars NON ciblés se replient en
          douceur, puis un champ de saisie apparaît. Toute la fluidité vient d'une transition `layout`
          unique et partagée (même spring sur le conteneur et chaque enfant). */}
      {(() => {
        const isMessaging = messageTarget !== null;
        // Spring commun → mouvement homogène et lisible.
        const spring = { type: 'spring' as const, stiffness: 240, damping: 28, mass: 0.9 };
        // Teinte de fond : en mode message, on vire vers la couleur dominante de l'avatar (dès qu'elle est
        // extraite) ; sinon le noir semi-transparent habituel. `messageTint.text` garantit un texte lisible.
        const barBg = isMessaging && messageTint ? messageTint.bg : 'rgba(0,0,0,0.7)';
        const barText = isMessaging && messageTint ? messageTint.text : '#ffffff';
        return (
          <motion.div
            ref={topBarRef}
            // Largeur FIGÉE pendant le mode message (mesurée à l'ouverture) → le conteneur ne se
            // redimensionne pas ; toute l'animation se joue à l'intérieur (les avatars se stackent à gauche).
            style={isMessaging && lockedBarWidth ? { width: lockedBarWidth } : undefined}
            animate={{ backgroundColor: barBg }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="hidden lg:flex fixed top-4 gap-2 p-2 backdrop-blur-sm rounded-lg border border-white/10 items-center max-w-[90vw] overflow-hidden z-[90]"
          >
            {/* ── ☰ menu (toujours visible) ── */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex items-center justify-center h-8 w-8 flex-shrink-0 bg-gray-900 text-white rounded-full hover:bg-gray-700 transition-transform transform hover:scale-105 shadow-lg focus:outline-none"
            >
              <span className="text-lg">☰</span>
            </button>

            {/* ── Bascule Joueurs/PNJ (MJ) — se replie en mode message ── */}
            <AnimatePresence initial={false}>
              {isMJ && !isMessaging && (
                <motion.div
                  key="mode-toggle"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={spring}
                  className="flex-shrink-0 overflow-hidden"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setMode(prev => prev === 'joueurs' ? 'pnj' : 'joueurs')}
                        className={`flex items-center justify-center h-8 w-8 flex-shrink-0 rounded-full transition-colors shadow-lg focus:outline-none ${mode === 'joueurs' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-red-600 hover:bg-red-500'}`}
                      >
                        {mode === 'joueurs' ? <User className="h-4 w-4 text-white" /> : <Users className="h-4 w-4 text-white" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{mode === 'joueurs' ? 'Afficher les PNJ' : 'Afficher les Joueurs'}</p>
                    </TooltipContent>
                  </Tooltip>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Séparateur (toujours visible) ── */}
            <div className="h-8 w-[1px] bg-white/20 mx-1 flex-shrink-0" />

            {/* ── Avatars ──
                 En mode message, les NON-ciblés glissent de la droite vers la gauche et se compactent en
                 PILE chevauchée (marginLeft négatif + scale réduit + opacité), révélant la cible. La cible,
                 elle, reste pleine taille. Le champ de saisie apparaît ensuite à droite. */}
            <div className="flex items-center flex-shrink min-w-0">
              {/* En mode message, on réordonne pour que la CIBLE passe en DERNIER dans le DOM : comme tous
                  les avatars se chevauchent, le dernier rendu est visuellement AU SOMMET de la pile. Tout le
                  monde se compacte tout à gauche ; on ne voit donc que la cible, posée en haut du tas.
                  `layout` anime ce repositionnement (glissement droite→gauche). */}
              {(isMessaging
                ? [...visibleList].sort((a, b) => (a.id === messageTarget?.id ? 1 : 0) - (b.id === messageTarget?.id ? 1 : 0))
                : visibleList
              ).map((char, index) => {
                const isTarget = messageTarget?.id === char.id;
                return (
                  <motion.div
                    key={char.id}
                    layout
                    className="relative flex-shrink-0"
                    // La cible domine la pile (z-index max) ; les autres sont parfaitement RECOUVERTS dessous.
                    style={{ zIndex: isTarget ? 100 : index }}
                    animate={{
                      // Pile PARFAITE : chaque avatar (sauf le 1er) remonte EXACTEMENT de sa largeur (40px =
                      // h-10/w-10) sur le précédent → superposition pile-poil, aucun bord visible. La cible
                      // étant rendue en dernier et z-index max, elle est la seule qu'on voit, au sommet.
                      marginLeft: isMessaging ? (index === 0 ? 0 : -40) : (index === 0 ? 0 : 8),
                      // On garde scale/opacité à 1 : inutile d'estomper des avatars totalement cachés, et un
                      // scale < 1 laisserait dépasser un liseré derrière la cible.
                      scale: 1,
                      opacity: 1,
                    }}
                    transition={spring}
                  >
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild disabled={isMessaging}>
                            <button
                              type="button"
                              className="flex flex-col items-center gap-1 group relative flex-shrink-0 cursor-pointer focus:outline-none disabled:cursor-default"
                            >
                              <div className="relative">
                                <Avatar className={`h-10 w-10 border-2 transition-colors ${isTarget ? 'border-[#c0a080]' : mode === 'pnj' ? 'border-red-500/50 group-hover:border-red-500' : 'border-blue-500/50 group-hover:border-blue-500'}`}>
                                  <AvatarImage src={char.image} alt={char.name} className="object-cover" />
                                  <AvatarFallback className="bg-primary-foreground text-xs">
                                    {char.name[0]}
                                  </AvatarFallback>
                                </Avatar>
                              </div>

                              {/* Barre de vie — masquée en mode message. Sens inversé si recoversToZero
                                  (ex Blessures EotE : 0 = indemne), sinon comportement historique (PV D&D). */}
                              {!isMessaging && (
                                <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                                  <div
                                    className="h-full transition-all duration-300 ease-in-out rounded-full"
                                    style={{
                                      width: `${Math.min(100, Math.max(0, ((char.recoversToZero ? char.maxHealth - char.health : char.health) / char.maxHealth) * 100))}%`,
                                      backgroundColor: `hsl(${Math.min(120, Math.max(0, ((char.recoversToZero ? char.maxHealth - char.health : char.health) / char.maxHealth) * 120))}, 100%, 50%)`,
                                    }}
                                  />
                                </div>
                              )}
                            </button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-center z-[110] bg-zinc-950 border-zinc-800 text-white">
                          <p className="font-bold text-white">{char.name}</p>
                          <p className="text-xs text-zinc-300">{char.health}/{char.maxHealth} {primaryVitalStat ? (gameSystem.stats.find((s) => s.key === primaryVitalStat.key)?.shortLabel ?? gameSystem.stats.find((s) => s.key === primaryVitalStat.key)?.label ?? '') : 'PV'}</p>
                        </TooltipContent>
                      </Tooltip>

                      <DropdownMenuContent align="start" className="z-[120] w-48 bg-zinc-950 border-zinc-800 text-white">
                        <DropdownMenuItem
                          className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer"
                          onSelect={() => {
                            setSelectedCharacterId(char.id);
                            centerOnCharacter(char.id);
                          }}
                        >
                          <Eye size={14} className="text-white/70" /> Voir sur la carte
                        </DropdownMenuItem>

                        {isMJ && char.vitalKey && (
                          <DropdownMenuItem
                            className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer"
                            onSelect={() => { setHealthDelta(0); setHealthTarget(char); }}
                          >
                            <Heart size={14} className="text-white/70" /> Modifier la vie
                          </DropdownMenuItem>
                        )}

                        {/* Écrire en privé — réservé aux personnages joueurs (jamais un PNJ ni soi-même).
                            Fait MORPHER la barre sur ce joueur (ciblé via son Nomperso, seul identifiant que
                            le filtre de réception de Chat.tsx sait matcher). */}
                        {char.type === 'joueurs' && char.name !== playerData?.Nomperso && (
                          <DropdownMenuItem
                            className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer"
                            onSelect={() => openMessage(char)}
                          >
                            <MessageSquare size={14} className="text-white/70" /> Écrire en privé
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator className="bg-zinc-800" />

                        <DropdownMenuItem
                          className="gap-2 focus:bg-white/10 focus:text-white cursor-pointer"
                          onSelect={() => {
                            window.dispatchEvent(new CustomEvent('vtt-open-character-sheet', { detail: { characterId: char.id } }));
                          }}
                        >
                          <FileText size={14} className="text-white/70" /> Voir la fiche
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                );
              })}

              {!isMessaging && visibleList.length === 0 && (
                <div className="text-white text-sm italic px-2">
                  Aucun {mode === 'joueurs' ? 'joueur' : 'PNJ'}
                </div>
              )}
            </div>

            {/* ── Champ de saisie (mode message) : apparaît à droite de la cible, glissé depuis la droite ── */}
            <AnimatePresence>
              {isMessaging && messageTarget && (
                <motion.div
                  key="message-input"
                  className="flex items-center gap-2 flex-1 min-w-0"
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0, transition: { ...spring, delay: 0.18 } }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
                >
                  <input
                    autoFocus
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendPrivateMessage();
                      if (e.key === 'Escape') closeMessage();
                    }}
                    placeholder={`Message privé à ${messageTarget.name}…`}
                    // Couleur de texte = contraste calculé sur le fond → toujours lisible. Le placeholder
                    // reprend cette couleur atténuée (opacité), via une CSS var pilotée en inline.
                    style={{ color: barText, ['--ph' as string]: barText, opacity: 1 }}
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-medium px-1 placeholder:text-[var(--ph)] placeholder:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={sendPrivateMessage}
                    disabled={!messageText.trim()}
                    aria-label="Envoyer"
                    // Bouton d'envoi : garde l'accent doré s'il y a du texte (lisible sur tout fond) ; sinon
                    // pastille discrète teintée par la couleur de contraste courante.
                    style={!messageText.trim() ? { color: barText } : undefined}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${messageText.trim() ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'bg-black/20 cursor-not-allowed'}`}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={closeMessage}
                    aria-label="Fermer"
                    style={{ color: barText }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/20 transition-colors opacity-70 hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })()}

      {/* Drawer d'ajustement rapide de la vie — boutons +/-, avec un raccourci "pleine vie" qui respecte
          le sens de la stat (0 pour un seuil de blessure type EotE, max pour des PV classiques). */}
      <Drawer open={!!healthTarget} onOpenChange={(open) => { if (!open) { setHealthTarget(null); setHealthDelta(0); } }}>
        <DrawerContent className="bg-[#1a1a1a] border-t border-[#333] max-w-2xl mx-auto">
          {healthTarget && (() => {
            const statLabel = primaryVitalStat
              ? (gameSystem.stats.find((s) => s.key === primaryVitalStat.key)?.label ?? 'PV')
              : 'PV';
            const projected = Math.max(0, Math.min(healthTarget.health + healthDelta, healthTarget.maxHealth));
            return (
              <>
                <DrawerHeader>
                  <DrawerTitle className="text-white text-center text-2xl">Ajuster {statLabel}</DrawerTitle>
                  <DrawerDescription className="text-gray-400 text-center">
                    {healthTarget.name} — actuel : {healthTarget.health}/{healthTarget.maxHealth} → {projected}
                  </DrawerDescription>
                </DrawerHeader>
                <div className="p-8 flex items-center justify-center gap-8">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-16 w-16 rounded-full border-2 border-[#333] hover:bg-red-500/10 hover:border-red-500 hover:text-red-500 transition-all"
                    onClick={() => setHealthDelta((prev) => prev - 1)}
                  >
                    <Minus className="h-8 w-8" />
                  </Button>
                  <div className={`text-6xl font-bold font-mono ${healthDelta > 0 ? 'text-green-500' : healthDelta < 0 ? 'text-red-500' : 'text-white'}`}>
                    {healthDelta > 0 ? `+${healthDelta}` : healthDelta}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-16 w-16 rounded-full border-2 border-[#333] hover:bg-green-500/10 hover:border-green-500 hover:text-green-500 transition-all"
                    onClick={() => setHealthDelta((prev) => prev + 1)}
                  >
                    <Plus className="h-8 w-8" />
                  </Button>
                </div>
                <div className="flex justify-center pb-2">
                  <Button
                    variant="ghost"
                    className="text-[#c0a080] hover:bg-[#c0a080]/10 hover:text-[#d4b896] gap-2"
                    onClick={async () => {
                      await applyHealth(healthTarget, fullHealthValue(healthTarget));
                      setHealthTarget(null);
                      setHealthDelta(0);
                    }}
                  >
                    <Heart size={16} fill="currentColor" />
                    {healthTarget.recoversToZero ? 'Remettre à zéro (indemne)' : 'Pleine vie'}
                  </Button>
                </div>
                <DrawerFooter className="flex-row justify-center gap-4">
                  <Button
                    variant="outline"
                    className="w-32 border-[#333] text-gray-300 hover:bg-[#252525]"
                    onClick={() => { setHealthTarget(null); setHealthDelta(0); }}
                  >
                    Annuler
                  </Button>
                  <Button
                    className="w-32 bg-[#c0a080] text-[#1a1a1a] font-bold hover:bg-[#d4b896]"
                    disabled={healthDelta === 0}
                    onClick={async () => {
                      await applyHealth(healthTarget, healthTarget.health + healthDelta);
                      setHealthTarget(null);
                      setHealthDelta(0);
                    }}
                  >
                    Confirmer
                  </Button>
                </DrawerFooter>
              </>
            );
          })()}
        </DrawerContent>
      </Drawer>
    </TooltipProvider>
  );
}
