"use client";

import React, { useState } from 'react';
import { useCharacter, Character, CustomField } from '@/contexts/CharacterContext';
import CharacterImage from '@/components/(fiches)/CharacterImage';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Heart, Shield } from 'lucide-react';
import useMeasure from 'react-use-measure';

interface WidgetProps {
    style?: React.CSSProperties;
    onRaceClick?: (race: string) => void;
}

export const WidgetAvatar: React.FC<WidgetProps> = ({ style }) => {
    const { selectedCharacter } = useCharacter();

    if (!selectedCharacter) return null;

    return (
        <div className="h-full w-full p-2 overflow-hidden flex items-center justify-center">
            <div className="h-full w-full relative">
                <CharacterImage
                    imageUrl={selectedCharacter.imageURL}
                    imageURL2={selectedCharacter.imageURL2}
                    imageURLFinal={selectedCharacter.imageURLFinal}
                    isGifProp={selectedCharacter.isGif}
                    altText={selectedCharacter.Nomperso}
                    characterId={selectedCharacter.id}
                />
            </div>
        </div>
    );
};

export const WidgetDetails: React.FC<WidgetProps> = ({ style, onRaceClick }) => {
    const { selectedCharacter, getDisplayValue } = useCharacter();
    const [ref, bounds] = useMeasure();

    if (!selectedCharacter) return null;

    const fontSize = bounds.height ? Math.min(Math.max(bounds.height / 15, 10), 100) : 12;

    return (
        <div className="h-full p-2 overflow-hidden" ref={ref}>
            <div
                className="bg-[#2a2a2a] p-2 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] h-full flex flex-col"
                style={{ ...style, fontSize: `${fontSize}px` }}
            >
                <h2 className="text-[1.3em] font-bold text-[color:var(--text-secondary,#c0a0a0)] mb-2 text-center sm:text-left shrink-0 leading-tight">
                    {selectedCharacter.Nomperso}
                </h2>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-x-2 gap-y-1 flex-1 content-evenly items-center text-[color:var(--text-primary,#d4d4d4)]">
                    <div>Niveau: <span className="text-[color:var(--text-secondary,#a0a0a0)]">{selectedCharacter.niveau}</span></div>
                    <div>Initiative: <span className="text-[color:var(--text-secondary,#a0a0a0)]">{getDisplayValue("INIT")}</span></div>
                    <div>Profil: <span className="text-[color:var(--text-secondary,#a0a0a0)]">{selectedCharacter.Profile}</span></div>
                    <div>Taille: <span className="text-[color:var(--text-secondary,#a0a0a0)]">{selectedCharacter.Taille} cm</span></div>
                    <div>
                        Race:
                        <span
                            className="text-[color:var(--text-secondary,#a0a0a0)] underline cursor-pointer ml-1"
                            onClick={() => onRaceClick && onRaceClick(selectedCharacter.Race || "")}
                        >
                            {selectedCharacter.Race}
                        </span>
                    </div>
                    <div>Poids: <span className="text-[color:var(--text-secondary,#a0a0a0)]">{selectedCharacter.Poids} Kg</span></div>
                    <div className="xs:col-span-2">Dé de Vie: <span className="text-[color:var(--text-secondary,#a0a0a0)]">{selectedCharacter.deVie}</span></div>
                </div>
            </div>
        </div>
    );
};

export const WidgetStats: React.FC<WidgetProps> = ({ style }) => {
    const { selectedCharacter, getDisplayModifier, getModifier, categorizedBonuses } = useCharacter();

    return (
        <div className="grid grid-cols-3 gap-1 md:gap-2 h-full p-1">
            {[
                { name: 'FOR', value: getDisplayModifier("FOR") },
                { name: 'DEX', value: getDisplayModifier("DEX") },
                { name: 'CON', value: getDisplayModifier("CON") },
                { name: 'INT', value: getDisplayModifier("INT") },
                { name: 'SAG', value: getDisplayModifier("SAG") },
                { name: 'CHA', value: getDisplayModifier("CHA") },
            ].map((ability) => (
                <Tooltip key={ability.name}>
                    <TooltipTrigger asChild>
                        <div className="bg-[#2a2a2a] rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] h-full flex flex-col justify-center items-center overflow-hidden min-h-0 py-1" style={style}>
                            <div className="text-[color:var(--text-secondary,#c0a0a0)] font-semibold text-xs sm:text-sm">{ability.name}</div>
                            <div className={`text-lg sm:text-xl md:text-2xl font-bold leading-none ${ability.value >= 0 ? 'text-[color:var(--text-primary,#22c55e)]' : 'text-red-500'}`}>
                                {ability.value >= 0 ? '+' : ''}{ability.value}
                            </div>
                            <div className="text-[10px] sm:text-xs text-[color:var(--text-secondary,#a0a0a0)]">{selectedCharacter ? (selectedCharacter[ability.name as keyof Character] as number) : 0}</div>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Mod de base: {getModifier(selectedCharacter ? (selectedCharacter[ability.name as keyof Character] as number) : 0)}</p>
                        <p>Inventaire: {categorizedBonuses ? categorizedBonuses[ability.name].Inventaire : 0}</p>
                        <p>Compétence: {categorizedBonuses ? categorizedBonuses[ability.name].Competence : 0}</p>
                    </TooltipContent>
                </Tooltip>
            ))}
        </div>
    );
};

export const WidgetVitals: React.FC<WidgetProps> = ({ style }) => {
    const { selectedCharacter, getDisplayValue, categorizedBonuses } = useCharacter();

    return (
        <div className="flex flex-col h-full p-1 justify-center">
            <div className="bg-[#2a2a2a] px-12 py-1 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] flex flex-row justify-between items-center gap-2 h-full" style={style}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex items-center space-x-1 cursor-help">
                            <Heart className="text-red-500" size={16} />
                            <span className="text-sm sm:text-base md:text-xl font-bold text-[color:var(--text-primary,#d4d4d4)]">
                                {getDisplayValue("PV")} / {getDisplayValue("PV_Max")}
                            </span>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Base: {selectedCharacter ? selectedCharacter.PV : 0}</p>
                        <p>Inventaire: {categorizedBonuses ? categorizedBonuses.PV.Inventaire : 0}</p>
                        <p>Compétence: {categorizedBonuses ? categorizedBonuses.PV.Competence : 0}</p>
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex items-center space-x-1 cursor-help">
                            <Shield className="text-blue-500" size={16} />
                            <span className="text-sm sm:text-base md:text-xl font-bold text-[color:var(--text-primary,#d4d4d4)]">{getDisplayValue("Defense")}</span>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Base: {selectedCharacter ? selectedCharacter.Defense : 0}</p>
                        <p>Inventaire: {categorizedBonuses ? categorizedBonuses.Defense.Inventaire : 0}</p>
                        <p>Compétence: {categorizedBonuses ? categorizedBonuses.Defense.Competence : 0}</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
};

export const WidgetCombatStats: React.FC<WidgetProps> = ({ style }) => {
    const { selectedCharacter, getDisplayValue, categorizedBonuses } = useCharacter();

    return (
        <div className="grid grid-cols-3 gap-1 h-full p-1">
            {[
                { name: 'Contact', value: getDisplayValue("Contact") },
                { name: 'Distance', value: getDisplayValue("Distance") },
                { name: 'Magie', value: getDisplayValue("Magie") }
            ].map((stat) => (
                <Tooltip key={stat.name}>
                    <TooltipTrigger asChild>
                        <div className="bg-[#2a2a2a] p-1 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] text-center h-full flex flex-col justify-center overflow-hidden" style={style}>
                            <h3 className="text-[10px] sm:text-xs md:text-sm font-semibold text-[color:var(--text-secondary,#c0a0a0)] mb-0.5 whitespace-nowrap">{stat.name}</h3>
                            <span className="text-base sm:text-lg md:text-xl font-bold text-[color:var(--text-primary,#d4d4d4)] leading-none">{stat.value}</span>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Base: {selectedCharacter ? (selectedCharacter[stat.name as keyof Character] as number) : 0}</p>
                        <p>Inventaire: {categorizedBonuses ? categorizedBonuses[stat.name].Inventaire : 0}</p>
                        <p>Compétence: {categorizedBonuses ? categorizedBonuses[stat.name].Competence : 0}</p>
                    </TooltipContent>
                </Tooltip>
            ))}
        </div>
    );
};


export const WidgetCustomGroup: React.FC<WidgetProps & { label?: string; fieldIds?: string[] }> = ({ style, label, fieldIds = [] }) => {
    const { selectedCharacter } = useCharacter();
    const fields = selectedCharacter?.customFields ?? [];

    // Filter fields that are in this group
    const groupFields = fields.filter(f => fieldIds.includes(f.id));

    if (groupFields.length === 0) return null;

    const getFieldModifier = (val: number) => Math.floor((val - 10) / 2);
    const fmtMod = (m: number) => (m >= 0 ? `+${m}` : `${m}`);

    return (
        <div className="flex flex-col h-full p-1 justify-center">
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="grid gap-1 flex-1 h-full" style={{ gridTemplateColumns: `repeat(${groupFields.length}, minmax(0, 1fr))` }}>
                    {groupFields.map((field) => {
                        const numVal = typeof field.value === 'number' ? field.value : parseFloat(field.value as string) || 0;
                        const mod = field.hasModifier && field.type === 'number' ? getFieldModifier(numVal) : null;

                        let displayValue: string;
                        if (field.type === 'boolean') displayValue = field.value ? '✓' : '✗';
                        else if (field.type === 'percent') displayValue = `${field.value}%`;
                        else displayValue = field.value !== '' && field.value !== undefined ? String(field.value) : '—';

                        return (
                            <div
                                key={field.id}
                                className="bg-[#2a2a2a] p-1 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] text-center h-full flex flex-col justify-center items-center overflow-hidden"
                                style={style}
                            >
                                <span className="text-[9px] sm:text-[10px] uppercase font-bold text-[color:var(--text-secondary,#c0a0a0)] tracking-wider truncate mb-0.5" title={field.label}>
                                    {field.label}
                                </span>
                                {mod !== null ? (
                                    <>
                                        <div className={`text-lg sm:text-xl md:text-2xl font-bold leading-none ${mod >= 0 ? 'text-[color:var(--text-primary,#22c55e)]' : 'text-red-500'}`}>
                                            {fmtMod(mod)}
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-[color:var(--text-secondary,#a0a0a0)]">{displayValue}</div>
                                    </>
                                ) : (
                                    <div className="text-sm sm:text-base md:text-xl font-bold text-[color:var(--text-primary,#d4d4d4)] leading-none mt-1">
                                        {displayValue}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export function GroupCreationSection({ handleAddWidget, customFields, initialLabel = '', initialFieldIds = [], mode = 'create' }: {
    handleAddWidget: (id: string) => void,
    customFields: CustomField[],
    initialLabel?: string,
    initialFieldIds?: string[],
    mode?: 'create' | 'edit'
}) {
    const [label, setLabel] = useState(initialLabel);
    const [selectedIds, setSelectedIds] = useState<string[]>(initialFieldIds);

    const toggleId = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleAction = () => {
        if (selectedIds.length === 0) {
            alert("Veuillez sélectionner au moins un attribut.");
            return;
        }
        const finalLabel = label.trim() || 'Attributs';
        handleAddWidget(`custom_group:${finalLabel}:${selectedIds.join(',')}`);
        if (mode === 'create') {
            setLabel('');
            setSelectedIds([]);
        }
    };

    return (
        <div className="flex flex-col gap-2 p-3 bg-[#1c1c1c] border border-[var(--border-color)] rounded-lg mb-2">
            <span className="text-[10px] font-bold text-[var(--accent-brown)] uppercase">
                {mode === 'edit' ? 'Modifier le Groupement' : 'Créer un Groupement'}
            </span>
            <input
                type="text"
                placeholder="Libellé du bloc (ex: Social)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-[#3a3a3a] rounded px-2 py-1 text-xs text-[#d4d4d4]"
            />
            <div className="max-h-[150px] overflow-y-auto space-y-1 mt-1 scrollbar-thin scrollbar-thumb-[#3a3a3a] scrollbar-track-transparent">
                {customFields.length > 0 ? (
                    customFields.map(f => (
                        <label key={f.id} className="flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] rounded cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(f.id)}
                                onChange={() => toggleId(f.id)}
                                className="accent-[var(--accent-brown)]"
                            />
                            <span className="text-[11px] text-[#a0a0a0] group-hover:text-white truncate">{f.label}</span>
                        </label>
                    ))
                ) : (
                    <div className="text-[10px] text-[#555] italic px-2">Aucun attribut disponible</div>
                )}
            </div>
            <button
                onClick={handleAction}
                disabled={selectedIds.length === 0}
                className="w-full py-1.5 bg-[var(--accent-brown)] text-black rounded text-[10px] font-bold uppercase mt-1 hover:bg-[var(--accent-brown-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {mode === 'edit' ? 'Enregistrer' : 'Créer le bloc'}
            </button>
        </div>
    );
}
