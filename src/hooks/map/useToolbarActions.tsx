"use client"

import React from 'react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Trash2, Edit, X, Eye, Pencil, Eraser, Square, Circle as CircleIcon, Slash, Ruler, Music, Hexagon, DoorOpen, ArrowDownUp } from 'lucide-react';
import { TOOLS } from '@/components/(map)/MapToolbar';
import type { Character, SavedDrawing, MapText, DrawingTool, ViewMode, Point } from '@/app/[roomid]/map/types';

// ---- Types ----

export interface UseToolbarActionsParams {
  // Identity
  roomId: string;
  isMJ: boolean;

  // Mode states (read + write)
  drawMode: boolean;
  setDrawMode: (v: boolean) => void;
  panMode: boolean;
  setPanMode: (v: boolean) => void;
  measureMode: boolean;
  setMeasureMode: (v: boolean) => void;
  visibilityMode: boolean;
  setVisibilityMode: (v: boolean) => void;
  isMusicMode: boolean;
  setIsMusicMode: (v: boolean) => void;
  multiSelectMode: boolean;
  setMultiSelectMode: (v: boolean) => void;
  portalMode: boolean;
  setPortalMode: (v: boolean) => void;
  spawnPointMode: boolean;
  setSpawnPointMode: (v: boolean) => void;
  isLightPlacementMode: boolean;
  setIsLightPlacementMode: (v: boolean) => void;
  isBackgroundEditMode: boolean;
  setIsBackgroundEditMode: (v: boolean) => void;

  // Drawer states (read + write)
  isObjectDrawerOpen: boolean;
  setIsObjectDrawerOpen: (v: boolean) => void;
  isNPCDrawerOpen: boolean;
  setIsNPCDrawerOpen: (v: boolean) => void;
  isSoundDrawerOpen: boolean;
  setIsSoundDrawerOpen: (v: boolean) => void;
  isAudioMixerOpen: boolean;
  setIsAudioMixerOpen: (v: boolean) => void;
  isUnifiedSearchOpen: boolean;
  setIsUnifiedSearchOpen: (v: boolean) => void;

  // Obstacle sub-states (write-only, for deactivateIncompatible)
  setIsDrawingObstacle: (v: boolean) => void;
  setCurrentObstaclePoints: (v: any[]) => void;
  setFogMode: (v: boolean) => void;

  // View mode
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;

  // Grid & display toggles
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  showCharBorders: boolean;
  setShowCharBorders: (v: boolean) => void;
  showLayerControl: boolean;
  setShowLayerControl: (v: boolean) => void;
  showAllBadges: boolean;
  setShowAllBadges: (v: boolean) => void;

  // Background selector
  setShowBackgroundSelector: (v: boolean) => void;

  // Player view mode
  playerViewMode: boolean;
  setPlayerViewMode: (v: boolean) => void;
  viewAsPersoId: string | null;
  setViewAsPersoId: (v: string | null) => void;

  // Ally view mode (for players)
  allyViewMode: boolean;
  setAllyViewMode: (v: boolean) => void;
  allyViewId: string | null;
  setAllyViewId: (v: string | null) => void;

  // Zoom
  setZoom: React.Dispatch<React.SetStateAction<number>>;

  // Measure
  setMeasureStart: (v: Point | null) => void;
  setMeasureEnd: (v: Point | null) => void;
  isCalibrating: boolean;
  setIsCalibrating: (v: boolean) => void;

  // Drawing tool options
  currentTool: DrawingTool;
  setCurrentTool: (v: DrawingTool) => void;
  drawingColor: string;
  setDrawingColor: (v: string) => void;
  drawingSize: number;
  setDrawingSize: (v: number) => void;

  // Selection states (for getToolOptionsContent)
  selectedDrawingIndex: number | null;
  setSelectedDrawingIndex: (v: number | null) => void;
  selectedNoteIndex: number | null;
  setSelectedNoteIndex: (v: number | null) => void;
  selectedFogCells: string[];
  setSelectedFogCells: (v: string[]) => void;
  selectedFogIndex: number | null;
  selectedCharacters: number[];
  setSelectedCharacters: (v: number[]) => void;

  // Data arrays (for getToolOptionsContent)
  characters: Character[];
  drawings: SavedDrawing[];
  notes: MapText[];

  // Fog state (for getToolOptionsContent)
  fogGrid: Map<string, boolean>;
  setFogGrid: React.Dispatch<React.SetStateAction<Map<string, boolean>>>;
  fullMapFog: boolean;
  setFullMapFog: (v: boolean) => void;

  // Portal state (for getToolOptionsContent)
  portalPlacementMode: 'scene-change' | 'same-map' | null;
  setPortalPlacementMode: (v: 'scene-change' | 'same-map' | null) => void;
  firstPortalPoint: Point | null;
  setFirstPortalPoint: (v: Point | null) => void;

  // Callbacks
  togglePanMode: () => void;
  toggleDrawMode: () => void;
  toggleVisibilityMode: () => void;
  clearDrawings: () => void;
  handleAddNote: () => void;
  handleEditNote: () => void;
  handleDeleteNote: () => void;
  handleDeleteSelectedCharacters: () => void;
  navigateToWorldMap: () => void;

  // Firebase callbacks (for getToolOptionsContent)
  deleteFromRtdbWithHistory: (collectionName: string, docId: string, description?: string) => Promise<void>;
  saveFogGridWithHistory: (newGrid: Map<string, boolean>, description?: string) => Promise<void>;
  saveFullMapFog: (v: boolean) => void;
  setDrawings: React.Dispatch<React.SetStateAction<SavedDrawing[]>>;
}

export interface UseToolbarActionsReturn {
  handleToolbarAction: (actionId: string) => void;
  getActiveToolbarTools: () => string[];
  getToolOptionsContent: () => React.ReactNode;
}

// ---- Hook ----

export function useToolbarActions(params: UseToolbarActionsParams): UseToolbarActionsReturn {
  const {
    roomId, isMJ,
    drawMode, setDrawMode,
    panMode, setPanMode,
    measureMode, setMeasureMode,
    visibilityMode, setVisibilityMode,
    isMusicMode, setIsMusicMode,
    multiSelectMode, setMultiSelectMode,
    portalMode, setPortalMode,
    spawnPointMode, setSpawnPointMode,
    isLightPlacementMode, setIsLightPlacementMode,
    isBackgroundEditMode, setIsBackgroundEditMode,
    isObjectDrawerOpen, setIsObjectDrawerOpen,
    isNPCDrawerOpen, setIsNPCDrawerOpen,
    isSoundDrawerOpen, setIsSoundDrawerOpen,
    isAudioMixerOpen, setIsAudioMixerOpen,
    isUnifiedSearchOpen, setIsUnifiedSearchOpen,
    setIsDrawingObstacle, setCurrentObstaclePoints, setFogMode,
    viewMode, setViewMode,
    showGrid, setShowGrid,
    showCharBorders, setShowCharBorders,
    showLayerControl, setShowLayerControl,
    showAllBadges, setShowAllBadges,
    setShowBackgroundSelector,
    playerViewMode, setPlayerViewMode,
    viewAsPersoId, setViewAsPersoId,
    allyViewMode, setAllyViewMode,
    allyViewId, setAllyViewId,
    setZoom,
    setMeasureStart, setMeasureEnd,
    isCalibrating, setIsCalibrating,
    currentTool, setCurrentTool,
    drawingColor, setDrawingColor,
    drawingSize, setDrawingSize,
    selectedDrawingIndex, setSelectedDrawingIndex,
    selectedNoteIndex, setSelectedNoteIndex,
    selectedFogCells, setSelectedFogCells,
    selectedFogIndex,
    selectedCharacters, setSelectedCharacters,
    characters, drawings, notes,
    fogGrid, setFogGrid,
    fullMapFog, setFullMapFog,
    portalPlacementMode, setPortalPlacementMode,
    firstPortalPoint, setFirstPortalPoint,
    togglePanMode, toggleDrawMode, toggleVisibilityMode,
    clearDrawings, handleAddNote, handleEditNote, handleDeleteNote,
    handleDeleteSelectedCharacters, navigateToWorldMap,
    deleteFromRtdbWithHistory, saveFogGridWithHistory, saveFullMapFog,
    setDrawings,
  } = params;

  const handleToolbarAction = (actionId: string) => {
    const deactivateIncompatible = (currentTool: string) => {
      if (currentTool !== TOOLS.DRAW && drawMode) setDrawMode(false);
      if (currentTool !== TOOLS.PAN && panMode) setPanMode(false);
      if (currentTool !== TOOLS.MEASURE && measureMode) setMeasureMode(false);
      if (isMJ) {
        if (currentTool !== TOOLS.VISIBILITY && visibilityMode) {
          setVisibilityMode(false);
          setIsDrawingObstacle(false);
          setCurrentObstaclePoints([]);
          setFogMode(false);
        }

        //  MUTUAL EXCLUSION: Close other drawers
        if (currentTool !== TOOLS.ADD_OBJ && isObjectDrawerOpen) setIsObjectDrawerOpen(false);
        if (currentTool !== TOOLS.ADD_CHAR && isNPCDrawerOpen) setIsNPCDrawerOpen(false);
        if (currentTool !== TOOLS.MUSIC && isSoundDrawerOpen) setIsSoundDrawerOpen(false);
        if (currentTool !== TOOLS.AUDIO_MIXER && isAudioMixerOpen) setIsAudioMixerOpen(false);

        // If opening a tool that requires the map view, switch back from 'world' mode
        if ((currentTool === TOOLS.ADD_OBJ ||
          currentTool === TOOLS.ADD_CHAR ||
          currentTool === TOOLS.MUSIC ||
          currentTool === TOOLS.AUDIO_MIXER) && viewMode === 'world') {
          setViewMode('city');
        }

        if (currentTool !== TOOLS.MUSIC && isMusicMode) setIsMusicMode(false);
        if (currentTool !== TOOLS.MULTI_SELECT && multiSelectMode) setMultiSelectMode(false);
        if (isLightPlacementMode) setIsLightPlacementMode(false);
        if (currentTool !== TOOLS.PORTAL && portalMode) setPortalMode(false); // Fix conflict
        if (currentTool !== TOOLS.SPAWN_POINT && spawnPointMode) setSpawnPointMode(false); // Fix conflict
      }
    };
    switch (actionId) {
      case TOOLS.PAN: deactivateIncompatible(TOOLS.PAN); togglePanMode(); break;
      case TOOLS.GRID: setShowGrid(!showGrid); break;
      case TOOLS.TOGGLE_CHAR_BORDERS: setShowCharBorders(!showCharBorders); break;
      case TOOLS.LAYERS: setShowLayerControl(!showLayerControl); break;
      case TOOLS.BACKGROUND: if (isMJ) setShowBackgroundSelector(true); break;
      case TOOLS.VIEW_MODE:
        if (isMJ) {
          if (playerViewMode) {
            // Turning off player view mode - clear the selected player
            setViewAsPersoId(null);
          }
          setPlayerViewMode(!playerViewMode);
        }
        break;

      // Mode Vue Allié pour les joueurs (comme Vue Joueur pour MJ)
      case 'ALLY_VIEW_MODE':
        if (!isMJ) {
          if (allyViewMode) {
            // Turning off ally view mode - clear the selected ally
            setAllyViewId(null);
          }
          setAllyViewMode(!allyViewMode);
        }
        break;

      default:
        break;
      case TOOLS.AUDIO_MIXER: deactivateIncompatible(TOOLS.AUDIO_MIXER); setIsAudioMixerOpen(!isAudioMixerOpen); break;
      case TOOLS.ADD_CHAR: if (isMJ) { deactivateIncompatible(TOOLS.ADD_CHAR); setIsNPCDrawerOpen(!isNPCDrawerOpen); } break;

      case TOOLS.ADD_OBJ: if (isMJ) { deactivateIncompatible(TOOLS.ADD_OBJ); setIsObjectDrawerOpen(!isObjectDrawerOpen); } break;
      case TOOLS.ADD_NOTE: handleAddNote(); break;
      case TOOLS.MUSIC: if (isMJ) { deactivateIncompatible(TOOLS.MUSIC); setIsSoundDrawerOpen(!isSoundDrawerOpen); } break;
      case TOOLS.UNIFIED_SEARCH: if (isMJ) { deactivateIncompatible(TOOLS.UNIFIED_SEARCH); setIsUnifiedSearchOpen(!isUnifiedSearchOpen); } break;
      case TOOLS.PORTAL: if (isMJ) { deactivateIncompatible(TOOLS.PORTAL); setPortalMode(!portalMode); } break;
      case TOOLS.SPAWN_POINT: if (isMJ) { deactivateIncompatible(TOOLS.SPAWN_POINT); setSpawnPointMode(!spawnPointMode); } break;  // Toggle spawn point mode
      case TOOLS.MULTI_SELECT: if (isMJ) { deactivateIncompatible(TOOLS.MULTI_SELECT); setMultiSelectMode(!multiSelectMode); } break;
      case TOOLS.BACKGROUND_EDIT: if (isMJ) setIsBackgroundEditMode(!isBackgroundEditMode); break;
      case TOOLS.DRAW: deactivateIncompatible(TOOLS.DRAW); toggleDrawMode(); break;
      case TOOLS.MEASURE: deactivateIncompatible(TOOLS.MEASURE); setMeasureMode(!measureMode); setMeasureStart(null); setMeasureEnd(null); setIsCalibrating(false); break;
      case TOOLS.VISIBILITY: if (isMJ) { deactivateIncompatible(TOOLS.VISIBILITY); toggleVisibilityMode(); } break;
      case TOOLS.CLEAR_DRAWINGS: clearDrawings(); break;
      case TOOLS.ZOOM_IN: setZoom(prev => Math.min(prev + 0.1, 5)); break;
      case TOOLS.ZOOM_OUT: setZoom(prev => Math.max(prev - 0.1, 0.1)); break;
      case TOOLS.WORLD_MAP: navigateToWorldMap(); break;
      case TOOLS.TOGGLE_ALL_BADGES: setShowAllBadges(!showAllBadges); break;
    }
  };


  const getActiveToolbarTools = (): string[] => {
    const active: string[] = [];
    if (drawMode) active.push(TOOLS.DRAW);
    if (visibilityMode) active.push(TOOLS.VISIBILITY);
    if (showGrid) active.push(TOOLS.GRID);
    if (showCharBorders) active.push(TOOLS.TOGGLE_CHAR_BORDERS);
    if (panMode) active.push(TOOLS.PAN);
    if (playerViewMode) active.push(TOOLS.VIEW_MODE);
    if (allyViewMode) active.push('ALLY_VIEW_MODE'); // Vue Allié
    if (measureMode) active.push(TOOLS.MEASURE);
    if (isMusicMode) active.push(TOOLS.MUSIC);
    if (showLayerControl) active.push(TOOLS.LAYERS);
    if (isObjectDrawerOpen) active.push(TOOLS.ADD_OBJ);
    if (isNPCDrawerOpen) active.push(TOOLS.ADD_CHAR);
    if (isSoundDrawerOpen) active.push(TOOLS.MUSIC);
    if (isUnifiedSearchOpen) active.push(TOOLS.UNIFIED_SEARCH);
    if (portalMode) active.push(TOOLS.PORTAL);
    if (spawnPointMode) active.push(TOOLS.SPAWN_POINT);  // Show spawn point mode as active

    if (multiSelectMode) active.push(TOOLS.MULTI_SELECT);
    if (isBackgroundEditMode) active.push(TOOLS.BACKGROUND_EDIT);
    if (isAudioMixerOpen) active.push(TOOLS.AUDIO_MIXER);
    if (showAllBadges) active.push(TOOLS.TOGGLE_ALL_BADGES);
    return active;
  };

  const getToolOptionsContent = () => {
    //  SELECTION : Dessin
    if (selectedDrawingIndex !== null) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <span className="text-white text-sm font-medium pr-2">Dessin sélectionné</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (selectedDrawingIndex !== null && roomId) {
                const drawing = drawings[selectedDrawingIndex];
                deleteFromRtdbWithHistory('drawings', drawing.id, 'Suppression du tracé');
                setDrawings(prev => prev.filter((_, i) => i !== selectedDrawingIndex));
                setSelectedDrawingIndex(null);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDrawingIndex(null)}
            className="text-gray-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      );
    }

    //  SELECTION : Note
    if (selectedNoteIndex !== null) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <Button variant="ghost" size="sm" onClick={handleEditNote} className="text-[#c0a080] hover:text-[#d4b494] hover:bg-white/10">
            <Edit className="w-4 h-4 mr-2" /> Modifier
          </Button>
          <Separator orientation="vertical" className="h-6 w-[1px] bg-white/10 mx-1" />
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteNote}
          >
            <X className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedNoteIndex(null)}
            className="text-gray-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      );
    }

    // Obstacles are handled by ObstacleContextMenu (floating panel), not the bottom toolbar

    // SELECTION : Cases de brouillard (MJ seulement)
    if (selectedFogCells.length > 0 && isMJ) { // Réservé au MJ
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <span className="text-white text-sm font-medium pr-2">{selectedFogCells.length} case{selectedFogCells.length > 1 ? 's' : ''} de brouillard sélectionnée{selectedFogCells.length > 1 ? 's' : ''}</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Supprimer ${selectedFogCells.length} case(s) de brouillard ?`)) {
                const newGrid = new Map(fogGrid);
                selectedFogCells.forEach(cellKey => {
                  if (fullMapFog) {
                    newGrid.set(cellKey, true);
                  } else {
                    newGrid.delete(cellKey);
                  }
                });
                setFogGrid(newGrid);
                saveFogGridWithHistory(newGrid, 'Suppression de cellules de brouillard');
                setSelectedFogCells([]);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedFogCells([])}
            className="text-gray-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      );
    }

    //  SELECTION : Multi-Char (MJ)
    if (selectedCharacters.length > 1 && isMJ) {
      const hasNonPlayerCharacter = selectedCharacters.some(index =>
        characters[index]?.type !== 'joueurs'
      );
      if (hasNonPlayerCharacter) {
        return (
          <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <Button variant="destructive" size="sm" onClick={handleDeleteSelectedCharacters}>
              <X className="w-4 h-4 mr-2" /> Supprimer la sélection ({selectedCharacters.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCharacters([])}
              className="text-gray-400 hover:text-white"
            >
              Fermer
            </Button>
          </div>
        );
      }
    }

    //  SELECTION : Brouillard (MJ)
    if (isMJ && selectedFogIndex !== null) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <span className="text-white text-sm font-medium pr-2">Brouillard global</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setFullMapFog(false);
              saveFullMapFog(false);
              setFogGrid(new Map());
              saveFogGridWithHistory(new Map(), 'Suppression de tout le brouillard');
            }}>
            <X className="w-4 h-4 mr-2" /> Supprimer tout
          </Button>
        </div>
      )
    }

    if (drawMode) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'pen' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentTool('pen')}
              title="Crayon"
            >
              <Pencil className="w-5 h-5" strokeWidth={currentTool === 'pen' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'line' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentTool('line')}
              title="Ligne"
            >
              <Slash className="w-5 h-5" strokeWidth={currentTool === 'line' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'rectangle' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentTool('rectangle')}
              title="Rectangle"
            >
              <Square className="w-5 h-5" strokeWidth={currentTool === 'rectangle' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'circle' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentTool('circle')}
              title="Cercle"
            >
              <CircleIcon className="w-5 h-5" strokeWidth={currentTool === 'circle' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'eraser' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40' : 'text-gray-400 hover:text-red-400 hover:bg-red-900/20'}`}
              onClick={() => setCurrentTool('eraser')}
              title="Gomme (supprime le trait entier)"
            >
              <Eraser className="w-5 h-5" />
            </Button>
          </div>

          {/* Separator before "Clear All" logic or just integrate it */}
          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          {/* Clear All Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-lg transition-all duration-200 text-gray-400 hover:text-red-400 hover:bg-red-900/20"
            onClick={() => clearDrawings()}
            title="Tout effacer"
          >
            <Trash2 className="w-5 h-5" />
          </Button>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          {/* Colors */}
          <div className="flex items-center gap-2">
            {['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].map((color) => (
              <button
                key={color}
                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${drawingColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  setDrawingColor(color);
                  setCurrentTool('pen');
                }}
              />
            ))}
            <div className="relative w-6 h-6 rounded-full overflow-hidden border-2 border-zinc-600 hover:border-white transition-colors">
              <input
                type="color"
                value={drawingColor}
                onChange={(e) => {
                  setDrawingColor(e.target.value);
                  setCurrentTool('pen');
                }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] p-0 m-0 border-0 cursor-pointer"
              />
            </div>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          {/* Size */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Taille</span>
            <input
              type="range"
              min="1"
              max="20"
              value={drawingSize}
              onChange={(e) => setDrawingSize(Number(e.target.value))}
              className="h-1 w-24 bg-gray-700 rounded-full appearance-none cursor-pointer accent-[#c0a080]"
            />
            <span className="text-[#c0a080] text-sm font-bold w-4">{drawingSize}</span>
          </div>
        </div>
      );
    }

    //  MODE : Mesure
    if (measureMode) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Ruler className="w-4 h-4 text-[#c0a080]" />
            <span className="text-[#c0a080] font-medium text-xs tracking-wide uppercase">Mode Mesure</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          <div className="text-xs text-gray-400">
            {isCalibrating ? "Tracez une ligne d'étalon." : "Tracez pour mesurer."}
          </div>

          {!isCalibrating && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCalibrating(true);
                setMeasureStart(null);
                setMeasureEnd(null);
              }}
              className="h-8 px-3 ml-2 text-xs font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
            >
              Étalonner
            </Button>
          )}
          {isCalibrating && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCalibrating(false)}
              className="h-8 px-3 ml-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg"
            >
              Annuler
            </Button>
          )}
        </div>
      );
    }

    // Visibility mode UI is now in VisibilityDrawer component

    if (playerViewMode) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Eye className="w-4 h-4 text-red-400" />
            <span className="text-red-400 font-medium text-xs tracking-wide uppercase">VUE JOUEUR</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          <div className="flex items-center gap-2">
            {characters
              .filter(c => c.type === 'joueurs' || c.visibility === 'ally')
              .map(char => {
                const isSelected = viewAsPersoId === char.id;
                return (
                  <div
                    key={char.id}
                    onClick={() => setViewAsPersoId(isSelected ? null : char.id)}
                    className={`relative w-8 h-8 rounded-full overflow-hidden border-2 cursor-pointer transition-all duration-200 ${isSelected ? 'border-[#c0a080] scale-110 shadow-[0_0_10px_rgba(192,160,128,0.4)]' : 'border-white/10 hover:border-white/40 hover:scale-105 opacity-70 hover:opacity-100'}`}
                    title={char.name}
                  >
                    {char.image && (typeof char.image === 'object' ? (char.image as any).src : char.image) ? (
                      <img src={typeof char.image === 'object' ? (char.image as any).src : char.image} alt={char.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 font-bold">
                        {char.name[0]}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-lg transition-all duration-200 text-gray-400 hover:text-red-400 hover:bg-red-900/20"
            onClick={() => {
              setPlayerViewMode(false);
              setViewAsPersoId(null);
            }}
            title="Quitter"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      );
    }

    // Vue Allié pour les joueurs (même UI que Vue Joueur)
    if (allyViewMode && !isMJ) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Eye className="w-4 h-4 text-green-400" />
            <span className="text-green-400 font-medium text-xs tracking-wide uppercase">VUE ALLIÉ</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          <div className="flex items-center gap-2">
            {characters
              .filter(c => c.visibility === 'ally')
              .map(ally => {
                const isSelected = allyViewId === ally.id;
                return (
                  <div
                    key={ally.id}
                    onClick={() => setAllyViewId(isSelected ? null : ally.id)}
                    className={`relative w-8 h-8 rounded-full overflow-hidden border-2 cursor-pointer transition-all duration-200 ${isSelected ? 'border-[#c0a080] scale-110 shadow-[0_0_10px_rgba(192,160,128,0.4)]' : 'border-white/10 hover:border-white/40 hover:scale-105 opacity-70 hover:opacity-100'}`}
                    title={ally.name}
                  >
                    {ally.image && (typeof ally.image === 'object' ? (ally.image as any).src : ally.image) ? (
                      <img src={typeof ally.image === 'object' ? (ally.image as any).src : ally.image} alt={ally.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 font-bold">
                        {ally.name[0]}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-lg transition-all duration-200 text-gray-400 hover:text-green-400 hover:bg-green-900/20"
            onClick={() => {
              setAllyViewMode(false);
              setAllyViewId(null);
            }}
            title="Quitter"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      );
    }
    if (isMusicMode) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Music className="w-4 h-4 text-fuchsia-400" />
            <span className="text-fuchsia-400 font-medium text-xs tracking-wide uppercase">Mode Musique</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          <span className="text-xs text-gray-400 hidden sm:inline-block">Clic carte pour placer</span>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1 hidden sm:block" />


        </div>
      );
    }

    //  PORTAL MODE
    if (portalMode && isMJ) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Hexagon className="w-4 h-4 text-[#c0a080]" />
            <span className="text-[#c0a080] font-medium text-xs tracking-wide uppercase">Mode Portail</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          <span className="text-xs text-gray-400 hidden sm:inline-block">Choisissez le type :</span>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPortalPlacementMode('scene-change')}
              className={`h-8 px-3 text-xs font-medium rounded-lg transition-colors ${portalPlacementMode === 'scene-change'
                ? 'bg-[#c0a080] text-black hover:bg-[#d4b594]'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
            >
              <DoorOpen className="w-3 h-3 mr-1.5" />
              Autre carte
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPortalPlacementMode('same-map');
                setFirstPortalPoint(null); // Reset pour un nouveau portail
              }}
              className={`h-8 px-3 text-xs font-medium rounded-lg transition-colors ${portalPlacementMode === 'same-map'
                ? 'bg-[#c0a080] text-black hover:bg-[#d4b594]'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
            >
              <ArrowDownUp className="w-3 h-3 mr-1.5" />
              Même carte
            </Button>
          </div>

          {portalPlacementMode === 'same-map' && firstPortalPoint && (
            <div className="ml-2 px-2 py-1 bg-blue-500/20 border border-blue-400/30 rounded text-xs text-blue-300">
              Cliquez pour placer la sortie
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return {
    handleToolbarAction,
    getActiveToolbarTools,
    getToolOptionsContent,
  };
}
