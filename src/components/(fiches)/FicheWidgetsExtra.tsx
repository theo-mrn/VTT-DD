"use client";

import React, { useState, useEffect } from 'react';
import { useCharacter } from '@/contexts/CharacterContext';
import { Coins, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { db, collection, onSnapshot, doc, updateDoc } from '@/lib/firebase';

interface WidgetProps {
    style?: React.CSSProperties;
}


export const WidgetBourse: React.FC<WidgetProps> = ({ style }) => {
    const { selectedCharacter, roomId } = useCharacter();
    const [currencies, setCurrencies] = useState<{ name: string, quantity: number, color: string }[]>([]);

    useEffect(() => {
        if (!selectedCharacter || !roomId) return;
        const inventoryRef = collection(db, `Inventaire/${roomId}/${selectedCharacter.Nomperso}`);

        const unsubscribe = onSnapshot(inventoryRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            const foundCurrencies: typeof currencies = [];

            items.forEach((item: any) => {
                const isBourse = item.category === 'bourse' ||
                    (item.message && ["pièce d'or", "pièce d'argent", "pièce de cuivre"].some(s => item.message.toLowerCase().includes(s)));

                if (isBourse && item.message) {
                    let color = "text-[color:var(--text-primary,#d4d4d4)]";
                    const nameLower = item.message.toLowerCase();
                    if (nameLower.includes('or')) color = "text-yellow-500";
                    else if (nameLower.includes('argent')) color = "text-gray-400";
                    else if (nameLower.includes('cuivre')) color = "text-orange-700";

                    foundCurrencies.push({
                        name: item.message,
                        quantity: item.quantity,
                        color: color
                    });
                }
            });

            foundCurrencies.sort((a, b) => {
                const getPriority = (name: string) => {
                    const n = name.toLowerCase();
                    if (n.includes('or')) return 1;
                    if (n.includes('argent')) return 2;
                    if (n.includes('cuivre')) return 3;
                    return 4;
                };
                return getPriority(a.name) - getPriority(b.name) || a.name.localeCompare(b.name);
            });

            setCurrencies(foundCurrencies);
        });
        return () => unsubscribe();
    }, [selectedCharacter, roomId]);

    return (
        <div className="h-full w-full p-2 flex flex-col rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] overflow-hidden" style={style}>
            <div className="text-[color:var(--text-secondary,#e0c060)] font-bold text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1 opacity-80 shrink-0">
                <Coins size={12} /> Bourse
            </div>

            <div className="flex-1 flex flex-row items-center justify-around gap-4 px-1 overflow-x-auto">
                {currencies.length > 0 ? (
                    currencies.map((curr, idx) => (
                        <React.Fragment key={idx}>
                            <div className="flex flex-col items-center justify-center min-w-[3rem]">
                                <span className={`text-2xl font-bold ${curr.color} font-mono leading-none drop-shadow-sm`}>
                                    {curr.quantity}
                                </span>
                                {/* Display full name without truncation */}
                                <span className="text-[10px] font-bold text-[color:var(--text-secondary,#888)] uppercase tracking-wide mt-1 text-center whitespace-nowrap">
                                    {curr.name}
                                </span>
                            </div>
                            {idx < currencies.length - 1 && (
                                <div className="h-8 w-px bg-[#444] shrink-0"></div>
                            )}
                        </React.Fragment>
                    ))
                ) : (
                    <div className="w-full text-center opacity-30 text-xs italic">
                        Vide
                    </div>
                )}
            </div>
        </div>
    );
};

export const WidgetEffects: React.FC<WidgetProps> = ({ style }) => {
    const { selectedCharacter, roomId } = useCharacter();
    const [effects, setEffects] = useState<any[]>([]);

    useEffect(() => {
        setEffects([]); // Clear effects immediately to prevent leakage
        if (!selectedCharacter?.Nomperso || !roomId) return;

        const bonusesRef = collection(db, `Bonus/${roomId}/${selectedCharacter.Nomperso}`);

        const unsubscribe = onSnapshot(bonusesRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setEffects(items);
        }, (err) => {
            console.error("Error fetching bonuses:", err);
        });
        return () => unsubscribe();
    }, [selectedCharacter?.Nomperso, roomId]);

    const toggleEffect = async (effectId: string, currentActive: boolean) => {
        if (!selectedCharacter || !roomId) return;
        const effectRef = doc(db, `Bonus/${roomId}/${selectedCharacter.Nomperso}/${effectId}`);
        try {
            await updateDoc(effectRef, { active: !currentActive });
            toast.success(currentActive ? "Effet désactivé" : "Effet activé");
        } catch (e) {
            console.error(e);
            toast.error("Erreur lors de la modification");
        }
    };

    const getEffectString = (effect: any) => {
        const stats = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA', 'PV', 'PV_Max', 'Defense', 'Contact', 'Mythe', 'Magie', 'Distance', 'INIT'];
        const parts: string[] = [];
        stats.forEach(stat => {
            if (effect[stat] && effect[stat] !== 0) {
                parts.push(`${stat} ${effect[stat] > 0 ? '+' : ''}${effect[stat]}`);
            }
        });
        return parts.join(', ');
    };

    const getDisplayName = (effect: any) => {
        if (effect.name) return effect.name;
        if (effect.label) return effect.label;
        // Fallback: beautify ID if it's all we have
        return effect.id.replace(/-/g, ' ').replace(/_/g, ' ');
    };

    return (
        <div className="h-full w-full p-2 flex flex-col rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] overflow-hidden" style={style}>
            <div className="text-[color:var(--text-secondary,#a0c0e0)] font-bold text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1 opacity-80 shrink-0">
                <Sparkles size={12} /> Effets Actifs
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent pr-1 space-y-2">
                {effects.length > 0 ? (
                    effects.map((effect) => {
                        const effectStr = getEffectString(effect);
                        // Filter out items with no actual bonuses (all stats 0 or missing)
                        if (!effectStr) return null;

                        return (
                            <div
                                key={effect.id}
                                onClick={() => toggleEffect(effect.id, effect.active)}
                                className={`
                                    cursor-pointer border rounded-lg p-2 transition-all select-none
                                    ${effect.active
                                        ? 'bg-[#444]/40 border-[#666] text-[color:var(--text-primary,#d4d4d4)] shadow-sm'
                                        : 'bg-[#2a2a2a]/40 border-[#333] text-[color:var(--text-secondary,#666)] opacity-60 hover:opacity-100'
                                    }
                                `}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[11px] font-bold uppercase tracking-wide truncate pr-2">{getDisplayName(effect)}</span>
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${effect.active ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]' : 'bg-red-900/50'}`}></div>
                                </div>
                                <div className={`text-xs font-mono font-semibold ${effect.active ? 'text-[color:var(--text-secondary,#a0c0e0)]' : 'text-[color:var(--text-secondary,#555)]'}`}>
                                    {effectStr || <span className="italic opacity-50">Aucun bonus de stat</span>}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30">
                        <span className="text-[10px] italic">Aucun effet disponible</span>
                    </div>
                )}
            </div>
        </div>
    );
};

