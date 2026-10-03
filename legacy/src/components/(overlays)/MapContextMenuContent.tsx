"use client";

import React from 'react';
import { EyeOff, MousePointer2, Users, Square, Scan, Grid, Image as ImageIcon, Sparkles, RefreshCw } from 'lucide-react';

import { useSettings } from '@/contexts/SettingsContext';
import { useMapReload } from '@/contexts/MapReloadContext';
import { moduleRegistry } from '@/modules/registry';
import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
} from '@/components/ui/context-menu';

interface MapContextMenuContentProps {
    isMJ: boolean;
    position: { x: number; y: number };
    showAllBadges?: boolean;
    onToggleBadges?: () => void;
}

const itemClass = "focus:bg-white/10 focus:text-white text-neutral-200 cursor-pointer";

export default function MapContextMenuContent({
    isMJ,
    position,
    showAllBadges = false,
    onToggleBadges,
}: MapContextMenuContentProps) {
    const reloadMap = useMapReload();
    const {
        showCharBorders, setShowCharBorders,
        showMyCursor, setShowMyCursor,
        showOtherCursors, setShowOtherCursors,
        showGrid, setShowGrid,
        setShowBackgroundSelector,
    } = useSettings();

    const ctx = { position, isMJ };

    const moduleItems = moduleRegistry.getContextMenuItems('map').flatMap(contribution =>
        contribution.items
            .filter(item => !item.condition || item.condition(ctx))
            .map(item => ({
                id: `module:${item.id}`,
                label: typeof item.label === 'function' ? item.label(ctx) : item.label,
                icon: item.icon as React.ReactElement,
                onClick: () => item.onClick(ctx),
            }))
    );

    return (
        <ContextMenuContent className="bg-neutral-900/95 border border-white/10 text-white shadow-xl backdrop-blur-sm min-w-[180px]">
            <ContextMenuItem className={itemClass} onClick={() => setShowCharBorders(!showCharBorders)}>
                {showCharBorders ? <Scan size={16} className="mr-2" /> : <Square size={16} className="mr-2" />}
                {showCharBorders ? 'Masquer Bordures' : 'Afficher Bordures'}
            </ContextMenuItem>

            <ContextMenuItem className={itemClass} onClick={() => setShowMyCursor(!showMyCursor)}>
                {showMyCursor ? <MousePointer2 size={16} className="mr-2" /> : <EyeOff size={16} className="mr-2" />}
                {showMyCursor ? 'Masquer Mon Curseur' : 'Montrer Mon Curseur'}
            </ContextMenuItem>

            <ContextMenuItem className={itemClass} onClick={() => setShowOtherCursors(!showOtherCursors)}>
                {showOtherCursors ? <Users size={16} className="mr-2" /> : <EyeOff size={16} className="mr-2" />}
                {showOtherCursors ? 'Masquer Autres' : 'Voir Autres'}
            </ContextMenuItem>

            <ContextMenuItem className={itemClass} onClick={() => setShowGrid(!showGrid)}>
                <Grid size={16} className="mr-2" />
                {showGrid ? 'Masquer Grille' : 'Afficher Grille'}
            </ContextMenuItem>

            {isMJ && (
                <>
                    <ContextMenuSeparator className="bg-white/10" />
                    <ContextMenuItem className={itemClass} onClick={() => onToggleBadges?.()}>
                        <Sparkles size={16} className="mr-2" />
                        {showAllBadges ? 'Masquer Badges' : 'Afficher Badges'}
                    </ContextMenuItem>
                    <ContextMenuItem className={itemClass} onClick={() => setShowBackgroundSelector(true)}>
                        <ImageIcon size={16} className="mr-2" />
                        Changer Fond
                    </ContextMenuItem>
                </>
            )}

            <ContextMenuSeparator className="bg-white/10" />
            <ContextMenuItem className={itemClass} onClick={reloadMap}>
                <RefreshCw size={16} className="mr-2" />
                Recharger la carte
            </ContextMenuItem>

            {moduleItems.length > 0 && (
                <>
                    <ContextMenuSeparator className="bg-white/10" />
                    {moduleItems.map(item => (
                        <ContextMenuItem key={item.id} className={itemClass} onClick={item.onClick}>
                            {item.icon && <span className="mr-2 [&>svg]:size-4">{item.icon}</span>}
                            {item.label}
                        </ContextMenuItem>
                    ))}
                </>
            )}
        </ContextMenuContent>
    );
}
