import { NextResponse } from 'next/server';

interface RollRequest {
    notation: string;
    roomId?: string;
    userId?: string;
    username?: string;
    userAvatar?: string;
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

        // Parse notation (simple parser for now: XdY)
        // Matches: 1d20, 2d6, 1d20+5
        // We only care about generating the DICE values here.
        const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;

        // We need to preserve the structure to return individual die results
        const rolls: { type: string; value: number }[] = [];
        let total = 0;

        // We will parse the string to find all dice to roll
        const matches = [...notation.matchAll(diceRegex)];

        if (matches.length === 0 && !notation.match(/\d/)) {
            return NextResponse.json({ error: 'Invalid notation' }, { status: 400 });
        }

        // Generate random values for each die match
        for (const match of matches) {
            const count = parseInt(match[1]);
            const faces = parseInt(match[2]);
            const type = `d${faces}`;

            for (let i = 0; i < count; i++) {
                const val = Math.floor(Math.random() * faces) + 1;
                rolls.push({ type, value: val });
            }
        }

        // We also need to calculate the TOTAL. 
        // This is tricky without a full expression parser if the notation is complex (e.g. 1d20+1d4+5).
        // For now, we will emulate the simple processing: replace dice with values and eval.
        // NOTE: This logic should ideally match `dice-roller.tsx` logic exactly to avoid discrepancies.
        //
        // Let's copy the evaluation logic from dice-roller.tsx basically.

        let processedNotation = notation;
        // We need to consume our generated 'rolls' array in order
        const tempRolls = [...rolls];

        const detailsParts: string[] = [];

        processedNotation = processedNotation.replace(diceRegex, (match, countStr, facesStr, keepType, keepCountStr) => {
            const count = parseInt(countStr);
            const faces = parseInt(facesStr);
            const keepCount = keepCountStr ? parseInt(keepCountStr) : 0;

            const currentDiceValues: number[] = [];
            for (let i = 0; i < count; i++) {
                // Take the first available roll of this type
                // In our simple generation above, we pushed them in order of matches, so we can just shift.
                // But wait, the loop above 'matches' is the same order as replace.
                // So we can just pop from the front of tempRolls IF the type matches.
                // Actually, since we iterate in the exact same order, we can just grab the next N items from tempRolls?
                // Wait, tempRolls has ALL dice flat.
                // The first match generated 'count' items.
                // So we just splice 0..count

                const roll = tempRolls.shift();
                if (roll) currentDiceValues.push(roll.value);
            }

            // Appliquer la logique Keep High / Keep Low (Copied from dice-roller.tsx)
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

            // Formatting for detail string
            const formattedDice = usedRolls.map(r => r.keep ? `${r.val}` : `r${r.val}`).join(', ');
            detailsParts.push(`[${formattedDice}]`);

            return subTotal.toString();
        });

        let grandTotal = 0;
        try {
            // Evaluate the math expression
            const safeExpression = processedNotation.replace(/[^0-9+\-*/().\s]/g, '');
            // eval is dangerous but standard for these calculator apps. 
            // In strict server env we might want a library like mathjs, but for now:
            // eslint-disable-next-line no-eval
            grandTotal = eval(safeExpression);
        } catch (e) {
            console.error("Math eval error", e);
        }

        const output = `${notation} = ${processedNotation} = ${grandTotal}`;

        return NextResponse.json({
            total: grandTotal,
            rolls: rolls, // These are the raw values [ {type:'d20', value: 15}, ... ]
            output: output,
            timestamp: Date.now(),
            saved: false // API does not save anymore
        });

    } catch (error) {
        console.error('Error in roll-dice API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
