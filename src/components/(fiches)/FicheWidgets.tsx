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

export const WidgetStats: React.FC<WidgetProps & { fieldIds?: string[], layout?: 'horizontal' | 'vertical' | 'grid', styleOption?: 'separated' | 'unified', justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'stretch' }> = ({ style, fieldIds = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'], layout = 'grid', styleOption = 'separated', justify = 'center' }) => {
    const { selectedCharacter, getDisplayModifier, getModifier, categorizedBonuses } = useCharacter();

    const isUnified = styleOption === 'unified';
    const gapClass = isUnified ? '' : 'gap-1 md:gap-2';
    const gapClassVert = isUnified ? '' : 'gap-1';

    let containerClassName = '';
    if (layout === 'grid') {
        containerClassName = `grid grid-cols-2 sm:grid-cols-3 ${gapClass} h-full p-1`;
    } else if (layout === 'vertical') {
        if (justify === 'stretch') containerClassName = `flex flex-col items-stretch ${gapClassVert} flex-1 h-full overflow-y-auto p-1`;
        else if (justify === 'between' || justify === 'around') containerClassName = `flex flex-col justify-${justify} items-stretch ${gapClassVert} flex-1 h-full overflow-y-auto p-1`;
        else containerClassName = `flex flex-col justify-start items-${justify} ${gapClassVert} flex-1 h-full overflow-y-auto p-1`;
    } else {
        if (justify === 'stretch') containerClassName = `grid ${gapClassVert} flex-1 h-full p-1`;
        else containerClassName = `flex flex-row flex-wrap justify-${justify} items-stretch ${gapClassVert} flex-1 h-full overflow-y-auto p-1`;
    }

    const containerStyle = (layout === 'horizontal' && justify === 'stretch')
        ? { gridTemplateColumns: `repeat(${fieldIds.length}, minmax(0, 1fr))` }
        : undefined;

    const unifiedContainerClasses = isUnified ? 'bg-[#2a2a2a] rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] overflow-hidden' : '';

    return (
        <div className={`${containerClassName} ${unifiedContainerClasses}`} style={containerStyle}>
            {fieldIds.map((name) => {
                const customField = selectedCharacter?.customFields?.find(f => f.id === name);
                const isCustom = !!customField;
                const label = isCustom ? customField.label : name;

                let modifierVal: number;
                let baseVal: number;
                let isCustomMod = false;
                let displayValueStr: string | null = null;

                if (isCustom) {
                    if (customField.type === 'number') {
                        const numVal = typeof customField.value === 'number' ? customField.value : parseFloat(customField.value as string) || 0;
                        if (customField.hasModifier) {
                            modifierVal = Math.floor((numVal - 10) / 2);
                            baseVal = numVal;
                            isCustomMod = true;
                        } else {
                            modifierVal = numVal;
                            baseVal = 0;
                        }
                    } else {
                        modifierVal = 0;
                        baseVal = 0;
                        if (customField.type === 'boolean') displayValueStr = customField.value ? '✓' : '✗';
                        else if (customField.type === 'percent') displayValueStr = `${customField.value}%`;
                        else displayValueStr = customField.value !== '' && customField.value !== undefined ? String(customField.value) : '—';
                    }
                } else {
                    const modifier = getDisplayModifier(name as any);
                    modifierVal = isNaN(modifier) ? 0 : modifier;
                    baseVal = selectedCharacter ? (selectedCharacter[name as keyof Character] as number) : 0;
                }

                const childClasses = isUnified
                    ? "p-1 text-center h-full flex flex-col justify-center min-h-[50px] overflow-hidden"
                    : "bg-[#2a2a2a] p-1 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] text-center h-full flex flex-col justify-center min-h-[50px] overflow-hidden";

                return (
                    <Tooltip key={name}>
                        <TooltipTrigger asChild>
                            <div className={childClasses} style={isUnified ? {} : style}>
                                <div className="text-[color:var(--text-secondary,#c0a0a0)] font-semibold text-xs sm:text-sm truncate" title={label}>{label}</div>

                                {displayValueStr !== null ? (
                                    <div className="text-sm sm:text-base md:text-xl font-bold text-[color:var(--text-primary,#d4d4d4)] leading-none mt-1">
                                        {displayValueStr}
                                    </div>
                                ) : (
                                    <>
                                        <div className={`text-lg sm:text-xl md:text-2xl font-bold leading-none ${modifierVal >= 0 ? 'text-[color:var(--text-primary,#22c55e)]' : 'text-red-500'}`}>
                                            {(modifierVal >= 0 && (!isCustom || isCustomMod)) ? '+' : ''}{modifierVal}
                                        </div>
                                        {(!isCustom || isCustomMod) && (
                                            <div className="text-[10px] sm:text-xs text-[color:var(--text-secondary,#a0a0a0)]">{baseVal}</div>
                                        )}
                                    </>
                                )}
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {isCustom ? (
                                <p>Valeur personnalisée: {String(customField.value)}</p>
                            ) : (
                                <>
                                    <p>Mod de base: {getModifier(selectedCharacter ? (selectedCharacter[name as keyof Character] as number) : 0)}</p>
                                    <p>Inventaire: {categorizedBonuses ? categorizedBonuses[name as any]?.Inventaire || 0 : 0}</p>
                                    <p>Compétence: {categorizedBonuses ? categorizedBonuses[name as any]?.Competence || 0 : 0}</p>
                                </>
                            )}
                        </TooltipContent>
                    </Tooltip>
                )
            })}
        </div>
    );
};

export const WidgetVitals: React.FC<WidgetProps & { fieldIds?: string[], layout?: 'horizontal' | 'vertical' | 'grid', styleOption?: 'separated' | 'unified', justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'stretch' }> = ({ style, fieldIds = ['PV', 'Defense'], layout = 'horizontal', styleOption = 'separated', justify = 'center' }) => {
    const { selectedCharacter, getDisplayValue, categorizedBonuses } = useCharacter();

    const isUnified = styleOption === 'unified';
    const gapClass = isUnified ? '' : 'gap-1';

    let containerClassName = '';
    if (layout === 'grid') {
        containerClassName = `grid grid-cols-2 ${gapClass} h-full p-1`;
    } else if (layout === 'vertical') {
        if (justify === 'stretch') containerClassName = `flex flex-col items-stretch ${gapClass} flex-1 h-full overflow-y-auto p-1`;
        else if (justify === 'between' || justify === 'around') containerClassName = `flex flex-col justify-${justify} items-stretch ${gapClass} flex-1 h-full overflow-y-auto p-1`;
        else containerClassName = `flex flex-col justify-start items-${justify} ${gapClass} flex-1 h-full overflow-y-auto p-1`;
    } else {
        if (justify === 'stretch') containerClassName = `grid ${gapClass} flex-1 h-full p-1`;
        else containerClassName = `flex flex-row flex-wrap justify-${justify} items-stretch ${gapClass} flex-1 h-full overflow-y-auto p-1`;
    }

    const containerStyle = (layout === 'horizontal' && justify === 'stretch')
        ? { gridTemplateColumns: `repeat(${fieldIds.length}, minmax(0, 1fr))` }
        : undefined;

    const unifiedContainerClasses = isUnified ? 'bg-[#2a2a2a] rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] overflow-hidden' : '';

    return (
        <div className={`${containerClassName} ${unifiedContainerClasses}`} style={containerStyle}>
            {fieldIds.map(name => {
                const customField = selectedCharacter?.customFields?.find(f => f.id === name);
                const isCustom = !!customField;
                const label = isCustom ? customField.label : name;

                const isPV = name === 'PV';

                const widthClass = (layout === 'horizontal' && justify !== 'stretch') ? '' : 'w-full';

                const childClasses = isUnified
                    ? `px-4 py-1 flex flex-row justify-between items-center gap-2 h-full min-h-[50px] ${widthClass}`
                    : `bg-[#2a2a2a] px-4 py-1 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] flex flex-row justify-between items-center gap-2 h-full min-h-[50px] ${widthClass}`;

                let displayVal: string | number;
                if (isCustom) {
                    if (customField.type === 'boolean') displayVal = customField.value ? '✓' : '✗';
                    else if (customField.type === 'percent') displayVal = `${customField.value}%`;
                    else displayVal = customField.value !== '' && customField.value !== undefined ? String(customField.value) : '—';
                } else {
                    displayVal = isPV ? `${getDisplayValue("PV")} / ${getDisplayValue("PV_Max")}` : getDisplayValue(name as any);
                }

                return (
                    <div key={name} className={childClasses} style={isUnified ? {} : style}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center space-x-1 cursor-help">
                                    {isPV ? <Heart className="text-red-500" size={16} /> : <Shield className={isCustom ? "text-[color:var(--accent-brown)]" : "text-blue-500"} size={16} />}
                                    <span className="text-sm sm:text-base md:text-xl font-bold text-[color:var(--text-primary,#d4d4d4)] truncate max-w-[120px] sm:max-w-[200px]" title={isCustom ? label : undefined}>
                                        {isCustom ? `${label}: ${displayVal}` : displayVal}
                                    </span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                {isCustom ? (
                                    <p>Valeur personnalisée: {String(customField.value)}</p>
                                ) : (
                                    <>
                                        <p>Base: {selectedCharacter ? selectedCharacter[name as keyof Character] as number : 0}</p>
                                        <p>Inventaire: {categorizedBonuses ? categorizedBonuses[name as any]?.Inventaire || 0 : 0}</p>
                                        <p>Compétence: {categorizedBonuses ? categorizedBonuses[name as any]?.Competence || 0 : 0}</p>
                                    </>
                                )}
                            </TooltipContent>
                        </Tooltip>
                    </div>
                )
            })}
        </div>
    );
};

export const WidgetCombatStats: React.FC<WidgetProps & { fieldIds?: string[], layout?: 'horizontal' | 'vertical' | 'grid', styleOption?: 'separated' | 'unified', justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'stretch' }> = ({ style, fieldIds = ['Contact', 'Distance', 'Magie'], layout = 'grid', styleOption = 'separated', justify = 'center' }) => {
    const { selectedCharacter, getDisplayValue, categorizedBonuses } = useCharacter();

    const isUnified = styleOption === 'unified';
    const gapClass = isUnified ? '' : 'gap-1';

    let containerClassName = '';
    if (layout === 'grid') {
        containerClassName = `grid grid-cols-3 ${gapClass} h-full p-1`;
    } else if (layout === 'vertical') {
        if (justify === 'stretch') containerClassName = `flex flex-col items-stretch ${gapClass} flex-1 h-full overflow-y-auto p-1`;
        else if (justify === 'between' || justify === 'around') containerClassName = `flex flex-col justify-${justify} items-stretch ${gapClass} flex-1 h-full overflow-y-auto p-1`;
        else containerClassName = `flex flex-col justify-start items-${justify} ${gapClass} flex-1 h-full overflow-y-auto p-1`;
    } else {
        if (justify === 'stretch') containerClassName = `grid ${gapClass} flex-1 h-full p-1`;
        else containerClassName = `flex flex-row flex-wrap justify-${justify} items-stretch ${gapClass} flex-1 h-full overflow-y-auto p-1`;
    }

    const containerStyle = (layout === 'horizontal' && justify === 'stretch')
        ? { gridTemplateColumns: `repeat(${fieldIds.length}, minmax(0, 1fr))` }
        : undefined;

    const unifiedContainerClasses = isUnified ? 'bg-[#2a2a2a] rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] overflow-hidden' : '';

    return (
        <div className={`${containerClassName} ${unifiedContainerClasses}`} style={containerStyle}>
            {fieldIds.map((name) => {
                const customField = selectedCharacter?.customFields?.find(f => f.id === name);
                const isCustom = !!customField;
                const label = isCustom ? customField.label : name;

                let valueStr: string | number;
                if (isCustom) {
                    if (customField.type === 'boolean') valueStr = customField.value ? '✓' : '✗';
                    else if (customField.type === 'percent') valueStr = `${customField.value}%`;
                    else valueStr = customField.value !== '' && customField.value !== undefined ? String(customField.value) : '—';
                } else {
                    valueStr = getDisplayValue(name as any);
                }

                const childClasses = isUnified
                    ? "p-1 text-center h-full flex flex-col justify-center overflow-hidden min-h-[50px]"
                    : "bg-[#2a2a2a] p-1 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] text-center h-full flex flex-col justify-center overflow-hidden min-h-[50px]";

                return (
                    <Tooltip key={name}>
                        <TooltipTrigger asChild>
                            <div className={childClasses} style={isUnified ? {} : style}>
                                <h3 className="text-[10px] sm:text-xs md:text-sm font-semibold text-[color:var(--text-secondary,#c0a0a0)] mb-0.5 truncate" title={label}>{label}</h3>
                                <span className="text-base sm:text-lg md:text-xl font-bold text-[color:var(--text-primary,#d4d4d4)] leading-none">{valueStr}</span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            {isCustom ? (
                                <p>Valeur personnalisée: {String(customField.value)}</p>
                            ) : (
                                <>
                                    <p>Base: {selectedCharacter ? (selectedCharacter[name as keyof Character] as number) : 0}</p>
                                    <p>Inventaire: {categorizedBonuses ? categorizedBonuses[name as any]?.Inventaire || 0 : 0}</p>
                                    <p>Compétence: {categorizedBonuses ? categorizedBonuses[name as any]?.Competence || 0 : 0}</p>
                                </>
                            )}
                        </TooltipContent>
                    </Tooltip>
                )
            })}
        </div>
    );
};


interface WidgetCustomGroupProps extends WidgetProps {
    label?: string;
    fieldIds?: string[];
    layout?: 'horizontal' | 'vertical' | 'grid';
    styleOption?: 'separated' | 'unified';
    justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'stretch';
}

export const WidgetCustomGroup: React.FC<WidgetCustomGroupProps> = ({ style, label, fieldIds = [], layout = 'horizontal', styleOption = 'separated', justify = 'center' }) => {
    const { selectedCharacter, getDisplayValue, getDisplayModifier } = useCharacter();

    if (!selectedCharacter) return null;

    const baseStatsKeys = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA', 'Defense', 'Contact', 'Magie', 'Distance', 'INIT', 'PV', 'PV_Max'];

    const resolvedFields = fieldIds.map((id: string) => {
        // Check if it's a base stat
        if (baseStatsKeys.includes(id)) {
            const isAbility = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].includes(id);
            return {
                id,
                label: id,
                value: isAbility ? getDisplayModifier(id as any) : getDisplayValue(id as any),
                secondaryValue: (selectedCharacter as any)[id],
                type: 'number' as const,
                hasModifier: isAbility
            };
        }
        // Otherwise look in custom fields
        const customField = selectedCharacter.customFields?.find(f => f.id === id);
        if (customField) {
            return {
                ...customField,
                secondaryValue: null
            };
        }
        return null;
    }).filter((f): f is Exclude<typeof f, null> => f !== null);

    if (resolvedFields.length === 0) return null;

    const getFieldModifier = (val: number) => Math.floor((val - 10) / 2);
    const fmtMod = (m: number) => (m >= 0 ? `+${m}` : `${m}`);

    const isUnified = styleOption === 'unified';
    const gapClass = isUnified ? '' : 'gap-1';

    let containerClassName = '';
    if (layout === 'grid') {
        containerClassName = `grid grid-cols-2 sm:grid-cols-3 ${gapClass} flex-1 h-full overflow-y-auto`;
    } else if (layout === 'vertical') {
        if (justify === 'stretch') containerClassName = `flex flex-col items-stretch ${gapClass} flex-1 h-full overflow-y-auto`;
        else if (justify === 'between' || justify === 'around') containerClassName = `flex flex-col justify-${justify} items-stretch ${gapClass} flex-1 h-full overflow-y-auto`;
        else containerClassName = `flex flex-col justify-start items-${justify} ${gapClass} flex-1 h-full overflow-y-auto`;
    } else {
        if (justify === 'stretch') containerClassName = `grid ${gapClass} flex-1 h-full`;
        else containerClassName = `flex flex-row flex-wrap justify-${justify} items-stretch ${gapClass} flex-1 h-full overflow-y-auto`;
    }

    const containerStyle = (layout === 'horizontal' && justify === 'stretch')
        ? { gridTemplateColumns: `repeat(${resolvedFields.length}, minmax(0, 1fr))` }
        : undefined;

    const unifiedContainerClasses = isUnified ? 'bg-[#2a2a2a] rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] overflow-hidden' : '';

    return (
        <div className="flex flex-col h-full p-1 justify-center">
            {label && (
                <div className="text-[9px] font-bold text-[#d4b48f] uppercase tracking-widest text-center mb-1 opacity-70">
                    {label}
                </div>
            )}
            <div className={`flex-1 flex flex-col h-full overflow-hidden ${unifiedContainerClasses}`}>
                <div className={containerClassName} style={containerStyle}>
                    {resolvedFields.map((field) => {
                        const isBaseAbility = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].includes(field.id);

                        let displayValue: string;
                        let mod: number | null = null;

                        if (isBaseAbility) {
                            mod = field.value as number;
                            displayValue = String(field.secondaryValue || 0);
                        } else {
                            const numVal = typeof field.value === 'number' ? field.value : parseFloat(field.value as string) || 0;
                            mod = field.hasModifier && field.type === 'number' ? getFieldModifier(numVal) : null;

                            if (field.type === 'boolean') displayValue = field.value ? '✓' : '✗';
                            else if (field.type === 'percent') displayValue = `${field.value}%`;
                            else displayValue = field.value !== '' && field.value !== undefined ? String(field.value) : '—';
                        }

                        const childClasses = isUnified
                            ? "p-1 text-center h-full flex flex-col justify-center items-center overflow-hidden min-h-[50px]"
                            : "bg-[#2a2a2a] p-1 rounded-[length:var(--block-radius,0.5rem)] border border-[#3a3a3a] text-center h-full flex flex-col justify-center items-center overflow-hidden min-h-[50px]";

                        return (
                            <div
                                key={field.id}
                                className={childClasses}
                                style={isUnified ? {} : style}
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

export function GroupCreationSection({
    handleAddWidget,
    customFields,
    baseType = "custom_group",
    initialLabel = '',
    initialFieldIds = [],
    layout: initialLayout = 'horizontal',
    styleOption: initialStyleOption = 'separated',
    justify: initialJustify = 'center',
    mode = 'create'
}: {
    handleAddWidget: (id: string) => void,
    customFields: CustomField[],
    baseType?: string,
    initialLabel?: string,
    initialFieldIds?: string[],
    layout?: 'horizontal' | 'vertical' | 'grid',
    styleOption?: 'separated' | 'unified',
    justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'stretch',
    mode?: 'create' | 'edit'
}) {
    const [label, setLabel] = useState(initialLabel);
    const [selectedIds, setSelectedIds] = useState<string[]>(initialFieldIds);
    const [layout, setLayout] = useState<'horizontal' | 'vertical' | 'grid'>(initialLayout || 'horizontal');
    const [styleOption, setStyleOption] = useState<'separated' | 'unified'>(initialStyleOption || 'separated');
    const [justify, setJustify] = useState<'start' | 'center' | 'end' | 'between' | 'around' | 'stretch'>(initialJustify || 'center');

    const toggleId = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const handleAction = () => {
        if (selectedIds.length === 0) {
            alert("Veuillez sélectionner au moins un attribut.");
            return;
        }
        const finalLabel = label.trim() || 'Attributs';

        let idToSave = `${baseType}:${finalLabel}:${selectedIds.join(',')}:${layout}:${styleOption}:${justify}`;

        // Use default behavior for baseType if no label or specific conditions are met
        if (baseType !== 'custom_group' && finalLabel === '') {
            idToSave = `${baseType}::${selectedIds.join(',')}:${layout}:${styleOption}:${justify}`;
        }

        handleAddWidget(idToSave);

        if (mode === 'create') {
            setLabel('');
            setSelectedIds([]);
            setLayout('horizontal');
            setStyleOption('separated');
            setJustify('center');
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

            <div className="flex gap-1 mt-1">
                {(['horizontal', 'vertical', 'grid'] as const).map(l => (
                    <button
                        key={l}
                        type="button"
                        onClick={() => setLayout(l)}
                        className={`flex-1 py-1 text-[9px] uppercase font-bold border rounded transition-all ${layout === l
                            ? 'bg-[var(--accent-brown)] text-black border-[var(--accent-brown)]'
                            : 'bg-[#141414] text-gray-500 border-[#3a3a3a] hover:border-gray-500'
                            }`}
                    >
                        {l}
                    </button>
                ))}
            </div>

            <div className="flex gap-1 mt-1">
                <button
                    type="button"
                    onClick={() => setStyleOption('separated')}
                    className={`flex-1 py-1 text-[9px] uppercase font-bold border rounded transition-all ${styleOption === 'separated'
                        ? 'bg-[var(--accent-brown)] text-black border-[var(--accent-brown)]'
                        : 'bg-[#141414] text-gray-500 border-[#3a3a3a] hover:border-gray-500'
                        }`}
                >
                    Séparé
                </button>
                <button
                    type="button"
                    onClick={() => setStyleOption('unified')}
                    className={`flex-1 py-1 text-[9px] uppercase font-bold border rounded transition-all ${styleOption === 'unified'
                        ? 'bg-[var(--accent-brown)] text-black border-[var(--accent-brown)]'
                        : 'bg-[#141414] text-gray-500 border-[#3a3a3a] hover:border-gray-500'
                        }`}
                >
                    Lié (Sans bordure)
                </button>
            </div>

            {layout !== 'grid' && (
                <div className="flex gap-1 mt-1 flex-wrap">
                    {(['start', 'center', 'end', 'between', 'around', 'stretch'] as const).map(j => (
                        <button
                            key={j}
                            type="button"
                            onClick={() => setJustify(j)}
                            className={`flex flex-1 items-center justify-center py-1 text-[8px] uppercase font-bold border rounded transition-all ${justify === j
                                ? 'bg-[var(--accent-brown)] text-black border-[var(--accent-brown)]'
                                : 'bg-[#141414] text-gray-500 border-[#3a3a3a] hover:border-gray-500'
                                }`}
                            title={j === 'stretch' ? 'Remplir' : j === 'start' ? 'Gauche/Haut' : j === 'end' ? 'Droite/Bas' : j === 'center' ? 'Centre' : j === 'between' ? 'Espace entre' : 'Espace autour'}
                        >
                            {j === 'stretch' ? 'Fill' : j}
                        </button>
                    ))}
                </div>
            )}

            <div className="max-h-[150px] overflow-y-auto space-y-1 mt-1 scrollbar-thin scrollbar-thumb-[#3a3a3a] scrollbar-track-transparent">
                <div className="text-[9px] font-bold text-gray-500 uppercase px-2 mb-1">Attributs de base</div>
                {['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA', 'Defense', 'Contact', 'Magie', 'Distance', 'INIT', 'PV', 'PV_Max'].map(id => (
                    <label key={id} className="flex items-center gap-2 px-2 py-1 hover:bg-[#2a2a2a] rounded cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(id)}
                            onChange={() => toggleId(id)}
                            className="accent-[var(--accent-brown)]"
                        />
                        <span className="text-[11px] text-[#a0a0a0] group-hover:text-white truncate">{id}</span>
                    </label>
                ))}

                <div className="text-[9px] font-bold text-gray-500 uppercase px-2 mt-2 mb-1 border-t border-[#2a2a2a] pt-2">Champs Personnalisés</div>
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
                    <div className="text-[10px] text-[#555] italic px-2">Aucun attribut personnalisé</div>
                )}
            </div>
            <button
                type="button"
                onClick={handleAction}
                disabled={selectedIds.length === 0}
                className="w-full py-1.5 bg-[var(--accent-brown)] text-black rounded text-[10px] font-bold uppercase mt-1 hover:bg-[var(--accent-brown-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
                {mode === 'edit' ? 'Enregistrer' : 'Créer le bloc'}
            </button>
        </div>
    );
}
