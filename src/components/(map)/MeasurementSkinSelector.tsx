
import React from 'react';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export const FIREBALL_SKIN_OPTIONS = [
    { label: 'Explosion 1', value: 'Fireballs/explosion1.webm' },
    { label: 'Explosion 2', value: 'Fireballs/explosion2.webm' },
    { label: 'Explosion 3', value: 'Fireballs/explosion3.webm' },
    { label: 'Explosion 4', value: 'Fireballs/explosion4.webm' },
    { label: 'Explosion 5', value: 'Fireballs/explosion5.webm' },
    { label: 'Explosion 6', value: 'Fireballs/explosion6.webm' },
    { label: 'Explosion 7', value: 'Fireballs/explosion7.webm' },
    { label: 'Loop 1', value: 'Fireballs/loop1.webm' },
    { label: 'Loop 2', value: 'Fireballs/loop2.webm' },
    { label: 'Loop 3', value: 'Fireballs/loop3.webm' },
    { label: 'Loop 4', value: 'Fireballs/loop4.webm' },
    { label: 'Loop 5', value: 'Fireballs/loop5.webm' },
    { label: 'Loop 6', value: 'Fireballs/loop6.webm' },
    { label: 'Loop 7', value: 'Fireballs/loop7.webm' },
];

export const CONE_SKIN_OPTIONS = [
    { label: 'Cone 1', value: 'Cone/cone1.webm' },
    { label: 'Cone 2', value: 'Cone/cone2.webm' },
    { label: 'Cone 3', value: 'Cone/cone3.webm' },
    { label: 'Cone 4', value: 'Cone/cone4.webm' },
    { label: 'Cone 5', value: 'Cone/cone5.webm' },
    { label: 'Cone 6', value: 'Cone/cone6.webm' },
    { label: 'Cone 7', value: 'Cone/cone7.webm' },
    { label: 'Cone 8', value: 'Cone/cone8.webm' },
    { label: 'Cone 9', value: 'Cone/cone9.webm' },
    { label: 'Cone 10', value: 'Cone/cone10.webm' },
];

export const SKIN_OPTIONS = FIREBALL_SKIN_OPTIONS; // Default/Fallback

interface MeasurementSkinSelectorProps {
    selectedSkin: string;
    onSkinChange: (skin: string) => void;
    shape?: 'circle' | 'cone' | 'line' | 'cube';
}

export default function MeasurementSkinSelector({ selectedSkin, onSkinChange, shape = 'circle' }: MeasurementSkinSelectorProps) {
    let options = FIREBALL_SKIN_OPTIONS;
    if (shape === 'cone') options = CONE_SKIN_OPTIONS;

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0a0a0a]/90 backdrop-blur-xl border border-[#333] rounded-lg shadow-lg">
            <span className="text-[#c0a080] text-xs font-medium uppercase tracking-wider">Skin</span>
            <Select value={selectedSkin} onValueChange={onSkinChange}>
                <SelectTrigger className="w-[140px] bg-black/50 text-white border-white/10 h-7 text-xs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white">
                    <SelectGroup>
                        {options.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
}
