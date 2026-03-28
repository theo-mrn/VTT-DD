import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { buildCharacterVariables, applyVariables } from '@/lib/character-variables';
import { createHash, randomBytes } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';

const APP_ID    = process.env.DISCORD_APPLICATION_ID ?? '';
const BOT_TOKEN = process.env.DISCORD_TOKEN ?? '';
const FB_KEY    = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '';

// ─── Discord helpers ────────────────────────────────────────────────────────

async function patch(token: string, payload: object) {
    const res = await fetch(
        `https://discord.com/api/v10/webhooks/${APP_ID}/${token}/messages/@original`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
    );
    if (!res.ok) {
        const text = await res.text();
        console.error(`[discord/handle] patch ${res.status}:`, text);
    }
}

// ─── discordLinks cache ──────────────────────────────────────────────────────

interface DiscordLink {
    uid: string;
    name: string;
    avatar?: string;
    persoId?: string;
    roomId?: string;
}

async function getLink(discordId: string): Promise<DiscordLink | null> {
    const doc = await adminDb.doc(`discordLinks/${discordId}`).get();
    if (!doc.exists) return null;
    return doc.data() as DiscordLink;
}

async function setLink(discordId: string, data: DiscordLink) {
    await adminDb.doc(`discordLinks/${discordId}`).set(data);
}

// ─── Dice rolling logic ──────────────────────────────────────────────────────

function rollDice(notation: string): { total: number; processedNotation: string; rolls: { type: string; value: number }[]; detailsParts: string[] } {
    const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;
    const rolls: { type: string; value: number }[] = [];

    const matches = [...notation.matchAll(diceRegex)];
    for (const match of matches) {
        const count = parseInt(match[1]);
        const faces = parseInt(match[2]);
        for (let i = 0; i < count; i++) {
            rolls.push({ type: `d${faces}`, value: Math.floor(Math.random() * faces) + 1 });
        }
    }

    const tempRolls = [...rolls];
    const detailsParts: string[] = [];
    const diceRegex2 = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;

    const processedNotation = notation.replace(diceRegex2, (_, countStr, _faces, keepType, keepCountStr) => {
        const count = parseInt(countStr);
        const keepCount = keepCountStr ? parseInt(keepCountStr) : 0;
        const vals: number[] = [];
        for (let i = 0; i < count; i++) {
            const r = tempRolls.shift();
            if (r) vals.push(r.value);
        }

        let usedRolls = vals.map(v => ({ val: v, keep: true }));

        if (keepType) {
            const sorted = vals.map((val, idx) => ({ val, idx }))
                .sort((a, b) => keepType === 'h' ? b.val - a.val : a.val - b.val);
            const keep = new Set(sorted.slice(0, keepCount).map(x => x.idx));
            usedRolls = vals.map((val, idx) => ({ val, keep: keep.has(idx) }));
        }

        const subTotal = usedRolls.filter(r => r.keep).reduce((s, r) => s + r.val, 0);
        detailsParts.push(`[${usedRolls.map(r => r.keep ? `${r.val}` : `~~${r.val}~~`).join(', ')}]`);
        return subTotal.toString();
    });

    let total = 0;
    try {
        // eslint-disable-next-line no-eval
        total = eval(processedNotation.replace(/[^0-9+\-*/().\s]/g, ''));
    } catch { /* ignored */ }

    return { total, processedNotation, rolls, detailsParts };
}

// ─── Command handlers ────────────────────────────────────────────────────────

async function handleRoll(interaction: any, token: string) {
    const options = interaction.data?.options ?? [];
    const rawInput: string = options.find((o: any) => o.name === 'notation')?.value ?? '';
    const typeOpt: string  = options.find((o: any) => o.name === 'type')?.value ?? 'public';

    // Strip trailing visibility suffix (e.g. "1d20+3 p")
    const notation = rawInput.replace(/\s+[pi]$/i, '').trim();
    const suffix   = rawInput.match(/\s+([pi])$/i)?.[1]?.toLowerCase();

    const isPrivate = suffix === 'p' || typeOpt === 'prive';
    const isBlind   = suffix === 'i' || typeOpt === 'aveugle';

    const discordId = interaction.member?.user?.id ?? interaction.user?.id ?? '';
    const link = await getLink(discordId);

    // Resolve character variables if linked
    let finalNotation = notation;
    if (link?.uid) {
        const vars = await buildCharacterVariables(link.uid);
        finalNotation = applyVariables(notation, vars);
    }

    const { total, processedNotation, rolls, detailsParts } = rollDice(finalNotation);

    const userName   = link?.name   ?? interaction.member?.user?.username ?? 'Aventurier';
    const userAvatar = link?.avatar ?? undefined;

    const details = detailsParts.length ? detailsParts.join(' ') + ' ' : '';
    const description = `${details}**${notation}** = ${processedNotation} = **${total}**`;

    // Save to Firestore
    if (link?.roomId && link?.uid) {
        const firstMatch = [...finalNotation.matchAll(/(\d+)d(\d+)/gi)][0];
        adminDb.collection(`rolls/${link.roomId}/rolls`).add({
            id: crypto.randomUUID(),
            isPrivate,
            isBlind,
            diceCount:  firstMatch ? parseInt(firstMatch[1]) : rolls.length,
            diceFaces:  firstMatch ? parseInt(firstMatch[2]) : 20,
            modifier:   0,
            results:    rolls.map(r => r.value),
            total,
            userName,
            ...(userAvatar ? { userAvatar } : {}),
            ...(link.persoId ? { persoId: link.persoId } : {}),
            type:       'Dice Roller/Discord',
            timestamp:  Date.now(),
            notation,
            output:     `${notation} = ${processedNotation} = ${total}`,
        }); // fire-and-forget
    }

    const embed: any = {
        description,
        color: isBlind ? 0x2b2d31 : isPrivate ? 0x5865f2 : 0x57f287,
    };
    if (userName) embed.author = { name: userName, ...(userAvatar ? { icon_url: userAvatar } : {}) };
    if (isBlind)   embed.footer = { text: '🙈 Lancer aveugle — visible par le MJ uniquement' };
    else if (isPrivate) embed.footer = { text: '🔒 Lancer privé' };

    await patch(token, { embeds: [embed] });
}

async function handleLogin(interaction: any, token: string) {
    const options  = interaction.data?.options ?? [];
    const email    = options.find((o: any) => o.name === 'email')?.value ?? '';
    const password = options.find((o: any) => o.name === 'password')?.value ?? '';
    const discordId = interaction.member?.user?.id ?? interaction.user?.id ?? '';

    if (!email || !password) {
        await patch(token, { content: '❌ Email et mot de passe requis.' });
        return;
    }

    // Firebase Auth REST sign-in
    const authRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
    );

    if (!authRes.ok) {
        await patch(token, { content: '❌ Email ou mot de passe incorrect.' });
        return;
    }

    const { localId: uid } = await authRes.json();

    // Fetch user profile
    const userDoc  = await adminDb.doc(`users/${uid}`).get();
    const userData = userDoc.exists ? userDoc.data()! : {};
    const persoName: string = userData.perso || userData.name || userData.displayName || 'Aventurier';
    const persoId: string | undefined = userData.persoId || undefined;
    const roomId: string | undefined  = userData.room_id || undefined;

    // Fetch avatar
    let avatar: string | undefined;
    if (roomId && persoId && persoName !== 'MJ') {
        const charDoc = await adminDb.doc(`cartes/${roomId}/characters/${persoId}`).get();
        if (charDoc.exists) {
            const c = charDoc.data()!;
            avatar = c.imageURLFinal || c.imageURL || undefined;
        }
    }

    // Generate API key
    const rawKey  = `vtt_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyId   = randomBytes(8).toString('hex');

    await adminDb.collection('apiKeys').doc(keyId).set({
        uid,
        keyHash,
        label: `discord-${discordId}`,
        createdAt: Timestamp.now(),
        lastUsed: null,
    });

    // Cache in discordLinks for instant future lookups
    const linkData: DiscordLink = {
        uid,
        name: persoName === 'MJ' ? 'MJ' : persoName,
        ...(avatar  ? { avatar }  : {}),
        ...(persoId ? { persoId } : {}),
        ...(roomId  ? { roomId }  : {}),
    };
    await setLink(discordId, linkData);

    await patch(token, {
        embeds: [{
            title: `✅ Connecté en tant que ${persoName}`,
            description: `Ton compte Yner est maintenant lié à Discord.\n\nClé API (usage CLI) :\n\`\`\`\n${rawKey}\n\`\`\``,
            color: 0x57f287,
            footer: { text: 'Ne partage jamais ta clé API.' },
        }],
    });
}

async function handleLink(interaction: any, token: string) {
    const options   = interaction.data?.options ?? [];
    const apiKey    = options.find((o: any) => o.name === 'api_key')?.value ?? '';
    const discordId = interaction.member?.user?.id ?? interaction.user?.id ?? '';

    if (!apiKey) {
        await patch(token, { content: '❌ Clé API requise.' });
        return;
    }

    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const snap = await adminDb.collection('apiKeys').where('keyHash', '==', keyHash).limit(1).get();
    if (snap.empty) {
        await patch(token, { content: '❌ Clé API invalide.' });
        return;
    }

    const uid = snap.docs[0].data().uid;

    // Fetch full profile
    const userDoc  = await adminDb.doc(`users/${uid}`).get();
    const userData = userDoc.exists ? userDoc.data()! : {};
    const persoName: string = userData.perso || userData.name || userData.displayName || 'Aventurier';
    const persoId: string | undefined = userData.persoId || undefined;
    const roomId: string | undefined  = userData.room_id || undefined;

    let avatar: string | undefined;
    if (roomId && persoId && persoName !== 'MJ') {
        const charDoc = await adminDb.doc(`cartes/${roomId}/characters/${persoId}`).get();
        if (charDoc.exists) {
            const c = charDoc.data()!;
            avatar = c.imageURLFinal || c.imageURL || undefined;
        }
    }

    const linkData: DiscordLink = {
        uid,
        name: persoName === 'MJ' ? 'MJ' : persoName,
        ...(avatar  ? { avatar }  : {}),
        ...(persoId ? { persoId } : {}),
        ...(roomId  ? { roomId }  : {}),
    };
    await setLink(discordId, linkData);

    await patch(token, {
        embeds: [{
            title: `✅ Compte lié — ${persoName}`,
            description: 'Ton compte Yner est maintenant lié à ce Discord.',
            color: 0x57f287,
        }],
    });
}

async function handleUnlink(interaction: any, token: string) {
    const discordId = interaction.member?.user?.id ?? interaction.user?.id ?? '';
    await adminDb.doc(`discordLinks/${discordId}`).delete();
    await patch(token, { content: '✅ Compte Yner délié.' });
}

async function handleHistory(interaction: any, token: string) {
    const options   = interaction.data?.options ?? [];
    const joueur    = options.find((o: any) => o.name === 'joueur')?.value?.toLowerCase() ?? '';
    const discordId = interaction.member?.user?.id ?? interaction.user?.id ?? '';

    const link = await getLink(discordId);
    if (!link?.roomId) {
        await patch(token, { content: '❌ Tu n\'es pas lié à une salle. Utilise `/login` ou `/link` d\'abord.' });
        return;
    }

    const snap = await adminDb
        .collection(`rolls/${link.roomId}/rolls`)
        .orderBy('timestamp', 'desc')
        .limit(50)
        .get();

    const isMJ = link.name === 'MJ';

    const rolls = snap.docs
        .map(d => d.data())
        .filter(r => {
            if (r.isBlind && !isMJ) return false;
            if (r.isPrivate && !isMJ && r.userName !== link.name) return false;
            if (joueur && !r.userName?.toLowerCase().includes(joueur)) return false;
            return true;
        })
        .slice(0, 10);

    if (!rolls.length) {
        await patch(token, { content: '📜 Aucun lancer trouvé.' });
        return;
    }

    const lines = rolls.map(r => {
        const icon = r.isBlind ? '🙈' : r.isPrivate ? '🔒' : '🎲';
        const time = r.timestamp ? `<t:${Math.floor(r.timestamp / 1000)}:R>` : '';
        return `${icon} **${r.userName}** — ${r.output ?? `${r.notation} = **${r.total}**`} ${time}`;
    });

    await patch(token, {
        embeds: [{
            title: '📜 Historique des lancers',
            description: lines.join('\n'),
            color: 0x5865f2,
        }],
    });
}

// ─── Main route ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    // Verify internal secret
    const secret = request.headers.get('x-discord-secret');
    console.log('[discord/handle] called, APP_ID:', APP_ID, 'secret_ok:', !!secret && secret === BOT_TOKEN);
    if (!secret || secret !== BOT_TOKEN) {
        console.error('[discord/handle] unauthorized — BOT_TOKEN mismatch or missing');
        return new Response('Unauthorized', { status: 401 });
    }

    let token = '';
    try {
        const interaction = await request.json();
        token = interaction.token ?? '';
        const name: string = interaction.data?.name ?? '';

        if (name === 'roll')    await handleRoll(interaction, token);
        else if (name === 'login')   await handleLogin(interaction, token);
        else if (name === 'link')    await handleLink(interaction, token);
        else if (name === 'unlink')  await handleUnlink(interaction, token);
        else if (name === 'history') await handleHistory(interaction, token);
        else await patch(token, { content: '❌ Commande inconnue.' });
    } catch (err) {
        console.error('[discord/handle]', err);
        try {
            await patch(token, { content: '❌ Une erreur est survenue.' });
        } catch { /* ignored */ }
    }

    return NextResponse.json({ ok: true });
}
