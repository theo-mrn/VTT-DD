/**
 * Profils publics des autres utilisateurs (créateur d'une salle, membres,
 * auteur d'un message ou d'un thème…), avec un cache partagé par tout l'onglet.
 *
 * Avant : chaque composant relisait users/{uid} à chaque montage, souvent en
 * boucle (un getDoc par membre, par banni, par auteur). Ici une même personne
 * n'est lue qu'une fois toutes les 5 minutes, et les lectures simultanées
 * partagent la même requête.
 *
 * PublicProfile est aussi le contrat du futur endpoint du service identity :
 * seuls ces champs sont publics. Aujourd'hui la règle Firestore laisse tout
 * utilisateur connecté lire le document complet (e-mail compris) — à fermer
 * en phase 2.
 */
import { useEffect, useState } from 'react';
import { db, doc, getDoc } from '@/lib/firebase';
import type { RawProfile } from './session';

export interface PublicProfile {
    uid: string;
    name: string | null;
    /** Photo de profil. */
    pp: string | null;
    titre: string | null;
    imageURL: string | null;
    bio: string | null;
    borderType: string | null;
    premium: boolean;
    showPremiumBadge: boolean;
    /** Temps de jeu cumulé. */
    timeSpent: number | null;
}

const DUREE_CACHE_MS = 5 * 60_000;

interface Entree {
    promesse: Promise<PublicProfile | null>;
    expire: number;
}

const cache = new Map<string, Entree>();

function texte(v: unknown): string | null {
    return typeof v === 'string' && v !== '' ? v : null;
}

export function toPublicProfile(uid: string, data: RawProfile): PublicProfile {
    return {
        uid,
        name: texte(data.name),
        pp: texte(data.pp),
        titre: texte(data.titre),
        imageURL: texte(data.imageURL),
        bio: texte(data.bio),
        borderType: texte(data.borderType),
        premium: data.premium === true,
        // Affiché par défaut : seul un `false` explicite masque le badge
        showPremiumBadge: data.showPremiumBadge !== false,
        timeSpent: typeof data.timeSpent === 'number' ? data.timeSpent : null,
    };
}

/** Profil public d'un utilisateur, ou null s'il n'existe pas. */
export function getPublicProfile(uid: string): Promise<PublicProfile | null> {
    const maintenant = Date.now();
    const existant = cache.get(uid);
    if (existant && existant.expire > maintenant) return existant.promesse;

    const promesse = getDoc(doc(db, 'users', uid)).then((snap) =>
        snap.exists() ? toPublicProfile(uid, snap.data()) : null,
    );
    cache.set(uid, { promesse, expire: maintenant + DUREE_CACHE_MS });
    // Un échec n'est pas mis en cache : la prochaine demande relira
    promesse.catch(() => {
        if (cache.get(uid)?.promesse === promesse) cache.delete(uid);
    });
    return promesse;
}

/** Plusieurs profils d'un coup (lectures en parallèle, doublons fusionnés). */
export async function getPublicProfiles(uids: readonly string[]): Promise<Map<string, PublicProfile | null>> {
    const uniques = [...new Set(uids)];
    const profils = await Promise.all(uniques.map((uid) => getPublicProfile(uid)));
    return new Map(uniques.map((uid, i) => [uid, profils[i]]));
}

/** Oublie un profil (après modification par son propriétaire). */
export function invalidatePublicProfile(uid: string): void {
    cache.delete(uid);
}

/** Vide tout le cache (tests, déconnexion). */
export function clearPublicProfiles(): void {
    cache.clear();
}

/** Profil public dans un composant ; `uid` null ou vide = rien à charger. */
export function usePublicProfile(uid: string | null | undefined): {
    profile: PublicProfile | null;
    loading: boolean;
} {
    const [etat, setEtat] = useState<{ uid: string | null; profile: PublicProfile | null }>({
        uid: null,
        profile: null,
    });

    useEffect(() => {
        if (!uid) return;
        let actif = true;
        getPublicProfile(uid)
            .then((profile) => {
                if (actif) setEtat({ uid, profile });
            })
            .catch((erreur) => {
                console.error('[profiles] lecture du profil impossible', erreur);
                if (actif) setEtat({ uid, profile: null });
            });
        return () => {
            actif = false;
        };
    }, [uid]);

    if (!uid) return { profile: null, loading: false };
    return { profile: etat.uid === uid ? etat.profile : null, loading: etat.uid !== uid };
}
