"use client";

import React from 'react';
import { useCharacter, Character } from '@/contexts/CharacterContext';
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
