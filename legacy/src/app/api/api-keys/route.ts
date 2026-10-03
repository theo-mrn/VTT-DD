import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'crypto';
import { resolveApiUser } from '@/lib/api-auth';

async function resolveUid(request: Request): Promise<string | null> {
    // Bearer token (Firebase ID token)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        try {
            const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
            return decoded.uid;
        } catch {
            return null;
        }
    }
    // API Key
    const user = await resolveApiUser(request);
    return user?.uid ?? null;
}

function hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}

// POST /api/api-keys — generate a new API key
export async function POST(request: Request) {
    const uid = await resolveUid(request);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const label = body.label || 'default';

    const rawKey = `vtt_${randomBytes(32).toString('hex')}`;
    const keyHash = hashKey(rawKey);
    const keyId = randomBytes(8).toString('hex');

    await adminDb.collection('apiKeys').doc(keyId).set({
        uid,
        keyHash,
        label,
        createdAt: Timestamp.now(),
        lastUsed: null,
    });

    return NextResponse.json({ keyId, key: rawKey, label });
}

// GET /api/api-keys — list keys
export async function GET(request: Request) {
    const uid = await resolveUid(request);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await adminDb.collection('apiKeys')
        .where('uid', '==', uid)
        .get();

    const keys = snapshot.docs.map(doc => ({
        keyId: doc.id,
        label: doc.data().label,
        createdAt: doc.data().createdAt?.toDate().toISOString(),
        lastUsed: doc.data().lastUsed?.toDate().toISOString() ?? null,
    }));

    const sep = '─'.repeat(60);
    const lines = [
        ``,
        `  ${keys.length} clé(s) API enregistrée(s)`,
        ``,
        sep,
    ];

    for (const k of keys) {
        const used = k.lastUsed
            ? `dernière utilisation : ${new Date(k.lastUsed).toLocaleString('fr-FR')}`
            : `jamais utilisée`;
        lines.push(`  [${k.keyId}]  ${k.label.padEnd(16)}  créée le ${new Date(k.createdAt!).toLocaleDateString('fr-FR')}  —  ${used}`);
    }

    lines.push(sep);
    lines.push(`  Pour révoquer : curl -X DELETE https://www.yner.fr/api/api-keys \\`);
    lines.push(`    -H "Authorization: ApiKey $VTT_API_KEY" \\`);
    lines.push(`    -H "Content-Type: application/json" \\`);
    lines.push(`    -d '{"keyId": "ID_DE_LA_CLE"}'`);
    lines.push(sep);
    lines.push(``);

    return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain' } });
}

// DELETE /api/api-keys — revoke a key
export async function DELETE(request: Request) {
    const uid = await resolveUid(request);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keyId } = await request.json();
    if (!keyId) {
        return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
    }

    const doc = await adminDb.collection('apiKeys').doc(keyId).get();
    if (!doc.exists || doc.data()!.uid !== uid) {
        return NextResponse.json({ error: 'Clé introuvable' }, { status: 404 });
    }

    const label = doc.data()!.label;
    await adminDb.collection('apiKeys').doc(keyId).delete();

    return new Response(
        `\n  Clé "${label}" [${keyId}] révoquée avec succès.\n`,
        { headers: { 'Content-Type': 'text/plain' } }
    );
}
