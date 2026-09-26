import { toast } from 'sonner';
import type { Point } from '@/app/[roomid]/map/types';
import type { Obstacle, EdgeMeta } from '@/lib/visibility';
import {
  findAdjacentWalls,
  getMergedWallPoints,
  findAllConnectedWalls,
  findClosedLoops,
  determineOneWayDirection,
} from '@/lib/obstacle-utils';

// ---- Types ----

export interface UseObstacleActionsParams {
  // Identity
  roomId: string;
  isMJ: boolean;
  selectedCityId: string | null;

  // Data (read-only)
  obstacles: Obstacle[];

  // Setters
  setObstacles: React.Dispatch<React.SetStateAction<Obstacle[]>>;
  setSelectedObstacleIds: (ids: string[]) => void;

  // Firebase history functions
  addToRtdbWithHistory: (
    collectionName: string,
    data: any,
    description?: string
  ) => Promise<string>;
  updateRtdbWithHistory: (
    collectionName: string,
    docId: string,
    updates: any,
    description?: string
  ) => Promise<void>;
  deleteFromRtdbWithHistory: (
    collectionName: string,
    docId: string,
    description?: string
  ) => Promise<void>;
}

export interface UseObstacleActionsReturn {
  saveObstacle: (
    type: 'wall' | 'polygon' | 'one-way-wall' | 'door' | 'window',
    points: Point[],
    additionalProps?: {
      direction?: 'north' | 'south' | 'east' | 'west';
      isOpen?: boolean;
      edges?: EdgeMeta[];
    }
  ) => Promise<void>;
  deleteObstacle: (obstacleId: string) => Promise<void>;
  updateObstacle: (obstacleId: string, newPoints: Point[]) => Promise<void>;
  toggleDoorState: (obstacleId: string) => Promise<void>;
  toggleLockDoor: (obstacleId: string) => Promise<void>;
  handleObstacleDelete: (obstacleId: string) => Promise<void>;
  handleObstacleDeleteConnected: (obstacleId: string) => Promise<void>;
  handleObstacleInvertDirection: (obstacleId: string) => Promise<void>;
  handleObstacleConvertTo: (
    obstacleId: string,
    newType: 'wall' | 'one-way-wall' | 'door' | 'window'
  ) => Promise<void>;
  handleToggleRoomMode: (obstacleId: string) => Promise<void>;
  clearAllObstacles: () => Promise<void>;
}

// ---- Hook ----

export function useObstacleActions(params: UseObstacleActionsParams): UseObstacleActionsReturn {
  const {
    roomId,
    isMJ,
    selectedCityId,
    obstacles,
    setObstacles,
    setSelectedObstacleIds,
    addToRtdbWithHistory,
    updateRtdbWithHistory,
    deleteFromRtdbWithHistory,
  } = params;

  // -------------------------------------------------------
  // saveObstacle - saves an obstacle to Firebase RTDB
  // -------------------------------------------------------
  const saveObstacle = async (
    type: 'wall' | 'polygon' | 'one-way-wall' | 'door' | 'window',
    points: Point[],
    additionalProps?: {
      direction?: 'north' | 'south' | 'east' | 'west';
      isOpen?: boolean;
      edges?: EdgeMeta[];
    }
  ) => {
    if (!roomId || points.length < 2) return;

    try {
      const obstacleData: any = {
        type,
        points,
        cityId: selectedCityId,
        createdAt: new Date().toISOString(),
      };

      // Ajouter les propriétés spécifiques selon le type
      if (type === 'one-way-wall' && additionalProps?.direction) {
        obstacleData.direction = additionalProps.direction;
      }

      if (type === 'door') {
        obstacleData.isOpen = additionalProps?.isOpen ?? false; // Par défaut fermée
      }

      await addToRtdbWithHistory(
        'obstacles',
        obstacleData,
        `Ajout d'un obstacle${type ? ` (${type})` : ''}`
      );
    } catch (error) {
      console.error('❌ Erreur sauvegarde obstacle:', error);
    }
  };

  // -------------------------------------------------------
  // deleteObstacle - deletes an obstacle
  // -------------------------------------------------------
  const deleteObstacle = async (obstacleId: string) => {
    if (!roomId || !obstacleId) return;

    try {
      await deleteFromRtdbWithHistory(
        'obstacles',
        obstacleId,
        `Suppression d'obstacle`
      );
      setSelectedObstacleIds([]);

    } catch (error) {
      console.error('❌ Erreur suppression obstacle:', error);
    }
  };

  // -------------------------------------------------------
  // updateObstacle - updates an obstacle's points
  // -------------------------------------------------------
  const updateObstacle = async (obstacleId: string, newPoints: Point[]) => {
    if (!roomId || !obstacleId || newPoints.length < 2) return;

    try {
      await updateRtdbWithHistory('obstacles', obstacleId, { points: newPoints }, 'Modification obstacle');

    } catch (error) {
      console.error('❌ Erreur mise à jour obstacle:', error);
    }
  };

  // -------------------------------------------------------
  // toggleDoorState - toggles door open/closed
  // -------------------------------------------------------
  const toggleDoorState = async (obstacleId: string) => {
    if (!roomId || !obstacleId) return;

    try {
      const obstacle = obstacles.find(o => o.id === obstacleId);
      if (!obstacle || obstacle.type !== 'door') return;

      // Les joueurs ne peuvent pas interagir avec les portes verrouillées
      if (!isMJ && obstacle.isLocked) {
        toast.error('Porte verrouillée', {
          description: 'Cette porte est verrouillée.',
          duration: 2000,
        });
        return;
      }

      const newIsOpen = !obstacle.isOpen;

      // Mise à jour optimiste locale
      setObstacles(prev => prev.map(o =>
        o.id === obstacleId ? { ...o, isOpen: newIsOpen } : o
      ));

      // Sauvegarder dans Firebase
      await updateRtdbWithHistory(
        'obstacles',
        obstacleId,
        { isOpen: newIsOpen },
        `Porte ${newIsOpen ? 'ouverte' : 'fermée'}`
      );

      toast.success(newIsOpen ? 'Porte ouverte' : 'Porte fermée', {
        duration: 2000,
      });

    } catch (error) {
      console.error('❌ Erreur toggle porte:', error);
      toast.error('Erreur', {
        description: "Impossible de modifier l'état de la porte.",
        duration: 3000,
      });
    }
  };

  // -------------------------------------------------------
  // toggleLockDoor - toggles door locked/unlocked
  // -------------------------------------------------------
  const toggleLockDoor = async (obstacleId: string) => {
    if (!roomId || !obstacleId || !isMJ) return;

    try {
      const obstacle = obstacles.find(o => o.id === obstacleId);
      if (!obstacle || obstacle.type !== 'door') return;

      const newIsLocked = !obstacle.isLocked;

      // Mise à jour optimiste locale
      setObstacles(prev => prev.map(o =>
        o.id === obstacleId ? { ...o, isLocked: newIsLocked } : o
      ));

      await updateRtdbWithHistory(
        'obstacles',
        obstacleId,
        { isLocked: newIsLocked },
        `Porte ${newIsLocked ? 'verrouillée' : 'déverrouillée'}`
      );

      toast.success(newIsLocked ? 'Porte verrouillée' : 'Porte déverrouillée', {
        duration: 2000,
      });

    } catch (error) {
      console.error('❌ Erreur toggle verrou porte:', error);
      toast.error('Erreur', {
        description: "Impossible de modifier le verrou de la porte.",
        duration: 3000,
      });
    }
  };

  // -------------------------------------------------------
  // handleObstacleDelete - handles obstacle deletion (with smart merge)
  // -------------------------------------------------------
  const handleObstacleDelete = async (obstacleId: string) => {
    if (!roomId || !isMJ) return;
    const targetObs = obstacles.find(o => o.id === obstacleId);
    if (!targetObs) return;

    // Smart merge: if deleting a door/one-way-wall/window, merge adjacent walls back
    if ((targetObs.type === 'door' || targetObs.type === 'one-way-wall' || targetObs.type === 'window') && targetObs.points.length === 2) {
      const { before, after } = findAdjacentWalls(targetObs.id, targetObs.points, obstacles);
      if (before || after) {
        const mergedPoints = getMergedWallPoints(targetObs, before, after);
        await deleteFromRtdbWithHistory('obstacles', targetObs.id, 'Fusion de mur');
        if (before) await deleteFromRtdbWithHistory('obstacles', before.id, 'Fusion de mur');
        if (after) await deleteFromRtdbWithHistory('obstacles', after.id, 'Fusion de mur');
        await saveObstacle('wall', mergedPoints);
        setSelectedObstacleIds([]);
        toast.success('Mur reconstitué');
        return;
      }
    }

    await deleteFromRtdbWithHistory('obstacles', obstacleId, `Suppression de mur`);
    toast.success("Mur supprimé");
    setSelectedObstacleIds([]);
  };

  // -------------------------------------------------------
  // handleObstacleDeleteConnected - handles connected obstacle deletion
  // -------------------------------------------------------
  const handleObstacleDeleteConnected = async (obstacleId: string) => {
    if (!roomId || !isMJ) return;
    const connectedIds = findAllConnectedWalls(obstacleId, obstacles);
    const deletePromises = connectedIds.map(id =>
      deleteFromRtdbWithHistory('obstacles', id, `Suppression de murs adjacents`)
    );
    await Promise.all(deletePromises);
    toast.success(`${connectedIds.length} murs supprimés`);
    setSelectedObstacleIds([]);
  };

  // -------------------------------------------------------
  // handleObstacleInvertDirection - inverts one-way wall direction
  // -------------------------------------------------------
  const handleObstacleInvertDirection = async (obstacleId: string) => {
    if (!roomId) return;
    const obs = obstacles.find(o => o.id === obstacleId);
    if (!obs) return;
    const currentDir = obs.direction || 'north';
    let newDir = 'north';
    if (currentDir === 'north') newDir = 'south';
    else if (currentDir === 'south') newDir = 'north';
    else if (currentDir === 'east') newDir = 'west';
    else if (currentDir === 'west') newDir = 'east';
    await updateRtdbWithHistory('obstacles', obstacleId, { direction: newDir }, `Inversion de direction`);
  };

  // -------------------------------------------------------
  // handleObstacleConvertTo - converts obstacle type
  // -------------------------------------------------------
  const handleObstacleConvertTo = async (obstacleId: string, newType: 'wall' | 'one-way-wall' | 'door' | 'window') => {
    if (!roomId) return;
    const obs = obstacles.find(o => o.id === obstacleId);
    if (!obs) return;

    const updateData: any = { type: newType };

    if (newType === 'one-way-wall') {
      const p1 = obs.points[0];
      const p2 = obs.points[1];
      if (p1 && p2) {
        updateData.direction = determineOneWayDirection(p1, p2);
      }
    }

    if (newType === 'door') {
      updateData.isOpen = false;
    }

    await updateRtdbWithHistory('obstacles', obstacleId, updateData, `Conversion en ${newType === 'door' ? 'porte' : newType === 'one-way-wall' ? 'mur sens-unique' : newType === 'window' ? 'fenêtre' : 'mur'}`);
  };

  // -------------------------------------------------------
  // handleToggleRoomMode - toggles room/individual mode for closed loops
  // -------------------------------------------------------
  const handleToggleRoomMode = async (obstacleId: string) => {
    if (!roomId) return;
    const obs = obstacles.find(o => o.id === obstacleId);
    if (!obs) return;

    // Find the closed loop containing this wall
    const loops = findClosedLoops(obstacles);
    const loop = loops.find(l => l.wallObstacles.some(w => w.id === obstacleId));
    if (!loop) return;

    const newMode = obs.roomMode === 'individual' ? 'room' : 'individual';
    const label = newMode === 'individual' ? 'Mode obstacles' : 'Mode salle';

    // Update all walls in the loop
    const updatePromises = loop.wallObstacles.map(wall =>
      updateRtdbWithHistory('obstacles', wall.id, { roomMode: newMode }, label)
    );
    await Promise.all(updatePromises);
  };

  // -------------------------------------------------------
  // clearAllObstacles - deletes all obstacles for current city
  // -------------------------------------------------------
  const clearAllObstacles = async () => {
    if (!roomId) return;

    try {
      // Supprimer tous les obstacles de la ville courante depuis RTDB
      const currentObstacles = obstacles; // déjà filtrés par cityId
      if (currentObstacles.length === 0) return;
      const deletePromises = currentObstacles.map(o => deleteFromRtdbWithHistory('obstacles', o.id, 'Suppression groupée'));
      await Promise.all(deletePromises);

    } catch (error) {
      console.error('❌ Erreur suppression obstacles:', error);
    }
  };

  return {
    saveObstacle,
    deleteObstacle,
    updateObstacle,
    toggleDoorState,
    toggleLockDoor,
    handleObstacleDelete,
    handleObstacleDeleteConnected,
    handleObstacleInvertDirection,
    handleObstacleConvertTo,
    handleToggleRoomMode,
    clearAllObstacles,
  };
}
