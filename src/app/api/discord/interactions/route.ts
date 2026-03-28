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

function buildEmbed(_notation: string, result: ReturnType<typeof rollDice>, userName?: string, avatar?: string, isMJ?: boolean) {
    if (!result) return null;
    const { total, output, rolls } = result;

    const isCrit = rolls.some(r => r.type === 'd20' && r.value === 20);
    const isFumble = rolls.some(r => r.type === 'd20' && r.value === 1);

    const color = isCrit ? 0xffd700 : isFumble ? 0xff3333 : 0xc0a080;

    return {
        author: userName ? {
            name: userName,
            icon_url: (!isMJ && avatar) ? avatar : undefined,
        } : undefined,
        description: `${output}`,
        color,
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

const MODIFIER_STATS = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'];
const DIRECT_STATS = ['Defense', 'Contact', 'Magie', 'Distance', 'INIT'];

function buildVariablesFromChar(c: Record<string, any>): Record<string, number> {
    const vars: Record<string, number> = {};
    for (const key of MODIFIER_STATS) {
        const v = c[`${key}_F`] ?? c[key];
        if (v !== undefined) vars[key] = c[`${key}_F`] !== undefined ? Number(v) : Math.floor((Number(v) - 10) / 2);
    }
    for (const key of DIRECT_STATS) {
        const v = c[`${key}_F`] ?? c[key];
        if (v !== undefined) vars[key] = Number(v);
    }
    for (const field of (c.customFields ?? [])) {
        if (!field.isRollable || !field.label) continue;
        const val = Number(field.value) || 0;
        vars[field.label] = field.hasModifier ? Math.floor((val - 10) / 2) : val;
    }
    return vars;
}

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
    const persoId: string | null = userData.persoId ?? null;

    // Fetch character doc once — avatar + variables en un seul appel
    let avatar: string | undefined;
    let variables: Record<string, number> = {};
    if (!isMJ && roomId && persoId) {
        const charDoc = await adminDb.doc(`cartes/${roomId}/characters/${persoId}`).get();
        if (charDoc.exists) {
            const c = charDoc.data()!;
            avatar = c.imageURLFinal || c.imageURL || undefined;
            variables = buildVariablesFromChar(c);
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
            const rawInput: string = options?.find((o: { name: string }) => o.name === 'notation')?.value ?? '1d20';

            // Suffixes : "1d20+3 p" → privé, "1d20+3 i" → aveugle (invisible)
            const suffixMatch = rawInput.match(/\s+([pi])$/i);
            const suffix = suffixMatch?.[1]?.toLowerCase();
            const rawNotation = suffixMatch ? rawInput.slice(0, -suffixMatch[0].length).trim() : rawInput;

            const rollTypeOption: string = options?.find((o: { name: string }) => o.name === 'type')?.value ?? 'public';
            const isPrivate = suffix === 'p' || rollTypeOption === 'prive';
            const isBlind   = suffix === 'i' || rollTypeOption === 'aveugle';
            const isEphemeral = isPrivate || isBlind;

            waitUntil((async () => {
                const linked = await resolveLinkedUser(discordId);
                const notation = applyVariables(rawNotation, linked?.variables ?? {});
                const result = rollDice(notation);

                if (!result) {
                    await editOriginalResponse(appId, token, { content: `❌ Notation invalide : \`${rawNotation}\``, flags: 64 });
                    return;
                }

                if (linked?.roomId) {
                    const firstMatch = [...notation.matchAll(/(\d+)d(\d+)/gi)][0];
                    await adminDb.collection(`rolls/${linked.roomId}/rolls`).add({
                        id: crypto.randomUUID(),
                        isPrivate,
                        isBlind,
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

                // Blind : on cache le résultat dans l'embed (le MJ verra dans l'app)
                const responseEmbed = isBlind
                    ? { ...embed, description: `*Lancer aveugle envoyé au MJ*`, color: 0x555555 }
                    : embed;

                await editOriginalResponse(appId, token, {
                    embeds: [responseEmbed],
                    ...(isEphemeral ? { flags: 64 } : {}),
                });
            })());

            // Ephemeral deferred pour privé/aveugle, public pour le reste
            return NextResponse.json({ type: 5, ...(isEphemeral ? { data: { flags: 64 } } : {}) });
        }

        // ── /history ──────────────────────────────────────────────────────────
        if (name === 'history') {
            waitUntil((async () => {
                const linked = await resolveLinkedUser(discordId);
                if (!linked?.roomId) {
                    await editOriginalResponse(appId, token, { content: '❌ Connecte-toi d\'abord avec `/login`.', flags: 64 });
                    return;
                }

                const joueurFilter: string | undefined = options?.find((o: { name: string }) => o.name === 'joueur')?.value;

                const snapshot = await adminDb.collection(`rolls/${linked.roomId}/rolls`)
                    .orderBy('timestamp', 'desc')
                    .limit(10)
                    .get();

                const docs = snapshot.docs
                    .map(doc => doc.data())
                    .filter(d => !d.isPrivate && !d.isBlind)
                    .filter(d => !joueurFilter || d.userName === joueurFilter);

                if (!docs.length) {
                    const msg = joueurFilter
                        ? `Aucun lancer public pour **${joueurFilter}**.`
                        : 'Aucun lancer public dans cette salle.';
                    await editOriginalResponse(appId, token, { content: msg });
                    return;
                }

                const lines = docs.map(d => {
                    const date = new Date(d.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                    return `**${d.total}** · \`${d.output}\` — ${d.userName} · ${date}`;
                });

                const title = joueurFilter ? `Historique de ${joueurFilter}` : 'Derniers lancers publics';
                await editOriginalResponse(appId, token, {
                    embeds: [{
                        title,
                        description: lines.join('\n'),
                        color: 0xc0a080,
                    }],
                });
            })());

            return NextResponse.json({ type: 5 });
        }
    }

    return new Response('Unknown interaction', { status: 400 });
}
