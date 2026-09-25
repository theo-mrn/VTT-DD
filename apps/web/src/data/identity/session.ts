/**
 * Session unique de l'application : UN écouteur d'authentification et UN
 * abonnement au profil `users/{uid}`, partagés par tous les composants.
 *
 * Avant : chaque page branchait son propre onAuthStateChanged puis relisait
 * users/{uid} (12 écouteurs, une soixantaine de lectures du même document).
 * Ici l'état est gardé en mémoire pour toute la navigation ; les composants le
 * lisent via useSession() sans déclencher de requête.
 *
 * Le store démarre au premier abonné et fonctionne hors de React
 * (getSession(), subscribeSession()). En phase 2, seule l'implémentation
 * change : le service identity et un middleware Next (cookie httpOnly + JWT)
 * remplaceront Firebase Auth, avec la même interface.
 */
import type { User } from 'firebase/auth';
import { auth, db, doc, onAuthStateChanged, onSnapshot } from '@/lib/firebase';
import type { SessionUser } from './types';

/** Champs du document profil utilisés par l'app. */
export interface UserProfile {
    name: string | null;
    email: string | null;
    title: string | null;
    /** Salle courante (users.room_id), en attendant room_members côté campaign. */
    roomId: string | null;
    /** Nom du perso joué, ou "MJ" (users.perso), en attendant les rôles de campaign. */
    perso: string | null;
    persoId: string | null;
    /**
     * Document complet, pour les champs pas encore typés ici.
     * À réduire au fil de la migration ; disparaît avec le service identity.
     */
    raw: Record<string, unknown>;
}

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionState {
    status: SessionStatus;
    user: SessionUser | null;
    /** null tant que le profil n'est pas chargé, ou si le document n'existe pas. */
    profile: UserProfile | null;
    profileStatus: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
}

const ETAT_INITIAL: SessionState = {
    status: 'loading',
    user: null,
    profile: null,
    profileStatus: 'idle',
};

let etat: SessionState = ETAT_INITIAL;
const abonnes = new Set<() => void>();
let arreterAuth: (() => void) | null = null;
let arreterProfil: (() => void) | null = null;

function publier(suivant: SessionState): void {
    etat = suivant;
    for (const abonne of abonnes) abonne();
}

export function toSessionUser(u: User): SessionUser {
    return {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        photoURL: u.photoURL,
        providers: u.providerData.map((p) =>
            p.providerId === 'google.com' ? 'google' : p.providerId,
        ),
    };
}

function texte(v: unknown): string | null {
    return typeof v === 'string' && v !== '' ? v : null;
}

function toUserProfile(data: Record<string, unknown>): UserProfile {
    return {
        name: texte(data.name),
        email: texte(data.email),
        title: texte(data.title),
        roomId: texte(data.room_id),
        perso: texte(data.perso),
        persoId: texte(data.persoId),
        raw: data,
    };
}

function suivreProfil(uid: string): void {
    arreterProfil?.();
    arreterProfil = onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
            // Ignorer un instantané arrivé après un changement d'utilisateur
            if (etat.user?.uid !== uid) return;
            publier({
                ...etat,
                profile: snap.exists() ? toUserProfile(snap.data()) : null,
                profileStatus: snap.exists() ? 'ready' : 'missing',
            });
        },
        (erreur) => {
            console.error('[session] abonnement au profil impossible', erreur);
            if (etat.user?.uid === uid) publier({ ...etat, profileStatus: 'error' });
        },
    );
}

function demarrer(): void {
    if (arreterAuth) return;
    arreterAuth = onAuthStateChanged(auth, (u) => {
        if (!u) {
            arreterProfil?.();
            arreterProfil = null;
            publier({ status: 'anonymous', user: null, profile: null, profileStatus: 'idle' });
            return;
        }

        const memeUtilisateur = etat.user?.uid === u.uid;
        publier({
            status: 'authenticated',
            user: toSessionUser(u),
            // Même utilisateur (rafraîchissement du jeton) : on garde le profil
            profile: memeUtilisateur ? etat.profile : null,
            profileStatus: memeUtilisateur ? etat.profileStatus : 'loading',
        });
        if (!memeUtilisateur) suivreProfil(u.uid);
    });
}

/**
 * Abonnement bas niveau (hors React). Renvoie la fonction de désabonnement.
 * La session, elle, reste active pour toute la vie de l'onglet : la couper
 * quand le dernier composant se démonte ferait tout recharger à chaque
 * changement de page.
 */
export function subscribeSession(abonne: () => void): () => void {
    abonnes.add(abonne);
    demarrer();
    return () => {
        abonnes.delete(abonne);
    };
}

/** État courant de la session (référence stable tant qu'il ne change pas). */
export function getSession(): SessionState {
    return etat;
}

/** État utilisé pendant le rendu serveur : la session n'est connue que côté client. */
export function getServerSession(): SessionState {
    return ETAT_INITIAL;
}

/**
 * Utilisateur courant, disponible immédiatement même sans abonné
 * (remplace auth.currentUser dans les gestionnaires d'événements).
 */
export function getCurrentUser(): SessionUser | null {
    if (etat.user) return etat.user;
    return auth.currentUser ? toSessionUser(auth.currentUser) : null;
}

/** Jeton d'accès à envoyer en `Authorization: Bearer` aux routes API. */
export async function getAccessToken(): Promise<string | null> {
    return (await auth.currentUser?.getIdToken()) ?? null;
}
