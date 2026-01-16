import { useCallback } from 'react';
import { doc, deleteDoc, updateDoc, setDoc, getDoc, addDoc, collection, DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

    return {
        addWithHistory,
        deleteWithHistory,
        updateWithHistory,
        setWithHistory,
    };
}
