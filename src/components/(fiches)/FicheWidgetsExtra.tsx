"use client";

import React, { useState, useEffect } from 'react';
import { useCharacter } from '@/contexts/CharacterContext';
import { Coins, Sparkles, ScrollText, Dices } from 'lucide-react';
import { toast } from 'sonner';
import { db, collection, onSnapshot, doc, updateDoc } from '@/lib/firebase';

interface WidgetProps {
    style?: React.CSSProperties;
    onRaceClick?: (race: string) => void;
}

export const WidgetDices: React.FC<WidgetProps> = ({ style }) => {
    const rollDice = (sides: number) => {
        const result = Math.floor(Math.random() * sides) + 1;
        toast.info(
            <div className="flex flex-col gap-0.5">
                <span className="font-bold text-lg">Résultat : {result}</span>
                <span className="text-xs opacity-70">Dé : d{sides}</span>
            </div>,
            { duration: 3000 }
        );
    };

    return (
        <div className="h-full w-full p-2 flex flex-col justify-center" style={style}>
            <div className="text-[#c0a080] font-bold text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1 opacity-80 shrink-0">
                <Dices size={12} /> Dés
            </div>

            <div className="flex-1 flex flex-wrap gap-2 items-center justify-center content-center overflow-auto">
                {[4, 6, 8, 10, 12, 20, 100].map(d => (
                    <button
                        key={d}
                        className="group relative h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center bg-[#444] hover:bg-[#555] rounded-md border border-[#555] hover:border-[#777] transition-all active:scale-95 shadow-sm shrink-0"
                        onClick={() => rollDice(d)}
                        title={`Lancer 1d${d}`}
                    >
                        <span className="text-xs sm:text-sm font-bold text-white group-hover:text-[#fff] transition-colors">d{d}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

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
                    let color = "text-[#d4d4d4]";
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
        <div className="h-full w-full p-2 flex flex-col" style={style}>
            <div className="text-[#e0c060] font-bold text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1 opacity-80 shrink-0">
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
                                <span className="text-[10px] font-bold text-[#888] uppercase tracking-wide mt-1 text-center whitespace-nowrap">
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
        <div className="h-full w-full p-2 flex flex-col" style={style}>
            <div className="text-[#a0c0e0] font-bold text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1 opacity-80 shrink-0">
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
                                        ? 'bg-[#444]/40 border-[#666] text-[#d4d4d4] shadow-sm'
                                        : 'bg-[#2a2a2a]/40 border-[#333] text-[#666] opacity-60 hover:opacity-100'
                                    }
                                `}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[11px] font-bold uppercase tracking-wide truncate pr-2">{getDisplayName(effect)}</span>
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${effect.active ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]' : 'bg-red-900/50'}`}></div>
                                </div>
                                <div className={`text-xs font-mono font-semibold ${effect.active ? 'text-[#a0c0e0]' : 'text-[#555]'}`}>
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

export const WidgetNotes: React.FC<WidgetProps> = ({ style }) => {
    const { selectedCharacter, updateCharacter } = useCharacter();
    const [notes, setNotes] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (selectedCharacter?.notes) {
            setNotes(selectedCharacter.notes);
        } else {
            setNotes("");
        }
    }, [selectedCharacter?.id]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNotes(e.target.value);
    };

    const handleBlur = async () => {
        if (!selectedCharacter) return;
        if (notes !== selectedCharacter.notes) {
            setIsSaving(true);
            try {
                await updateCharacter(selectedCharacter.id, { notes });
            } finally {
                setIsSaving(false);
            }
        }
    };

    return (
        <div className="h-full w-full p-2 flex flex-col relative group" style={style}>
            <div className="text-[#888] font-bold text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1 opacity-70 shrink-0">
                <ScrollText size={12} /> Notes
                {isSaving && <span className="text-[9px] text-yellow-500 ml-auto lowercase italic">sauvegarde...</span>}
            </div>

            <textarea
                className="flex-1 w-full bg-transparent text-[#d4d4d4] text-xs resize-none focus:outline-none scrollbar-thin scrollbar-thumb-[#3a3a3a] scrollbar-track-transparent leading-relaxed placeholder:text-[#444] placeholder:italic p-0 border-none focus:ring-0"
                placeholder="Rédigez vos notes..."
                value={notes}
                onChange={handleChange}
                onBlur={handleBlur}
                spellCheck={false}
            />
        </div>
    );
};
