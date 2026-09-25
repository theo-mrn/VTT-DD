/**
 * Actions d'authentification. Chaque action correspond à un futur appel au
 * service identity (phase 2) : l'inscription crée le compte ET le profil en une
 * seule opération, comme le fera identity côté serveur.
 */
import {
    createUserWithEmailAndPassword,
    EmailAuthProvider,
    GoogleAuthProvider,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut as firebaseSignOut,
    updatePassword,
} from 'firebase/auth';
import { auth, db, doc, getDoc, setDoc } from '@/lib/firebase';
import { AuthError, toAuthError } from './errors';
import { toSessionUser } from './session';
import type { SessionUser } from './types';

const TITRE_INITIAL = 'débutant';

export async function signInWithPassword(email: string, password: string): Promise<SessionUser> {
    try {
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        return toSessionUser(user);
    } catch (e) {
        throw toAuthError(e);
    }
}

/** Crée le compte puis le profil `users/{uid}` (nom, titre initial, e-mail). */
export async function signUpWithPassword(params: {
    email: string;
    password: string;
    name: string;
}): Promise<SessionUser> {
    try {
        const { user } = await createUserWithEmailAndPassword(auth, params.email, params.password);
        await setDoc(doc(db, 'users', user.uid), {
            name: params.name,
            title: TITRE_INITIAL,
            email: params.email,
        });
        return toSessionUser(user);
    } catch (e) {
        throw toAuthError(e);
    }
}

/** Connexion Google (popup) ; crée le profil à la première connexion. */
export async function signInWithGoogle(): Promise<SessionUser> {
    try {
        const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
        const profil = doc(db, 'users', user.uid);
        if (!(await getDoc(profil)).exists()) {
            await setDoc(profil, {
                name: user.displayName || 'Joueur',
                title: TITRE_INITIAL,
                email: user.email,
            });
        }
        return toSessionUser(user);
    } catch (e) {
        throw toAuthError(e);
    }
}

export async function sendPasswordReset(email: string): Promise<void> {
    try {
        await sendPasswordResetEmail(auth, email);
    } catch (e) {
        throw toAuthError(e);
    }
}

/** Change le mot de passe après vérification du mot de passe actuel. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) {
        throw new AuthError('not-authenticated', 'Utilisateur non authentifié');
    }
    try {
        await reauthenticateWithCredential(
            user,
            EmailAuthProvider.credential(user.email, currentPassword),
        );
        await updatePassword(user, newPassword);
    } catch (e) {
        throw toAuthError(e);
    }
}

export async function signOut(): Promise<void> {
    await firebaseSignOut(auth);
}
