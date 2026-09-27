import { useCallback } from 'react';
import { useUndoRedo } from '@/contexts/UndoRedoContext';
import {
  legacyAdd,
  legacyDelete,
  legacyGet,
  legacyUpdate,
  moveCharacters,
  currentMapId,
} from '@/hooks/map/map-writes';

/**
 * Hook personnalisé qui wrappe les écritures de la carte avec l'historique undo/redo.
 *
 * Mêmes fonctions que dans l'ancienne app (écritures Firestore et RTDB) : elles passent
 * maintenant par l'API de la carte (map-writes.ts), avec les mêmes noms de collection et les
 * mêmes champs. Les données précédentes sont lues dans l'état partagé de la carte.
 *
 * @param roomId - Campagne (ancien code de salle)
 * @returns Fonctions d'écriture augmentées avec l'historique
 */
export function useFirestoreWithHistory(roomId: string) {
  const { recordAction } = useUndoRedo();

  /**
   * Ajoute un document avec enregistrement dans l'historique
   */
  const addWithHistory = useCallback(
    async (collectionName: string, data: any, description?: string): Promise<{ id: string }> => {
      const id = await legacyAdd(roomId, collectionName, data);

      recordAction({
        type: 'ADD',
        collection: collectionName,
        documentId: id,
        newData: data,
        description: description || `Ajout dans ${collectionName}`,
        roomId,
      });

      return { id };
    },
    [roomId, recordAction],
  );

  /**
   * Supprime un document avec enregistrement dans l'historique
   */
  const deleteWithHistory = useCallback(
    async (collectionName: string, documentId: string, description?: string): Promise<void> => {
      // Récupérer les données avant suppression pour pouvoir les restaurer
      const previousData = legacyGet(roomId, collectionName, documentId);

      await legacyDelete(roomId, collectionName, documentId);

      recordAction({
        type: 'DELETE',
        collection: collectionName,
        documentId,
        previousData,
        description: description || `Suppression de ${collectionName}`,
        roomId,
      });
    },
    [roomId, recordAction],
  );

  /**
   * Met à jour un document avec enregistrement dans l'historique
   * IMPORTANT: Enregistre uniquement les champs modifiés, pas tout le document
   * @param knownPreviousData - Si fourni, évite de relire les valeurs courantes (pendant le drag, l'état local est déjà déplacé)
   */
  const updateWithHistory = useCallback(
    async (
      collectionName: string,
      documentId: string,
      updates: any,
      description?: string,
      knownPreviousData?: any,
    ): Promise<void> => {
      let previousData: any = {};
      if (knownPreviousData) {
        previousData = knownPreviousData;
      } else {
        // Récupérer les valeurs actuelles des champs qu'on va modifier
        const currentData = legacyGet(roomId, collectionName, documentId);
        if (currentData) {
          // Ne stocker que les champs qui vont être modifiés
          for (const key in updates) {
            if (key in currentData) {
              previousData[key] = currentData[key];
            }
          }
        }
      }

      await legacyUpdate(roomId, collectionName, documentId, updates);

      recordAction({
        type: 'UPDATE',
        collection: collectionName,
        documentId,
        previousData,
        newData: updates,
        description: description || `Modification de ${collectionName}`,
        roomId,
      });
    },
    [roomId, recordAction],
  );

  /**
   * Crée ou remplace un document avec enregistrement dans l'historique
   */
  const setWithHistory = useCallback(
    async (
      collectionName: string,
      documentId: string,
      data: any,
      description?: string,
      _merge: boolean = false,
    ): Promise<void> => {
      // Récupérer les données précédentes si elles existent
      const previousData = legacyGet(roomId, collectionName, documentId);

      if (previousData) await legacyUpdate(roomId, collectionName, documentId, data);
      else await legacyAdd(roomId, collectionName, data);

      recordAction({
        type: 'SET',
        collection: collectionName,
        documentId,
        previousData,
        newData: data,
        description: description || `Modification de ${collectionName}`,
        roomId,
      });
    },
    [roomId, recordAction],
  );

  /**
   * Met à jour la position d'un personnage (fin de déplacement) avec historique
   */
  const updatePositionWithHistory = useCallback(
    async (
      characterId: string,
      updates: { x: number; y: number },
      description?: string,
    ): Promise<void> => {
      // Lire les valeurs actuelles pour l'undo
      const currentData = legacyGet(roomId, 'positions', characterId) || {};
      const previousData: any = {};
      for (const key in updates) {
        if (key in currentData) previousData[key] = currentData[key];
      }

      await moveCharacters(roomId, [{ characterId, pos: updates }]);

      recordAction({
        type: 'RTDB_UPDATE',
        collection: 'positions',
        documentId: characterId,
        previousData,
        newData: updates,
        description: description || 'Déplacement',
        roomId,
        rtdbPath: `positions/${characterId}`,
      });
    },
    [roomId, recordAction],
  );

  /**
   * Met à jour la position d'un personnage dans une scène avec historique : seule la carte
   * suivie est modifiable (le personnage y est présent).
   */
  const setCityPositionWithHistory = useCallback(
    async (
      characterId: string,
      cityId: string,
      position: { x: number; y: number },
      description?: string,
    ): Promise<void> => {
      const mapId = currentMapId(roomId);
      if (!mapId || mapId !== cityId) return;
      const current = legacyGet(roomId, 'positions', characterId);
      const previousData = current ? { x: current.x, y: current.y } : undefined;

      await moveCharacters(roomId, [{ characterId, pos: position }]);

      recordAction({
        type: 'RTDB_UPDATE',
        collection: 'positions',
        documentId: characterId,
        previousData,
        newData: position,
        description: description || 'Déplacement',
        roomId,
        rtdbPath: `positions/${characterId}/positions/${cityId}`,
      });
    },
    [roomId, recordAction],
  );

  // ─── CRUD générique des anciennes collections RTDB (drawings, obstacles, notes) ──────

  /**
   * Ajoute un élément avec historique. Retourne l'ID donné par le serveur.
   */
  const addToRtdbWithHistory = useCallback(
    async (collectionName: string, data: any, description?: string): Promise<string> => {
      const id = await legacyAdd(roomId, collectionName, data);

      recordAction({
        type: 'RTDB_ADD',
        collection: collectionName,
        documentId: id,
        newData: data,
        description: description || `Ajout dans ${collectionName}`,
        roomId,
        rtdbPath: `${collectionName}/${id}`,
      });

      return id;
    },
    [roomId, recordAction],
  );

  /**
   * Met à jour un élément avec historique.
   */
  const updateRtdbWithHistory = useCallback(
    async (
      collectionName: string,
      docId: string,
      updates: any,
      description?: string,
    ): Promise<void> => {
      // Lire les valeurs actuelles pour l'undo
      const currentData = legacyGet(roomId, collectionName, docId) || {};
      const previousData: any = {};
      for (const key in updates) {
        if (key in currentData) previousData[key] = currentData[key];
      }

      await legacyUpdate(roomId, collectionName, docId, updates);

      recordAction({
        type: 'RTDB_UPDATE',
        collection: collectionName,
        documentId: docId,
        previousData,
        newData: updates,
        description: description || `Modification de ${collectionName}`,
        roomId,
        rtdbPath: `${collectionName}/${docId}`,
      });
    },
    [roomId, recordAction],
  );

  /**
   * Supprime un élément avec historique.
   */
  const deleteFromRtdbWithHistory = useCallback(
    async (collectionName: string, docId: string, description?: string): Promise<void> => {
      // Lire les données avant suppression pour l'undo
      const previousData = legacyGet(roomId, collectionName, docId);

      await legacyDelete(roomId, collectionName, docId);

      recordAction({
        type: 'RTDB_DELETE',
        collection: collectionName,
        documentId: docId,
        previousData,
        description: description || `Suppression de ${collectionName}`,
        roomId,
        rtdbPath: `${collectionName}/${docId}`,
      });
    },
    [roomId, recordAction],
  );

  return {
    addWithHistory,
    deleteWithHistory,
    updateWithHistory,
    setWithHistory,
    updatePositionWithHistory,
    setCityPositionWithHistory,
    addToRtdbWithHistory,
    updateRtdbWithHistory,
    deleteFromRtdbWithHistory,
  };
}
