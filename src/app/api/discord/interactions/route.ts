import { NextResponse } from 'next/server';
import { InteractionType, InteractionResponseType, verifyKey } from 'discord-interactions';

// Dice rolling logic (mirrors roll-dice route)
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

function buildEmbed(notation: string, result: ReturnType<typeof rollDice>) {
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
        fields: [
            { name: 'Résultat', value: `**${total}**`, inline: true },
            { name: 'Notation', value: `\`${notation}\``, inline: true },
        ],
        footer: { text: 'Yner Bot • VTT' },
    };
}

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

    // Verification PING
    if (interaction.type === InteractionType.PING) {
        return NextResponse.json({ type: InteractionResponseType.PONG });
    }

    // Slash commands
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const { name, options } = interaction.data;

        if (name === 'roll') {
            const notation: string = options?.[0]?.value ?? '1d20';
            const result = rollDice(notation);

            if (!result) {
                return NextResponse.json({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: `❌ Notation invalide : \`${notation}\`` },
                });
            }

            const embed = buildEmbed(notation, result);
            return NextResponse.json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { embeds: [embed] },
            });
        }
    }

    return new Response('Unknown interaction', { status: 400 });
}
