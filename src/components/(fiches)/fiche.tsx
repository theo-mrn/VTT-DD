"use client";

import React, { useState, useEffect } from 'react';
import {
  auth,
  db,
  doc,
  getDoc,
  updateDoc,
  storage,
  ref,
  uploadBytes,
  getDownloadURL
} from '@/lib/firebase';
import { Heart, Shield, Edit, Settings, TrendingUp, ChartColumn, Palette, Upload, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Trash2, PlusCircle, Expand, FileEdit, LayoutDashboard, Search, FileDown, UploadCloud, RotateCcw, Droplet, Minus, Plus } from 'lucide-react';
import InventoryManagement2 from '@/components/(inventaire)/inventaire2';
import CompetencesDisplay from "@/components/(competences)/competencesD";
import Competences from "@/components/(competences)/competences";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCharacter, Character } from '@/contexts/CharacterContext';
import { Statistiques } from '@/components/Statistiques';
import { WidgetAvatar, WidgetDetails, WidgetStats, WidgetVitals, WidgetCombatStats } from './FicheWidgets';
import { WidgetBourse, WidgetEffects } from './FicheWidgetsExtra';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { FloatingEditTabs } from './FloatingEditTabs';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

const ResponsiveGridLayout = WidthProvider(Responsive);

const DEFAULT_LAYOUT: Layout[] = [
  { i: 'avatar', x: 0, y: 0, w: 2, h: 4, minW: 2, minH: 3 },
  { i: 'details', x: 2, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
  { i: 'vitals', x: 6, y: 0, w: 6, h: 2, minW: 4, minH: 2 },
  { i: 'combat_stats', x: 6, y: 6, w: 6, h: 2, minW: 4, minH: 2 },
  { i: 'stats', x: 0, y: 12, w: 6, h: 5, minW: 4, minH: 3 },
  { i: 'inventory', x: 6, y: 12, w: 6, h: 5, minW: 4, minH: 4 },
  { i: 'skills', x: 0, y: 17, w: 12, h: 8, minW: 6, minH: 6 }
];

export const WIDGET_REGISTRY = [
  { id: 'bourse', label: 'Bourse', default: { w: 6, h: 4, minW: 4, minH: 3 } },
  { id: 'effects', label: 'Effets Actifs', default: { w: 6, h: 4, minW: 4, minH: 3 } },
  // Core widgets available to re-add if removed
  // { id: 'stats', label: 'Caractéristiques', default: { w: 6, h: 5, minW: 4, minH: 3 } },
  // { id: 'inventory', label: 'Inventaire', default: { w: 6, h: 5, minW: 4, minH: 4 } },
  // { id: 'skills', label: 'Compétences', default: { w: 12, h: 8, minW: 6, minH: 6 } },
];

interface UserData {
  persoId?: string;
  perso?: string;
}

interface WidgetControlsProps {
  id: string;
  updateWidgetDim: (id: string, type: 'w' | 'h', value: number | 'inc' | 'dec') => void;
  widthMode?: 'presets' | 'incremental';
  onRemove?: (id: string) => void;
}

const WidgetControls: React.FC<WidgetControlsProps> = ({ id, updateWidgetDim, widthMode = 'presets', onRemove }) => (
  <div className="absolute -top-9 right-0 z-50 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none pr-1">
    <div className="flex bg-[#2a2a2a] border border-[#3a3a3a] rounded-t-lg shadow-xl text-xs overflow-hidden pointer-events-auto">
      <div className="flex border-r border-[#3a3a3a]">
        {widthMode === 'incremental' ? (
          <>
            <button onClick={() => updateWidgetDim(id, 'w', 'dec')} className="px-2 py-1.5 hover:bg-[#3a3a3a] text-[#a0a0a0] hover:text-[#d4d4d4] border-r border-[#3a3a3a] transition-colors" title="Réduire largeur">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => updateWidgetDim(id, 'w', 'inc')} className="px-2 py-1.5 hover:bg-[#3a3a3a] text-[#a0a0a0] hover:text-[#d4d4d4] transition-colors" title="Augmenter largeur">
              <ChevronRight size={14} />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => updateWidgetDim(id, 'w', 4)} className="px-2 py-1.5 hover:bg-[#3a3a3a] text-[#a0a0a0] hover:text-[#d4d4d4] border-r border-[#3a3a3a] transition-colors" title="Largeur 1/3">1/3</button>
            <button onClick={() => updateWidgetDim(id, 'w', 6)} className="px-2 py-1.5 hover:bg-[#3a3a3a] text-[#a0a0a0] hover:text-[#d4d4d4] border-r border-[#3a3a3a] transition-colors" title="Largeur 1/2">1/2</button>
            <button onClick={() => updateWidgetDim(id, 'w', 8)} className="px-2 py-1.5 hover:bg-[#3a3a3a] text-[#a0a0a0] hover:text-[#d4d4d4] border-r border-[#3a3a3a] transition-colors" title="Largeur 2/3">2/3</button>
            <button onClick={() => updateWidgetDim(id, 'w', 12)} className="px-2 py-1.5 hover:bg-[#3a3a3a] text-[#a0a0a0] hover:text-[#d4d4d4] transition-colors" title="Pleine largeur">Full</button>
          </>
        )}
      </div>
      <div className="flex border-l border-[#3a3a3a]">
        <button onClick={() => updateWidgetDim(id, 'h', 'dec')} className="px-2 py-1.5 hover:bg-[#3a3a3a] text-[#a0a0a0] hover:text-[#d4d4d4] border-r border-[#3a3a3a] transition-colors" title="Réduire hauteur">
          <ChevronUp size={14} />
        </button>
        <button onClick={() => updateWidgetDim(id, 'h', 'inc')} className="px-2 py-1.5 hover:bg-[#3a3a3a] text-[#a0a0a0] hover:text-[#d4d4d4] transition-colors" title="Augmenter hauteur">
          <ChevronDown size={14} />
        </button>
      </div>
      <div className="flex border-l border-[#3a3a3a]">
        <div className="drag-handle px-3 py-1.5 cursor-grab active:cursor-grabbing text-[#a0a0a0] hover:text-[#d4d4d4] hover:bg-[#3a3a3a] flex items-center transition-colors">
          <Upload size={14} className="rotate-45" />
        </div>
      </div>
      {onRemove && (
        <div className="flex border-l border-[#3a3a3a]">
          <button onClick={(e) => { e.stopPropagation(); onRemove(id); }} className="px-2 py-1.5 hover:bg-red-900/50 text-[#a0a0a0] hover:text-red-400 transition-colors" title="Supprimer le widget">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  </div>
);

export default function Component() {
  const {
    characters,
    selectedCharacter,
    setSelectedCharacter,
    bonuses,
    categorizedBonuses,
    getModifier,
    getDisplayModifier,
    getDisplayValue,
    updateCharacter,
    isLoading,
    roomId,
  } = useCharacter();

  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isCustomizing, setIsCustomizing] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<Partial<Character>>({});
  const [customizationForm, setCustomizationForm] = useState<Partial<Character>>({});
  const [bgType, setBgType] = useState<'color' | 'image'>('color');
  const [blockType, setBlockType] = useState<'color' | 'image'>('color');
  const [showLevelUpModal, setShowLevelUpModal] = useState<boolean>(false);
  const [rollResult, setRollResult] = useState<number | null>(null);
  const [isRaceModalOpen, setIsRaceModalOpen] = useState(false);
  const [selectedRaceAbilities, setSelectedRaceAbilities] = useState<string[]>([]);
  const [userPersoId, setUserPersoId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showLevelUpConfirmationModal, setShowLevelUpConfirmationModal] = useState<boolean>(false);
  const [showCompetencesFullscreen, setShowCompetencesFullscreen] = useState<boolean>(false);
  const [showStatistiques, setShowStatistiques] = useState<boolean>(false);

  // Layout State
  const [layout, setLayout] = useState<Layout[]>(DEFAULT_LAYOUT);
  const [isLayoutEditing, setIsLayoutEditing] = useState(false);
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);

  useEffect(() => {
    if (selectedCharacter?.layout && selectedCharacter.layout.length > 0) {
      setLayout(selectedCharacter.layout);
    } else {
      setLayout(DEFAULT_LAYOUT);
    }
  }, [selectedCharacter]);

  const onLayoutChange = (currentLayout: Layout[]) => {
    // Prevent the grid from immediately saving the previewed layout as the actual "layout" state
    if (previewLayout) return;
    setLayout(currentLayout);
  };

  const handleSaveLayout = async () => {
    if (!selectedCharacter) return;
    try {
      // Sanitize layout to remove undefined values which Firebase rejects
      const sanitizedLayout = layout.map(l => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        minW: l.minW ?? null,
        maxW: l.maxW ?? null,
        minH: l.minH ?? null,
        maxH: l.maxH ?? null,
        static: l.static ?? false
      }));

      // Remove nulls if necessary, but null is valid in Firestore. 
      // safer to just keep essential fields
      const cleanLayout = JSON.parse(JSON.stringify(sanitizedLayout));

      await updateCharacter(selectedCharacter.id, {
        layout: cleanLayout,
        ...customizationForm
      });
      setIsLayoutEditing(false);
    } catch (error) {
      console.error("Error saving layout and customization:", error);
      alert("Erreur lors de la sauvegarde: " + (error as Error).message);
    }
  };

  const handleResetPositions = async () => {
    setLayout(DEFAULT_LAYOUT);
  };

  const handleApplyTheme = (config: { theme: typeof customizationForm; layout: typeof layout }) => {
    if (config.theme) {
      setCustomizationForm({ ...customizationForm, ...config.theme });

      const bg = config.theme.theme_background || '';
      if (bg.startsWith('http') || bg.startsWith('data:')) setBgType('image');
      else setBgType('color');

      const block = config.theme.theme_secondary_color || '';
      if (block.startsWith('http') || block.startsWith('data:')) setBlockType('image');
      else setBlockType('color');
    }
    if (config.layout && Array.isArray(config.layout)) {
      setLayout(config.layout);
    }
  };

  const handleExportConfig = () => {
    const exportData = {
      theme: customizationForm,
      layout,
    };
    const configData = JSON.stringify(exportData, null, 2);
    const blob = new Blob([configData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCharacter?.Nomperso || 'character'}_theme.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Configuration exportée avec succès !");
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        // Backward compatibility: If no 'theme' root is found, assume the old format
        const themeData = json.theme ? json.theme : json;

        setCustomizationForm({
          ...customizationForm,
          theme_background: themeData.theme_background || customizationForm.theme_background,
          theme_secondary_color: themeData.theme_secondary_color || customizationForm.theme_secondary_color,
          theme_text_color: themeData.theme_text_color || customizationForm.theme_text_color,
          theme_text_secondary_color: themeData.theme_text_secondary_color || customizationForm.theme_text_secondary_color,
          theme_border_radius: themeData.theme_border_radius ?? customizationForm.theme_border_radius,
        });

        // Update local UI states for bg/block types if they are images
        if (themeData.theme_background) {
          if (themeData.theme_background.startsWith('http') || themeData.theme_background.startsWith('data:')) setBgType('image');
          else setBgType('color');
        }
        if (themeData.theme_secondary_color) {
          if (themeData.theme_secondary_color.startsWith('http') || themeData.theme_secondary_color.startsWith('data:')) setBlockType('image');
          else setBlockType('color');
        }

        // Apply layout if included
        if (json.layout && Array.isArray(json.layout)) {
          setLayout(json.layout);
        }

        toast.success("Thème et disposition importés avec succès !");
      } catch (error) {
        toast.error("Format de fichier invalide.");
        console.error("Error parsing theme config:", error);
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be imported again if needed
    e.target.value = '';
  };

  useEffect(() => {
    const loadUserData = async () => {
      const user = auth.currentUser;
      if (!user) {
        setError("Veuillez vous connecter pour voir les personnages");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (userDoc.exists()) {
          const userData = userDoc.data() as UserData;
          setUserPersoId(userData?.persoId || null);
          setUserRole(userData?.perso || null);
        }
      } catch (error) {
        console.error("Erreur lors de la récupération des données utilisateur:", error);
        setError("Erreur lors du chargement des données: " + (error as Error).message);
      }
    };

    loadUserData();
  }, []);

  const updateWidgetDim = (id: string, type: 'w' | 'h', value: number | 'inc' | 'dec') => {
    setLayout(prevLayout => {
      return prevLayout.map(item => {
        if (item.i === id) {
          let newItem = { ...item };
          const minW = newItem.minW || 2;
          const minH = newItem.minH || 2;

          if (value === 'inc') {
            if (type === 'w') newItem.w = Math.min((newItem.w || 1) + 1, 12);
            if (type === 'h') newItem.h = (newItem.h || 1) + 1;
          } else if (value === 'dec') {
            if (type === 'w') newItem.w = Math.max((newItem.w || 1) - 1, minW);
            if (type === 'h') newItem.h = Math.max((newItem.h || 1) - 1, minH);
          } else if (typeof value === 'number') {
            if (type === 'w') newItem.w = Math.max(value, minW);
            // Handle explicit height if ever needed, though mostly unused logic currently
          }
          return newItem;
        }
        return item;
      });
    });
  };

  const handleAddWidget = (widgetId: string) => {
    const widgetDef = WIDGET_REGISTRY.find(w => w.id === widgetId);
    if (!widgetDef) return;

    setLayout(prev => {
      // Avoid duplicates
      if (prev.find(l => l.i === widgetId)) return prev;

      // Find first available gap at the bottom
      const maxY = prev.reduce((max, item) => Math.max(max, item.y + item.h), 0);

      return [
        ...prev,
        {
          i: widgetId,
          x: 0,
          y: maxY,
          ...widgetDef.default
        }
      ];
    });
    setIsAddWidgetOpen(false);
  };

  const handleRemoveWidget = (widgetId: string) => {
    setLayout(prev => prev.filter(l => l.i !== widgetId));
  };




  const handleWidgetResize = React.useCallback((id: string, height: number) => {
    setLayout(prevLayout => {
      const widgetItem = prevLayout.find(l => l.i === id);
      if (!widgetItem) return prevLayout;

      const rowHeight = 40;
      const margin = 20;
      const totalHeight = height + 20; // Padding safety

      const newH = Math.ceil((totalHeight + margin) / (rowHeight + margin));
      const finalH = Math.max(newH, widgetItem.minH || 2);

      if (widgetItem.h === finalH) return prevLayout;

      return prevLayout.map(item => {
        if (item.i === id) {
          return { ...item, h: finalH };
        }
        return item;
      });
    });
  }, []);

  const handleEdit = () => {
    if (!selectedCharacter) return;
    setEditForm({
      PV: selectedCharacter.PV || 0,
      PV_Max: selectedCharacter.PV_Max || 0,
      Defense: selectedCharacter.Defense || 0,
      Contact: selectedCharacter.Contact || 0,
      Magie: selectedCharacter.Magie || 0,
      Distance: selectedCharacter.Distance || 0,
      INIT: selectedCharacter.INIT || 0,
      FOR: selectedCharacter.FOR || 0,
      DEX: selectedCharacter.DEX || 0,
      CON: selectedCharacter.CON || 0,
      SAG: selectedCharacter.SAG || 0,
      INT: selectedCharacter.INT || 0,
      CHA: selectedCharacter.CHA || 0,
    });
    setIsEditing(true);
  };

  const handleEditModeToggle = () => {
    if (!isLayoutEditing) {
      // Entering edit mode: init customization form
      if (selectedCharacter) {
        setCustomizationForm({
          theme_background: selectedCharacter.theme_background || '#1c1c1c',
          theme_secondary_color: selectedCharacter.theme_secondary_color || '#242424',
          theme_text_color: selectedCharacter.theme_text_color || '#d4d4d4',
          theme_text_secondary_color: selectedCharacter.theme_text_secondary_color || '#a0a0a0',
          theme_border_radius: selectedCharacter.theme_border_radius ?? 8,
        });
        setBgType(selectedCharacter.theme_background?.startsWith('http') ? 'image' : 'color');
        setBlockType(selectedCharacter.theme_secondary_color?.startsWith('http') ? 'image' : 'color');
      }
    }
    setIsLayoutEditing(!isLayoutEditing);
  };



  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'background' | 'block') => {
    if (!e.target.files || e.target.files.length === 0 || !selectedCharacter) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const storageRef = ref(storage, `backgrounds/${selectedCharacter.id}_${target}_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      if (target === 'background') {
        setCustomizationForm(prev => ({ ...prev, theme_background: url }));
      } else {
        setCustomizationForm(prev => ({ ...prev, theme_secondary_color: url }));
      }
    } catch (error) {
      console.error("Error uploading image: ", error);
      alert("Erreur lors de l'upload de l'image");
    } finally {
      setUploading(false);
    }
  };



  interface RaceAbilitiesModalProps {
    abilities: string[];
    onClose: () => void;
  }

  const RaceAbilitiesModal: React.FC<RaceAbilitiesModalProps> = ({ abilities, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2a2a2a] p-4 sm:p-6 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] max-w-md w-full text-center max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg sm:text-xl font-bold text-[#c0a080] mb-4">Capacités Raciales</h2>
        <div className="space-y-3 sm:space-y-4">
          {abilities.map((ability, index) => (
            <p key={index} className="text-sm sm:text-base text-[#d4d4d4]">{ability}</p>
          ))}
        </div>
        <button
          onClick={onClose}
          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-xs sm:text-sm font-bold mt-4"
        >
          Fermer
        </button>
      </div>
    </div>
  );

  const handleRaceClick = async (race: string) => {
    console.log(race);
    if (!race) {
      setSelectedRaceAbilities(["Race non spécifiée."]);
      setIsRaceModalOpen(true);
      return;
    }

    try {
      const response = await fetch('/tabs/capacites.json');
      if (!response.ok) {
        throw new Error("Erreur lors du chargement des capacités.");
      }

      const abilitiesData: Record<string, string[]> = await response.json();
      const abilities = abilitiesData[race.toLowerCase()]
        ? Object.values(abilitiesData[race.toLowerCase()])
        : ["Aucune capacité raciale trouvée."];

      setSelectedRaceAbilities(abilities);

      setIsRaceModalOpen(true);
    } catch (error) {
      console.error("Erreur lors du chargement des capacités:", error);
      setSelectedRaceAbilities(["Erreur lors du chargement des capacités."]);
      setIsRaceModalOpen(true);
    }
  };

  const handleSave = async () => {
    if (!selectedCharacter) return;
    try {
      await updateCharacter(selectedCharacter.id, editForm);

      setIsEditing(false);
      toast.success(`Modification de ${selectedCharacter.Nomperso} réussi`, {
        duration: 2000,
      });
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error);
      toast.error('Erreur de sauvegarde', {
        description: "Impossible de sauvegarder les modifications.",
        duration: 4000,
      });
    }
  };

  const openLevelUpModal = () => {
    setShowLevelUpModal(true);
    setRollResult(null);
  };

  const handleRollDie = () => {
    if (!selectedCharacter) return;
    const deVie = selectedCharacter.deVie || 'd8';
    const faces = parseInt(deVie.substring(1));
    const roll = Math.floor(Math.random() * faces) + 1;
    const conModifier = getModifier(selectedCharacter.CON || 0);
    setRollResult(roll + conModifier);
  };

  const handleUpdatePV = async (amount: number) => {
    if (!selectedCharacter) return;
    const currentPV = selectedCharacter.PV || 0;
    const maxPV = selectedCharacter.PV_Max || 0;
    let newPV = currentPV + amount;

    if (newPV > maxPV) newPV = maxPV;

    try {
      await updateCharacter(selectedCharacter.id, { PV: newPV });
    } catch (e) {
      console.error("Error updating PV", e);
    }
  };

  const LevelUpConfirmationModal: React.FC<{ onClose: () => void; updatedCharacter: Character }> = ({ onClose, updatedCharacter }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2a2a2a] p-4 sm:p-6 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] max-w-md w-full text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-[#c0a0a0] mb-4">Niveau Augmenté !</h2>
        <p className="text-sm sm:text-base text-[#d4d4d4] mb-4">
          Félicitations, votre personnage a monté de niveau ! Voici les nouvelles valeurs :
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm text-[#a0a0a0] mb-4">
          <div>PV Max: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.PV_Max}</span></div>
          <div>Contact: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.Contact}</span></div>
          <div>Distance: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.Distance}</span></div>
          <div>Magie: <span className="text-[#d4d4d4] font-bold">{updatedCharacter.Magie}</span></div>
        </div>
        <button
          onClick={onClose}
          className="bg-[#5c6bc0] text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-[#7986cb] transition duration-300 text-xs sm:text-sm font-bold"
        >
          Fermer
        </button>
      </div>
    </div>
  );

  const confirmLevelUp = async () => {
    if (rollResult == null || !selectedCharacter) {
      toast.error('Lancer requis', {
        description: "Veuillez lancer le dé avant de valider.",
        duration: 3000,
      });
      return;
    }

    const newPV_Max = (parseInt(selectedCharacter.PV_Max as any) || 0) + rollResult;
    const newNiveau = (selectedCharacter.niveau || 0) + 1;
    const updates = {
      PV_Max: newPV_Max,
      PV: newPV_Max,
      Contact: (parseInt(selectedCharacter.Contact as any) || 0) + 1,
      Distance: (parseInt(selectedCharacter.Distance as any) || 0) + 1,
      Magie: (parseInt(selectedCharacter.Magie as any) || 0) + 1,
      niveau: newNiveau,
    };

    try {
      await updateCharacter(selectedCharacter.id, updates);

      setShowLevelUpModal(false);
      setShowLevelUpConfirmationModal(true);

      toast.success(`🎉 Niveau ${newNiveau} atteint !`, {
        description: `${selectedCharacter.Nomperso} a gagné ${rollResult} PV et +1 en Contact, Distance et Magie.`,
        duration: 5000,
      });
    } catch (error) {
      console.error("Erreur lors de l'augmentation de niveau:", error);
      toast.error('Erreur de montée de niveau', {
        description: "Impossible d'augmenter le niveau du personnage.",
        duration: 4000,
      });
    }
  };

  const closeLevelUpModal = () => {
    setShowLevelUpModal(false);
  };

  // Temporary preview theme from portal hover – overrides displayed values without saving
  const [previewTheme, setPreviewTheme] = useState<Record<string, any> | null>(null);
  const [previewLayout, setPreviewLayout] = useState<any[] | null>(null);

  if (isLoading) {
    return <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4 flex items-center justify-center">
      Chargement...
    </div>;
  }

  if (error) {
    return <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-4 flex items-center justify-center">
      <div className="bg-red-500/10 text-red-500 p-4 rounded-lg">
        {error}
      </div>
    </div>;
  }

  // Si le gestionnaire de compétences plein écran est ouvert, l'afficher
  if (showCompetencesFullscreen && selectedCharacter) {
    return (
      <Competences
        preSelectedCharacterId={selectedCharacter.id}
        onClose={() => setShowCompetencesFullscreen(false)}
      />
    );
  }



  const bgValue = (previewTheme?.theme_background ?? (isLayoutEditing ? customizationForm.theme_background : selectedCharacter?.theme_background)) || '';
  const secondaryValue = (previewTheme?.theme_secondary_color ?? (isLayoutEditing ? customizationForm.theme_secondary_color : selectedCharacter?.theme_secondary_color)) || '';
  const textValue = (previewTheme?.theme_text_color ?? (isLayoutEditing ? customizationForm.theme_text_color : selectedCharacter?.theme_text_color)) || '#d4d4d4';
  const textSecondaryValue = (previewTheme?.theme_text_secondary_color ?? (isLayoutEditing ? customizationForm.theme_text_secondary_color : selectedCharacter?.theme_text_secondary_color)) || '#a0a0a0';
  const borderRadiusValue = previewTheme?.theme_border_radius ??
    (isLayoutEditing ? (customizationForm.theme_border_radius ?? 8) : (selectedCharacter?.theme_border_radius ?? 8));

  const mainStyle: React.CSSProperties = bgValue
    ? (bgValue.startsWith('http')
      ? { backgroundImage: `url(${bgValue})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
      : { backgroundColor: bgValue })
    : {};

  const boxStyle: React.CSSProperties = {
    ...(secondaryValue
      ? (secondaryValue.startsWith('http')
        ? { backgroundImage: `url(${secondaryValue})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
        : { backgroundColor: secondaryValue })
      : {}),
    '--text-primary': textValue,
    '--text-secondary': textSecondaryValue,
    '--block-radius': `${borderRadiusValue}px`,
  } as React.CSSProperties & { '--text-primary'?: string, '--text-secondary'?: string, '--block-radius'?: string };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#1c1c1c] text-[#d4d4d4] p-2 sm:p-4">
        {/* Barre de personnages séparée */}
        <div className="max-w-7xl mx-auto mb-6 bg-[#242424] p-2 rounded-lg shadow-md flex items-center justify-between gap-4">
          <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-[#3a3a3a] scrollbar-track-transparent">
            {characters.map((character) => (
              <button
                key={character.id}
                onClick={() => setSelectedCharacter(character)}
                className={`px-3 py-2 sm:px-4 ${selectedCharacter?.id === character.id
                  ? 'bg-[#d4b48f]'
                  : 'bg-[#c0a080]'
                  } text-[#1c1c1c] rounded-lg hover:bg-[#d4b48f] transition whitespace-nowrap text-xs sm:text-sm font-bold flex-shrink-0`}
              >
                {character.Nomperso}
              </button>
            ))}
          </div>

          {selectedCharacter && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {(selectedCharacter.id === userPersoId || userRole === "MJ") && (
                <>
                  <button
                    id="vtt-fiche-btn-modifier"
                    onClick={handleEdit}
                    className="bg-[#3a3a3a] text-[#c0a080] p-2 rounded-lg hover:bg-[#4a4a4a] transition duration-200 flex items-center gap-1 text-xs sm:text-sm"
                    title="Modifier"
                  >
                    <Edit size={16} />
                    <span className="hidden sm:inline">Modifier</span>
                  </button>
                  <button
                    id="vtt-fiche-btn-level-up"
                    onClick={openLevelUpModal}
                    className="bg-[#3a3a3a] text-[#5c6bc0] p-2 rounded-lg hover:bg-[#4a4a4a] transition duration-200 flex items-center gap-1 text-xs sm:text-sm"
                    title="Monter de niveau"
                  >
                    <TrendingUp size={16} />
                    <span className="hidden sm:inline">Niveau +</span>
                  </button>
                </>
              )}

              <button
                id="vtt-fiche-btn-stats"
                onClick={() => setShowStatistiques(true)}
                className="bg-[#3a3a3a] text-[#c0a080] p-2 rounded-lg hover:bg-[#4a4a4a] transition duration-200 flex items-center gap-1 text-xs sm:text-sm"
                title="Voir les statistiques"
              >
                <ChartColumn size={16} />
                <span className="hidden sm:inline">Stats</span>
              </button>

              {(selectedCharacter.id === userPersoId || userRole === "MJ") && (
                <button
                  id="vtt-fiche-btn-edition"
                  onClick={handleEditModeToggle}
                  className={`p-2 rounded-lg transition duration-200 flex items-center gap-1 text-xs sm:text-sm ${isLayoutEditing ? 'bg-[#c0a080] text-[#1c1c1c]' : 'bg-[#3a3a3a] text-[#80c0a0] hover:bg-[#4a4a4a]'}`}
                  title="Mode Édition (Style & Disposition)"
                >
                  <Palette size={16} />
                  <span className="hidden sm:inline">Édition</span>
                </button>
              )}
            </div>
          )}
        </div>

        {isLayoutEditing && (
          <FloatingEditTabs
            customizationForm={customizationForm}
            setCustomizationForm={setCustomizationForm}
            handleImageUpload={handleImageUpload}
            handleImportConfig={handleImportConfig}
            handleExportConfig={handleExportConfig}
            handleResetPositions={handleResetPositions}
            handleSaveLayout={handleSaveLayout}
            layout={layout}
            WIDGET_REGISTRY={WIDGET_REGISTRY}
            isAddWidgetOpen={isAddWidgetOpen}
            setIsAddWidgetOpen={setIsAddWidgetOpen}
            handleAddWidget={handleAddWidget}
            onApplyTheme={handleApplyTheme}
            onPreviewTheme={(config: any) => {
              if (config.theme) {
                setPreviewTheme(config.theme);
              }
              if (config.layout?.length) setPreviewLayout(config.layout);
            }}
            onStopPreview={() => {
              setPreviewTheme(null);
              setPreviewLayout(null);
            }}
            onClose={() => setIsLayoutEditing(false)}
          />
        )}

        <div className={`max-w-7xl mx-auto bg-[#242424] rounded-[length:var(--block-radius,0.5rem)] shadow-2xl p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6 ${isLayoutEditing ? 'mb-[40vh]' : ''}`} style={mainStyle}>
          {selectedCharacter && !isEditing && (
            isLayoutEditing ? (
              <ResponsiveGridLayout
                className="layout"
                layouts={{ lg: previewLayout ?? layout, md: previewLayout ?? layout, sm: previewLayout ?? layout, xs: previewLayout ?? layout, xxs: previewLayout ?? layout }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={40}
                margin={[20, 20]}
                containerPadding={[0, 0]}
                onLayoutChange={onLayoutChange}
                isDraggable={true}
                isResizable={false}
                draggableHandle=".drag-handle"
              >
                <div id="vtt-widget-avatar" key="avatar" className="relative group hover:z-[100]">
                  <WidgetControls id="avatar" updateWidgetDim={updateWidgetDim} widthMode="incremental" />
                  <div className="h-full w-full overflow-hidden rounded-[length:var(--block-radius,0.5rem)] bg-[#242424] border border-dashed border-gray-600">
                    <WidgetAvatar style={boxStyle} />
                  </div>
                </div>
                <div id="vtt-widget-details" key="details" className="relative group hover:z-[100]">
                  <WidgetControls id="details" updateWidgetDim={updateWidgetDim} widthMode="incremental" />
                  <div className="h-full w-full overflow-hidden rounded-[length:var(--block-radius,0.5rem)] bg-[#242424] border border-dashed border-gray-600">
                    <WidgetDetails style={boxStyle} onRaceClick={handleRaceClick} />
                  </div>
                </div>
                <div id="vtt-widget-stats" key="stats" className="relative group hover:z-[100]">
                  <WidgetControls id="stats" updateWidgetDim={updateWidgetDim} widthMode="presets" />
                  <div className="h-full w-full overflow-hidden rounded-[length:var(--block-radius,0.5rem)] bg-[#242424] border border-dashed border-gray-600">
                    <WidgetStats style={boxStyle} />
                  </div>
                </div>
                <div id="vtt-widget-vitals" key="vitals" className="relative group hover:z-[100]">
                  <WidgetControls id="vitals" updateWidgetDim={updateWidgetDim} widthMode="presets" />
                  <div className="h-full w-full overflow-hidden rounded-[length:var(--block-radius,0.5rem)] bg-[#242424] border border-dashed border-gray-600">
                    <WidgetVitals style={boxStyle} />
                  </div>
                </div>
                <div id="vtt-widget-combat-stats" key="combat_stats" className="relative group hover:z-[100]">
                  <WidgetControls id="combat_stats" updateWidgetDim={updateWidgetDim} widthMode="presets" />
                  <div className="h-full w-full overflow-hidden rounded-[length:var(--block-radius,0.5rem)] bg-[#242424] border border-dashed border-gray-600">
                    <WidgetCombatStats style={boxStyle} />
                  </div>
                </div>
                <div id="vtt-widget-inventory" key="inventory" className="relative group hover:z-[100]">
                  <WidgetControls id="inventory" updateWidgetDim={updateWidgetDim} widthMode="presets" />
                  <div className="h-full w-full overflow-hidden rounded-[length:var(--block-radius,0.5rem)] bg-[#242424] border border-dashed border-gray-600">
                    <InventoryManagement2
                      playerName={selectedCharacter.Nomperso}
                      roomId={roomId!}
                      canEdit={selectedCharacter.id === userPersoId || userRole === "MJ"}
                      style={boxStyle}
                    />
                  </div>
                </div>
                <div id="vtt-widget-skills" key="skills" className="relative group hover:z-[100]">
                  <WidgetControls id="skills" updateWidgetDim={updateWidgetDim} widthMode="presets" />
                  <div className="h-full w-full overflow-hidden rounded-[length:var(--block-radius,0.5rem)] bg-[#242424] border border-dashed border-gray-600">
                    <CompetencesDisplay
                      roomId={roomId!}
                      characterId={selectedCharacter.id}
                      canEdit={selectedCharacter.id === userPersoId || userRole === "MJ"}
                      onOpenFullscreen={() => setShowCompetencesFullscreen(true)}
                      onHeightChange={(h) => handleWidgetResize('skills', h)}
                      style={boxStyle}
                    />
                  </div>
                </div>
                {layout.find(l => l.i === 'bourse') && (
                  <div key="bourse" className="relative group hover:z-[100]">
                    <WidgetControls id="bourse" updateWidgetDim={updateWidgetDim} widthMode="presets" onRemove={handleRemoveWidget} />
                    <div className="h-full w-full overflow-hidden rounded-[length:var(--block-radius,0.5rem)] bg-[#242424] border border-dashed border-gray-600">
                      <WidgetBourse style={boxStyle} />
                    </div>
                  </div>
                )}
                {layout.find(l => l.i === 'effects') && (
                  <div key="effects" className="relative group hover:z-[100]">
                    <WidgetControls id="effects" updateWidgetDim={updateWidgetDim} widthMode="presets" onRemove={handleRemoveWidget} />
                    <div className="h-full w-full overflow-hidden rounded-[length:var(--block-radius,0.5rem)] bg-[#242424] border border-dashed border-gray-600">
                      <WidgetEffects style={boxStyle} />
                    </div>
                  </div>
                )}
              </ResponsiveGridLayout>
            ) : (
              <ResponsiveGridLayout
                className="layout"
                layouts={{ lg: layout }}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={40}
                margin={[20, 20]}
                containerPadding={[0, 0]}
                isDraggable={false}
                isResizable={false}
              >
                <div id="vtt-widget-avatar-view" key="avatar" className="overflow-hidden h-full"><WidgetAvatar style={boxStyle} /></div>
                <div id="vtt-widget-details-view" key="details" className="overflow-hidden h-full"><WidgetDetails style={boxStyle} onRaceClick={handleRaceClick} /></div>
                <div id="vtt-widget-stats-view" key="stats" className="overflow-hidden h-full"><WidgetStats style={boxStyle} /></div>
                {layout.find(l => l.i === 'bourse') && <div key="bourse" className="overflow-hidden h-full"><WidgetBourse style={boxStyle} /></div>}
                {layout.find(l => l.i === 'effects') && <div key="effects" className="overflow-hidden h-full"><WidgetEffects style={boxStyle} /></div>}
                <div id="vtt-widget-vitals-view" key="vitals" className="overflow-hidden h-full">
                  <Drawer>
                    <DrawerTrigger asChild>
                      <button className="w-full h-full text-left p-0 bg-transparent border-0 cursor-pointer block hover:brightness-110 transition-all">
                        <WidgetVitals style={boxStyle} />
                      </button>
                    </DrawerTrigger>
                    <DrawerContent className="bg-[#1c1c1c] border-[#3a3a3a] text-[#d4d4d4]">
                      <div className="mx-auto w-full max-w-sm">
                        <DrawerHeader>
                          <DrawerTitle className="text-[#c0a080]">Gestion des Points de Vie</DrawerTitle>
                          <DrawerDescription className="text-[#a0a0a0]">Ajustez les points de vie de votre personnage.</DrawerDescription>
                        </DrawerHeader>
                        <div className="p-4 pb-0">
                          <div className="flex items-center justify-center space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 shrink-0 rounded-full bg-[#2a2a2a] border-[#3a3a3a] hover:bg-[#3a3a3a]/80 text-[#d4d4d4]"
                              onClick={() => handleUpdatePV(-5)}
                              disabled={!selectedCharacter}
                            >
                              <span className="font-bold">-5</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0 rounded-full bg-[#2a2a2a] border-[#3a3a3a] hover:bg-[#3a3a3a]/80 text-[#d4d4d4]"
                              onClick={() => handleUpdatePV(-1)}
                              disabled={!selectedCharacter}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>

                            <div className="flex-1 text-center">
                              <div className="text-5xl font-bold tracking-tighter text-[#d4d4d4]">
                                {selectedCharacter?.PV}
                              </div>
                              <div className="text-[0.70rem] uppercase text-muted-foreground text-[#a0a0a0]">
                                PV ACTUELS / {selectedCharacter?.PV_Max} MAX
                              </div>
                            </div>

                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0 rounded-full bg-[#2a2a2a] border-[#3a3a3a] hover:bg-[#3a3a3a]/80 text-[#d4d4d4]"
                              onClick={() => handleUpdatePV(1)}
                              disabled={!selectedCharacter || (selectedCharacter?.PV || 0) >= (selectedCharacter?.PV_Max || 0)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-10 w-10 shrink-0 rounded-full bg-[#2a2a2a] border-[#3a3a3a] hover:bg-[#3a3a3a]/80 text-[#d4d4d4]"
                              onClick={() => handleUpdatePV(5)}
                              disabled={!selectedCharacter || (selectedCharacter?.PV || 0) >= (selectedCharacter?.PV_Max || 0)}
                            >
                              <span className="font-bold">+5</span>
                            </Button>
                          </div>
                          <div className="mt-8 flex justify-center">
                            <Button
                              variant="ghost"
                              className="text-[#80c0a0] hover:text-[#80c0a0] hover:bg-[#2a2a2a]"
                              onClick={() => handleUpdatePV((selectedCharacter?.PV_Max || 0) - (selectedCharacter?.PV || 0))}
                              disabled={!selectedCharacter || (selectedCharacter?.PV || 0) >= (selectedCharacter?.PV_Max || 0)}
                            >
                              Repos complet (Full PV)
                            </Button>
                          </div>
                        </div>
                        <DrawerFooter>
                          <DrawerClose asChild>
                            <Button variant="outline" className="bg-[#2a2a2a] border-[#3a3a3a] text-[#d4d4d4] hover:bg-[#3a3a3a]/80">Fermer</Button>
                          </DrawerClose>
                        </DrawerFooter>
                      </div>
                    </DrawerContent>
                  </Drawer>
                </div>
                <div id="vtt-widget-combat-stats-view" key="combat_stats" className="overflow-hidden h-full"><WidgetCombatStats style={boxStyle} /></div>
                <div id="vtt-widget-inventory-view" key="inventory" className="overflow-hidden h-full">
                  <InventoryManagement2
                    playerName={selectedCharacter.Nomperso}
                    roomId={roomId!}
                    canEdit={selectedCharacter.id === userPersoId || userRole === "MJ"}
                    style={boxStyle}
                  />
                </div>
                <div id="vtt-widget-skills-view" key="skills" className="overflow-hidden h-full">
                  <CompetencesDisplay
                    roomId={roomId!}
                    characterId={selectedCharacter.id}
                    canEdit={selectedCharacter.id === userPersoId || userRole === "MJ"}
                    onOpenFullscreen={() => setShowCompetencesFullscreen(true)}
                    onHeightChange={(h) => handleWidgetResize('skills', h)}
                    style={boxStyle}
                  />
                </div>
              </ResponsiveGridLayout>
            )
          )}


          {showLevelUpConfirmationModal && selectedCharacter && (
            <LevelUpConfirmationModal
              onClose={() => setShowLevelUpConfirmationModal(false)}
              updatedCharacter={selectedCharacter}
            />
          )}

          {isEditing && (
            <div className="bg-[#2a2a2a] p-4 sm:p-6 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a]">
              <h2 className="text-lg sm:text-xl font-bold text-[#c0a0a0] mb-4">
                Modifier {selectedCharacter?.Nomperso || "Personnage"}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm block">PV</label>
                  <input
                    type="number"
                    value={editForm.PV || ''}
                    onChange={(e) => setEditForm({ ...editForm, PV: parseInt(e.target.value) })}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm block">PV Maximum</label>
                  <input
                    type="number"
                    value={editForm.PV_Max || ''}
                    onChange={(e) => setEditForm({ ...editForm, PV_Max: parseInt(e.target.value) })}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm block">Défense</label>
                  <input
                    type="number"
                    value={editForm.Defense || ''}
                    onChange={(e) => setEditForm({ ...editForm, Defense: parseInt(e.target.value) })}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm block">Contact</label>
                  <input
                    type="number"
                    value={editForm.Contact || ''}
                    onChange={(e) => setEditForm({ ...editForm, Contact: parseInt(e.target.value) })}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm block">Magie</label>
                  <input
                    type="number"
                    value={editForm.Magie || ''}
                    onChange={(e) => setEditForm({ ...editForm, Magie: parseInt(e.target.value) })}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm block">Distance</label>
                  <input
                    type="number"
                    value={editForm.Distance || ''}
                    onChange={(e) => setEditForm({ ...editForm, Distance: parseInt(e.target.value) })}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm block">Initiative</label>
                  <input
                    type="number"
                    value={editForm.INIT || ''}
                    onChange={(e) => setEditForm({ ...editForm, INIT: parseInt(e.target.value) })}
                    className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
                {['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((stat) => (
                  <div key={stat} className="space-y-2">
                    <label className="text-xs sm:text-sm block">{stat}</label>
                    <input
                      type="number"
                      value={(editForm[stat as keyof Character] as number) || ''}
                      onChange={(e) => setEditForm({ ...editForm, [stat]: parseInt(e.target.value) })}
                      className="w-full bg-[#1c1c1c] rounded px-3 py-2 text-white text-sm"
                    />
                  </div>
                ))}
              </div>




              <div className="flex flex-col xs:flex-row justify-end gap-3 xs:gap-4">
                <button
                  onClick={() => setIsEditing(false)}
                  className="bg-gray-600 text-white px-4 sm:px-6 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-xs sm:text-sm font-bold"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  className="bg-[#c0a080] text-[#1c1c1c] px-4 sm:px-6 py-2 rounded-lg hover:bg-[#d4b48f] transition duration-300 text-xs sm:text-sm font-bold"
                >
                  Sauvegarder
                </button>
              </div>
            </div>
          )}

          {isRaceModalOpen && (
            <RaceAbilitiesModal
              abilities={selectedRaceAbilities}
              onClose={() => setIsRaceModalOpen(false)}
            />
          )}

          {showLevelUpModal && selectedCharacter && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-[#2a2a2a] p-4 sm:p-6 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] max-w-md w-full text-center">
                <h2 className="text-lg sm:text-xl font-bold text-[#c0a0a0] mb-4">Monter de Niveau</h2>
                <p className="text-sm sm:text-base text-[#d4d4d4] mb-4">Lancez un dé pour augmenter les PV Max.</p>
                <button
                  onClick={handleRollDie}
                  className="bg-[#c0a080] text-[#1c1c1c] px-4 py-2 rounded-lg mb-4 hover:bg-[#d4b48f] transition duration-300 text-xs sm:text-sm font-bold"
                >
                  Lancer le Dé
                </button>
                {rollResult !== null && selectedCharacter && (
                  <div className="text-lg sm:text-2xl font-bold text-green-500 mb-4 break-words">
                    {rollResult - getModifier(selectedCharacter.CON || 0)} + CON ({getModifier(selectedCharacter.CON || 0)}) = {rollResult}
                  </div>
                )}
                <div className="flex flex-col xs:flex-row justify-center gap-3 xs:gap-4">
                  <button
                    onClick={confirmLevelUp}
                    className="bg-[#5c6bc0] text-white px-4 py-2 rounded-lg hover:bg-[#7986cb] transition duration-300 text-xs sm:text-sm font-bold"
                  >
                    Valider
                  </button>
                  <button
                    onClick={closeLevelUpModal}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-xs sm:text-sm font-bold"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}

          {showStatistiques && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-[#1c1c1c] rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-[#1c1c1c] border-b border-[#3a3a3a] p-4 flex justify-between items-center z-10">
                  <h2 className="text-lg sm:text-xl font-bold text-[#c0a080]">Statistiques des Joueurs</h2>
                  <button
                    onClick={() => setShowStatistiques(false)}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition duration-300 text-xs sm:text-sm font-bold"
                  >
                    Fermer
                  </button>
                </div>
                <div className="p-0">
                  <Statistiques />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider >
  );
}
