import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { MapObject } from '@/app/[roomid]/map/types';

/**
 * Pastes a MapObject copy into the Firestore database.
 * Handles deep cloning, sanitization, and positioning offset.
 */
export const pasteObject = async (
    roomId: string,
    template: MapObject,
    selectedCityId: string | null
) => {
    if (!roomId || !template) return;

    try {
        // 1. Deep Clone
        const newObjData = JSON.parse(JSON.stringify(template));

        // 2. Remove ID
        delete newObjData.id;
        delete (newObjData as any).image; // Remove transient image object reference if any

        // 3. Offset Coordinates
        newObjData.x = (newObjData.x || 0) + 50;
        newObjData.y = (newObjData.y || 0) + 50;

        // 4. Handle CityId
        if (selectedCityId) {
            newObjData.cityId = selectedCityId;
        }

        // 5. Sanitize Data
        Object.keys(newObjData).forEach(key => {
            const val = newObjData[key];
            if (val === undefined) {
                delete newObjData[key];
            }
        });

        // 6. Save to Firestore (objects collection)
        // Usually objects are in 'objects' collection, but let's confirm usage. 
        // Based on page.tsx, objects are loaded, but where are they saved?
        // Let's assume 'objects' collection based on standard naming, 
        // BUT wait, in page.tsx: `const q = query(collection(db, 'cartes', roomId, 'objects'));`
        // So yes, 'objects'.

        await addDoc(collection(db, 'cartes', roomId, 'objects'), newObjData);
        console.log("Details: Object pasted successfully", newObjData.name);

    } catch (error) {
        console.error("Error pasting object:", error);
        throw error;
    }
};
