import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { BonusData } from '@/contexts/CharacterContext';

export interface RawBonus extends Partial<BonusData> {
    id: string;
}

export interface Bonuses {
    [key: string]: number;
    CHA: number;
    CON: number;
    Contact: number;
    DEX: number;
    Defense: number;
    Distance: number;
    FOR: number;
    INIT: number;
    INT: number;
    Magie: number;
    PV: number;
    SAG: number;
    PV_Max: number;
}

export interface CategorizedBonuses {
    [key: string]: {
        Inventaire: number;
        Competence: number;
        [category: string]: number;
    };
}

/**
 * Hook centralisant l'écoute de l'inventaire d'un personnage.
 * Remplace les onSnapshot éparpillés dans inventaire2.tsx, CharacterSheet.tsx, FicheWidgetsExtra.tsx.
 */
export function useCharacterInventory<T = any>(roomId: string | null, playerName: string | undefined) {
    const [inventory, setInventory] = useState<T[]>([]);

    useEffect(() => {
        if (!roomId || !playerName) {
            setInventory([]);
            return;
        }
        const inventoryRef = collection(db, `Inventaire/${roomId}/${playerName}`);
        const unsubscribe = onSnapshot(inventoryRef, (snapshot) => {
            setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T)));
        });
        return () => unsubscribe();
    }, [roomId, playerName]);

    return inventory;
}

/**
 * Hook centralisant l'écoute des bonus d'un personnage.
 * Remplace les onSnapshot éparpillés dans les fiches et widgets.
 */
export function useCharacterBonuses(roomId: string | null, playerName: string | undefined) {
    const [bonuses, setBonuses] = useState<RawBonus[]>([]);

    useEffect(() => {
        if (!roomId || !playerName) {
            setBonuses([]);
            return;
        }
        const bonusesRef = collection(db, `Bonus/${roomId}/${playerName}`);
        const unsubscribe = onSnapshot(bonusesRef, (snapshot) => {
            setBonuses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RawBonus)));
        });
        return () => unsubscribe();
    }, [roomId, playerName]);

    return bonuses;
}

/**
 * Hook écoutant un document de bonus spécifique (pour l'édition d'un seul objet par exemple).
 */
export function useSingleItemBonus(roomId: string | null, playerName: string | undefined, itemId: string | null | undefined) {
    const [bonusData, setBonusData] = useState<Record<string, any> | null>(null);

    useEffect(() => {
        if (!roomId || !playerName || !itemId) {
            setBonusData(null);
            return;
        }
        const itemRef = doc(db, `Bonus/${roomId}/${playerName}/${itemId}`);
        const unsubscribe = onSnapshot(itemRef, (docSnap) => {
            if (docSnap.exists()) {
                setBonusData(docSnap.data());
            } else {
                setBonusData(null);
            }
        });
        return () => unsubscribe();
    }, [roomId, playerName, itemId]);

    return bonusData;
}

/**
 * Hook qui récupère les bonus bruts et calcule automatiquement les totaux globaux et par catégorie.
 * Remplace la duplication de cette logique dans les composants et contextes.
 */
export function useCalculatedBonuses(roomId: string | null, playerName: string | undefined) {
    const rawBonuses = useCharacterBonuses(roomId, playerName);

    return useMemo(() => {
        const totalBonuses: Bonuses = {
            CHA: 0, CON: 0, Contact: 0, DEX: 0, Defense: 0, Distance: 0,
            FOR: 0, INIT: 0, INT: 0, Magie: 0, PV_Max: 0, PV: 0, SAG: 0,
        };

        const categorizedBonuses: CategorizedBonuses = {
            CHA: { Inventaire: 0, Competence: 0 },
            CON: { Inventaire: 0, Competence: 0 },
            Contact: { Inventaire: 0, Competence: 0 },
            DEX: { Inventaire: 0, Competence: 0 },
            Defense: { Inventaire: 0, Competence: 0 },
            Distance: { Inventaire: 0, Competence: 0 },
            FOR: { Inventaire: 0, Competence: 0 },
            INIT: { Inventaire: 0, Competence: 0 },
            INT: { Inventaire: 0, Competence: 0 },
            Magie: { Inventaire: 0, Competence: 0 },
            PV_Max: { Inventaire: 0, Competence: 0 },
            PV: { Inventaire: 0, Competence: 0 },
            SAG: { Inventaire: 0, Competence: 0 },
        };

        if (!rawBonuses || rawBonuses.length === 0) {
            return { rawBonuses, totalBonuses, categorizedBonuses };
        }

        rawBonuses.forEach((bonusData) => {
            if (bonusData.active) {
                // Gestion sensible à la casse selon les cas existants ("Inventaire" vs "inventaire")
                const category = bonusData.category === "Inventaire" ? "Inventaire" :
                    bonusData.category === "competence" ? "competence" :
                        (bonusData.category || 'Inconnu');

                Object.keys(totalBonuses).forEach((stat) => {
                    if (bonusData[stat as keyof typeof bonusData] !== undefined) {
                        const val = parseInt(String(bonusData[stat as keyof typeof bonusData]) || "0");
                        totalBonuses[stat] += val;

                        if (categorizedBonuses[stat]) {
                            if (categorizedBonuses[stat][category] === undefined) {
                                categorizedBonuses[stat][category] = 0;
                            }
                            categorizedBonuses[stat][category] += val;
                        }
                    }
                });
            }
        });

        return { rawBonuses, totalBonuses, categorizedBonuses };
    }, [rawBonuses]);
}
