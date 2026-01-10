import { db, doc, setDoc } from '@/lib/firebase';
import { Character, Point } from './types';

// Helpers purs
export const calculateDistance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
};

// 🎯 NOUVELLES FONCTIONS UTILITAIRES POUR LE BROUILLARD
export const getCellKey = (x: number, y: number, fogCellSize: number): string => {
    const cellX = Math.floor(x / fogCellSize);
    const cellY = Math.floor(y / fogCellSize);
    return `${cellX},${cellY}`;
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
        const cellKey = `${cellX},${cellY}`;
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

        for (const character of characters) {
            // Check if this character should reveal fog:
            // 1. It is the effective user character
            // 2. OR it is an ally (always visible)
            // 3. AND it has a visibility radius and valid position
            const isViewer = character.id === effectivePersoId;
            const isAlly = character.visibility === 'ally';

            if ((isViewer || isAlly) && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
                const cellCenterX = cellX * fogCellSize + fogCellSize / 2;
                const cellCenterY = cellY * fogCellSize + fogCellSize / 2;
                const distance = calculateDistance(character.x, character.y, cellCenterX, cellCenterY);

                const visibilityRadius = character.visibilityRadius;
                const visibleRadiusWithMargin = visibilityRadius + cellDiagonalHalf;

                if (distance <= visibleRadiusWithMargin) return 0;

                const extendedRadius = visibleRadiusWithMargin + visibilityRadius;
                if (distance <= extendedRadius) {
                    const fadeDistance = distance - visibleRadiusWithMargin;
                    const fadeRange = extendedRadius - visibleRadiusWithMargin;
                    const normalizedFade = fadeDistance / fadeRange;
                    const opacity = Math.min(1, Math.max(0, normalizedFade));
                    minOpacity = Math.min(minOpacity, opacity);
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
                    ? (opacity > 0 || fogGrid.has(`${x},${y}`)) // In fullMapFog: show fogged cells and revealed cells
                    : (opacity > 0 || fogGrid.has(`${x},${y}`)); // In normal: show fogged cells

                if (shouldShowGrid && isRelevantCell) {
                    ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(cellScreenX, cellScreenY, cellScreenWidth, cellScreenHeight);
                }

                // 🆕 Afficher une bordure dorée pour les cellules sélectionnées
                if (selectedFogCells.includes(`${x},${y}`)) {
                    ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)'; // Gold
                    ctx.lineWidth = 3;
                    ctx.strokeRect(cellScreenX + 1.5, cellScreenY + 1.5, cellScreenWidth - 3, cellScreenHeight - 3);
                }
            }
        }
    }
};
