import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { resolveApiUser } from '@/lib/api-auth';

interface RollRequest {
    notation: string;
    roomId?: string;
    persoId?: string;
    isPrivate?: boolean;
    isBlind?: boolean;
}

export async function POST(request: Request) {
    try {
        const body: RollRequest = await request.json();
        const { notation } = body;

        if (!notation) {
            return NextResponse.json({ error: 'Notation is required' }, { status: 400 });
        }

        // Authenticate user via Bearer token or API Key
        const apiUser = await resolveApiUser(request, body.roomId);

        if (body.roomId && !apiUser) {
            return NextResponse.json(
                { error: 'Authentication required to save a roll. Add -H "Authorization: ApiKey $VTT_API_KEY"' },
                { status: 401 }
            );
        }

        const userName = apiUser?.name ?? 'Anonyme';
        const userAvatar = apiUser?.avatar;
        const authenticatedUid = apiUser?.uid;

        // Parse notation (simple parser for now: XdY)
        // Matches: 1d20, 2d6, 1d20+5
        const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;

        const rolls: { type: string; value: number }[] = [];

        const matches = [...notation.matchAll(diceRegex)];

        if (matches.length === 0 && !notation.match(/\d/)) {
            return NextResponse.json({ error: 'Invalid notation' }, { status: 400 });
        }

        for (const match of matches) {
            const count = parseInt(match[1]);
            const faces = parseInt(match[2]);
            const type = `d${faces}`;

            for (let i = 0; i < count; i++) {
                const val = Math.floor(Math.random() * faces) + 1;
                rolls.push({ type, value: val });
            }
        }

        let processedNotation = notation;
        const tempRolls = [...rolls];
        const detailsParts: string[] = [];

        processedNotation = processedNotation.replace(diceRegex, (_, countStr, _facesStr, keepType, keepCountStr) => {
            const count = parseInt(countStr);
            const keepCount = keepCountStr ? parseInt(keepCountStr) : 0;

            const currentDiceValues: number[] = [];
            for (let i = 0; i < count; i++) {
                const roll = tempRolls.shift();
                if (roll) currentDiceValues.push(roll.value);
            }

            let subTotal = 0;
            let usedRolls: { val: number, keep: boolean }[] = currentDiceValues.map(r => ({ val: r, keep: true }));

            if (keepType) {
                const sortedIndices = currentDiceValues.map((val, idx) => ({ val, idx }))
                    .sort((a, b) => keepType === 'h' ? b.val - a.val : a.val - b.val);

                const indicesToKeep = new Set(sortedIndices.slice(0, keepCount).map(x => x.idx));

                usedRolls = currentDiceValues.map((val, idx) => ({
                    val,
                    keep: indicesToKeep.has(idx)
                }));

                subTotal = usedRolls.filter(r => r.keep).reduce((sum, r) => sum + r.val, 0);
            } else {
                subTotal = currentDiceValues.reduce((a, b) => a + b, 0);
            }

            const formattedDice = usedRolls.map(r => r.keep ? `${r.val}` : `r${r.val}`).join(', ');
            detailsParts.push(`[${formattedDice}]`);

            return subTotal.toString();
        });

        let grandTotal = 0;
        try {
            const safeExpression = processedNotation.replace(/[^0-9+\-*/().\s]/g, '');
            // eslint-disable-next-line no-eval
            grandTotal = eval(safeExpression);
        } catch (e) {
            console.error("Math eval error", e);
        }

        const output = `${notation} = ${processedNotation} = ${grandTotal}`;

        let saved = false;

        if (body.roomId && authenticatedUid) {
            const firstMatch = matches[0];
            const diceCount = firstMatch ? parseInt(firstMatch[1]) : rolls.length;
            const diceFaces = firstMatch ? parseInt(firstMatch[2]) : 20;

            const firebaseRoll = {
                id: crypto.randomUUID(),
                isPrivate: body.isPrivate ?? false,
                isBlind: body.isBlind ?? false,
                diceCount,
                diceFaces,
                modifier: 0,
                results: rolls.map(r => r.value),
                total: grandTotal,
                userName,
                ...(userAvatar ? { userAvatar } : {}),
                ...(apiUser?.persoId ? { persoId: apiUser.persoId } : {}),
                type: 'Dice Roller/API',
                timestamp: Date.now(),
                notation,
                output,
            };

            await adminDb.collection(`rolls/${body.roomId}/rolls`).add(firebaseRoll);
            saved = true;
        }

        return NextResponse.json({
            total: grandTotal,
            rolls,
            output,
            timestamp: Date.now(),
            saved,
            ...(authenticatedUid ? { user: userName } : {}),
        });

    } catch (error) {
        console.error('Error in roll-dice API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
