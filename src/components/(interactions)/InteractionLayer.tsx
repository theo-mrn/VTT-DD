"use client";

import React from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Character, Interaction, VendorInteraction, GameInteraction, LootInteraction } from '@/app/[roomid]/map/types';
import ShopComponent from '@/components/(interactions)/ShopComponent';
import LootComponent from '@/components/(interactions)/LootComponent';
import GameComponent from '@/components/(interactions)/GameComponent';
import InteractionConfigDialog from '@/components/(dialogs)/InteractionConfigDialog';

interface InteractionLayerProps {
    roomId: string; // Made required as it's essential for updates
    isMJ: boolean;
    characters: Character[];
    activeInteraction: { interaction: VendorInteraction | GameInteraction | LootInteraction, host: Character } | null;
    setActiveInteraction: (interaction: { interaction: VendorInteraction | GameInteraction | LootInteraction, host: Character } | null) => void;
    interactionConfigTarget: Character | null;
    setInteractionConfigTarget: (character: Character | null) => void;
    persoId: string | null;
    viewAsPersoId: string | null;
}

export default function InteractionLayer({
    roomId,
    isMJ,
    characters,
    activeInteraction,
    setActiveInteraction,
    interactionConfigTarget,
    setInteractionConfigTarget,
    persoId,
    viewAsPersoId
}: InteractionLayerProps) {

    const handleUpdateInteraction = async (updatedInteraction: Interaction, hostId: string) => {
        if (!roomId) return;

        const hostChar = characters.find(c => c.id === hostId);
        if (!hostChar) return;

        const currentInteractions = hostChar.interactions || [];
        const updatedInteractions = currentInteractions.map(i =>
            i.id === updatedInteraction.id ? updatedInteraction : i
        );

        const charRef = doc(db, 'cartes', roomId, 'characters', hostId);
        await updateDoc(charRef, { interactions: updatedInteractions });

        // Update active interaction if it's the one being modified
        if (activeInteraction && activeInteraction.interaction.id === updatedInteraction.id) {
            setActiveInteraction({ ...activeInteraction, interaction: updatedInteraction as any });
        }
    };

    return (
        <>
            {/* VENDOR INTERACTION */}
            {activeInteraction && activeInteraction.interaction.type === 'vendor' && (
                <ShopComponent
                    isOpen={!!activeInteraction}
                    onClose={() => setActiveInteraction(null)}
                    interaction={activeInteraction.interaction as VendorInteraction}
                    vendor={activeInteraction.host}
                    isMJ={isMJ}
                    onUpdateInteraction={(updated) => handleUpdateInteraction(updated, activeInteraction.host.id)}
                />
            )}

            {/* LOOT INTERACTION */}
            {activeInteraction && activeInteraction.interaction.type === 'loot' && (
                <LootComponent
                    isOpen={!!activeInteraction}
                    onClose={() => setActiveInteraction(null)}
                    interaction={activeInteraction.interaction as LootInteraction}
                    character={characters.find(c => c.id === (viewAsPersoId || persoId)) || activeInteraction.host}
                    isMJ={isMJ}
                    roomId={roomId}
                    onUpdateInteraction={(updated) => handleUpdateInteraction(updated, activeInteraction.host.id)}
                />
            )}

            {/* GAME INTERACTION */}
            {activeInteraction && activeInteraction.interaction.type === 'game' && (
                <GameComponent
                    isOpen={!!activeInteraction}
                    onClose={() => setActiveInteraction(null)}
                    interaction={activeInteraction.interaction as GameInteraction}
                    gameHost={activeInteraction.host}
                    roomId={roomId}
                    currentPlayerId={persoId || undefined}
                    isMJ={isMJ}
                    onUpdateInteraction={(updated) => handleUpdateInteraction(updated, activeInteraction.host.id)}
                />
            )}

            {/* CONFIG DIALOG (For creating NEW interactions) */}
            <InteractionConfigDialog
                isOpen={!!interactionConfigTarget}
                onClose={() => setInteractionConfigTarget(null)}
                currentInteraction={undefined} // Configuring NEW interactions primarily here
                onSave={async (interaction) => {
                    if (interactionConfigTarget && roomId) {
                        const charRef = doc(db, 'cartes', roomId, 'characters', interactionConfigTarget.id);
                        const currentInteractions = interactionConfigTarget.interactions || [];
                        await updateDoc(charRef, { interactions: [...currentInteractions, interaction] });
                    }
                }}
            />
        </>
    );
}
