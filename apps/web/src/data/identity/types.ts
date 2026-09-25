/**
 * Types du domaine identity, indépendants du fournisseur d'authentification.
 * Aujourd'hui implémentés sur Firebase Auth ; demain sur le service identity
 * (phase 2 de refacto.md) sans que les composants changent.
 */

/** Fournisseur de connexion rattaché au compte. */
export type AuthProvider = 'password' | 'google' | (string & {});

/** Utilisateur de la session courante. */
export interface SessionUser {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    providers: AuthProvider[];
}

export type AuthErrorCode =
    | 'invalid-credentials'
    | 'email-already-in-use'
    | 'weak-password'
    | 'invalid-email'
    | 'popup-closed'
    | 'too-many-requests'
    | 'requires-recent-login'
    | 'not-authenticated'
    | 'unknown';
