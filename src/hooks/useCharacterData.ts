import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, Unsubscribe } from 'firebase/firestore';
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

// ==================== SHARED SUBSCRIPTION CACHE ====================
// Plusieurs composants montés en même temps (fiche + widgets + inventaire) appellent ces hooks
// pour le même personnage. Sans ce cache, chacun ouvrait son propre onSnapshot sur la même
// collection Firestore (jusqu'à 3 listeners identiques observés sur Bonus/{roomId}/{name} et
// Inventaire/{roomId}/{name}), multipliant les lectures facturées pour rien. Ici, un seul
// onSnapshot réel est actif par clé Firestore ; il est fermé quand le dernier abonné se démonte.
interface SharedSubscription<T> {
    data: T;
    listeners: Set<(data: T) => void>;
    unsubscribe: Unsubscribe;
}

function createSharedCollectionHook<T>(getPath: (roomId: string, playerName: string) => string, emptyValue: T[]) {
    const cache = new Map<string, SharedSubscription<T[]>>();

    return function useSharedCollection(roomId: string | null, playerName: string | undefined): T[] {
        const [data, setData] = useState<T[]>(emptyValue);
        const key = roomId && playerName ? `${roomId}/${playerName}` : null;

        useEffect(() => {
            if (!key || !roomId || !playerName) {
                setData(emptyValue);
                return;
            }

            let sub = cache.get(key);
            if (!sub) {
                const ref = collection(db, getPath(roomId, playerName));
                const listeners = new Set<(data: T[]) => void>();
                const unsubscribe = onSnapshot(ref, (snapshot) => {
                    const next = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as T));
                    const current = cache.get(key);
                    if (current) {
                        current.data = next;
                        current.listeners.forEach(l => l(next));
                    }
                });
                sub = { data: emptyValue, listeners, unsubscribe };
                cache.set(key, sub);
            }

            sub.listeners.add(setData);
            setData(sub.data);

            return () => {
                const current = cache.get(key);
                if (!current) return;
                current.listeners.delete(setData);
                if (current.listeners.size === 0) {
                    current.unsubscribe();
                    cache.delete(key);
                }
            };
        }, [key, roomId, playerName]);

        return data;
    };
}

/**
 * Hook centralisant l'écoute de l'inventaire d'un personnage.
 * Un seul onSnapshot actif par (roomId, playerName), partagé entre tous les composants
 * qui l'appellent simultanément (inventaire.tsx, WidgetBourse, FloatingEditTabs, ...).
 */
export const useCharacterInventory = createSharedCollectionHook<any>(
    (roomId, playerName) => `Inventaire/${roomId}/${playerName}`,
    []
) as <T = any>(roomId: string | null, playerName: string | undefined) => T[];

/**
 * Hook centralisant l'écoute des bonus d'un personnage.
 * Un seul onSnapshot actif par (roomId, playerName), partagé entre tous les composants
 * qui l'appellent simultanément (CharacterContext, inventaire.tsx, WidgetEffects, ...).
 */
export const useCharacterBonuses = createSharedCollectionHook<RawBonus>(
    (roomId, playerName) => `Bonus/${roomId}/${playerName}`,
    []
);

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
