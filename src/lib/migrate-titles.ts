/**
 * Script de migration pour convertir les anciens titres (label complet)
 * vers le nouveau format (slug)
 */

import { db, doc, getDoc, updateDoc } from '@/lib/firebase';
import { generateSlug } from '@/lib/titles';

export async function migrateTitlesForUser(uid: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.log('User not found');
      return;
    }

    const userData = userSnap.data();
    const titles = userData.titles || {};

    let needsMigration = false;
    const newTitles: Record<string, string> = {};

    // Parcourir tous les titres
    for (const [key, value] of Object.entries(titles)) {
      // Si la clé contient des espaces ou des majuscules, c'est l'ancien format
      if (key !== key.toLowerCase() || key.includes(' ')) {
        needsMigration = true;
        const slug = generateSlug(key);
        newTitles[slug] = value as string;
        console.log(`Migrating: "${key}" -> "${slug}"`);
      } else {
        // Garder le nouveau format tel quel
        newTitles[key] = value as string;
      }
    }

    if (needsMigration) {
      await updateDoc(userRef, {
        titles: newTitles
      });
      console.log(`✅ Migration completed for user ${uid}`);
      console.log(`Migrated ${Object.keys(newTitles).length} titles`);
    } else {
      console.log(`✓ User ${uid} already using new format`);
    }
  } catch (error) {
    console.error('Error migrating titles:', error);
    throw error;
  }
}

/**
 * Fonction utilitaire pour migrer tous les utilisateurs
 * À utiliser avec précaution !
 */
export async function migrateAllUsersTitles(): Promise<void> {
  console.warn('⚠️  This function should be run manually through admin console');
  console.warn('⚠️  Not recommended for automatic execution');
  // Implementation would require admin SDK to list all users
}
