import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, updateDoc, increment, getDoc, collection, query, where, limit as firestoreLimit } from 'firebase/firestore';
import { toast } from 'sonner';

const DEFAULT_LIMIT = 22.7 * 1024 * 1024; // 22.7 MB
const PREMIUM_LIMIT = 50 * 1024 * 1024; // 50 MB

export function useStorageQuota(roomId: string) {
    const [usage, setUsage] = useState<number>(0);
    const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!roomId) return;

        // 1. Listen for storage usage
        const unsubUsage = onSnapshot(doc(db, 'rooms', roomId, 'usage', 'storage'), (snapshot) => {
            if (snapshot.exists()) {
                setUsage(snapshot.data().totalBytes || 0);
            } else {
                // Initialize if not exists
                setDoc(doc(db, 'rooms', roomId, 'usage', 'storage'), { totalBytes: 0 }, { merge: true });
                setUsage(0);
            }
            setLoading(false);
        });

        // 2. Listen for premium status in the room
        const q = query(
            collection(db, 'users'),
            where('room_id', '==', roomId),
            where('premium', '==', true),
            firestoreLimit(1)
        );

        const unsubPremium = onSnapshot(q, (snapshot) => {
            setLimit(!snapshot.empty ? PREMIUM_LIMIT : DEFAULT_LIMIT);
        });

        return () => {
            unsubUsage();
            unsubPremium();
        };
    }, [roomId]);

    const checkQuota = (bytesToAdd: number): boolean => {
        if (usage + bytesToAdd > limit) {
            toast.error(`Limite de stockage atteinte (${limit / (1024 * 1024)} Mo). Veuillez supprimer des fichiers dans la bibliothèque.`);
            return false;
        }
        return true;
    };

    /**
     * Call this after a successful upload to update the counter
     * @param bytesAdded Size of the uploaded file
     */
    const addUsage = async (bytesAdded: number) => {
        if (!roomId) return;
        const usageRef = doc(db, 'rooms', roomId, 'usage', 'storage');
        await setDoc(usageRef, {
            totalBytes: increment(bytesAdded),
            lastUpdate: new Date()
        }, { merge: true });
    };

    /**
     * Call this after a deletion to update the counter
     * @param bytesRemoved Size of the deleted file
     */
    const removeUsage = async (bytesRemoved: number) => {
        if (!roomId) return;
        const usageRef = doc(db, 'rooms', roomId, 'usage', 'storage');
        await setDoc(usageRef, {
            totalBytes: increment(-bytesRemoved),
            lastUpdate: new Date()
        }, { merge: true });
    };

    /**
     * Force synchronization with a calculated size (e.g. from FileLibrary)
     */
    const syncUsage = async (totalBytes: number) => {
        if (!roomId) return;
        const usageRef = doc(db, 'rooms', roomId, 'usage', 'storage');
        await setDoc(usageRef, {
            totalBytes,
            lastUpdate: new Date()
        }, { merge: true });
    };

    return { usage, loading, limit, checkQuota, addUsage, removeUsage, syncUsage };
}
