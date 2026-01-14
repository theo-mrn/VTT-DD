import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Character } from '@/app/[roomid]/map/types';

/**
 * Pastes a character copy into the Firestore database.
 * Handles deep cloning, sanitization, and multi-scene positioning.
 */
export const pasteCharacter = async (
    roomId: string,
    template: Character,
    selectedCityId: string | null
) => {
    if (!roomId || !template) return;

    // 🚫 Prevent copying Player Characters
    if (template.type === 'joueurs') {
        console.warn("Cannot duplicate Player Characters.");
        return;
    }

    try {
        // 1. Deep Clone to avoid reference issues
        const newCharData = JSON.parse(JSON.stringify(template));

        // 2. Remove ID to ensure a new one is generated
        delete newCharData.id;

        // 3. Offset Global Coordinates
        // (Used as fallback or for global map)
        newCharData.x = (newCharData.x || 0) + 50;
        newCharData.y = (newCharData.y || 0) + 50;

        // 4. Handle Positions Map (Multi-Scene)
        if (selectedCityId) {
            // Ensure positions object exists
            if (!newCharData.positions || typeof newCharData.positions !== 'object') {
                newCharData.positions = {};
            }

            // Force set the position for the current city
            newCharData.positions[selectedCityId] = {
                x: newCharData.x,
                y: newCharData.y
            };

            // Force set the cityId so it appears in the current scene
            newCharData.cityId = selectedCityId;
        }

        // 5. Sanitize Data
        // Handle image fields: strictly migrate to imageURL2 as requested
        let imageSource = (newCharData as any).imageURL2 || (newCharData as any).imageURL || (newCharData as any).imageUrl || (newCharData as any).image;

        // If it's an object (like {src: ...}), extract src
        if (imageSource && typeof imageSource === 'object') {
            imageSource = imageSource.src || imageSource.url || imageSource;
        }

        // Clean up all legacy fields
        delete (newCharData as any).image;
        delete (newCharData as any).imageUrl;
        delete (newCharData as any).imageURL;

        // Set valid source to imageURL2
        if (imageSource && typeof imageSource === 'string') {
            (newCharData as any).imageURL2 = imageSource;
        }

        Object.keys(newCharData).forEach(key => {
            const val = newCharData[key];

            // Remove undefined fields
            if (val === undefined) {
                delete newCharData[key];
            }
        });

        // 6. Handle Field Naming Mismatch (Nomperso vs name)
        // User explicitly stated "c'est Nomperso, pas name"
        // If we have 'name' but not 'Nomperso', copy it over.
        if (newCharData.name && !newCharData.Nomperso) {
            newCharData.Nomperso = newCharData.name;
        }
        // If the DB strictly wants Nomperso and NOT name, we could delete name, 
        // but typically keeping both is safer unless schema forbids it.
        // For now, ensuring Nomperso exists is the critical part.

        // 7. Save to Firestore
        await addDoc(collection(db, 'cartes', roomId, 'characters'), newCharData);
        console.log("Details: Character pasted successfully", newCharData.name || newCharData.Nomperso);

    } catch (error) {
        console.error("Error pasting character:", error);
        throw error;
    }
};
