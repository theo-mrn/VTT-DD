'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { doc, setDoc, deleteDoc, updateDoc, addDoc, collection, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

// Type définissant une action undoable
export interface UndoableAction {
    type: 'ADD' | 'DELETE' | 'UPDATE' | 'SET';
    collection: string; // ex: 'characters', 'objects', 'lights', etc.
    documentId: string;
    previousData?: any; // Données avant modification (pour UPDATE/DELETE)
    newData?: any; // Nouvelles données (pour ADD/UPDATE/SET)
    timestamp: number;
    description?: string; // Description lisible (ex: "Suppression de Gandalf")
    roomId: string; // ID de la salle pour construire les chemins Firebase
}

interface UndoRedoContextType {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
    recordAction: (action: Omit<UndoableAction, 'timestamp'>) => void;
    clearHistory: () => void;
    historySize: number;
}

const UndoRedoContext = createContext<UndoRedoContextType | undefined>(undefined);

const MAX_HISTORY_SIZE = 50;

export function UndoRedoProvider({ children }: { children: ReactNode }) {
    const [undoStack, setUndoStack] = useState<UndoableAction[]>([]);
    const [redoStack, setRedoStack] = useState<UndoableAction[]>([]);

    // Enregistrer une action dans l'historique
    const recordAction = useCallback((action: Omit<UndoableAction, 'timestamp'>) => {
        const fullAction: UndoableAction = {
            ...action,
            timestamp: Date.now(),
        };

        setUndoStack((prev) => {
            const newStack = [...prev, fullAction];
            // Limiter la taille de l'historique
            if (newStack.length > MAX_HISTORY_SIZE) {
                return newStack.slice(-MAX_HISTORY_SIZE);
            }
            return newStack;
        });

        // Quand on enregistre une nouvelle action, on efface le redo stack
        setRedoStack([]);
    }, []);

    // Annuler la dernière action
    const undo = useCallback(async () => {
        if (undoStack.length === 0) {
            toast.info('Rien à annuler');
            return;
        }

        const action = undoStack[undoStack.length - 1];

        try {
            // Construire le chemin Firebase
            const ref = doc(db, 'cartes', action.roomId, action.collection, action.documentId);

            switch (action.type) {
                case 'ADD':
                    // Annuler un ajout = supprimer le document
                    await deleteDoc(ref);
                    toast.success(action.description || 'Action annulée');
                    break;

                case 'DELETE':
                    // Annuler une suppression = recréer le document avec les données précédentes
                    if (action.previousData) {
                        await setDoc(ref, action.previousData);
                        toast.success(action.description || 'Suppression annulée');
                    }
                    break;

                case 'UPDATE':
                    // Annuler une mise à jour = restaurer les champs précédents
                    if (action.previousData) {
                        await updateDoc(ref, action.previousData);
                        toast.success(action.description || 'Modification annulée');
                    }
                    break;

                case 'SET':
                    // Annuler un set = si previousData existe, le restaurer, sinon supprimer
                    // CRITICAL: Use merge to avoid deleting fields not in previousData
                    if (action.previousData) {
                        await setDoc(ref, action.previousData, { merge: true });
                        toast.success(action.description || 'Action annulée');
                    } else {
                        await deleteDoc(ref);
                        toast.success(action.description || 'Action annulée');
                    }
                    break;
            }

            // Déplacer l'action du undo vers le redo stack
            setUndoStack((prev) => prev.slice(0, -1));
            setRedoStack((prev) => [...prev, action]);

        } catch (error) {
            console.error('Erreur lors du undo:', error);
            toast.error('Impossible d\'annuler cette action');
        }
    }, [undoStack]);

    // Refaire la dernière action annulée
    const redo = useCallback(async () => {
        if (redoStack.length === 0) {
            toast.info('Rien à refaire');
            return;
        }

        const action = redoStack[redoStack.length - 1];

        try {
            const ref = doc(db, 'cartes', action.roomId, action.collection, action.documentId);

            switch (action.type) {
                case 'ADD':
                    // Refaire un ajout = recréer le document
                    if (action.newData) {
                        await setDoc(ref, action.newData);
                        toast.success('Action refaite');
                    }
                    break;

                case 'DELETE':
                    // Refaire une suppression = supprimer à nouveau
                    await deleteDoc(ref);
                    toast.success('Action refaite');
                    break;

                case 'UPDATE':
                    // Refaire une mise à jour = appliquer les nouvelles données
                    if (action.newData) {
                        await updateDoc(ref, action.newData);
                        toast.success('Action refaite');
                    }
                    break;

                case 'SET':
                    // Refaire un set = appliquer les nouvelles données
                    // CRITICAL: Use merge to avoid deleting fields not in newData
                    if (action.newData) {
                        await setDoc(ref, action.newData, { merge: true });
                        toast.success('Action refaite');
                    }
                    break;
            }

            // Déplacer l'action du redo vers le undo stack
            setRedoStack((prev) => prev.slice(0, -1));
            setUndoStack((prev) => [...prev, action]);

        } catch (error) {
            console.error('Erreur lors du redo:', error);
            toast.error('Impossible de refaire cette action');
        }
    }, [redoStack]);

    // Effacer tout l'historique
    const clearHistory = useCallback(() => {
        setUndoStack([]);
        setRedoStack([]);
    }, []);

    const value: UndoRedoContextType = {
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undo,
        redo,
        recordAction,
        clearHistory,
        historySize: undoStack.length,
    };

    return (
        <UndoRedoContext.Provider value={value}>
            {children}
        </UndoRedoContext.Provider>
    );
}

export function useUndoRedo() {
    const context = useContext(UndoRedoContext);
    if (context === undefined) {
        throw new Error('useUndoRedo must be used within an UndoRedoProvider');
    }
    return context;
}
