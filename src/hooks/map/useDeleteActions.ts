"use client"

import { useCallback } from 'react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import type { EntityToDelete } from '@/components/(map)/DeleteConfirmationModal';
import type { Character, LightSource, MapText, SavedDrawing, MusicZone, MapObject } from '@/app/[roomid]/map/types';
import type { SharedMeasurement } from '@/app/[roomid]/map/measurements';
import type { Obstacle } from '@/lib/visibility';

// ---- Types ----

export interface UseDeleteActionsParams {
  // Identity
  roomId: string;
  isMJ: boolean;

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

  // Context menu state (read-only)
  contextMenuLightOpen: boolean;
  contextMenuLightId: string | null;

  // Modal state
  entityToDelete: EntityToDelete | null;
  setEntityToDelete: (v: EntityToDelete | null) => void;
  setDeleteModalOpen: (v: boolean) => void;

  // Data arrays (read-only)
  characters: Character[];
  objects: MapObject[];
  notes: MapText[];
  musicZones: MusicZone[];
  obstacles: Obstacle[];
  drawings: SavedDrawing[];
  lights: LightSource[];
  fogGrid: Map<string, boolean>;
  measurements: SharedMeasurement[];

  // Setters for clearing selection after delete
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  setObjects: React.Dispatch<React.SetStateAction<MapObject[]>>;
  setNotes: React.Dispatch<React.SetStateAction<MapText[]>>;
  setMusicZones: React.Dispatch<React.SetStateAction<MusicZone[]>>;
  setLights: React.Dispatch<React.SetStateAction<LightSource[]>>;
  setDrawings: React.Dispatch<React.SetStateAction<SavedDrawing[]>>;
  setFogGrid: React.Dispatch<React.SetStateAction<Map<string, boolean>>>;
  setMeasurements: React.Dispatch<React.SetStateAction<SharedMeasurement[]>>;
  setSelectedCharacters: (v: number[]) => void;
  setSelectedCharacterIndex: (v: number | null) => void;
  setSelectedObjectIndices: (v: number[]) => void;
  setSelectedNoteIndex: (v: number | null) => void;
  setSelectedMusicZoneIds: (v: string[]) => void;
  setSelectedObstacleIds: (v: string[]) => void;
  setSelectedDrawingIndex: (v: number | null) => void;
  setSelectedFogCells: (v: string[]) => void;
  setContextMenuLightOpen: (v: boolean) => void;
  setContextMenuLightId: (v: string | null) => void;

  // Firebase functions
  deleteWithHistory: (collectionName: string, documentId: string, description?: string) => Promise<void>;
  deleteFromRtdbWithHistory: (collectionName: string, docId: string, description?: string) => Promise<void>;
  saveFogGridWithHistory: (newGrid: Map<string, boolean>, description?: string) => Promise<void>;

  // Obstacle delete handler (already extracted)
  handleObstacleDelete: (obstacleId: string) => Promise<void>;

  // Selection reset
  resetActiveElementSelection: () => void;
}

export interface UseDeleteActionsReturn {
  handleDeleteKeyPress: () => void;
  handleConfirmDelete: () => Promise<void>;
}

// ---- Hook ----

export function useDeleteActions(params: UseDeleteActionsParams): UseDeleteActionsReturn {
  const {
    roomId, isMJ,
    selectedCharacters, selectedCharacterIndex, selectedObjectIndices,
    selectedNoteIndex, selectedMusicZoneIds, selectedObstacleIds,
    selectedDrawingIndex, selectedFogCells, isVisActive,
    contextMenuLightOpen, contextMenuLightId,
    entityToDelete, setEntityToDelete, setDeleteModalOpen,
    characters, objects, notes, musicZones, obstacles, drawings, lights, fogGrid, measurements,
    setCharacters, setObjects, setNotes, setMusicZones, setLights, setDrawings,
    setFogGrid, setMeasurements,
    setSelectedCharacters, setSelectedCharacterIndex, setSelectedObjectIndices,
    setSelectedNoteIndex, setSelectedMusicZoneIds, setSelectedObstacleIds,
    setSelectedDrawingIndex, setSelectedFogCells,
    setContextMenuLightOpen, setContextMenuLightId,
    deleteWithHistory, deleteFromRtdbWithHistory, saveFogGridWithHistory,
    handleObstacleDelete, resetActiveElementSelection,
  } = params;

  // ── CENTRALIZED DELETE HANDLER ──
  const handleDeleteKeyPress = useCallback(() => {
    if (!isMJ) return; // Only MJ can delete

    // 1. Check for selected characters (multi-select)
    if (selectedCharacters.length > 0) {
      const charsToDelete = selectedCharacters
        .map(index => characters[index])
        .filter(c => c && c.type !== 'joueurs');
      if (charsToDelete.length > 0) {
        setEntityToDelete({
          type: 'character',
          ids: charsToDelete.map(c => c.id),
          count: charsToDelete.length,
          name: charsToDelete.length === 1 ? charsToDelete[0].name : undefined
        });
        setDeleteModalOpen(true);
        return;
      }
    }

    // 2. Check for single selected character
    if (selectedCharacterIndex !== null) {
      const char = characters[selectedCharacterIndex];
      if (char && char.type !== 'joueurs') {
        setEntityToDelete({
          type: 'character',
          id: char.id,
          name: char.name
        });
        setDeleteModalOpen(true);
        return;
      }
    }

    // 3. Check for selected objects (multi-select)
    if (selectedObjectIndices.length > 0) {
      const objsToDelete = selectedObjectIndices.map(index => objects[index]);
      setEntityToDelete({
        type: 'object',
        ids: objsToDelete.map(o => o.id),
        count: objsToDelete.length,
        name: objsToDelete.length === 1 ? objsToDelete[0].name : undefined
      });
      setDeleteModalOpen(true);
      return;
    }

    // 4. Check for selected note
    if (selectedNoteIndex !== null) {
      const note = notes[selectedNoteIndex];
      setEntityToDelete({
        type: 'note',
        id: note.id,
        name: note.text?.substring(0, 30) + (note.text && note.text.length > 30 ? '...' : '')
      });
      setDeleteModalOpen(true);
      return;
    }

    // 5. Check for selected music zones (multi-select)
    if (selectedMusicZoneIds.length > 0) {
      const zonesToDelete = musicZones.filter(z => selectedMusicZoneIds.includes(z.id));
      setEntityToDelete({
        type: 'musicZone',
        ids: selectedMusicZoneIds,
        count: zonesToDelete.length,
        name: zonesToDelete.length === 1 ? zonesToDelete[0].name : undefined
      });
      setDeleteModalOpen(true);
      return;
    }

    // 6. Check for selected obstacle
    if (selectedObstacleIds.length > 0 && isVisActive) {
      const obstacleId = selectedObstacleIds[0];
      const obstacle = obstacles.find(o => o.id === obstacleId);
      setEntityToDelete({
        type: 'obstacle',
        id: obstacleId,
        name: `Obstacle`
      });
      setDeleteModalOpen(true);
      return;
    }

    // 7. Check for selected drawing
    if (selectedDrawingIndex !== null) {
      const drawing = drawings[selectedDrawingIndex];
      setEntityToDelete({
        type: 'drawing',
        id: drawing.id,
        name: `Dessin`
      });
      setDeleteModalOpen(true);
      return;
    }

    // 8. Check for selected fog cells
    if (selectedFogCells.length > 0) {
      setEntityToDelete({
        type: 'fogCells',
        ids: selectedFogCells,
        count: selectedFogCells.length
      });
      setDeleteModalOpen(true);
      return;
    }

    // 9. Check for context menu light (if open)
    if (contextMenuLightOpen && contextMenuLightId) {
      const light = lights.find(l => l.id === contextMenuLightId);
      setEntityToDelete({
        type: 'light',
        id: contextMenuLightId,
        name: `Lumière`
      });
      setDeleteModalOpen(true);
      return;
    }
  }, [
    isMJ, selectedCharacters, selectedCharacterIndex, selectedObjectIndices,
    selectedNoteIndex, selectedMusicZoneIds, selectedObstacleIds,
    selectedDrawingIndex, selectedFogCells, isVisActive,
    contextMenuLightOpen, contextMenuLightId,
    characters, objects, notes, musicZones, obstacles, drawings, lights,
    setEntityToDelete, setDeleteModalOpen,
  ]);

  // ── CONFIRM DELETE HANDLER ──
  const handleConfirmDelete = useCallback(async () => {
    if (!entityToDelete || !roomId) return;

    try {
      switch (entityToDelete.type) {
        case 'character':
          if (entityToDelete.ids && entityToDelete.ids.length > 0) {
            // Multiple characters
            const deletePromises = entityToDelete.ids.map(async (id) => {
              const char = characters.find(c => c.id === id);
              await deleteWithHistory(
                'characters',
                id,
                `Suppression de "${char?.name || 'Personnage'}"`
              );
            });
            await Promise.all(deletePromises);
            setCharacters(prev => prev.filter(c => !entityToDelete.ids!.includes(c.id)));
            setSelectedCharacters([]);
            if (entityToDelete.count === 1) {
              toast.success(`Personnage "${entityToDelete.name || 'Inconnu'}" supprimé`);
            } else {
              toast.success(`${entityToDelete.ids?.length || 0} personnages supprimés`);
            }
          } else if (entityToDelete.id) {
            // Single character
            await deleteWithHistory(
              'characters',
              entityToDelete.id,
              `Suppression de "${entityToDelete.name}"`
            );
            setCharacters(prev => prev.filter(c => c.id !== entityToDelete.id));
            setSelectedCharacterIndex(null);
            toast.success(`Personnage "${entityToDelete.name}" supprimé`);
          }
          break;

        case 'object':
          if (entityToDelete.ids && entityToDelete.ids.length > 0) {
            // Multiple objects
            const deletePromises = entityToDelete.ids.map(async (id) => {
              await deleteDoc(doc(db, 'cartes', String(roomId), 'objects', id));
            });
            await Promise.all(deletePromises);
            setObjects(prev => prev.filter(o => !entityToDelete.ids!.includes(o.id)));
            setSelectedObjectIndices([]);
            if (entityToDelete.count === 1) {
              toast.success(`Objet "${entityToDelete.name || 'Inconnu'}" supprimé`);
            } else {
              toast.success(`${entityToDelete.ids?.length || 0} objets supprimés`);
            }
          }
          break;

        case 'light':
          if (entityToDelete.id) {
            await deleteWithHistory(
              'lights',
              entityToDelete.id,
              `Suppression de la source de lumière`
            );
            setLights(prev => prev.filter(l => l.id !== entityToDelete.id));
            setContextMenuLightOpen(false);
            setContextMenuLightId(null);
            toast.success(`Lumière supprimée`);
          }
          break;

        case 'obstacle':
          if (entityToDelete.id) {
            await handleObstacleDelete(entityToDelete.id);
          }
          break;

        case 'musicZone':
          if (entityToDelete.ids && entityToDelete.ids.length > 0) {
            // Multiple zones
            const deletePromises = entityToDelete.ids.map(async (id) => {
              const zone = musicZones.find(z => z.id === id);
              await deleteWithHistory(
                'musicZones',
                id,
                `Suppression de la zone musicale${zone?.name ? ` "${zone.name}"` : ''}`
              );
            });
            await Promise.all(deletePromises);
            setMusicZones(prev => prev.filter(z => !entityToDelete.ids!.includes(z.id)));
            setSelectedMusicZoneIds([]);
            if (entityToDelete.count === 1) {
              toast.success(`Zone musicale "${entityToDelete.name || 'Inconnue'}" supprimée`);
            } else {
              toast.success(`${entityToDelete.ids?.length || 0} zones musicales supprimées`);
            }
          }
          break;

        case 'note':
          if (entityToDelete.id) {
            await deleteFromRtdbWithHistory(
              'notes',
              entityToDelete.id,
              `Suppression de la note "${entityToDelete.name}"`
            );
            setNotes(prev => prev.filter(n => n.id !== entityToDelete.id));
            setSelectedNoteIndex(null);
            toast.success(`Note "${entityToDelete.name}" supprimée`);
          }
          break;

        case 'measurement':
          if (entityToDelete.id) {
            await deleteWithHistory(
              'measurements',
              entityToDelete.id,
              `Suppression de la mesure`
            );
            setMeasurements(prev => prev.filter(m => m.id !== entityToDelete.id));
          }
          toast.success("Mesure supprimée");
          break;

        case 'drawing':
          if (entityToDelete.id) {
            await deleteFromRtdbWithHistory('drawings', entityToDelete.id, 'Suppression du dessin');
            setDrawings(prev => prev.filter(d => d.id !== entityToDelete.id));
            setSelectedDrawingIndex(null);
            toast.success(`Dessin supprimé`);
          }
          break;

        case 'fogCells':
          if (entityToDelete.ids && entityToDelete.ids.length > 0) {
            // Remove fog cells from grid
            const newFogGrid = new Map(fogGrid);
            entityToDelete.ids.forEach(cellKey => {
              newFogGrid.delete(cellKey);
            });
            setFogGrid(newFogGrid);
            setSelectedFogCells([]);

            // Save to Firebase
            saveFogGridWithHistory(newFogGrid, 'Révélation de toute la carte');
          }
          toast.success("Brouillard supprimé");
          break;
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    } finally {
      setEntityToDelete(null);
      setDeleteModalOpen(false);
      resetActiveElementSelection();
    }
  }, [
    entityToDelete, roomId, characters, objects, musicZones, fogGrid,
    deleteWithHistory, deleteFromRtdbWithHistory, saveFogGridWithHistory,
    handleObstacleDelete, resetActiveElementSelection,
    setCharacters, setObjects, setNotes, setMusicZones, setLights, setDrawings,
    setFogGrid, setMeasurements,
    setSelectedCharacters, setSelectedCharacterIndex, setSelectedObjectIndices,
    setSelectedNoteIndex, setSelectedMusicZoneIds, setSelectedFogCells,
    setSelectedDrawingIndex, setContextMenuLightOpen, setContextMenuLightId,
    setEntityToDelete, setDeleteModalOpen,
  ]);

  return {
    handleDeleteKeyPress,
    handleConfirmDelete,
  };
}
