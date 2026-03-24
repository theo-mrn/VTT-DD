import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'crypto';

const FIREBASE_API_KEY = 'AIzaSyDrc70mfENCh6gCd5uJmeVbWJ98lcD6mQY';

// POST /api/login — email + password → API key (one step)
export async function POST(request: Request) {
    const { email, password, label = 'cli' } = await request.json();

    if (!email || !password) {
        return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
    }

    // Sign in via Firebase Auth REST API
    const authRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
    );

    if (!authRes.ok) {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const { localId: uid } = await authRes.json();

    // Fetch user profile
    const userDoc = await adminDb.doc(`users/${uid}`).get();
    const userName = userDoc.exists ? (userDoc.data()!.name || userDoc.data()!.displayName || email) : email;

    // Generate API key
    const rawKey = `vtt_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyId = randomBytes(8).toString('hex');

    await adminDb.collection('apiKeys').doc(keyId).set({
        uid,
        keyHash,
        label,
        createdAt: Timestamp.now(),
        lastUsed: null,
    });

    const sep = '─'.repeat(60);
    const output = [
        ``,
        `  Connecté en tant que ${userName} (${email})`,
        `  Clé "${label}" générée avec succès [${keyId}]`,
        ``,
        sep,
        `  1. Exporte la clé dans ta session :`,
        ``,
        `     export VTT_API_KEY=${rawKey}`,
        ``,
        `  2. Pour la conserver entre les sessions :`,
        ``,
        `     echo 'export VTT_API_KEY=${rawKey}' >> ~/.zshrc`,
        ``,
        sep,
        `  Commandes disponibles :`,
        ``,
        `  Lancer un dé :`,
        `    curl -X POST https://www.yner.fr/api/roll-dice \\`,
        `      -H "Authorization: ApiKey $VTT_API_KEY" \\`,
        `      -H "Content-Type: application/json" \\`,
        `      -d '{"notation": "1d20", "roomId": "MON_ROOM_ID"}'`,
        ``,
        `  Lister tes clés :`,
        `    curl https://www.yner.fr/api/api-keys \\`,
        `      -H "Authorization: ApiKey $VTT_API_KEY"`,
        ``,
        `  Révoquer une clé :`,
        `    curl -X DELETE https://www.yner.fr/api/api-keys \\`,
        `      -H "Authorization: ApiKey $VTT_API_KEY" \\`,
        `      -H "Content-Type: application/json" \\`,
        `      -d '{"keyId": "ID_DE_LA_CLE"}'`,
        ``,
        sep,
        ``,
    ].join('\n');

    return new Response(output, { headers: { 'Content-Type': 'text/plain' } });
}
