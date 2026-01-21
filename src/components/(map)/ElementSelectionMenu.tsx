import React, { useRef, useEffect } from 'react';
import {
    Lightbulb,
    DoorOpen,
    Music,
    User,
    Box,
    MousePointer2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DetectedElement {
    id: string;
    type: 'light' | 'portal' | 'musicZone' | 'character' | 'object';
    name: string;
    position: { x: number; y: number };
    image?: string | null;
}

interface ElementSelectionMenuProps {
    elements: DetectedElement[];
    position: { x: number; y: number };
    onSelect: (element: DetectedElement) => void;
    onClose: () => void;
}

export default function ElementSelectionMenu({
    elements,
    position,
    onSelect,
    onClose
}: ElementSelectionMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Fermer si on clique en dehors
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    const getElementIcon = (type: DetectedElement['type']) => {
        switch (type) {
            case 'light': return <Lightbulb size={18} className="text-yellow-400" />;
            case 'portal': return <DoorOpen size={18} className="text-blue-400" />;
            case 'musicZone': return <Music size={18} className="text-purple-400" />;
            case 'character': return <User size={18} className="text-green-400" />;
            case 'object': return <Box size={18} className="text-orange-400" />;
            default: return <MousePointer2 size={18} className="text-gray-400" />;
        }
    };

    const getElementGradient = (type: DetectedElement['type']) => {
        switch (type) {
            case 'light': return 'hover:bg-yellow-500/10 hover:border-yellow-500/30';
            case 'portal': return 'hover:bg-blue-500/10 hover:border-blue-500/30';
            case 'musicZone': return 'hover:bg-purple-500/10 hover:border-purple-500/30';
            case 'character': return 'hover:bg-green-500/10 hover:border-green-500/30';
            case 'object': return 'hover:bg-orange-500/10 hover:border-orange-500/30';
            default: return 'hover:bg-gray-500/10 hover:border-gray-500/30';
        }
    };

    return (
        <AnimatePresence>
            {/* Conteneur de positionnement fixe sans animation */}
            <div
                className="fixed z-[9999]"
                style={{
                    left: `${position.x}px`,
                    top: `${position.y}px`,
                    // Pas de transform ici pour laisser le contrôle total, 
                    // mais on va centrer via le motion.div ou un wrapper
                    width: 0, height: 0, overflow: 'visible'
                }}
            >
                <motion.div
                    ref={menuRef}
                    initial={{ opacity: 0, scale: 0.9, y: 10, x: "-50%" }} // Centrage via x: -50%
                    animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
                    exit={{ opacity: 0, scale: 0.9, y: 10, x: "-50%" }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="absolute top-0 left-0 min-w-[240px] bg-[#1a1a1a]/95 backdrop-blur-xl border border-[#333] rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/5"
                    style={{
                        // Le transform est géré par motion (x: -50% équivaut à translate X)
                        // On ajoute un marginTop pour centrer verticalement ou décaler légèrement vers le bas pour ne pas cacher le curseur
                        marginTop: '10px'
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header stylisé */}
                    <div className="relative px-4 py-3 border-b border-white/5 bg-gradient-to-r from-white/5 to-transparent">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <MousePointer2 size={12} />
                            Sélectionner
                        </h3>
                    </div>

                    {/* Liste des éléments */}
                    <div className="p-2 space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                        {elements.map((element) => (
                            <motion.button
                                key={element.id}
                                whileHover={{ scale: 1.02, x: 2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelect(element);
                                }}
                                className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent transition-all duration-200 bg-[#252525]/50 ${getElementGradient(element.type)}`}
                            >
                                <div className={`h-10 w-10 min-h-[2.5rem] min-w-[2.5rem] flex items-center justify-center rounded-lg bg-[#1a1a1a] shadow-inner group-hover:scale-105 transition-transform duration-200 text-gray-300 overflow-hidden`}>
                                    {element.image ? (
                                        <img src={element.image} alt={element.name} className="w-full h-full object-cover" />
                                    ) : (
                                        getElementIcon(element.type)
                                    )}
                                </div>
                                <div className="flex flex-col items-start flex-1 overflow-hidden">
                                    <span className="text-sm font-medium text-gray-200 truncate w-full text-left group-hover:text-white transition-colors">
                                        {element.name}
                                    </span>
                                    <span className="text-[10px] text-gray-500 capitalize">
                                        {element.type === 'musicZone' ? 'Zone Musique' : element.type}
                                    </span>
                                </div>
                            </motion.button>
                        ))}
                    </div>

                    {/* Footer instructions */}
                    <div className="px-3 py-2 bg-[#151515] border-t border-white/5 flex justify-between items-center text-[10px] text-gray-500">
                        <span>{elements.length} éléments</span>
                        <span className="flex items-center gap-1">
                            <kbd className="font-sans px-1 py-0.5 bg-[#252525] rounded border border-[#333]">Echap</kbd>
                        </span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
