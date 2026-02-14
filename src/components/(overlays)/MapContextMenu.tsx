"use client";

import React from 'react';
import { Component as CircularCommandMenu } from '@/components/ui/circular-command-menu';
import { Eye, EyeOff, MousePointer2, Users, Square, Scan, Grid, Cloud, Image as ImageIcon, Sparkles } from 'lucide-react';

import { useSettings } from '@/contexts/SettingsContext';
import { useGame } from '@/contexts/GameContext';
import { saveUserSettings } from '@/lib/saveSettings';

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
            onClick: () => {
                const newVal = !showCharBorders;
                setShowCharBorders(newVal);
                if (user?.uid) saveUserSettings(user.uid, { showCharBorders: newVal });
            }
        },
        {
            id: "my-cursor",
            label: showMyCursor ? "Masquer Mon Curseur" : "Montrer Mon Curseur",
            icon: showMyCursor ? <MousePointer2 size={20} /> : <EyeOff size={20} />,
            onClick: () => {
                const newVal = !showMyCursor;
                setShowMyCursor(newVal);
                if (user?.uid) saveUserSettings(user.uid, { showMyCursor: newVal });
            }
        },
        {
            id: "other-cursors",
            label: showOtherCursors ? "Masquer Autres" : "Voir Autres",
            icon: showOtherCursors ? <Users size={20} /> : <EyeOff size={20} />,
            onClick: () => {
                const newVal = !showOtherCursors;
                setShowOtherCursors(newVal);
                if (user?.uid) saveUserSettings(user.uid, { showOtherCursors: newVal });
            }
        },
        {
            id: "grid",
            label: showGrid ? "Masquer Grille" : "Afficher Grille",
            icon: <Grid size={20} />,
            onClick: () => {
                const newVal = !showGrid;
                setShowGrid(newVal);
                if (user?.uid) saveUserSettings(user.uid, { showGrid: newVal });
            }
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
