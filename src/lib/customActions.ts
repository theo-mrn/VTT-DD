import {
  Settings2,
  MessageSquare, Dice5, FileText, Swords, Edit3,
  Search, Undo2, Redo2, Smile, Dice1, Dice2, Dice3, Dice4, Dice6,
  Grid3x3, Sparkles, UserSquare2, UsersRound, Layers, SlidersHorizontal, Image as ImageIcon, Eye, Globe,
  Move, Target, Pencil, ZoomIn, ZoomOut, Baseline, UserPlus, PackagePlus,
  Volume2, Hexagon, MapPin, SquareDashedMousePointer, CirclePlus, Compass,
  History, Flame, CloudFog, Eraser, PlayCircle, Sun, Moon, RotateCcw, Trash2,
  Binoculars,
  type LucideIcon,
} from "lucide-react"
import { SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext"

export type ActionCategory = "Onglets" | "Dés" | "Interface & Vue" | "Outils de Carte" | "Contenu & Audio"

export type CustomActionDef = {
  id: string
  label: string
  icon: LucideIcon
  category: ActionCategory
  mjOnly?: boolean
  hiddenForMJ?: boolean
  // Présent uniquement pour les onglets natifs de la Sidebar : le clic doit basculer
  // activeTab via handleIconClick(tab) plutôt que passer par triggerAction(id).
  tab?: string
  // Présent uniquement pour les actions "directes" qui reflètent un état actif/inactif
  // de la carte (activeMapTools, voir ShortcutsContext). Correspond à une valeur de TOOLS.*
  // dans MapToolbar.tsx, distincte de l'id SHORTCUT_ACTIONS utilisé pour triggerAction.
  mapToolId?: string
}

// Catalogue partagé entre MapToolbar.tsx (groupe de boutons personnalisés de la barre)
// et Sidebar.tsx (rail/dock personnalisables) — chaque action est branchée sur le mécanisme triggerAction/
// onActionTriggered (voir ShortcutsContext.tsx), sauf les onglets natifs (champ `tab`)
// qui basculent directement activeTab dans le layout.
export const AVAILABLE_ACTIONS: CustomActionDef[] = [
  // --- Onglets natifs de la Sidebar ---
  { id: SHORTCUT_ACTIONS.TAB_COMBAT, label: "Combat", icon: Swords, category: "Onglets", tab: "GMDashboard", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TAB_NPC, label: "PNJ", icon: UsersRound, category: "Onglets", tab: "NPCManager", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TAB_ENCOUNTER, label: "Rencontre", icon: Flame, category: "Onglets", tab: "EncounterGenerator", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TAB_HISTORIQUE, label: "Historique", icon: History, category: "Onglets", tab: "Historique", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TAB_FICHE, label: "Fiche", icon: FileText, category: "Onglets", tab: "Component" },
  { id: SHORTCUT_ACTIONS.TAB_NOTES, label: "Notes", icon: Edit3, category: "Onglets", tab: "NewComponent" },
  { id: SHORTCUT_ACTIONS.TAB_DICE, label: "Dés", icon: Dice5, category: "Onglets", tab: "DiceRoller" },
  { id: SHORTCUT_ACTIONS.TAB_CHAT, label: "Chat", icon: MessageSquare, category: "Onglets", tab: "Chat" },
  { id: SHORTCUT_ACTIONS.TAB_MAP, label: "Carte", icon: Compass, category: "Onglets", tab: "MapExplorer" },

  // --- Dés ---
  { id: SHORTCUT_ACTIONS.QUICK_ROLL, label: "Saisie Rapide (dé)", icon: Dice1, category: "Dés" },
  { id: SHORTCUT_ACTIONS.ROLL_D4, label: "Lancer d4", icon: Dice2, category: "Dés" },
  { id: SHORTCUT_ACTIONS.ROLL_D6, label: "Lancer d6", icon: Dice3, category: "Dés" },
  { id: SHORTCUT_ACTIONS.ROLL_D8, label: "Lancer d8", icon: Dice4, category: "Dés" },
  { id: SHORTCUT_ACTIONS.ROLL_D10, label: "Lancer d10", icon: Dice6, category: "Dés" },
  { id: SHORTCUT_ACTIONS.ROLL_D12, label: "Lancer d12", icon: Dice6, category: "Dés" },
  { id: SHORTCUT_ACTIONS.ROLL_D20, label: "Lancer d20", icon: Dice6, category: "Dés" },
  { id: SHORTCUT_ACTIONS.ROLL_D100, label: "Lancer d100", icon: Dice6, category: "Dés" },

  // --- Interface & Vue ---
  { id: SHORTCUT_ACTIONS.QUICK_NOTE, label: "Note Rapide", icon: Edit3, category: "Interface & Vue" },
  { id: SHORTCUT_ACTIONS.TOOL_OPEN_SEARCH, label: "Recherche", icon: Search, category: "Interface & Vue" },
  { id: SHORTCUT_ACTIONS.TOOL_SETTINGS, label: "Paramètres", icon: Settings2, category: "Interface & Vue" },
  // N'a de sens que pour un joueur incarnant un personnage sur la carte (persoId requis) : le MJ n'en a pas.
  { id: SHORTCUT_ACTIONS.OPEN_BUBBLE_MENU, label: "Bulle (emoji/texte)", icon: Smile, category: "Interface & Vue", hiddenForMJ: true },
  // Bascule Character.visionBoostActive sur son propre personnage (multiplie son rayon de vision) — le MJ n'a pas de perso incarné par défaut.
  // mapToolId sert uniquement au highlight actif/inactif de l'icône (voir page.tsx, fusionné dans activeMapTools à part de getActiveToolbarTools).
  { id: SHORTCUT_ACTIONS.TOOL_VISION_BOOST, label: "Vision Augmentée", icon: Binoculars, category: "Interface & Vue", hiddenForMJ: true, mapToolId: 'vision_boost' },
  { id: SHORTCUT_ACTIONS.UNDO, label: "Annuler", icon: Undo2, category: "Interface & Vue" },
  { id: SHORTCUT_ACTIONS.REDO, label: "Refaire", icon: Redo2, category: "Interface & Vue" },
  { id: SHORTCUT_ACTIONS.TOOL_GRID, label: "Afficher/Masquer Grille", icon: Grid3x3, category: "Interface & Vue" },
  { id: SHORTCUT_ACTIONS.TOOL_BADGES, label: "Badges d'État", icon: Sparkles, category: "Interface & Vue" },
  { id: SHORTCUT_ACTIONS.TOOL_BORDERS, label: "Bordures Perso", icon: UserSquare2, category: "Interface & Vue" },
  { id: SHORTCUT_ACTIONS.TOOL_LAYERS, label: "Calques", icon: Layers, category: "Interface & Vue" },
  { id: SHORTCUT_ACTIONS.TOOL_VIEW_MODE, label: "Vue Joueur", icon: Eye, category: "Interface & Vue", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_WORLD_MAP, label: "Carte du Monde", icon: Globe, category: "Interface & Vue", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_WEATHER, label: "Météo", icon: CloudFog, category: "Interface & Vue", mjOnly: true },

  // --- Outils de Carte ---
  { id: SHORTCUT_ACTIONS.TOOL_PAN, label: "Déplacer la Carte (Pan)", icon: Move, category: "Outils de Carte" },
  { id: SHORTCUT_ACTIONS.TOOL_MEASURE, label: "Mesure / Gabarits", icon: Target, category: "Outils de Carte" },
  { id: SHORTCUT_ACTIONS.TOOL_DRAW, label: "Dessin", icon: Pencil, category: "Outils de Carte" },
  { id: SHORTCUT_ACTIONS.TOOL_ERASER, label: "Gomme", icon: Eraser, category: "Outils de Carte", mapToolId: 'eraser' },
  { id: SHORTCUT_ACTIONS.TOOL_CLEAR, label: "Supprimer les Dessins", icon: Trash2, category: "Outils de Carte" },
  { id: SHORTCUT_ACTIONS.TOOL_ZOOM_IN, label: "Zoomer", icon: ZoomIn, category: "Outils de Carte" },
  { id: SHORTCUT_ACTIONS.TOOL_ZOOM_OUT, label: "Dézoomer", icon: ZoomOut, category: "Outils de Carte" },
  { id: SHORTCUT_ACTIONS.TOOL_FOG, label: "Brouillard de Guerre", icon: CloudFog, category: "Outils de Carte", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_FOG_REVEAL_ALL, label: "Révéler la Carte", icon: Sun, category: "Outils de Carte", mjOnly: true, mapToolId: 'fog_reveal_all' },
  { id: SHORTCUT_ACTIONS.TOOL_FOG_HIDE_ALL, label: "Cacher la Carte", icon: Moon, category: "Outils de Carte", mjOnly: true, mapToolId: 'fog_hide_all' },
  { id: SHORTCUT_ACTIONS.TOOL_FOG_RESET, label: "Réinitialiser le Brouillard", icon: RotateCcw, category: "Outils de Carte", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_MULTI, label: "Sélection Multiple", icon: SquareDashedMousePointer, category: "Outils de Carte", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_PORTAL, label: "Portail", icon: Hexagon, category: "Outils de Carte", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_SPAWN, label: "Point d'Apparition", icon: MapPin, category: "Outils de Carte", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_BACKGROUND, label: "Changer Fond", icon: ImageIcon, category: "Outils de Carte", mjOnly: true },

  // --- Contenu & Audio ---
  { id: SHORTCUT_ACTIONS.TOOL_ADD_NOTE, label: "Ajouter une Note", icon: Baseline, category: "Contenu & Audio" },
  { id: SHORTCUT_ACTIONS.TOOL_ADD_CHAR, label: "Ajouter un Personnage", icon: UserPlus, category: "Contenu & Audio", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_ADD_OBJ, label: "Ajouter un Objet", icon: PackagePlus, category: "Contenu & Audio", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_MUSIC, label: "Musique / Sons", icon: Volume2, category: "Contenu & Audio", mjOnly: true },
  { id: SHORTCUT_ACTIONS.TOOL_MUSIC_PLAY_PAUSE, label: "Play/Pause Musique", icon: PlayCircle, category: "Contenu & Audio", mjOnly: true, mapToolId: 'music_play_pause' },
  { id: SHORTCUT_ACTIONS.TOOL_MIXER, label: "Table de Mixage", icon: SlidersHorizontal, category: "Contenu & Audio" },
  { id: SHORTCUT_ACTIONS.TOOL_SEARCH, label: "Ajouter un Élément", icon: CirclePlus, category: "Contenu & Audio", mjOnly: true },
]

export const ACTION_CATEGORIES: ActionCategory[] = ["Onglets", "Dés", "Interface & Vue", "Outils de Carte", "Contenu & Audio"]

export function getAvailableActions(isMJ: boolean): CustomActionDef[] {
  return AVAILABLE_ACTIONS.filter(a => (!a.mjOnly || isMJ) && (!a.hiddenForMJ || !isMJ))
}
