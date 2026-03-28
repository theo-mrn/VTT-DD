import { NextResponse } from 'next/server';
import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
import { adminDb } from '@/lib/firebase-admin';
import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { buildCharacterVariables, applyVariables } from '@/lib/character-variables';

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

        const reply = (data: object) => NextResponse.json({ type: 4, data });
        const ephemeral = (content: string) => reply({ content, flags: 64 });

        // ── /login ────────────────────────────────────────────────────────────
        if (name === 'login') {
            const email: string = options?.find((o: { name: string }) => o.name === 'email')?.value ?? '';
            const password: string = options?.find((o: { name: string }) => o.name === 'password')?.value ?? '';
            const authRes = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password, returnSecureToken: true }) }
            );
            if (!authRes.ok) return ephemeral('❌ Email ou mot de passe incorrect.');
            const { localId: uid } = await authRes.json();
            const userDoc = await adminDb.doc(`users/${uid}`).get();
            const persoName = userDoc.exists ? (userDoc.data()!.perso ?? userDoc.data()!.name ?? 'Aventurier') : 'Aventurier';
            adminDb.doc(`discordLinks/${discordId}`).set({ uid, linkedAt: Timestamp.now() }); // fire-and-forget
            return ephemeral(`✅ Connecté ! Tu joues en tant que **${persoName}**.`);
        }

        // ── /link ─────────────────────────────────────────────────────────────
        if (name === 'link') {
            const rawKey: string = options?.[0]?.value ?? '';
            if (!rawKey.startsWith('vtt_')) return ephemeral('❌ Clé invalide.');
            const keyHash = createHash('sha256').update(rawKey).digest('hex');
            const snapshot = await adminDb.collection('apiKeys').where('keyHash', '==', keyHash).limit(1).get();
            if (snapshot.empty) return ephemeral('❌ Clé introuvable ou révoquée.');
            const uid = snapshot.docs[0].data().uid;
            const userDoc = await adminDb.doc(`users/${uid}`).get();
            const persoName = userDoc.exists ? (userDoc.data()!.perso ?? 'Aventurier') : 'Aventurier';
            adminDb.doc(`discordLinks/${discordId}`).set({ uid, linkedAt: Timestamp.now() }); // fire-and-forget
            return ephemeral(`✅ Compte lié ! Tu joues en tant que **${persoName}**.`);
        }

        // ── /unlink ───────────────────────────────────────────────────────────
        if (name === 'unlink') {
            adminDb.doc(`discordLinks/${discordId}`).delete(); // fire-and-forget
            return ephemeral('🔓 Compte délié.');
        }

        // ── /roll ─────────────────────────────────────────────────────────────
        if (name === 'roll') {
            const rawInput: string = options?.find((o: { name: string }) => o.name === 'notation')?.value ?? '1d20';
            const suffixMatch = rawInput.match(/\s+([pi])$/i);
            const suffix      = suffixMatch?.[1]?.toLowerCase();
            const rawNotation = suffixMatch ? rawInput.slice(0, -suffixMatch[0].length).trim() : rawInput;
            const typeOpt     = options?.find((o: { name: string }) => o.name === 'type')?.value ?? 'public';
            const isPrivate   = suffix === 'p' || typeOpt === 'prive';
            const isBlind     = suffix === 'i' || typeOpt === 'aveugle';

            const linked   = await resolveLinkedUser(discordId);
            const notation = applyVariables(rawNotation, linked?.variables ?? {});
            const result   = rollDice(notation);

            if (!result) return ephemeral(`❌ Notation invalide : \`${rawNotation}\``);

            // Sauvegarder en fire-and-forget (ne bloque pas la réponse Discord)
            if (linked?.roomId) {
                const m = [...notation.matchAll(/(\d+)d(\d+)/gi)][0];
                adminDb.collection(`rolls/${linked.roomId}/rolls`).add({
                    id: crypto.randomUUID(), isPrivate, isBlind,
                    diceCount: m ? parseInt(m[1]) : 1, diceFaces: m ? parseInt(m[2]) : 20,
                    modifier: 0, results: result.rolls.map(r => r.value),
                    total: result.total, userName: linked.persoName,
                    userAvatar: linked.avatar ?? null, type: 'Discord',
                    timestamp: Date.now(), notation, output: result.output,
                });
            }

            const embed = isBlind
                ? { author: linked ? { name: linked.persoName } : undefined, description: '*Lancer aveugle envoyé au MJ*', color: 0x555555 }
                : buildEmbed(rawNotation, result, linked?.persoName, linked?.avatar, linked?.isMJ);

            return reply({ embeds: [embed], ...(isPrivate || isBlind ? { flags: 64 } : {}) });
        }

        // ── /history ──────────────────────────────────────────────────────────
        if (name === 'history') {
            const linked = await resolveLinkedUser(discordId);
            if (!linked?.roomId) return ephemeral('❌ Connecte-toi d\'abord avec `/login`.');

            const joueurFilter: string | undefined = options?.find((o: { name: string }) => o.name === 'joueur')?.value;
            const snapshot = await adminDb.collection(`rolls/${linked.roomId}/rolls`)
                .orderBy('timestamp', 'desc').limit(10).get();

            const docs = snapshot.docs.map(d => d.data())
                .filter(d => !d.isPrivate && !d.isBlind)
                .filter(d => !joueurFilter || d.userName === joueurFilter);

            if (!docs.length) return reply({ content: joueurFilter ? `Aucun lancer public pour **${joueurFilter}**.` : 'Aucun lancer public dans cette salle.' });

            const lines = docs.map(d => {
                const date = new Date(d.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                return `**${d.total}** · \`${d.output}\` — ${d.userName} · ${date}`;
            });
            return reply({ embeds: [{ title: joueurFilter ? `Historique de ${joueurFilter}` : 'Derniers lancers publics', description: lines.join('\n'), color: 0xc0a080 }] });
        }
    }

    return new Response('Unknown interaction', { status: 400 });
}
