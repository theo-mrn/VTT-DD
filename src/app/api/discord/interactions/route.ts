import { NextResponse } from 'next/server';
import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';
import { adminDb } from '@/lib/firebase-admin';
import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { applyVariables } from '@/lib/character-variables';
import { waitUntil } from '@vercel/functions';

const DISCORD_API = 'https://discord.com/api/v10';

// ── Dice rolling ──────────────────────────────────────────────────────────────

function rollDice(notation: string): { total: number; output: string; rolls: { type: string; value: number }[] } | null {
    const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;
    const rolls: { type: string; value: number }[] = [];
    const matches = [...notation.matchAll(diceRegex)];
    if (matches.length === 0 && !notation.match(/\d/)) return null;

    for (const match of matches) {
        const count = parseInt(match[1]);
        const faces = parseInt(match[2]);
        for (let i = 0; i < count; i++)
            rolls.push({ type: `d${faces}`, value: Math.floor(Math.random() * faces) + 1 });
    }

    const tempRolls = [...rolls];
    let processedNotation = notation.replace(diceRegex, (_, countStr, _f, keepType, keepCountStr) => {
        const count = parseInt(countStr);
        const keepCount = keepCountStr ? parseInt(keepCountStr) : 0;
        const vals: number[] = [];
        for (let i = 0; i < count; i++) { const r = tempRolls.shift(); if (r) vals.push(r.value); }

        let usedRolls = vals.map(v => ({ val: v, keep: true }));
        if (keepType) {
            const sorted = vals.map((val, idx) => ({ val, idx })).sort((a, b) => keepType === 'h' ? b.val - a.val : a.val - b.val);
            const keep = new Set(sorted.slice(0, keepCount).map(x => x.idx));
            usedRolls = vals.map((val, idx) => ({ val, keep: keep.has(idx) }));
        }
        return usedRolls.filter(r => r.keep).reduce((s, r) => s + r.val, 0).toString();
    });

    let total = 0;
    try { total = eval(processedNotation.replace(/[^0-9+\-*/().\s]/g, '')); } catch { total = 0; }
    return { total, output: `${notation} = ${processedNotation} = ${total}`, rolls };
}

// ── Embed builder ─────────────────────────────────────────────────────────────

function buildEmbed(result: ReturnType<typeof rollDice>, userName?: string, avatar?: string, isMJ?: boolean) {
    if (!result) return null;
    const { total, output, rolls } = result;
    const isCrit   = rolls.some(r => r.type === 'd20' && r.value === 20);
    const isFumble = rolls.some(r => r.type === 'd20' && r.value === 1);
    return {
        author: userName ? { name: userName, icon_url: (!isMJ && avatar) ? avatar : undefined } : undefined,
        description: `**${total}** · \`${output}\``,
        color: isCrit ? 0xffd700 : isFumble ? 0xff3333 : 0xc0a080,
    };
}

// ── Discord webhook follow-up ─────────────────────────────────────────────────

async function patch(appId: string, token: string, data: object) {
    const res = await fetch(`${DISCORD_API}/webhooks/${appId}/${token}/messages/@original`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) console.error('[Discord] patch failed:', res.status, await res.text());
}

// ── Linked user ───────────────────────────────────────────────────────────────

const MODIFIER_STATS = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'];
const DIRECT_STATS   = ['Defense', 'Contact', 'Magie', 'Distance', 'INIT'];

function buildVariablesFromChar(c: Record<string, any>): Record<string, number> {
    const vars: Record<string, number> = {};
    for (const key of MODIFIER_STATS) {
        const fv = c[`${key}_F`]; const rv = c[key];
        if (fv !== undefined) vars[key] = Number(fv);
        else if (rv !== undefined) vars[key] = Math.floor((Number(rv) - 10) / 2);
    }
    for (const key of DIRECT_STATS) {
        const v = c[`${key}_F`] ?? c[key];
        if (v !== undefined) vars[key] = Number(v);
    }
    for (const f of (c.customFields ?? [])) {
        if (!f.isRollable || !f.label) continue;
        const val = Number(f.value) || 0;
        vars[f.label] = f.hasModifier ? Math.floor((val - 10) / 2) : val;
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
    const persoName: string = userData.perso ?? userData.name ?? 'Aventurier';
    const isMJ = persoName === 'MJ';
    const roomId: string | null = userData.room_id ?? null;
    const persoId: string | null = userData.persoId ?? null;

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
    return { uid, persoName, isMJ, roomId, variables, avatar };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    const body      = await request.text();
    const signature = request.headers.get('x-signature-ed25519') ?? '';
    const timestamp = request.headers.get('x-signature-timestamp') ?? '';

    if (!await verifyKey(body, signature, timestamp, process.env.DISCORD_PUBLIC_KEY ?? ''))
        return new Response('Invalid signature', { status: 401 });

    const interaction = JSON.parse(body);

    if (interaction.type === InteractionType.PING)
        return NextResponse.json({ type: InteractionResponseType.PONG });

    if (interaction.type !== InteractionType.APPLICATION_COMMAND)
        return new Response('Unknown interaction', { status: 400 });

    const { name, options } = interaction.data;
    const discordId: string = interaction.member?.user?.id ?? interaction.user?.id;
    const appId: string     = interaction.application_id;
    const token: string     = interaction.token;

    const opt = (n: string) => options?.find((o: { name: string }) => o.name === n)?.value;

    // ── /login ────────────────────────────────────────────────────────────────
    if (name === 'login') {
        waitUntil((async () => {
            try {
                const authRes = await fetch(
                    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: opt('email'), password: opt('password'), returnSecureToken: true }) }
                );
                if (!authRes.ok) { await patch(appId, token, { content: '❌ Email ou mot de passe incorrect.' }); return; }

                const { localId: uid } = await authRes.json();
                const userDoc = await adminDb.doc(`users/${uid}`).get();
                const persoName = userDoc.exists ? (userDoc.data()!.perso ?? userDoc.data()!.name ?? 'Aventurier') : 'Aventurier';
                await adminDb.doc(`discordLinks/${discordId}`).set({ uid, linkedAt: Timestamp.now() });
                await patch(appId, token, { content: `✅ Connecté ! Tu joues en tant que **${persoName}**.` });
            } catch (e: any) { await patch(appId, token, { content: `❌ Erreur : ${e?.message ?? e}` }); }
        })());
        return NextResponse.json({ type: 5, data: { flags: 64 } });
    }

    // ── /link ─────────────────────────────────────────────────────────────────
    if (name === 'link') {
        waitUntil((async () => {
            try {
                const rawKey = opt('api_key') ?? '';
                if (!rawKey.startsWith('vtt_')) { await patch(appId, token, { content: '❌ Clé invalide.' }); return; }
                const snap = await adminDb.collection('apiKeys').where('keyHash', '==', createHash('sha256').update(rawKey).digest('hex')).limit(1).get();
                if (snap.empty) { await patch(appId, token, { content: '❌ Clé introuvable.' }); return; }
                const uid = snap.docs[0].data().uid;
                const userDoc = await adminDb.doc(`users/${uid}`).get();
                const persoName = userDoc.exists ? (userDoc.data()!.perso ?? 'Aventurier') : 'Aventurier';
                await adminDb.doc(`discordLinks/${discordId}`).set({ uid, linkedAt: Timestamp.now() });
                await patch(appId, token, { content: `✅ Compte lié ! Tu joues en tant que **${persoName}**.` });
            } catch (e: any) { await patch(appId, token, { content: `❌ Erreur : ${e?.message ?? e}` }); }
        })());
        return NextResponse.json({ type: 5, data: { flags: 64 } });
    }

    // ── /unlink ───────────────────────────────────────────────────────────────
    if (name === 'unlink') {
        waitUntil((async () => {
            try {
                await adminDb.doc(`discordLinks/${discordId}`).delete();
                await patch(appId, token, { content: '🔓 Compte délié.' });
            } catch (e: any) { await patch(appId, token, { content: `❌ Erreur : ${e?.message ?? e}` }); }
        })());
        return NextResponse.json({ type: 5, data: { flags: 64 } });
    }

    // ── /roll ─────────────────────────────────────────────────────────────────
    if (name === 'roll') {
        const rawInput = opt('notation') ?? '1d20';
        const suffixMatch = rawInput.match(/\s+([pi])$/i);
        const suffix      = suffixMatch?.[1]?.toLowerCase();
        const rawNotation = suffixMatch ? rawInput.slice(0, -suffixMatch[0].length).trim() : rawInput;
        const typeOpt     = opt('type') ?? 'public';
        const isPrivate   = suffix === 'p' || typeOpt === 'prive';
        const isBlind     = suffix === 'i' || typeOpt === 'aveugle';
        const isEphemeral = isPrivate || isBlind;

        waitUntil((async () => {
            try {
                const linked   = await resolveLinkedUser(discordId);
                const notation = applyVariables(rawNotation, linked?.variables ?? {});
                const result   = rollDice(notation);

                if (!result) { await patch(appId, token, { content: `❌ Notation invalide : \`${rawNotation}\`` }); return; }

                if (linked?.roomId) {
                    const m = [...notation.matchAll(/(\d+)d(\d+)/gi)][0];
                    await adminDb.collection(`rolls/${linked.roomId}/rolls`).add({
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
                    : buildEmbed(result, linked?.persoName, linked?.avatar, linked?.isMJ);

                await patch(appId, token, { embeds: [embed] });
            } catch (e: any) { await patch(appId, token, { content: `❌ Erreur : ${e?.message ?? e}` }); }
        })());

        return NextResponse.json({ type: 5, ...(isEphemeral ? { data: { flags: 64 } } : {}) });
    }

    // ── /history ──────────────────────────────────────────────────────────────
    if (name === 'history') {
        waitUntil((async () => {
            try {
                const linked = await resolveLinkedUser(discordId);
                if (!linked?.roomId) { await patch(appId, token, { content: '❌ Connecte-toi d\'abord avec `/login`.' }); return; }

                const joueurFilter: string | undefined = opt('joueur');
                const snapshot = await adminDb.collection(`rolls/${linked.roomId}/rolls`)
                    .orderBy('timestamp', 'desc').limit(10).get();

                const docs = snapshot.docs.map(d => d.data())
                    .filter(d => !d.isPrivate && !d.isBlind)
                    .filter(d => !joueurFilter || d.userName === joueurFilter);

                if (!docs.length) { await patch(appId, token, { content: joueurFilter ? `Aucun lancer public pour **${joueurFilter}**.` : 'Aucun lancer public.' }); return; }

                const lines = docs.map(d => {
                    const date = new Date(d.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                    return `**${d.total}** · \`${d.output}\` — ${d.userName} · ${date}`;
                });

                await patch(appId, token, { embeds: [{ title: joueurFilter ? `Historique de ${joueurFilter}` : 'Derniers lancers publics', description: lines.join('\n'), color: 0xc0a080 }] });
            } catch (e: any) { await patch(appId, token, { content: `❌ Erreur : ${e?.message ?? e}` }); }
        })());
        return NextResponse.json({ type: 5 });
    }

    return new Response('Unknown interaction', { status: 400 });
}
