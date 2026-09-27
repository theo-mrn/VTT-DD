/**
 * Préférences de l'utilisateur (curseur, grille, bordures, performance…) :
 * l'ancien `users/{uid}.settings` Firestore est le champ `settings` du profil
 * (service identity). Le PATCH remplace tout l'objet : on repart du profil lu.
 */
import { getMyProfile, updateMyProfile } from '@/lib/profile';

export type ThemeName = 'dark' | 'tavern' | 'dungeon' | 'royal' | 'druid';

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
  diceThemedSounds?: boolean;
  theme?: ThemeName;
}

/** Préférences enregistrées (null si le profil est illisible). */
export async function loadUserSettings(): Promise<Record<string, unknown> | null> {
  try {
    return (await getMyProfile()).settings ?? {};
  } catch {
    return null;
  }
}

/**
 * Enregistre des préférences (fusionnées avec celles du profil).
 * @param _userId - identifiant du compte (gardé pour la signature de l'ancienne app)
 */
export async function saveUserSettings(_userId: string, settings: UserSettings): Promise<void> {
  const current = (await loadUserSettings()) ?? {};
  await updateMyProfile({ settings: { ...current, ...settings } });
}
