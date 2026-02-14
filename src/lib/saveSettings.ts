import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export interface UserSettings {
    cursorColor?: string;
    cursorTextColor?: string;
    showMyCursor?: boolean;
    showOtherCursors?: boolean;
    showGrid?: boolean;
    showFogGrid?: boolean;
    showCharBorders?: boolean;
    globalTokenScale?: number;
    performanceMode?: 'high' | 'eco' | 'static';
}

/**
 * Save user settings to Firestore
 * @param userId - The user's UID
 * @param settings - Partial settings object to update
 */
export async function saveUserSettings(userId: string, settings: UserSettings): Promise<void> {
    try {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, { settings }, { merge: true });
        console.log('✅ Settings saved to DB:', settings);
    } catch (error) {
        console.error('❌ Error saving settings:', error);
        throw error;
    }
}
