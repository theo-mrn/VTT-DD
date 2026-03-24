import { adminDb } from '@/lib/firebase-admin';

// Stats with D&D modifier formula: floor((value - 10) / 2)
const MODIFIER_STATS = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'];
// Stats used as-is (direct value)
const DIRECT_STATS = ['Defense', 'Contact', 'Magie', 'Distance', 'INIT'];

/**
 * Build a variables map from a character document.
 * Mirrors the replaceCharacteristics() logic in glowing-ai-chat-assistant.tsx.
 * Uses _F (final) fields when available (already include bonuses).
 */
export async function buildCharacterVariables(uid: string): Promise<Record<string, number>> {
    const userDoc = await adminDb.doc(`users/${uid}`).get();
    if (!userDoc.exists) return {};

    const userData = userDoc.data()!;
    const roomId: string | null = userData.room_id ?? null;
    const persoId: string | null = userData.persoId ?? null;

    if (!roomId || !persoId) return {};

    const charDoc = await adminDb.doc(`cartes/${roomId}/characters/${persoId}`).get();
    if (!charDoc.exists) return {};

    const c = charDoc.data()!;
    const vars: Record<string, number> = {};

    // Built-in stats with modifier formula
    for (const key of MODIFIER_STATS) {
        const finalVal = c[`${key}_F`];
        if (finalVal !== undefined && finalVal !== null) {
            vars[key] = Number(finalVal);
        } else if (c[key] !== undefined) {
            vars[key] = Math.floor((Number(c[key]) - 10) / 2);
        }
    }

    // Direct stats (no modifier formula)
    for (const key of DIRECT_STATS) {
        const finalVal = c[`${key}_F`];
        if (finalVal !== undefined && finalVal !== null) {
            vars[key] = Number(finalVal);
        } else if (c[key] !== undefined) {
            vars[key] = Number(c[key]);
        }
    }

    // Custom rollable fields
    const customFields: any[] = c.customFields ?? [];
    for (const field of customFields) {
        if (!field.isRollable || !field.label) continue;
        const val = Number(field.value) || 0;
        vars[field.label] = field.hasModifier
            ? Math.floor((val - 10) / 2)
            : val;
    }

    return vars;
}

/** Replace variable names in a notation string with their numeric values */
export function applyVariables(notation: string, variables: Record<string, number>): string {
    if (!Object.keys(variables).length) return notation;

    // Sort by key length descending to avoid partial matches (e.g. "INIT" before "IN")
    const sortedKeys = Object.keys(variables).sort((a, b) => b.length - a.length);
    const escaped = sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

    return notation.replace(regex, (match) => {
        const key = sortedKeys.find(k => k.toLowerCase() === match.toLowerCase());
        return key !== undefined ? String(variables[key]) : match;
    });
}
