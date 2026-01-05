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
        if (!fullMapFog && !fogGrid.has(`${cellX},${cellY}`)) return 0;

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
    calculateFogOpacity: (x: number, y: number) => number
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
                if ((fogMode || showFogGrid || (visibilityMode && currentVisibilityTool === 'fog')) &&
                    (opacity > 0 || fullMapFog || fogGrid.has(`${x},${y}`))) {
                    ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(cellScreenX, cellScreenY, cellScreenWidth, cellScreenHeight);
                }
            }
        }
    }
};
