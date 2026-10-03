import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { createHash } from 'crypto';

export interface ApiUser {
    uid: string;
    name: string;
    avatar?: string;
    persoId?: string;
}

export async function resolveApiUser(request: Request, roomId?: string): Promise<ApiUser | null> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return null;

    // API Key — programmatic access (CLI, bots, scripts)
    if (authHeader.startsWith('ApiKey ')) {
        const rawKey = authHeader.slice(7);
        const keyHash = createHash('sha256').update(rawKey).digest('hex');

        const snapshot = await adminDb.collection('apiKeys')
            .where('keyHash', '==', keyHash)
            .limit(1)
            .get();

        if (snapshot.empty) return null;

        const keyDoc = snapshot.docs[0];
        const uid = keyDoc.data().uid;

        // Update lastUsed without blocking the response
        keyDoc.ref.update({ lastUsed: new Date() });

        return fetchUserProfile(uid, roomId);
    }

    // Bearer token — browser / mobile sessions
    if (authHeader.startsWith('Bearer ')) {
        try {
            const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
            return fetchUserProfile(decoded.uid, roomId);
        } catch {
            return null;
        }
    }

    return null;
}

async function fetchUserProfile(uid: string, roomId?: string): Promise<ApiUser> {
    const userDoc = await adminDb.doc(`users/${uid}`).get();
    const userData = userDoc.exists ? userDoc.data()! : {};
    const persoId: string | undefined = userData.persoId || undefined;

    // userData.perso = character name set at login (e.g. "Aragorn"), or "MJ"
    const persoName: string | undefined = userData.perso || undefined;

    // MJ : pas de personnage, pas d'avatar à chercher
    if (persoName === 'MJ') {
        return { uid, persoId: undefined, name: 'MJ', avatar: undefined };
    }

    // Si on a le persoId, fetch l'avatar depuis le doc du personnage
    const userRoomId = roomId || userData.room_id;
    let charAvatar: string | undefined;
    if (userRoomId && persoId) {
        const charDoc = await adminDb.doc(`cartes/${userRoomId}/characters/${persoId}`).get();
        if (charDoc.exists) {
            const c = charDoc.data()!;
            charAvatar = c.imageURLFinal || c.imageURL || undefined;
        }
    }

    return {
        uid,
        persoId,
        name: persoName || userData.name || userData.displayName || 'Aventurier',
        avatar: charAvatar || userData.avatar || userData.photoURL || undefined,
    };
}
