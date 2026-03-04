import { useCallback } from 'react';
import { doc, deleteDoc, updateDoc, setDoc, getDoc, addDoc, collection, DocumentReference } from 'firebase/firestore';
import { ref as rtdbRef, update as rtdbUpdate, get as rtdbGet, set as rtdbSet, push as rtdbPush } from 'firebase/database';
import { db, realtimeDb } from '@/lib/firebase';
import { useUndoRedo } from '@/contexts/UndoRedoContext';

/**
 * Hook personnalisé qui wrappe les opérations Firestore avec l'historique undo/redo
 * 
 * @param roomId - ID de la salle pour construire les chemins Firebase
 * @returns Fonctions Firestore augmentées avec l'historique
 */
export function useFirestoreWithHistory(roomId: string) {
    const { recordAction } = useUndoRedo();

    /**
     * Ajoute un document avec enregistrement dans l'historique
     */
    const addWithHistory = useCallback(async (
        collectionName: string,
        data: any,
        description?: string
    ): Promise<DocumentReference> => {
        const collectionRef = collection(db, 'cartes', roomId, collectionName);
        const docRef = await addDoc(collectionRef, data);

        recordAction({
            type: 'ADD',
            collection: collectionName,
            documentId: docRef.id,
            newData: data,
            description: description || `Ajout dans ${collectionName}`,
            roomId,
        });

        return docRef;
    }, [roomId, recordAction]);

    /**
     * Supprime un document avec enregistrement dans l'historique
     */
    const deleteWithHistory = useCallback(async (
        collectionName: string,
        documentId: string,
        description?: string
    ): Promise<void> => {
        // Récupérer les données avant suppression pour pouvoir les restaurer
        const docRef = doc(db, 'cartes', roomId, collectionName, documentId);
        const snapshot = await getDoc(docRef);
        const previousData = snapshot.exists() ? snapshot.data() : undefined;

        await deleteDoc(docRef);

        recordAction({
            type: 'DELETE',
            collection: collectionName,
            documentId,
            previousData,
            description: description || `Suppression de ${collectionName}`,
            roomId,
        });
    }, [roomId, recordAction]);

    /**
     * Met à jour un document avec enregistrement dans l'historique
     * IMPORTANT: Enregistre uniquement les champs modifiés, pas tout le document
     */
    const updateWithHistory = useCallback(async (
        collectionName: string,
        documentId: string,
        updates: any,
        description?: string
    ): Promise<void> => {
        // Récupérer les valeurs actuelles des champs qu'on va modifier
        const docRef = doc(db, 'cartes', roomId, collectionName, documentId);
        const snapshot = await getDoc(docRef);

        let previousData: any = {};
        if (snapshot.exists()) {
            const currentData = snapshot.data();
            // Ne stocker que les champs qui vont être modifiés
            for (const key in updates) {
                if (key in currentData) {
                    previousData[key] = currentData[key];
                }
            }
        }

        await updateDoc(docRef, updates);

        recordAction({
            type: 'UPDATE',
            collection: collectionName,
            documentId,
            previousData,
            newData: updates,
            description: description || `Modification de ${collectionName}`,
            roomId,
        });
    }, [roomId, recordAction]);

    /**
     * Crée ou remplace un document avec enregistrement dans l'historique
     */
    const setWithHistory = useCallback(async (
        collectionName: string,
        documentId: string,
        data: any,
        description?: string,
        merge: boolean = false
    ): Promise<void> => {
        const docRef = doc(db, 'cartes', roomId, collectionName, documentId);

        // Récupérer les données précédentes si elles existent
        const snapshot = await getDoc(docRef);
        const previousData = snapshot.exists() ? snapshot.data() : undefined;

        await setDoc(docRef, data, merge ? { merge: true } : {});

        recordAction({
            type: 'SET',
            collection: collectionName,
            documentId,
            previousData,
            newData: data,
            description: description || `Modification de ${collectionName}`,
            roomId,
        });
    }, [roomId, recordAction]);

    /**
     * Met à jour la position world map d'un personnage en RTDB avec historique
     */
    const updatePositionWithHistory = useCallback(async (
        characterId: string,
        updates: { x: number; y: number },
        description?: string
    ): Promise<void> => {
        const rtdbPath = `rooms/${roomId}/positions/${characterId}`;
        const charPosRef = rtdbRef(realtimeDb, rtdbPath);

        // Lire les valeurs actuelles pour l'undo
        const snapshot = await rtdbGet(charPosRef);
        const currentData = snapshot.val() || {};
        const previousData: any = {};
        for (const key in updates) {
            if (key in currentData) previousData[key] = currentData[key];
        }

        await rtdbUpdate(charPosRef, updates);

        recordAction({
            type: 'RTDB_UPDATE',
            collection: 'positions',
            documentId: characterId,
            previousData,
            newData: updates,
            description: description || 'Déplacement',
            roomId,
            rtdbPath,
        });
    }, [roomId, recordAction]);

    /**
     * Met à jour la position d'un personnage dans une ville spécifique en RTDB avec historique
     */
    const setCityPositionWithHistory = useCallback(async (
        characterId: string,
        cityId: string,
        position: { x: number; y: number },
        description?: string
    ): Promise<void> => {
        const rtdbPath = `rooms/${roomId}/positions/${characterId}/positions/${cityId}`;
        const cityPosRef = rtdbRef(realtimeDb, rtdbPath);

        // Lire les valeurs actuelles pour l'undo
        const snapshot = await rtdbGet(cityPosRef);
        const previousData = snapshot.val() || undefined;

        await rtdbUpdate(cityPosRef, position);

        recordAction({
            type: 'RTDB_UPDATE',
            collection: 'positions',
            documentId: characterId,
            previousData,
            newData: position,
            description: description || 'Déplacement',
            roomId,
            rtdbPath,
        });
    }, [roomId, recordAction]);

    // ─── RTDB CRUD générique (drawings, obstacles, notes) ─────────────────────

    /**
     * Ajoute un document RTDB avec historique. Génère un ID unique via push().
     * Retourne l'ID généré.
     */
    const addToRtdbWithHistory = useCallback(async (
        collectionName: string,
        data: any,
        description?: string
    ): Promise<string> => {
        const collectionRef = rtdbRef(realtimeDb, `rooms/${roomId}/${collectionName}`);
        const newNodeRef = rtdbPush(collectionRef);
        const id = newNodeRef.key!;

        await rtdbSet(newNodeRef, data);

        const rtdbPath = `rooms/${roomId}/${collectionName}/${id}`;
        recordAction({
            type: 'RTDB_ADD',
            collection: collectionName,
            documentId: id,
            newData: data,
            description: description || `Ajout dans ${collectionName}`,
            roomId,
            rtdbPath,
        });

        return id;
    }, [roomId, recordAction]);

    /**
     * Met à jour un document RTDB avec historique.
     */
    const updateRtdbWithHistory = useCallback(async (
        collectionName: string,
        docId: string,
        updates: any,
        description?: string
    ): Promise<void> => {
        const rtdbPath = `rooms/${roomId}/${collectionName}/${docId}`;
        const nodeRef = rtdbRef(realtimeDb, rtdbPath);

        // Lire les valeurs actuelles pour l'undo
        const snapshot = await rtdbGet(nodeRef);
        const currentData = snapshot.val() || {};
        const previousData: any = {};
        for (const key in updates) {
            if (key in currentData) previousData[key] = currentData[key];
        }

        await rtdbUpdate(nodeRef, updates);

        recordAction({
            type: 'RTDB_UPDATE',
            collection: collectionName,
            documentId: docId,
            previousData,
            newData: updates,
            description: description || `Modification de ${collectionName}`,
            roomId,
            rtdbPath,
        });
    }, [roomId, recordAction]);

    /**
     * Supprime un document RTDB avec historique.
     */
    const deleteFromRtdbWithHistory = useCallback(async (
        collectionName: string,
        docId: string,
        description?: string
    ): Promise<void> => {
        const rtdbPath = `rooms/${roomId}/${collectionName}/${docId}`;
        const nodeRef = rtdbRef(realtimeDb, rtdbPath);

        // Lire les données avant suppression pour l'undo
        const snapshot = await rtdbGet(nodeRef);
        const previousData = snapshot.val() || undefined;

        await rtdbSet(nodeRef, null);

        recordAction({
            type: 'RTDB_DELETE',
            collection: collectionName,
            documentId: docId,
            previousData,
            description: description || `Suppression de ${collectionName}`,
            roomId,
            rtdbPath,
        });
    }, [roomId, recordAction]);

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
