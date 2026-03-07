"use client";

import React from 'react';
import { Component as CircularCommandMenu } from '@/components/ui/circular-command-menu';
import { Eye, EyeOff, MousePointer2, Users, Square, Scan, Grid, Cloud, Image as ImageIcon, Sparkles } from 'lucide-react';

import { useSettings } from '@/contexts/SettingsContext';
import { useGame } from '@/contexts/GameContext';
import { saveUserSettings } from '@/lib/saveSettings';
import { moduleRegistry } from '@/modules/registry';

interface MapContextMenuProps {
    position: { x: number, y: number } | null;
    onClose: () => void;
    isMJ: boolean;
    showAllBadges?: boolean;
    onToggleBadges?: () => void;
}

export default function MapContextMenu({
    position,
    onClose,
    isMJ,
    showAllBadges = false,
    onToggleBadges
}: MapContextMenuProps) {
    if (!position) return null;

    const { user } = useGame();
    const {
        showCharBorders, setShowCharBorders,
        showMyCursor, setShowMyCursor,
        showOtherCursors, setShowOtherCursors,
        showGrid, setShowGrid,
        setShowBackgroundSelector
    } = useSettings();

    const items = [
        {
            id: "borders",
            label: showCharBorders ? "Masquer Bordures" : "Afficher Bordures",
            icon: showCharBorders ? <Scan size={20} /> : <Square size={20} />,
            onClick: () => setShowCharBorders(!showCharBorders)
        },
        {
            id: "my-cursor",
            label: showMyCursor ? "Masquer Mon Curseur" : "Montrer Mon Curseur",
            icon: showMyCursor ? <MousePointer2 size={20} /> : <EyeOff size={20} />,
            onClick: () => setShowMyCursor(!showMyCursor)
        },
        {
            id: "other-cursors",
            label: showOtherCursors ? "Masquer Autres" : "Voir Autres",
            icon: showOtherCursors ? <Users size={20} /> : <EyeOff size={20} />,
            onClick: () => setShowOtherCursors(!showOtherCursors)
        },
        {
            id: "grid",
            label: showGrid ? "Masquer Grille" : "Afficher Grille",
            icon: <Grid size={20} />,
            onClick: () => setShowGrid(!showGrid)
        }
    ];

    if (isMJ) {
        items.push({
            id: "badges",
            label: showAllBadges ? "Masquer Badges" : "Afficher Badges",
            icon: <Sparkles size={20} />,
            onClick: () => {
                if (onToggleBadges) onToggleBadges();
            }
        });
        items.push({
            id: "background",
            label: "Changer Fond",
            icon: <ImageIcon size={20} />,
            onClick: () => setShowBackgroundSelector(true)
        });
    }

    // Module context menu items
    const ctx = { position, isMJ };
    for (const contribution of moduleRegistry.getContextMenuItems('map')) {
        for (const item of contribution.items) {
            if (item.condition && !item.condition(ctx)) continue;
            const label = typeof item.label === 'function' ? item.label(ctx) : item.label;
            items.push({
                id: `module:${item.id}`,
                label,
                icon: item.icon as React.ReactElement,
                onClick: () => item.onClick(ctx),
            });
        }
    }

    return (
        <div
            style={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                zIndex: 9999, // High z-index to stay on top
                transform: 'translate(-50%, -50%)' // Center exactly on click
            }}
        >
            <CircularCommandMenu
                open={true}
                onOpenChange={(open) => {
                    if (!open) onClose();
                }}
                items={items}
                radius={80} // Slightly smaller radius for context menu feel
                startAngle={0}
                endAngle={360}
                tooltipPlacement="top"
                buttonClassName=" text-white border border-white/20 h-10 w-10" // Smaller center button
                trigger={<span className="text-xl">×</span>} // Simple close X as trigger
            />
        </div>
    );
}
