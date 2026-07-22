"use client";

import React, { useSyncExternalStore } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Character, Interaction, VendorInteraction, GameInteraction, LootInteraction, MapObject, LootItem } from '@/app/[roomid]/map/types';
import ShopComponent from '@/components/(interactions)/ShopComponent';
import LootComponent from '@/components/(interactions)/LootComponent';
import GameComponent from '@/components/(interactions)/GameComponent';
import InteractionConfigDialog from '@/components/(dialogs)/InteractionConfigDialog';
import { moduleRegistry } from '@/modules/registry';

interface InteractionLayerProps {
    roomId: string; // Made required as it's essential for updates
    isMJ: boolean;
    characters: Character[];
    activeInteraction: { interaction: VendorInteraction | GameInteraction | LootInteraction, host: Character | MapObject } | null;
    setActiveInteraction: (interaction: { interaction: VendorInteraction | GameInteraction | LootInteraction, host: Character | MapObject } | null) => void;
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

    // Jeux d'interaction fournis par le bundle actif (ex table de sabacc Star Wars). On s'abonne au
    // NUMÉRO DE VERSION du registry (valeur primitive stable) — getInteractionGames() reconstruit un
    // tableau neuf à chaque appel, l'utiliser comme snapshot ferait boucler useSyncExternalStore.
    useSyncExternalStore(
        (cb) => moduleRegistry.subscribe(cb),
        () => moduleRegistry.getSnapshot(),
        () => moduleRegistry.getSnapshot(),
    );
    const contributedGames = moduleRegistry.getInteractionGames();

    const handleUpdateInteraction = async (updatedInteraction: Interaction, hostId: string) => {
        if (!roomId) return;

        // Check if host is a Character
        const hostChar = characters.find(c => c.id === hostId);
        if (hostChar) {
            const currentInteractions = hostChar.interactions || [];
            const updatedInteractions = currentInteractions.map(i =>
                i.id === updatedInteraction.id ? updatedInteraction : i
            );

            const charRef = doc(db, 'cartes', roomId, 'characters', hostId);
            await updateDoc(charRef, { interactions: updatedInteractions });
        } else {
            // Assume host is a MapObject (for Loot)
            // For MapObjects, the "interaction" IS the object itself in a way, or we are updating its 'items' field.
            // But MapObject doesn't have 'interactions' array. It has direct 'items' and 'linkedId'.
            if (updatedInteraction.type === 'loot') {
                const objectRef = doc(db, 'cartes', roomId, 'objects', hostId);
                const items = (updatedInteraction as LootInteraction).items;

                // Objet ramassable (type 'item', posé via PlaceObjectModal "Objet ramassable")
                // entièrement vidé => il disparaît de la carte et le panneau de loot se ferme.
                // Un conteneur classique ('decors', ex coffre) vidé reste sur la carte (comportement
                // historique inchangé).
                const host = activeInteraction?.host;
                const isPickupObject = !!host && host.id === hostId && (host as MapObject).type === 'item';
                if (isPickupObject && items.length === 0) {
                    try {
                        await deleteDoc(objectRef);
                    } catch (error) {
                        console.error('[InteractionLayer] Échec suppression objet ramassé:', error);
                    }
                    setActiveInteraction(null);
                    return;
                }

                // We only update the specific loot fields
                // Filter out undefined values to avoid Firebase errors
                const updateData: any = { items };
                const linkedId = (updatedInteraction as LootInteraction).linkedId;
                if (linkedId !== undefined) {
                    updateData.linkedId = linkedId;
                }

                try {
                    await updateDoc(objectRef, updateData);
                } catch (error) {
                    console.error('[InteractionLayer] Échec mise à jour du loot de l\'objet:', error, updateData);
                }
            }
        }

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
                    vendor={activeInteraction.host as Character}
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
                    character={
                        characters.find(c => c.id === (viewAsPersoId || persoId)) ||
                        (('items' in activeInteraction.host) ? undefined : activeInteraction.host as Character)
                    }
                    isMJ={isMJ}
                    roomId={roomId}
                    onUpdateInteraction={(updated) => handleUpdateInteraction(updated, activeInteraction.host.id)}
                />
            )}

            {/* GAME INTERACTION — un gameType fourni par un bundle (ex 'sabacc') rend le composant
                contribué ; sinon l'échiquier historique */}
            {activeInteraction && activeInteraction.interaction.type === 'game' && (() => {
                const gameInteraction = activeInteraction.interaction as GameInteraction;
                const contributed = contributedGames.find((g) => g.id === gameInteraction.gameType);
                if (contributed) {
                    const GameUI = contributed.component;
                    return (
                        <GameUI
                            isOpen={!!activeInteraction}
                            onClose={() => setActiveInteraction(null)}
                            interactionId={gameInteraction.id}
                            interactionName={gameInteraction.name}
                            hostName={activeInteraction.host.name}
                            roomId={roomId}
                            currentPlayerId={persoId || undefined}
                            currentPlayerName={characters.find(c => c.id === persoId)?.name || undefined}
                            isMJ={isMJ}
                        />
                    );
                }
                return (
                    <GameComponent
                        isOpen={!!activeInteraction}
                        onClose={() => setActiveInteraction(null)}
                        interaction={gameInteraction}
                        gameHost={activeInteraction.host as Character}
                        roomId={roomId}
                        currentPlayerId={persoId || undefined}
                        isMJ={isMJ}
                        onUpdateInteraction={(updated) => handleUpdateInteraction(updated, activeInteraction.host.id)}
                    />
                );
            })()}

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
