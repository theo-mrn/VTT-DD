import { getStorage, ref, uploadBytes, getDownloadURL, StorageReference } from 'firebase/storage';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';

const DEFAULT_LIMIT = 22.7 * 1024 * 1024; // 22.7 MB
const PREMIUM_LIMIT = 50 * 1024 * 1024; // 50 MB

/**
 * Validates if the room has enough storage quota left
 */
export async function validateStorageQuota(roomId: string, bytesToAdd: number): Promise<boolean> {
    if (!roomId) return true;

    try {
        // 1. Determine limit
        const premiumQuery = query(collection(db, 'users'), where('room_id', '==', roomId), where('premium', '==', true), limit(1));
        const premiumSnap = await getDocs(premiumQuery);
        const currentLimit = !premiumSnap.empty ? PREMIUM_LIMIT : DEFAULT_LIMIT;

        // 2. Check usage
        const usageRef = doc(db, 'rooms', roomId, 'usage', 'storage');
        const usageSnap = await getDoc(usageRef);
        const currentUsage = usageSnap.exists() ? usageSnap.data().totalBytes || 0 : 0;

        if (currentUsage + bytesToAdd > currentLimit) {
            // Note: QuotaGuard modal will also trigger if this succeeds but the network call is intercepted
            return false;
        }
        return true;
    } catch (error) {
        console.error("Error validating quota:", error);
        return true;
    }
}

/**
 * Optimized upload function
 * Note: Quota increment is now handled GLOBALLY by QuotaGuard middleware
 */
export async function uploadWithQuota(
    storageRef: StorageReference,
    data: File | Blob,
    roomId: string
): Promise<string> {
    // Perform upload. QuotaGuard will intercept the XHR, 
    // block if over limit, and increment on success.
    const snapshot = await uploadBytes(storageRef, data);
    return await getDownloadURL(snapshot.ref);
}
