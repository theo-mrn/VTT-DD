import { adminDb } from '@/lib/firebase-admin';
import { resolveCharacterStats, buildDiceVariables, resolveRoomGameSystem } from '@/lib/rules-engine';
import type { GameSystemDefinition } from '@/modules/game-system/types';

/**
 * Build a variables map from a character document.
 * Thin wrapper autour du moteur de règles partagé (src/lib/rules-engine) : charge le personnage
 * + le système de jeu actif de sa room, puis délègue tout le calcul (modificateurs, stats dérivées,
 * champs custom rollable) au même moteur que le client (CharacterContext, dice-roller).
 */
export async function buildCharacterVariables(uid: string): Promise<Record<string, number>> {
    const userDoc = await adminDb.doc(`users/${uid}`).get();
    if (!userDoc.exists) return {};

    const userData = userDoc.data()!;
    const roomId: string | null = userData.room_id ?? null;
    const persoId: string | null = userData.persoId ?? null;

    if (!roomId || !persoId) return {};

    const [charDoc, roomDoc] = await Promise.all([
        adminDb.doc(`cartes/${roomId}/characters/${persoId}`).get(),
        adminDb.doc(`Salle/${roomId}`).get(),
    ]);
    if (!charDoc.exists) return {};

    const character = charDoc.data()!;
    const roomData = roomDoc.exists ? roomDoc.data() : undefined;

    // Système custom créé par le MJ (JSON pur, pas de module en mémoire côté serveur) : charger
    // séparément l'override si le gameSystemId de la room n'est pas un système builtin connu.
    // D'abord le catalogue partagé gameSystems/{id} (nouveau), sinon fallback sur l'ancien chemin
    // scopé à la room Salle/{roomId}/gameSystemOverrides/{id} (compat salles existantes).
    let override: GameSystemDefinition | null = null;
    if (roomData?.gameSystemId) {
        const catalogDoc = await adminDb.doc(`gameSystems/${roomData.gameSystemId}`).get();
        if (catalogDoc.exists) {
            override = catalogDoc.data() as GameSystemDefinition;
        } else {
            const overrideDoc = await adminDb.doc(`Salle/${roomId}/gameSystemOverrides/${roomData.gameSystemId}`).get();
            if (overrideDoc.exists) override = overrideDoc.data() as GameSystemDefinition;
        }
    }

    const { gameSystem, tableCustomStats } = resolveRoomGameSystem(roomData, override);

    const resolved = resolveCharacterStats(gameSystem, tableCustomStats, character);
    return buildDiceVariables(resolved, [...gameSystem.stats, ...tableCustomStats], character);
}

/** Replace variable names in a notation string with their numeric values */
export { applyVariablesToNotation as applyVariables } from '@/lib/rules-engine';
