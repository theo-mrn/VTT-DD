"use client"

import { useEffect } from 'react';
import { useShortcuts, SHORTCUT_ACTIONS } from '@/contexts/ShortcutsContext';
import { useUndoRedo } from '@/contexts/UndoRedoContext';
import { TOOLS } from '@/components/(map)/MapToolbar';
import { toast } from 'sonner';
import { pasteCharacter } from '@/utils/pasteCharacter';
import { pasteObject } from '@/utils/pasteObject';
import type { Character, MapObject, Point, DrawingTool } from '@/app/[roomid]/map/types';
import type { EdgeMeta } from '@/lib/visibility';

// ---- Types ----

export interface UseKeyboardShortcutsParams {
  // Identity
  roomId: string;
  isMJ: boolean;
  persoId: string | null;
  selectedCityId: string | null;

  // Selection state (read-only)
  selectedCharacters: number[];
  selectedCharacterIndex: number | null;
  selectedObjectIndices: number[];
  selectedNoteIndex: number | null;
  selectedMusicZoneIds: string[];
  selectedObstacleIds: string[];
  selectedDrawingIndex: number | null;
  selectedFogCells: string[];
  isVisActive: boolean;

  // Obstacle drawing state (read-only)
  isDrawingObstacle: boolean;
  currentObstaclePoints: Point[];
  pendingEdges: EdgeMeta[];
  visibilityMode: boolean;

  // Copy/paste state (read-only)
  copiedCharacterTemplate: Character | null;
  copiedObjectTemplate: MapObject | null;

  // Data (read-only)
  characters: Character[];
  objects: MapObject[];

  // Setters - obstacle drawing
  setIsDrawingObstacle: (v: boolean) => void;
  setCurrentObstaclePoints: (v: Point[]) => void;
  setPendingEdges: (v: EdgeMeta[]) => void;
  setSelectedFogCells: (v: string[]) => void;
  setVisibilityMode: (v: boolean) => void;

  // Setters - copy/paste
  setCopiedCharacterTemplate: (v: Character | null) => void;
  setCopiedObjectTemplate: (v: MapObject | null) => void;

  // Setters - search & settings
  setIsUnifiedSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGlobalSettingsDialog: (v: boolean) => void;

  // Setters - toolbar tool modes
  setMeasureMode: (v: boolean) => void;
  drawMode: boolean;
  setDrawMode: (v: boolean) => void;
  setPanMode: (v: boolean) => void;
  currentTool: DrawingTool;
  setCurrentTool: (v: DrawingTool) => void;
  fullMapFog: boolean;

  // Setters - character bubble menu
  setBubbleMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Callbacks
  handleDeleteKeyPress: () => void;
  saveObstacle: (
    type: 'wall' | 'polygon' | 'one-way-wall' | 'door' | 'window',
    points: Point[],
    additionalProps?: {
      direction?: 'north' | 'south' | 'east' | 'west';
      isOpen?: boolean;
      edges?: EdgeMeta[];
    }
  ) => Promise<void>;
  handleToolbarAction: (actionId: string) => void;

  // Actions "directes" (bypass le mode toggle, effet immédiat) pour boutons personnalisables
  toggleMusicPlayPause: () => void;
  handleFullMapFogChange: (value: boolean) => void;
  clearFog: () => void;
}

// ---- Hook ----

export function useKeyboardShortcuts(params: UseKeyboardShortcutsParams): void {
  const {
    roomId,
    isMJ,
    persoId,
    selectedCityId,
    selectedCharacters,
    selectedCharacterIndex,
    selectedObjectIndices,
    selectedNoteIndex,
    selectedMusicZoneIds,
    selectedObstacleIds,
    selectedDrawingIndex,
    selectedFogCells,
    isVisActive,
    isDrawingObstacle,
    currentObstaclePoints,
    pendingEdges,
    visibilityMode,
    copiedCharacterTemplate,
    copiedObjectTemplate,
    characters,
    objects,
    setIsDrawingObstacle,
    setCurrentObstaclePoints,
    setPendingEdges,
    setSelectedFogCells,
    setVisibilityMode,
    setCopiedCharacterTemplate,
    setCopiedObjectTemplate,
    setIsUnifiedSearchOpen,
    setShowGlobalSettingsDialog,
    setMeasureMode,
    drawMode,
    setDrawMode,
    setPanMode,
    currentTool,
    setCurrentTool,
    fullMapFog,
    setBubbleMenuOpen,
    handleDeleteKeyPress,
    saveObstacle,
    handleToolbarAction,
    toggleMusicPlayPause,
    handleFullMapFogChange,
    clearFog,
  } = params;

  const { isShortcutPressed, onActionTriggered } = useShortcuts();
  const { undo, redo } = useUndoRedo();

  // -------------------------------------------------------
  // 1. UNDO/REDO KEYBOARD SHORTCUTS
  // -------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.UNDO)) {
        e.preventDefault();
        undo();
      } else if (isShortcutPressed(e, SHORTCUT_ACTIONS.REDO)) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShortcutPressed, undo, redo]);

  // Boutons personnalisables (voir CustomButtons) : même effet que le raccourci clavier
  // correspondant, déclenché par clic — couvre toutes les actions de MapToolbar/Sidebar.
  useEffect(() => {
    const unsubs = [
      onActionTriggered(SHORTCUT_ACTIONS.UNDO, undo),
      onActionTriggered(SHORTCUT_ACTIONS.REDO, redo),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_SETTINGS, () => setShowGlobalSettingsDialog(true)),
      onActionTriggered(SHORTCUT_ACTIONS.OPEN_BUBBLE_MENU, () => {
        if (persoId) setBubbleMenuOpen(prev => !prev);
      }),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_GRID, () => handleToolbarAction(TOOLS.GRID)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_FOG, () => handleToolbarAction(TOOLS.VISIBILITY)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_BADGES, () => handleToolbarAction(TOOLS.TOGGLE_ALL_BADGES)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_BORDERS, () => handleToolbarAction(TOOLS.TOGGLE_CHAR_BORDERS)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_LAYERS, () => handleToolbarAction(TOOLS.LAYERS)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_MIXER, () => handleToolbarAction(TOOLS.AUDIO_MIXER)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_BACKGROUND, () => handleToolbarAction(TOOLS.BACKGROUND)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_VIEW_MODE, () => handleToolbarAction(TOOLS.VIEW_MODE)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_WORLD_MAP, () => handleToolbarAction(TOOLS.WORLD_MAP)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_PAN, () => handleToolbarAction(TOOLS.PAN)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_MEASURE, () => handleToolbarAction(TOOLS.MEASURE)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_DRAW, () => handleToolbarAction(TOOLS.DRAW)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_ZOOM_IN, () => handleToolbarAction(TOOLS.ZOOM_IN)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_ZOOM_OUT, () => handleToolbarAction(TOOLS.ZOOM_OUT)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_ADD_NOTE, () => handleToolbarAction(TOOLS.ADD_NOTE)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_ADD_CHAR, () => handleToolbarAction(TOOLS.ADD_CHAR)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_ADD_OBJ, () => handleToolbarAction(TOOLS.ADD_OBJ)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_MUSIC, () => handleToolbarAction(TOOLS.MUSIC)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_PORTAL, () => handleToolbarAction(TOOLS.PORTAL)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_SPAWN, () => handleToolbarAction(TOOLS.SPAWN_POINT)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_MULTI, () => handleToolbarAction(TOOLS.MULTI_SELECT)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_SEARCH, () => handleToolbarAction(TOOLS.UNIFIED_SEARCH)),
      // Actions directes : effet immédiat sans passer par un mode/panneau
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_CLEAR, () => handleToolbarAction(TOOLS.CLEAR_DRAWINGS)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_ERASER, () => {
        // Toggle : si la gomme est déjà l'outil actif, on repasse en mode sélection.
        if (drawMode && currentTool === 'eraser') {
          setDrawMode(false);
        } else {
          setDrawMode(true);
          setCurrentTool('eraser');
        }
      }),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_MUSIC_PLAY_PAUSE, toggleMusicPlayPause),
      // Toggle : recliquer sur "Révéler"/"Cacher" alors que l'état est déjà celui demandé
      // annule l'effet (bascule vers l'autre état) plutôt que de le réappliquer sans effet visible.
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_FOG_REVEAL_ALL, () => handleFullMapFogChange(!fullMapFog ? true : false)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_FOG_HIDE_ALL, () => handleFullMapFogChange(fullMapFog ? false : true)),
      onActionTriggered(SHORTCUT_ACTIONS.TOOL_FOG_RESET, clearFog),
    ];
    return () => unsubs.forEach(u => u());
  }, [
    onActionTriggered, undo, redo, setShowGlobalSettingsDialog, persoId, setBubbleMenuOpen,
    handleToolbarAction, drawMode, setDrawMode, currentTool, setCurrentTool, toggleMusicPlayPause,
    fullMapFog, handleFullMapFogChange, clearFog,
  ]);

  // -------------------------------------------------------
  // 2. MAIN KEYBOARD EVENT HANDLER (delete, escape, copy/paste)
  // -------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore inputs (fix for typing deletion issue)
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
      ) {
        return;
      }

      // CENTRALIZED DELETE - Handle Delete/Backspace for any selected entity
      if ((e.key === 'Delete' || e.key === 'Backspace') && isMJ) {
        const hasSelection =
          selectedCharacters.length > 0 ||
          selectedCharacterIndex !== null ||
          selectedObjectIndices.length > 0 ||
          selectedNoteIndex !== null ||
          selectedMusicZoneIds.length > 0 ||
          (selectedObstacleIds.length > 0 && isVisActive) ||
          selectedDrawingIndex !== null ||
          selectedFogCells.length > 0;

        if (hasSelection) {
          e.preventDefault();
          handleDeleteKeyPress();
          return;
        }
      }

      // Finir le dessin d'obstacle en cours avec Escape (sauvegarde les segments individuels)
      if (e.key === 'Escape' && isDrawingObstacle) {
        e.preventDefault();

        // Sauvegarder tous les segments accumules comme murs individuels
        if (currentObstaclePoints.length >= 2 && pendingEdges.length > 0) {
          const pointsToSave = [...currentObstaclePoints];
          (async () => {
            for (let i = 0; i < pointsToSave.length - 1; i++) {
              const segPoints = [pointsToSave[i], pointsToSave[i + 1]];
              await saveObstacle('wall', segPoints);
            }
          })();
        }

        setIsDrawingObstacle(false);
        setCurrentObstaclePoints([]);
        setPendingEdges([]);
      }

      // Deselectionner les cases de brouillard avec Escape
      if (e.key === 'Escape' && selectedFogCells.length > 0) {
        e.preventDefault();
        setSelectedFogCells([]);
      }

      // Quitter le mode obstacle avec Escape si pas de dessin en cours
      if (e.key === 'Escape' && visibilityMode && !isDrawingObstacle) {
        e.preventDefault();
        setVisibilityMode(false);
      }

      // COPY (Ctrl+C / Cmd+C)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        // Check if a character is selected
        if (selectedCharacterIndex !== null && characters[selectedCharacterIndex]) {
          const charToCopy = characters[selectedCharacterIndex];

          if (charToCopy.type === 'joueurs') {
            toast.error("Impossible de copier un personnage joueur");
            return;
          }

          setCopiedCharacterTemplate(charToCopy);
          setCopiedObjectTemplate(null); // Clear object copy
          console.log("Character copied:", charToCopy.name);
          toast.success(`Personnage copié : ${charToCopy.name}`);
        }
        // Check if an object is selected
        else if (selectedObjectIndices.length > 0) {
          // For now, take the first selected object (single copy support)
          const objIndex = selectedObjectIndices[0];
          const objToCopy = objects[objIndex];
          if (objToCopy) {
            setCopiedObjectTemplate(objToCopy);
            setCopiedCharacterTemplate(null); // Clear char copy
            console.log("Object copied:", objToCopy.name);
            toast.success(`Objet copié : ${objToCopy.name}`);
          }
        }
      }

      // PASTE (Ctrl+V / Cmd+V)
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (isMJ) { // Ensure only MJ can paste for now
          if (copiedCharacterTemplate) {
            pasteCharacter(roomId, copiedCharacterTemplate, selectedCityId)
              .then(() => toast.success(`Personnage collé : ${copiedCharacterTemplate.name}`))
              .catch(err => console.error("Failed to paste character:", err));
          } else if (copiedObjectTemplate) {
            pasteObject(roomId, copiedObjectTemplate, selectedCityId)
              .then(() => toast.success(`Objet collé : ${copiedObjectTemplate.name}`))
              .catch(err => console.error("Failed to paste object:", err));
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedCharacters,
    selectedCharacterIndex,
    selectedObjectIndices,
    selectedNoteIndex,
    selectedMusicZoneIds,
    selectedObstacleIds,
    selectedDrawingIndex,
    selectedFogCells,
    visibilityMode,
    isDrawingObstacle,
    isMJ,
    copiedCharacterTemplate,
    copiedObjectTemplate,
    roomId,
    selectedCityId,
    isVisActive,
    currentObstaclePoints,
    pendingEdges,
    characters,
    objects,
    handleDeleteKeyPress,
    saveObstacle,
    setIsDrawingObstacle,
    setCurrentObstaclePoints,
    setPendingEdges,
    setSelectedFogCells,
    setVisibilityMode,
    setCopiedCharacterTemplate,
    setCopiedObjectTemplate,
  ]);

  // -------------------------------------------------------
  // 3. SEARCH SHORTCUT (Ctrl+F / Cmd+F)
  // -------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+F (Windows/Linux) or Cmd+F (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault(); // Prevent browser's default search
        if (isMJ) {
          setIsUnifiedSearchOpen(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMJ, setIsUnifiedSearchOpen]);

  // -------------------------------------------------------
  // 4. TOOLBAR SHORTCUTS (tool switching via configurable keys)
  // -------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Map Tools
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_PAN)) { e.preventDefault(); handleToolbarAction(TOOLS.PAN); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_MEASURE)) { e.preventDefault(); handleToolbarAction(TOOLS.MEASURE); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_DRAW)) { e.preventDefault(); handleToolbarAction(TOOLS.DRAW); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_GRID)) { e.preventDefault(); handleToolbarAction(TOOLS.GRID); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_FOG)) { e.preventDefault(); handleToolbarAction(TOOLS.VISIBILITY); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_SELECT)) { e.preventDefault(); setMeasureMode(false); setDrawMode(false); setPanMode(false); } // Default to "Select" (Pointer)

      // New Tools
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_LAYERS)) { e.preventDefault(); handleToolbarAction(TOOLS.LAYERS); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_BACKGROUND)) { e.preventDefault(); handleToolbarAction(TOOLS.BACKGROUND); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_VIEW_MODE)) { e.preventDefault(); handleToolbarAction(TOOLS.VIEW_MODE); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_SETTINGS)) { e.preventDefault(); setShowGlobalSettingsDialog(true); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ZOOM_IN)) { e.preventDefault(); handleToolbarAction(TOOLS.ZOOM_IN); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ZOOM_OUT)) { e.preventDefault(); handleToolbarAction(TOOLS.ZOOM_OUT); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_WORLD_MAP)) { e.preventDefault(); handleToolbarAction(TOOLS.WORLD_MAP); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ADD_CHAR)) { e.preventDefault(); handleToolbarAction(TOOLS.ADD_CHAR); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ADD_OBJ)) { e.preventDefault(); handleToolbarAction(TOOLS.ADD_OBJ); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ADD_NOTE)) { e.preventDefault(); handleToolbarAction(TOOLS.ADD_NOTE); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_MUSIC)) { e.preventDefault(); handleToolbarAction(TOOLS.MUSIC); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_SEARCH)) { e.preventDefault(); handleToolbarAction(TOOLS.UNIFIED_SEARCH); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_PORTAL)) { e.preventDefault(); handleToolbarAction(TOOLS.PORTAL); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_SPAWN)) { e.preventDefault(); handleToolbarAction(TOOLS.SPAWN_POINT); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_CLEAR)) { e.preventDefault(); handleToolbarAction(TOOLS.CLEAR_DRAWINGS); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_MULTI)) { e.preventDefault(); handleToolbarAction(TOOLS.MULTI_SELECT); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_MIXER)) { e.preventDefault(); handleToolbarAction(TOOLS.AUDIO_MIXER); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_BORDERS)) { e.preventDefault(); handleToolbarAction(TOOLS.TOGGLE_CHAR_BORDERS); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_BADGES)) { e.preventDefault(); handleToolbarAction(TOOLS.TOGGLE_ALL_BADGES); }

      // Interactions
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.OPEN_BUBBLE_MENU)) {
        e.preventDefault();
        if (persoId) setBubbleMenuOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShortcutPressed, handleToolbarAction, setMeasureMode, setDrawMode, setPanMode, setShowGlobalSettingsDialog, persoId, setBubbleMenuOpen]);
}
