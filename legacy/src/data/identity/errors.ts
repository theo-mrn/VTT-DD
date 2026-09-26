import type { AuthErrorCode } from './types';

/**
 * Erreur d'authentification avec un code neutre : l'UI teste `code`, jamais
 * un code propre à Firebase (`auth/wrong-password`…).
 * `message` garde le message d'origine, pour ne pas changer ce qui s'affiche.
 */
export class AuthError extends Error {
    readonly code: AuthErrorCode;

    constructor(code: AuthErrorCode, message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'AuthError';
        this.code = code;
    }
}

const CODES_FIREBASE: Record<string, AuthErrorCode> = {
    'auth/invalid-credential': 'invalid-credentials',
    'auth/wrong-password': 'invalid-credentials',
    'auth/user-not-found': 'invalid-credentials',
    'auth/invalid-login-credentials': 'invalid-credentials',
    'auth/email-already-in-use': 'email-already-in-use',
    'auth/weak-password': 'weak-password',
    'auth/invalid-email': 'invalid-email',
    'auth/popup-closed-by-user': 'popup-closed',
    'auth/cancelled-popup-request': 'popup-closed',
    'auth/too-many-requests': 'too-many-requests',
    'auth/requires-recent-login': 'requires-recent-login',
};

/** Convertit une erreur du fournisseur en AuthError. */
export function toAuthError(erreur: unknown): AuthError {
    if (erreur instanceof AuthError) return erreur;

    const codeFournisseur =
        typeof erreur === 'object' && erreur !== null && 'code' in erreur
            ? String((erreur as { code: unknown }).code)
            : '';
    const message = erreur instanceof Error ? erreur.message : String(erreur);

    return new AuthError(CODES_FIREBASE[codeFournisseur] ?? 'unknown', message, { cause: erreur });
}
