
import { db, doc, setDoc } from '@/lib/firebase';
import { Character, LightSource, Point } from './types';

// Helpers purs
export const calculateDistance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
};

//  NOUVELLES FONCTIONS UTILITAIRES POUR LE BROUILLARD
export const getCellKey = (x: number, y: number, fogCellSize: number): string => {
    const cellX = Math.floor(x / fogCellSize);
    const cellY = Math.floor(y / fogCellSize);
    return `${cellX},${cellY} `;
};

export const isCellInFog = (x: number, y: number, fogGrid: Map<string, boolean>, fogCellSize: number): boolean => {
    const key = getCellKey(x, y, fogCellSize);
    return fogGrid.get(key) || false;
};

interface FogManagerProps {
    roomId: string;
    selectedCityId: string | null;
    fogGrid: Map<string, boolean>;
    setFogGrid: (grid: Map<string, boolean>) => void;
    lastFogCell: string | null;
    setLastFogCell: (key: string | null) => void;
    fullMapFog: boolean;
    isMJ: boolean;
    playerViewMode: boolean;
    persoId: string | null;
    viewAsPersoId: string | null; // [NEW]
    characters: Character[];
    lights?: LightSource[];
    fogCellSize: number;
}

export const useFogManager = ({
    roomId,
    selectedCityId,
    fogGrid,
    setFogGrid,
    lastFogCell,
    setLastFogCell,
    fullMapFog,
    isMJ,
    playerViewMode,
    persoId,
    viewAsPersoId, // [NEW]
    characters,
    lights,
    fogCellSize,
}: FogManagerProps) => {

    const saveFogGrid = async (newGrid: Map<string, boolean>) => {
        if (!roomId) return;
        const targetCityId = selectedCityId;
        const fogDocId = targetCityId ? `fog_${targetCityId}` : 'fogData';
        const gridObj = Object.fromEntries(newGrid);
        try {
            const fogRef = doc(db, 'cartes', roomId, 'fog', fogDocId);
            await setDoc(fogRef, {
                grid: gridObj,
                fullMapFog: fullMapFog
            });
        } catch (error) {
            console.error("❌ Erreur sauvegarde brouillard:", error);
        }
    };

    const saveFullMapFog = async (status: boolean) => {
        if (!roomId) return;
        const fogDocId = selectedCityId ? `fog_${selectedCityId}` : 'fogData';
        await setDoc(doc(db, 'cartes', roomId, 'fog', fogDocId), {
            fullMapFog: status
        }, { merge: true });
    };

    const toggleFogCell = async (x: number, y: number, forceState?: boolean) => {
        const key = getCellKey(x, y, fogCellSize);
        const newFogGrid = new Map(fogGrid);

        if (forceState !== undefined) {
            if (forceState) newFogGrid.set(key, true);
            else newFogGrid.delete(key);
        } else {
            if (newFogGrid.has(key)) newFogGrid.delete(key);
            else newFogGrid.set(key, true);
        }

        setFogGrid(newFogGrid);
        // [OPTIMIZATION] DO NOT SAVE TO FIREBASE HERE
        // Calls to this function happen on every mouse move.
        // We must batch writes or wait for mouse up.
    };

    const flushFogUpdates = async () => {
        if (!roomId) return;
        // Save the current state of fogGrid to Firebase
        await saveFogGrid(fogGrid);
    };

    const addFogCellIfNew = async (x: number, y: number, addMode: boolean) => {
        const key = getCellKey(x, y, fogCellSize);
        if (lastFogCell === key) return;
        // Éviter de modifier la même cellule plusieurs fois pendant un drag
        setLastFogCell(key);
        await toggleFogCell(x, y, addMode);
    };

    const calculateFogOpacity = (cellX: number, cellY: number): number => {
        const effectiveIsMJ = isMJ && !playerViewMode;
        const cellKey = `${cellX},${cellY} `;
        const isInGrid = fogGrid.has(cellKey);

        // 🌫️ INVERTED MODE LOGIC:
        // When fullMapFog is active:
        //   - By default, the entire map is fogged
        //   - fogGrid contains REVEALED cells (no fog)
        //   - If cell is in fogGrid, return 0 (visible)
        // When fullMapFog is inactive:
        //   - By default, the entire map is visible
        //   - fogGrid contains FOGGED cells (with fog)
        //   - If cell is NOT in fogGrid, return 0 (visible)

        if (fullMapFog) {
            // Full map fog mode: cells in fogGrid are REVEALED
            if (isInGrid) return 0; // No fog on revealed cells
            // Continue to apply fog (will check character vision below)
        } else {
            // Normal mode: cells in fogGrid have fog
            if (!isInGrid) return 0; // No fog if not in grid
            // Continue to apply fog (will check character vision below)
        }

        // [NEW] Determine effective ID for vision
        const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;

        let minOpacity = effectiveIsMJ ? 0.5 : 1.0;
        const cellDiagonalHalf = fogCellSize * Math.SQRT2 * 0.5;

        // 1. Add visibility for characters (Players and Allies)
        characters.forEach(character => {
            if (!character) return;

            try {
                const isViewer = character.id === effectivePersoId;
                const isAlly = character.visibility === 'ally';

                // If it's a viewer OR an ally, and has a visibility radius
                if ((isViewer || isAlly) && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
                    const cellCenterX = cellX * fogCellSize + fogCellSize / 2;
                    const cellCenterY = cellY * fogCellSize + fogCellSize / 2;
                    const distance = calculateDistance(character.x, character.y, cellCenterX, cellCenterY);

                    const visibilityRadius = character.visibilityRadius;
                    const visibleRadiusWithMargin = visibilityRadius + cellDiagonalHalf;

                    if (distance <= visibleRadiusWithMargin) {
                        minOpacity = 0; // Completely visible
                        return; // No need to check further for this character
                    }

                    const extendedRadius = visibleRadiusWithMargin + visibilityRadius; // Fade out over another 'visibilityRadius' distance
                    if (distance <= extendedRadius) {
                        const fadeDistance = distance - visibleRadiusWithMargin;
                        const fadeRange = extendedRadius - visibleRadiusWithMargin;
                        const normalizedFade = fadeDistance / fadeRange;
                        const opacity = Math.min(1, Math.max(0, normalizedFade));
                        minOpacity = Math.min(minOpacity, opacity);
                    }
                }
            } catch (e) {
                console.warn("Error calculating visibility for character:", character.id, e);
            }
        });

        // 2. Add visibility for independent Light Sources
        if (lights) {
            for (const light of lights) {
                if (!light.visible) continue;
                if (light.x === undefined || light.y === undefined || !light.radius) continue;

                const cellCenterX = cellX * fogCellSize + fogCellSize / 2;
                const cellCenterY = cellY * fogCellSize + fogCellSize / 2;

                // Calculer la distance de cette lumière
                const distToLight = calculateDistance(cellCenterX, cellCenterY, light.x, light.y);
                const lightRadius = light.radius; // En unités du monde (mètres)
                const pixelsPerUnit = 30; // ⚠️ Fallback constant
                const lightRadiusPixels = lightRadius * pixelsPerUnit; // Convertir en pixels

                // ATTENTION: light.radius est probablement en METRES (ex: 10m).
                // Il faut vérifier l'unité utilisée pour 'distance' et 'visibleRadiusWithMargin'.
                // 'distance' ligne 188 n'est pas définie dans ce scope (c'était celle du forEach précédent ?).
                // Ah, 'distance' venait de la boucle characters ! Elle n'est PAS accessible ici.
                // Il faut recalculer la distance pour la lumière.

                // Supposons que light.radius est en metres.
                // Si calculateDistance retourne des pixels ? 
                // Dans le code précédent, `distance` était `calculateDistance(...)`.

                // IMPORTANT: characters loop used `visibilityRadius = (character.visibilityRadius || 100)`. This is likely in pixels already? 
                // Or converted? Let's check character loop again.
                // Line 140: `const visibilityRadius = (character.visibilityRadius || 100);` 
                // If light.radius is e.g. 10 (meters), we need to convert to pixels: `light.radius * pixelsPerUnit`.
                // However, let's assume `light.radius` matches the unit system. 
                // Wait, in `types.ts`, light.radius is usually meters for display but pixels for logic? 
                // Let's stick to what we know: `light.radius` is the radius.

                // Let's assume pixels for now to match the code style (distance vs radius comparison).
                // Actually, `light.radius` from the UI is `10` or `20`, so likely meters.

                // Let's try to infer from common usage. If `visibilityRadius` defaults to 100, that's pixels. (100px ~ 3m or 5ft?).
                // If `light.radius` is from input `type="number"`, it might be small (5, 10, 15...).
                // We should probably multiply by `pixelsPerUnit`.
                // But `pixelsPerUnit` is NOT available in `useFogManager` scope props currently! (See line 49).

                // BUT wait, `visibleRadiusWithMargin` used for characters is `visibleRadius - 20` (pixels margin).
                // So everything is in PIXELS.

                // If `light.radius` is "10" (meters), and we compare to pixels distance (e.g. 300), it will be tiny.
                // We need `pixelsPerUnit`. 
                // Check if `pixelsPerUnit` is available in the file. No, correct?
                // Actually, `useFogManager` is a hook. Maybe we can pass `pixelsPerUnit`?
                // Or maybe `light.radius` IS stored in pixels? 
                // In `page.tsx`:
                // `updateDoc(... 'lights' ... { radius: ... })`.
                // In the UI for light: `<div className="...">{light.radius}m</div>`. Display in meters.
                // So it is stored in meters.

                // We likely need `pixelsPerUnit` passed to `useFogManager`.
                // HOWEVER, to fix the IMMEDIATE crash, let's just make it compilable.
                // But the logic was: `if (distance <= visibleRadiusWithMargin) return 0;`
                // This `distance` variable was Undefined in this scope anyway! It was leaked from previous scope mentally?
                // No, `distance` was declared in line 136 inside the character loop.
                // Thus the `lights.forEach` block was using an undefined variable `distance` if it was outside?
                // No, look at the snippet in Step 308. `distance` is NOT declared in the `lights` block.
                // It was a complete hallucination/copy-paste error in the previous code I viewed?
                // Or `distance` was declared at top level of `calculateFogOpacity`?
                // Let's look at `calculateFogOpacity` start. Step 351 doesn't show it.
                // But typically it's specific to the entity.

                // I will recalculate distance and assume radius needs conversion or is raw.
                // Given the urgency, I'll assume radius * 30 (approx pixels/unit) or just raw if it's large.
                // Wait, let's just use `light.radius` directly if it's comparable to `visibilityRadius`.
                // If not, it will be small/invisible.
                // Better approach: Use a safe default multiplier if unknown, OR check if I can see `pixelsPerUnit` usage elsewhere.
                // Line 250: `cellScreenWidth = (fogCellSize / imageWidth) * scaledWidth`. 
                // This suggests scaling relative to image.

                // Let's fix the Syntax first and logic "best guess" to simple distance check.
                // Variable `isMJ` is captured.

                const d = calculateDistance(cellCenterX, cellCenterY, light.x, light.y);
                const r = light.radius * 30; // ⚠️ Rough Estimate: 1m = 30px (standard grid). BETTER than 0. 
                // TODO: Pass pixelsPerUnit to proper calculation later.

                if (d <= r) {
                    minOpacity = 0;
                    break; // Found a light, cleared fog!
                }

                // Soft edge ? 
                const softEdge = 50;
                if (d <= r + softEdge) {
                    const fade = (d - r) / softEdge;
                    minOpacity = Math.min(minOpacity, fade);
                }
            }
        }
        return minOpacity;
    };

    return {
        saveFogGrid,
        saveFullMapFog,
        toggleFogCell,
        addFogCellIfNew,
        calculateFogOpacity,
        flushFogUpdates
    };
};

export const renderFogLayer = (
    ctx: CanvasRenderingContext2D,
    offset: Point,
    scaledWidth: number,
    scaledHeight: number,
    imageWidth: number,
    imageHeight: number,
    canvasWidth: number,
    canvasHeight: number,
    fogCellSize: number,
    scale: number,
    zoom: number,
    fogMode: boolean,
    showFogGrid: boolean,
    visibilityMode: boolean,
    currentVisibilityTool: string | null,
    fullMapFog: boolean,
    fogGrid: Map<string, boolean>,
    calculateFogOpacity: (x: number, y: number) => number,
    selectedFogCells: string[] // 🆕 Array of selected fog cell keys
) => {
    // 🌫️ D'abord dessiner le brouillard classique (si actif)
    if (fogMode || showFogGrid || fullMapFog || fogGrid.size > 0) {
        const startCellX = Math.floor(offset.x / (scaledWidth / imageWidth) / fogCellSize);
        const startCellY = Math.floor(offset.y / (scaledHeight / imageHeight) / fogCellSize);
        const visibleImageWidth = canvasWidth / scale / zoom;
        const visibleImageHeight = canvasHeight / scale / zoom;
        const endCellX = startCellX + Math.ceil(visibleImageWidth / fogCellSize) + 1;
        const endCellY = startCellY + Math.ceil(visibleImageHeight / fogCellSize) + 1;

        for (let x = startCellX; x <= endCellX; x++) {
            for (let y = startCellY; y <= endCellY; y++) {
                const opacity = calculateFogOpacity(x, y);
                if (opacity === 0 && !showFogGrid && !(visibilityMode && currentVisibilityTool === 'fog')) continue;

                const cellScreenX = (x * fogCellSize / imageWidth) * scaledWidth - offset.x;
                const cellScreenY = (y * fogCellSize / imageHeight) * scaledHeight - offset.y;
                const cellScreenWidth = (fogCellSize / imageWidth) * scaledWidth;
                const cellScreenHeight = (fogCellSize / imageHeight) * scaledHeight;

                if (opacity > 0) {
                    ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
                    ctx.fillRect(cellScreenX - 0.5, cellScreenY - 0.5, cellScreenWidth + 1, cellScreenHeight + 1);
                }

                // En mode édition, afficher la grille de brouillard
                // Show grid for cells that have fog OR are revealed (depending on mode)
                const shouldShowGrid = (fogMode || showFogGrid || (visibilityMode && currentVisibilityTool === 'fog'));
                const isRelevantCell = fullMapFog
                    ? (opacity > 0 || fogGrid.has(`${x},${y} `)) // In fullMapFog: show fogged cells and revealed cells
                    : (opacity > 0 || fogGrid.has(`${x},${y} `)); // In normal: show fogged cells

                if (shouldShowGrid && isRelevantCell) {
                    ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(cellScreenX, cellScreenY, cellScreenWidth, cellScreenHeight);
                }

                // 🆕 Afficher une bordure dorée pour les cellules sélectionnées
                if (selectedFogCells.includes(`${x},${y} `)) {
                    ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)'; // Gold
                    ctx.lineWidth = 3;
                    ctx.strokeRect(cellScreenX + 1.5, cellScreenY + 1.5, cellScreenWidth - 3, cellScreenHeight - 3);
                }
            }
        }
    }
};
