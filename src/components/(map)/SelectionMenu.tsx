import React from 'react';
import { User, Box, Type, Pencil, BrickWall, Music } from 'lucide-react';

export type SelectionType = 'characters' | 'objects' | 'notes' | 'drawings' | 'obstacles' | 'musicZones';

export interface SelectionCandidates {
    characters: number[];
    objects: number[];
    notes: number[];
    drawings: number[];
    obstacles: string[];
    musicZones: string[];
}

interface SelectionMenuProps {
    position: { x: number; y: number };
    candidates: SelectionCandidates;
    onSelect: (type: SelectionType) => void;
    onCancel: () => void;
}

const getLabelAndIcon = (type: SelectionType, count: number) => {
    switch (type) {
        case 'characters':
            return { label: `${count} Personnage${count > 1 ? 's' : ''}`, icon: User, color: 'text-blue-400' };
        case 'objects':
            return { label: `${count} Objet${count > 1 ? 's' : ''}`, icon: Box, color: 'text-orange-400' };
        case 'notes':
            return { label: `${count} Note${count > 1 ? 's' : ''}`, icon: Type, color: 'text-yellow-400' };
        case 'drawings':
            return { label: `${count} Dessin${count > 1 ? 's' : ''}`, icon: Pencil, color: 'text-purple-400' };
        case 'obstacles':
            return { label: `${count} Obstacle${count > 1 ? 's' : ''}`, icon: BrickWall, color: 'text-red-400' };
        case 'musicZones':
            return { label: `${count} Zone${count > 1 ? 's' : ''} Audio`, icon: Music, color: 'text-fuchsia-400' };
    }
};

export const SelectionMenu: React.FC<SelectionMenuProps> = ({ position, candidates, onSelect, onCancel }) => {
    const options: SelectionType[] = [];
    if (candidates.characters.length > 0) options.push('characters');
    if (candidates.objects.length > 0) options.push('objects');
    if (candidates.notes.length > 0) options.push('notes');
    if (candidates.drawings.length > 0) options.push('drawings');
    if (candidates.obstacles.length > 0) options.push('obstacles');
    if (candidates.musicZones.length > 0) options.push('musicZones');

    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                onCancel();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onCancel]);

    return (
        <div
            ref={containerRef}
            className="fixed z-50 bg-black/90 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl p-2 min-w-[200px] animate-in fade-in zoom-in-95 duration-200"
            style={{ top: position.y, left: position.x }}
        >
            <div className="text-xs font-semibold text-white/50 px-2 py-1 mb-1 uppercase tracking-wider">
                Sélection multiple
            </div>
            <div className="space-y-1">
                {options.map((type) => {
                    const count = type === 'obstacles' ? candidates[type].length : candidates[type].length;
                    const { label, icon: Icon, color } = getLabelAndIcon(type, count);

                    return (
                        <button
                            key={type}
                            onClick={() => onSelect(type)}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-white/10 hover:text-white rounded-lg transition-colors group"
                        >
                            <div className={`p-1.5 rounded-md bg-white/5 group-hover:bg-white/10 transition-colors ${color}`}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <span className="font-medium">{label}</span>
                            <span className="ml-auto text-xs text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                                x{count}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
