/**
 * Domaine identity (futur service identity, phase 2 de refacto.md).
 * Seul point d'accès du front à l'authentification et au profil utilisateur.
 */
export type { AuthErrorCode, AuthProvider, SessionUser } from './types';
export { AuthError } from './errors';
export {
    getAccessToken,
    getCurrentUser,
    getSession,
    subscribeSession,
    type SessionState,
    type SessionStatus,
    type UserProfile,
} from './session';
export { useSession } from './use-session';
export {
    changePassword,
    sendPasswordReset,
    signInWithGoogle,
    signInWithPassword,
    signOut,
    signUpWithPassword,
} from './auth';
