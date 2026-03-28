import { NextResponse } from 'next/server';
import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
import { adminDb } from '@/lib/firebase-admin';
import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { buildCharacterVariables, applyVariables } from '@/lib/character-variables';
import { waitUntil } from '@vercel/functions';

const DISCORD_API = 'https://discord.com/api/v10';

// ── Dice rolling logic ────────────────────────────────────────────────────────

function rollDice(notation: string): { total: number; output: string; rolls: { type: string; value: number }[] } | null {
    const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;
    const rolls: { type: string; value: number }[] = [];
    const matches = [...notation.matchAll(diceRegex)];

    if (matches.length === 0 && !notation.match(/\d/)) return null;

    for (const match of matches) {
        const count = parseInt(match[1]);
        const faces = parseInt(match[2]);
        for (let i = 0; i < count; i++) {
            rolls.push({ type: `d${faces}`, value: Math.floor(Math.random() * faces) + 1 });
        }
    }

    const tempRolls = [...rolls];
    const detailsParts: string[] = [];
    let processedNotation = notation.replace(diceRegex, (_, countStr, _f, keepType, keepCountStr) => {
        const count = parseInt(countStr);
        const keepCount = keepCountStr ? parseInt(keepCountStr) : 0;
        const currentDiceValues: number[] = [];
        for (let i = 0; i < count; i++) {
            const roll = tempRolls.shift();
            if (roll) currentDiceValues.push(roll.value);
        }

        let subTotal = 0;
        let usedRolls = currentDiceValues.map(v => ({ val: v, keep: true }));

        if (keepType) {
            const sortedIndices = currentDiceValues
                .map((val, idx) => ({ val, idx }))
                .sort((a, b) => keepType === 'h' ? b.val - a.val : a.val - b.val);
            const indicesToKeep = new Set(sortedIndices.slice(0, keepCount).map(x => x.idx));
            usedRolls = currentDiceValues.map((val, idx) => ({ val, keep: indicesToKeep.has(idx) }));
            subTotal = usedRolls.filter(r => r.keep).reduce((s, r) => s + r.val, 0);
        } else {
            subTotal = currentDiceValues.reduce((a, b) => a + b, 0);
        }

        detailsParts.push(`[${usedRolls.map(r => r.keep ? `${r.val}` : `~~${r.val}~~`).join(', ')}]`);
        return subTotal.toString();
    });

    let total = 0;
    try {
        const safe = processedNotation.replace(/[^0-9+\-*/().\s]/g, '');
        // eslint-disable-next-line no-eval
        total = eval(safe);
    } catch { total = 0; }

    return { total, output: `${notation} = ${processedNotation} = ${total}`, rolls };
}

// ── Discord embed builder ─────────────────────────────────────────────────────

function buildEmbed(notation: string, result: ReturnType<typeof rollDice>, userName?: string, avatar?: string, isMJ?: boolean) {
    if (!result) return null;
    const { total, output, rolls } = result;

    const isCrit = rolls.some(r => r.type === 'd20' && r.value === 20);
    const isFumble = rolls.some(r => r.type === 'd20' && r.value === 1);

    const color = isCrit ? 0xffd700 : isFumble ? 0xff3333 : 0xc0a080;
    const title = isCrit ? '🎲 Coup Critique !' : isFumble ? '💀 Fumble !' : '🎲 Lancer de dé';

    return {
        title,
        description: `\`\`\`${output}\`\`\``,
        color,
        thumbnail: (!isMJ && avatar) ? { url: avatar } : undefined,
        fields: [
            { name: 'Résultat', value: `**${total}**`, inline: true },
            { name: 'Notation', value: `\`${notation}\``, inline: true },
            ...(userName ? [{ name: 'Personnage', value: userName, inline: true }] : []),
        ],
        footer: { text: isMJ ? '🎲 Yner Bot • MJ' : 'Yner Bot • VTT' },
    };
}

// ── Follow-up via Discord webhook ─────────────────────────────────────────────

async function editOriginalResponse(appId: string, token: string, data: object) {
    await fetch(`${DISCORD_API}/webhooks/${appId}/${token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
}

// ── Resolve linked VTT account from Discord user ID ───────────────────────────

async function resolveLinkedUser(discordId: string) {
    const linkDoc = await adminDb.doc(`discordLinks/${discordId}`).get();
    if (!linkDoc.exists) return null;

    const { uid } = linkDoc.data()!;
    const userDoc = await adminDb.doc(`users/${uid}`).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data()!;
    const persoName: string | undefined = userData.perso ?? undefined;
    const isMJ = persoName === 'MJ';
    const roomId: string | null = userData.room_id ?? null;
    const variables = await buildCharacterVariables(uid);

    // Fetch character avatar (skip for MJ)
    let avatar: string | undefined;
    if (!isMJ && roomId && userData.persoId) {
        const charDoc = await adminDb.doc(`cartes/${roomId}/characters/${userData.persoId}`).get();
        if (charDoc.exists) {
            const c = charDoc.data()!;
            avatar = c.imageURLFinal || c.imageURL || undefined;
        }
    }

    return { uid, persoName: persoName ?? userData.name ?? 'Aventurier', isMJ, roomId, variables, avatar };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    const body = await request.text();
    const signature = request.headers.get('x-signature-ed25519') ?? '';
    const timestamp = request.headers.get('x-signature-timestamp') ?? '';
    const publicKey = process.env.DISCORD_PUBLIC_KEY ?? '';

    const isValid = await verifyKey(body, signature, timestamp, publicKey);
    if (!isValid) {
        return new Response('Invalid signature', { status: 401 });
    }

    const interaction = JSON.parse(body);

    // Verification PING — must respond synchronously
    if (interaction.type === InteractionType.PING) {
        return NextResponse.json({ type: InteractionResponseType.PONG });
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const { name, options } = interaction.data;
        const discordId: string = interaction.member?.user?.id ?? interaction.user?.id;
        const appId: string = interaction.application_id;
        const token: string = interaction.token;

        // ── /login ────────────────────────────────────────────────────────────
        if (name === 'login') {
            // Répondre immédiatement (ephemeral deferred)
            waitUntil((async () => {
                const email: string = options?.find((o: { name: string }) => o.name === 'email')?.value ?? '';
                const password: string = options?.find((o: { name: string }) => o.name === 'password')?.value ?? '';

                const authRes = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password, returnSecureToken: true }),
                    }
                );

                if (!authRes.ok) {
                    await editOriginalResponse(appId, token, { content: '❌ Email ou mot de passe incorrect.' });
                    return;
                }

                const { localId: uid } = await authRes.json();
                const userDoc = await adminDb.doc(`users/${uid}`).get();
                const userData = userDoc.exists ? userDoc.data()! : {};
                const persoName = userData.perso ?? userData.name ?? 'Aventurier';

                await adminDb.doc(`discordLinks/${discordId}`).set({ uid, linkedAt: Timestamp.now() });

                await editOriginalResponse(appId, token, {
                    content: `✅ Connecté ! Tu joues en tant que **${persoName}**.\nTes lancers seront sauvegardés automatiquement.`,
                });
            })());

            return NextResponse.json({ type: 5, data: { flags: 64 } }); // deferred ephemeral
        }

        // ── /link ─────────────────────────────────────────────────────────────
        if (name === 'link') {
            waitUntil((async () => {
                const rawKey: string = options?.[0]?.value ?? '';
                if (!rawKey.startsWith('vtt_')) {
                    await editOriginalResponse(appId, token, { content: '❌ Clé invalide.' });
                    return;
                }

                const keyHash = createHash('sha256').update(rawKey).digest('hex');
                const snapshot = await adminDb.collection('apiKeys').where('keyHash', '==', keyHash).limit(1).get();

                if (snapshot.empty) {
                    await editOriginalResponse(appId, token, { content: '❌ Clé introuvable ou révoquée.' });
                    return;
                }

                const uid = snapshot.docs[0].data().uid;
                const userDoc = await adminDb.doc(`users/${uid}`).get();
                const userData = userDoc.exists ? userDoc.data()! : {};
                const persoName = userData.perso ?? userData.name ?? 'Aventurier';

                await adminDb.doc(`discordLinks/${discordId}`).set({ uid, linkedAt: Timestamp.now() });
                await editOriginalResponse(appId, token, {
                    content: `✅ Compte lié ! Tu joues en tant que **${persoName}**.`,
                });
            })());

            return NextResponse.json({ type: 5, data: { flags: 64 } }); // deferred ephemeral
        }

        // ── /unlink ───────────────────────────────────────────────────────────
        if (name === 'unlink') {
            waitUntil((async () => {
                await adminDb.doc(`discordLinks/${discordId}`).delete();
                await editOriginalResponse(appId, token, { content: '🔓 Compte délié.' });
            })());

            return NextResponse.json({ type: 5, data: { flags: 64 } }); // deferred ephemeral
        }

        // ── /roll ─────────────────────────────────────────────────────────────
        if (name === 'roll') {
            const rawNotation: string = options?.[0]?.value ?? '1d20';

            waitUntil((async () => {
                const linked = await resolveLinkedUser(discordId);
                const notation = applyVariables(rawNotation, linked?.variables ?? {});
                const result = rollDice(notation);

                if (!result) {
                    await editOriginalResponse(appId, token, { content: `❌ Notation invalide : \`${rawNotation}\`` });
                    return;
                }

                if (linked?.roomId) {
                    const firstMatch = [...notation.matchAll(/(\d+)d(\d+)/gi)][0];
                    await adminDb.collection(`rolls/${linked.roomId}/rolls`).add({
                        id: crypto.randomUUID(),
                        isPrivate: false,
                        isBlind: false,
                        diceCount: firstMatch ? parseInt(firstMatch[1]) : 1,
                        diceFaces: firstMatch ? parseInt(firstMatch[2]) : 20,
                        modifier: 0,
                        results: result.rolls.map(r => r.value),
                        total: result.total,
                        userName: linked.persoName,
                        type: 'Discord',
                        timestamp: Date.now(),
                        notation,
                        output: result.output,
                    });
                }

                const embed = buildEmbed(rawNotation, result, linked?.persoName, linked?.avatar, linked?.isMJ);
                await editOriginalResponse(appId, token, { embeds: [embed] });
            })());

            return NextResponse.json({ type: 5 }); // deferred public — affiche "en train de répondre..."
        }
    }

    return new Response('Unknown interaction', { status: 400 });
}
