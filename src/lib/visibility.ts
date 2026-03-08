/**
 * Dynamic Line-of-Sight (LoS) Visibility System
 * Implements shadow casting - obstacles block vision and create shadows behind them
 * Vision is infinite by default, only blocked by obstacles
 */

import { findClosedLoops } from './obstacle-utils';

export type Point = { x: number; y: number };

export type Segment = {
    p1: Point;
    p2: Point;
};

export type EdgeMeta = {
    type: 'wall' | 'one-way-wall' | 'door' | 'window';
    direction?: 'north' | 'south' | 'east' | 'west'; // Pour one-way-wall
    isOpen?: boolean; // Pour door
};

export type Obstacle = {
    id: string;
    type: 'wall' | 'rectangle' | 'polygon' | 'one-way-wall' | 'door' | 'window';
    points: Point[]; // Pour wall: [start, end], rectangle: [topLeft, bottomRight], polygon: [points...]
    color?: string;
    opacity?: number;

    // Propriétés pour les obstacles avancés
    direction?: 'north' | 'south' | 'east' | 'west'; // Pour murs à sens unique : direction bloquante
    isOpen?: boolean; // Pour portes : true = ouverte (pas de blocage), false = fermée (bloque)
    isLocked?: boolean; // Pour portes : true = verrouillée (joueurs ne peuvent pas interagir)
    doorWidth?: number; // Largeur visuelle de la porte (optionnel)

    // Mode ombre pour les murs d'une pièce fermée :
    // 'room' = assombrit l'intérieur seulement (défaut), 'individual' = chaque mur projette son ombre
    roomMode?: 'room' | 'individual';

    // Metadata par arête pour les polygons fermés (salle avec portes/murs à sens unique)
    // edges[i] décrit l'arête de points[i] à points[(i+1) % points.length]
    // Si absent, toutes les arêtes sont des murs (rétrocompatible)
    edges?: EdgeMeta[];
};

/**
 * Get all segments from obstacles
 */
export function getSegmentsFromObstacles(obstacles: Obstacle[]): Segment[] {
    const segments: Segment[] = [];

    for (const obstacle of obstacles) {
        if (obstacle.type === 'wall' && obstacle.points.length >= 2) {
            segments.push({ p1: obstacle.points[0], p2: obstacle.points[1] });
        } else if (obstacle.type === 'rectangle' && obstacle.points.length >= 2) {
            const [tl, br] = obstacle.points;
            const tr = { x: br.x, y: tl.y };
            const bl = { x: tl.x, y: br.y };
            segments.push({ p1: tl, p2: tr });
            segments.push({ p1: tr, p2: br });
            segments.push({ p1: br, p2: bl });
            segments.push({ p1: bl, p2: tl });
        } else if (obstacle.type === 'polygon' && obstacle.points.length >= 3) {
            for (let i = 0; i < obstacle.points.length; i++) {
                const next = (i + 1) % obstacle.points.length;
                segments.push({ p1: obstacle.points[i], p2: obstacle.points[next] });
            }
        }
    }

    return segments;
}

/**
 * Calculate the shadow polygon cast by a segment from a viewer's position
 * The shadow extends to the edge of the visible area (mapBounds)
 */
function calculateShadowPolygon(
    viewerPos: Point,
    segment: Segment,
    mapBounds: { width: number; height: number }
): Point[] {
    // Extend factor - how far the shadow extends (should reach map edges)
    const extendDistance = Math.max(mapBounds.width, mapBounds.height) * 2;

    // Calculate direction vectors from viewer to segment endpoints
    const dir1 = {
        x: segment.p1.x - viewerPos.x,
        y: segment.p1.y - viewerPos.y,
    };
    const dir2 = {
        x: segment.p2.x - viewerPos.x,
        y: segment.p2.y - viewerPos.y,
    };

    // Normalize and extend
    const len1 = Math.sqrt(dir1.x * dir1.x + dir1.y * dir1.y);
    const len2 = Math.sqrt(dir2.x * dir2.x + dir2.y * dir2.y);

    if (len1 < 0.001 || len2 < 0.001) return []; // Viewer is on the segment

    const extended1 = {
        x: segment.p1.x + (dir1.x / len1) * extendDistance,
        y: segment.p1.y + (dir1.y / len1) * extendDistance,
    };
    const extended2 = {
        x: segment.p2.x + (dir2.x / len2) * extendDistance,
        y: segment.p2.y + (dir2.y / len2) * extendDistance,
    };

    // The shadow polygon is: segment.p1 -> extended1 -> extended2 -> segment.p2
    return [segment.p1, extended1, extended2, segment.p2];
}

/**
 * Check if a segment is facing the viewer (we only cast shadows from segments facing away)
 */
function isSegmentFacingViewer(viewerPos: Point, segment: Segment): boolean {
    // Calculate the midpoint of the segment
    const midX = (segment.p1.x + segment.p2.x) / 2;
    const midY = (segment.p1.y + segment.p2.y) / 2;

    // Vector from midpoint to viewer
    const toViewer = {
        x: viewerPos.x - midX,
        y: viewerPos.y - midY,
    };

    // Normal of the segment (perpendicular)
    const segDir = {
        x: segment.p2.x - segment.p1.x,
        y: segment.p2.y - segment.p1.y,
    };
    const normal = { x: -segDir.y, y: segDir.x };

    // Dot product - if positive, the segment is facing the viewer
    const dot = toViewer.x * normal.x + toViewer.y * normal.y;

    return dot > 0;
}

/**
 * Check if the viewer is inside a closed polygon obstacle
 */
export function isViewerInsideObstacle(viewerPos: Point, obstacle: Obstacle): boolean {
    if (obstacle.type !== 'polygon' || obstacle.points.length < 3) {
        return false;
    }
    return isPointInPolygon(viewerPos, obstacle.points);
}

/**
 * Create a polygon that covers the entire map EXCEPT the given polygon
 * This is used when the viewer is inside a polygon to hide everything outside
 */
function createExteriorMask(
    polygonPoints: Point[],
    mapBounds: { width: number; height: number }
): Point[][] {
    // Create a large outer rectangle that covers the map bounds (with some margin)
    const margin = Math.max(mapBounds.width, mapBounds.height);
    const outer: Point[] = [
        { x: -margin, y: -margin },
        { x: mapBounds.width + margin, y: -margin },
        { x: mapBounds.width + margin, y: mapBounds.height + margin },
        { x: -margin, y: mapBounds.height + margin },
    ];

    // Return the outer rectangle and the inner polygon as separate shapes
    // The rendering will handle the "hole" by using canvas clipping or composite operations
    // For simplicity, we return this as two separate polygons - the outer mask will be drawn,
    // then the inner polygon will be "cut out" during rendering
    return [outer, polygonPoints];
}

/**
 * Check if a one-way wall blocks vision from the viewer's position
 * One-way walls only block vision from one side based on their direction
 */
// Helper pour savoir si un viewer est du côté bloqué d'un mur à sens unique
// Utilise la géométrie vectorielle précise (produit scalaire) pour gérer tous les angles
function isViewerBlockedByOneWayWall(
    viewerPos: Point,
    wallSegment: Segment,
    direction: 'north' | 'south' | 'east' | 'west'
): boolean {
    const p1 = wallSegment.p1;
    const p2 = wallSegment.p2;

    // 1. Calculer le centre du mur
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    // 2. Calculer le vecteur Mur -> Viewer
    const vx = viewerPos.x - midX;
    const vy = viewerPos.y - midY;

    // 3. Calculer la normale du mur (Flèche visuelle)
    // Vecteur Mur
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return false;

    // Normale par défaut
    // n = (-dy, dx) / len
    let nx = -dy / len;
    let ny = dx / len;

    // 4. Orienter la normale selon la direction (exactement comme dans drawObstacles)
    let targetDx = 0, targetDy = 0;
    switch (direction) {
        case 'north': targetDy = -1; break;
        case 'south': targetDy = 1; break;
        case 'east': targetDx = 1; break;
        case 'west': targetDx = -1; break;
        default: targetDy = -1;
    }

    const dotAlign = nx * targetDx + ny * targetDy;
    if (dotAlign < 0) {
        nx = -nx;
        ny = -ny;
    }

    // 5. Produit scalaire (Mur->Viewer) . N
    // N pointe vers le côté "Autorisé" (flèche blanche)
    // Si Dot > 0 : Viewer est du côté autorisé (la flèche pointe vers lui) -> PAS BLOQUÉ
    // Si Dot < 0 : Viewer est du côté interdit (derrière le mur) -> BLOQUÉ

    // Attendez, revérifions la logique de blocage stricte : 
    // Un Mur One-Way est transparent d'un côté et Opaque de l'autre.
    // La flèche blanche indique le "Sens Autorisé de la Vision" (la lumière passe dans le sens de la flèche).
    // Donc la lumière va de "Derrière" vers "Devant" (pointe de la flèche).
    // Si je suis Devant (côté pointe), je vois ce qu'il y a Derrière. (La lumière m'arrive). -> PAS BLOQUÉ
    // Si je suis Derrière (côté base), je regarde vers Devant. La lumière ne revient pas. -> BLOQUÉ ???

    // NON. Habituellement "One Way" = On voit DANS le sens de la flèche.
    // Flèche : ->
    // Oeil A (base) regarde par là ->. Il VOIT.
    // Oeil B (pointe) regarde par là <-. Il est BLOQUÉ.

    // Ma logique visuelle step 289 : "Grande flèche blanche... Indique le sens autorisé de la vision"
    // Donc Viewer à la BASE de la flèche regarde vers la POINTE. Il voit.
    // Viewer à la POINTE regarde vers la BASE. Il est bloqué.

    // Vecteur N pointe de Base vers Pointe.
    // Vecteur V (Mur->Viewer).
    // Si V est du côté de la Pointe (Dot > 0) : Viewer est "Devant". Il regarde vers l'arrière (contre sens). BLOQUÉ.
    // Si V est du côté de la Base (Dot < 0) : Viewer est "Derrière". Il regarde vers l'avant (bon sens). PAS BLOQUÉ.

    const dotProduct = vx * nx + vy * ny;

    // Donc si Dot > 0 (Côté pointe), on est bloqué.
    return dotProduct > 0;
}

/**
 * Calculate all shadow polygons from obstacles
 * Closed rooms (auto-detected from connected walls) darken their interior when viewer is outside.
 * Individual walls cast shadows behind them.
 */
export function calculateShadowPolygons(
    viewerPos: Point,
    obstacles: Obstacle[],
    mapBounds: { width: number; height: number }
): Point[][] {
    const shadows: Point[][] = [];

    // 1. Detect closed rooms from connected walls
    const loops = findClosedLoops(obstacles);
    const wallsInLoops = new Set<string>();
    for (const loop of loops) {
        // Skip loops in 'individual' mode — their walls cast shadows independently
        const isIndividualMode = loop.wallObstacles.some(w => w.roomMode === 'individual');
        if (isIndividualMode) continue;

        for (const wall of loop.wallObstacles) {
            wallsInLoops.add(wall.id);
        }
    }

    // 2. Handle closed rooms (room mode only)
    for (const loop of loops) {
        if (loop.points.length < 3) continue;
        const isIndividualMode = loop.wallObstacles.some(w => w.roomMode === 'individual');
        if (isIndividualMode) continue;

        const viewerInside = isPointInPolygon(viewerPos, loop.points);
        if (!viewerInside) {
            // Viewer OUTSIDE : darken the room interior
            shadows.push([...loop.points]);
        }
        // Viewer INSIDE : exterior mask handled in drawShadows
    }

    // 3. Fallback: handle legacy polygon obstacles
    for (const obstacle of obstacles) {
        if (obstacle.type === 'polygon' && obstacle.points.length >= 3) {
            const viewerInside = isPointInPolygon(viewerPos, obstacle.points);
            if (!viewerInside) {
                shadows.push([...obstacle.points]);
            }
        }
    }

    // 4. Handle individual obstacles (not part of closed loops)
    for (const obstacle of obstacles) {
        if (wallsInLoops.has(obstacle.id)) continue; // Handled by loop
        if (obstacle.type === 'polygon') continue; // Handled above

        // Skip transparent obstacles
        if (obstacle.type === 'door' && obstacle.isOpen) continue;
        if (obstacle.type === 'window') continue;

        if (obstacle.type === 'one-way-wall' && obstacle.points.length >= 2) {
            const segment = { p1: obstacle.points[0], p2: obstacle.points[1] };
            const direction = obstacle.direction || 'north';
            if (isViewerBlockedByOneWayWall(viewerPos, segment, direction)) {
                const shadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
                if (shadow.length >= 3) {
                    shadows.push(shadow);
                }
            }
        } else if (obstacle.type === 'wall' && obstacle.points.length >= 2) {
            const segment = { p1: obstacle.points[0], p2: obstacle.points[1] };
            const shadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
            if (shadow.length >= 3) {
                shadows.push(shadow);
            }
        } else if (obstacle.type === 'door' && obstacle.points.length >= 2) {
            // Closed door = like a wall
            const segment = { p1: obstacle.points[0], p2: obstacle.points[1] };
            const shadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
            if (shadow.length >= 3) {
                shadows.push(shadow);
            }
        } else if (obstacle.type === 'rectangle' && obstacle.points.length >= 2) {
            for (const segment of getSegmentsFromRectangle(obstacle.points[0], obstacle.points[1])) {
                const shadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
                if (shadow.length >= 3) {
                    shadows.push(shadow);
                }
            }
        }
    }

    return shadows;
}

/**
 * Helper to get segments from a rectangle
 */
function getSegmentsFromRectangle(tl: Point, br: Point): Segment[] {
    const tr = { x: br.x, y: tl.y };
    const bl = { x: tl.x, y: br.y };
    return [
        { p1: tl, p2: tr },
        { p1: tr, p2: br },
        { p1: br, p2: bl },
        { p1: bl, p2: tl },
    ];
}

/**
 * Info about a closed room containing the viewer, with transparent edge indices
 */
export type PolygonViewerInfo = {
    points: Point[]; // polygon outline
    transparentEdgeIndices: number[]; // indices des arêtes qui ne bloquent pas la vision
    wallObstacles?: Obstacle[]; // wallObstacles[i] = the wall from points[i] to points[(i+1) % n]
};

/**
 * Get closed rooms (from connected walls) where the viewer is inside.
 * Auto-detects closed loops from individual wall obstacles.
 * Returns transparent edge info based on wall types (open doors, windows, one-way walls).
 */
export function getPolygonsContainingViewer(
    viewerPos: Point,
    obstacles: Obstacle[]
): PolygonViewerInfo[] {
    const loops = findClosedLoops(obstacles);
    const results: PolygonViewerInfo[] = [];

    for (const loop of loops) {
        if (loop.points.length < 3) continue;
        const isIndividualMode = loop.wallObstacles.some(w => w.roomMode === 'individual');
        if (isIndividualMode) continue; // Individual mode: no room behavior
        if (!isPointInPolygon(viewerPos, loop.points)) continue;

        const transparentEdgeIndices: number[] = [];
        for (let i = 0; i < loop.wallObstacles.length; i++) {
            const wall = loop.wallObstacles[i];
            if ((wall.type === 'door' && wall.isOpen) || wall.type === 'window') {
                transparentEdgeIndices.push(i);
            } else if (wall.type === 'one-way-wall') {
                const next = (i + 1) % loop.points.length;
                const segment = { p1: loop.points[i], p2: loop.points[next] };
                if (!isViewerBlockedByOneWayWall(viewerPos, segment, wall.direction || 'north')) {
                    transparentEdgeIndices.push(i);
                }
            }
        }

        results.push({ points: loop.points, transparentEdgeIndices, wallObstacles: loop.wallObstacles });
    }

    // Fallback: also check legacy polygon obstacles (backward compat during migration)
    for (const obs of obstacles) {
        if (obs.type !== 'polygon' || obs.points.length < 3) continue;
        if (!isPointInPolygon(viewerPos, obs.points)) continue;

        const transparentEdgeIndices: number[] = [];
        if (obs.edges) {
            for (let i = 0; i < obs.edges.length; i++) {
                const edge = obs.edges[i];
                if ((edge.type === 'door' && edge.isOpen) || edge.type === 'window') {
                    transparentEdgeIndices.push(i);
                } else if (edge.type === 'one-way-wall') {
                    const next = (i + 1) % obs.points.length;
                    const segment = { p1: obs.points[i], p2: obs.points[next] };
                    if (!isViewerBlockedByOneWayWall(viewerPos, segment, edge.direction || 'north')) {
                        transparentEdgeIndices.push(i);
                    }
                }
            }
        }
        results.push({ points: obs.points, transparentEdgeIndices });
    }

    return results;
}

/**
 * Draw shadow polygons on the canvas
 * Uses a temporary canvas to avoid opacity stacking when shadows overlap
 * Also handles special case where viewer is inside a polygon (hides exterior)
 */
export type ShadowResult = {
    shadows: Point[][];
    polygonsContainingViewer: PolygonViewerInfo[];
};

/**
 * Draw shadow polygons on the canvas
 * Uses a temporary canvas to avoid opacity stacking when shadows overlap
 * Also handles special case where viewer is inside a polygon (hides exterior)
 */
export function drawShadows(
    ctx: CanvasRenderingContext2D,
    viewerPos: Point,
    obstacles: Obstacle[],
    mapBounds: { width: number; height: number },
    fogOpacity: number,
    transformPoint: (p: Point) => Point,
    options: {
        precalculated?: ShadowResult;
        tempCanvas?: HTMLCanvasElement;
        exteriorCanvas?: HTMLCanvasElement;
    } = {}
): void {
    if (obstacles.length === 0) return;

    let shadows: Point[][];
    let polygonsContainingViewer: PolygonViewerInfo[];

    if (options.precalculated) {
        shadows = options.precalculated.shadows;
        polygonsContainingViewer = options.precalculated.polygonsContainingViewer;
    } else {
        shadows = calculateShadowPolygons(viewerPos, obstacles, mapBounds);
        polygonsContainingViewer = getPolygonsContainingViewer(viewerPos, obstacles);
    }

    if (shadows.length === 0 && polygonsContainingViewer.length === 0) return;

    // Créer un canvas temporaire pour les ombres ou utiliser celui fourni
    // Cela évite l'accumulation d'opacité quand les ombres se superposent
    const canvas = ctx.canvas;
    let tempCanvas = options.tempCanvas;
    let tempCtx: CanvasRenderingContext2D | null = null;
    let createdTempCanvas = false;

    if (!tempCanvas) {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        createdTempCanvas = true;
    } else {
        // Resize if needed
        if (tempCanvas.width !== canvas.width || tempCanvas.height !== canvas.height) {
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
        } else {
            // Clear existing content
            const tCtx = tempCanvas.getContext('2d');
            if (tCtx) tCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        }
    }

    tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // Appliquer le même scale que le canvas principal
    const scaleX = canvas.width / (canvas.clientWidth || canvas.width);
    const scaleY = canvas.height / (canvas.clientHeight || canvas.height);
    tempCtx.save(); // Save verifyable state
    tempCtx.scale(scaleX, scaleY);

    // Dessiner toutes les ombres en noir opaque sur le canvas temporaire
    tempCtx.fillStyle = 'black';

    // 1. Draw regular shadow polygons (from walls and polygon interiors when viewer is outside)
    for (const shadow of shadows) {
        if (shadow.length < 3) continue;

        tempCtx.beginPath();
        const first = transformPoint(shadow[0]);
        tempCtx.moveTo(first.x, first.y);

        for (let i = 1; i < shadow.length; i++) {
            const p = transformPoint(shadow[i]);
            tempCtx.lineTo(p.x, p.y);
        }

        tempCtx.closePath();
        tempCtx.fill();
    }

    // 1b. Pour les pièces fermées vues de l'extérieur :
    // Révéler l'intérieur de la pièce si elle a des arêtes transparentes (portes ouvertes, fenêtres)
    // On utilise un clip sur le polygone de la pièce pour ne pas effacer les ombres au-delà
    const closedLoops = findClosedLoops(obstacles);
    for (const loop of closedLoops) {
        if (loop.points.length < 3) continue;
        const isIndividualMode = loop.wallObstacles.some(w => w.roomMode === 'individual');
        if (isIndividualMode) continue;
        if (isPointInPolygon(viewerPos, loop.points)) continue;

        // Check if this loop has any transparent edges
        let hasTransparentEdge = false;
        for (let i = 0; i < loop.wallObstacles.length; i++) {
            const wall = loop.wallObstacles[i];
            if ((wall.type === 'door' && wall.isOpen) || wall.type === 'window') {
                hasTransparentEdge = true;
                break;
            } else if (wall.type === 'one-way-wall') {
                const nextIdx = (i + 1) % loop.points.length;
                const seg = { p1: loop.points[i], p2: loop.points[nextIdx] };
                if (!isViewerBlockedByOneWayWall(viewerPos, seg, wall.direction || 'north')) {
                    hasTransparentEdge = true;
                    break;
                }
            }
        }
        if (!hasTransparentEdge) continue;

        // Clip to room interior and erase the room shadow
        tempCtx.save();
        tempCtx.beginPath();
        const clipFirst = transformPoint(loop.points[0]);
        tempCtx.moveTo(clipFirst.x, clipFirst.y);
        for (let i = 1; i < loop.points.length; i++) {
            const p = transformPoint(loop.points[i]);
            tempCtx.lineTo(p.x, p.y);
        }
        tempCtx.closePath();
        tempCtx.clip();

        // Erase shadow inside the room polygon
        tempCtx.globalCompositeOperation = 'destination-out';
        tempCtx.fillStyle = 'white';
        tempCtx.fill();

        // Now re-draw shadows for the opaque walls of this room (inside the clip)
        tempCtx.globalCompositeOperation = 'source-over';
        tempCtx.fillStyle = 'black';

        for (let i = 0; i < loop.wallObstacles.length; i++) {
            const wall = loop.wallObstacles[i];
            const nextIdx = (i + 1) % loop.points.length;
            const wp1 = loop.points[i];
            const wp2 = loop.points[nextIdx];

            // Determine if this edge is opaque (blocks vision)
            let isOpaque = true;
            if ((wall.type === 'door' && wall.isOpen) || wall.type === 'window') {
                isOpaque = false;
            } else if (wall.type === 'one-way-wall') {
                const seg = { p1: wp1, p2: wp2 };
                if (!isViewerBlockedByOneWayWall(viewerPos, seg, wall.direction || 'north')) {
                    isOpaque = false;
                }
            }

            if (isOpaque) {
                // Cast shadow from this wall segment inside the room
                const segment = { p1: wp1, p2: wp2 };
                const shadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
                if (shadow.length >= 3) {
                    tempCtx.beginPath();
                    const sf = transformPoint(shadow[0]);
                    tempCtx.moveTo(sf.x, sf.y);
                    for (let j = 1; j < shadow.length; j++) {
                        const sp = transformPoint(shadow[j]);
                        tempCtx.lineTo(sp.x, sp.y);
                    }
                    tempCtx.closePath();
                    tempCtx.fill();
                }
            }
        }

        tempCtx.restore(); // Removes clip
    }
    tempCtx.globalCompositeOperation = 'source-over';
    tempCtx.fillStyle = 'black';

    // 1c. Draw wall outlines as thick opaque strokes so room boundaries are always visible
    tempCtx.strokeStyle = 'black';
    tempCtx.lineCap = 'round';
    const wallLineWidth = 6;
    for (const obstacle of obstacles) {
        if (obstacle.type === 'door' && obstacle.isOpen) continue;
        if (obstacle.type === 'window') continue;
        if ((obstacle.type === 'wall' || obstacle.type === 'door' || obstacle.type === 'one-way-wall') && obstacle.points.length >= 2) {
            const p1 = transformPoint(obstacle.points[0]);
            const p2 = transformPoint(obstacle.points[1]);
            tempCtx.lineWidth = wallLineWidth;
            tempCtx.beginPath();
            tempCtx.moveTo(p1.x, p1.y);
            tempCtx.lineTo(p2.x, p2.y);
            tempCtx.stroke();
        }
    }

    // 2. Handle case where viewer is INSIDE a polygon
    // BFS through connected rooms via transparent edges (doors, windows)
    // Instead of drawing infinite cones, cut out adjacent rooms directly
    if (polygonsContainingViewer.length > 0) {
        // Get all closed loops for adjacency detection
        const allLoops = findClosedLoops(obstacles);

        // Build a map: wallId → list of loop indices that contain this wall
        const wallToLoops = new Map<string, number[]>();
        for (let li = 0; li < allLoops.length; li++) {
            const loop = allLoops[li];
            const isIndividualMode = loop.wallObstacles.some(w => w.roomMode === 'individual');
            if (isIndividualMode) continue;
            for (const wall of loop.wallObstacles) {
                const existing = wallToLoops.get(wall.id) || [];
                existing.push(li);
                wallToLoops.set(wall.id, existing);
            }
        }

        // Create exterior canvas
        let exteriorCanvas = options.exteriorCanvas;
        let exteriorCtx: CanvasRenderingContext2D | null = null;

        if (!exteriorCanvas) {
            exteriorCanvas = document.createElement('canvas');
            exteriorCanvas.width = canvas.width;
            exteriorCanvas.height = canvas.height;
        } else {
            if (exteriorCanvas.width !== canvas.width || exteriorCanvas.height !== canvas.height) {
                exteriorCanvas.width = canvas.width;
                exteriorCanvas.height = canvas.height;
            } else {
                const eCtx = exteriorCanvas.getContext('2d');
                if (eCtx) eCtx.clearRect(0, 0, exteriorCanvas.width, exteriorCanvas.height);
            }
        }

        exteriorCtx = exteriorCanvas.getContext('2d');
        if (exteriorCtx) {
            exteriorCtx.save();
            exteriorCtx.scale(scaleX, scaleY);

            // Fill entire canvas with black (fog)
            exteriorCtx.fillStyle = 'black';
            exteriorCtx.fillRect(0, 0, canvas.width / scaleX, canvas.height / scaleY);

            exteriorCtx.globalCompositeOperation = 'destination-out';
            exteriorCtx.fillStyle = 'white';

            // Helper to cut out a polygon interior
            const cutOutPoly = (points: Point[]) => {
                if (points.length < 3 || !exteriorCtx) return;
                exteriorCtx.beginPath();
                const f = transformPoint(points[0]);
                exteriorCtx.moveTo(f.x, f.y);
                for (let i = 1; i < points.length; i++) {
                    const p = transformPoint(points[i]);
                    exteriorCtx.lineTo(p.x, p.y);
                }
                exteriorCtx.closePath();
                exteriorCtx.fill();
            };

            for (const polyInfo of polygonsContainingViewer) {
                if (polyInfo.points.length < 3) continue;

                // Cut out the viewer's room
                cutOutPoly(polyInfo.points);

                // BFS through connected rooms via transparent edges
                if (polyInfo.transparentEdgeIndices.length > 0 && polyInfo.wallObstacles) {
                    // Find the viewer's loop index
                    const viewerWallIds = new Set(polyInfo.wallObstacles.map(w => w.id));
                    const viewerLoopIdx = allLoops.findIndex(loop =>
                        loop.wallObstacles.length === polyInfo.wallObstacles!.length &&
                        loop.wallObstacles.every(w => viewerWallIds.has(w.id))
                    );

                    const visitedLoops = new Set<number>();
                    if (viewerLoopIdx >= 0) visitedLoops.add(viewerLoopIdx);

                    // Queue: loop index + transparent wall IDs to expand through
                    const queue: { loopIdx: number; transparentWallIds: Set<string> }[] = [];

                    // Seed with viewer's transparent edges
                    const viewerTransparentWallIds = new Set<string>();
                    for (const edgeIdx of polyInfo.transparentEdgeIndices) {
                        viewerTransparentWallIds.add(polyInfo.wallObstacles[edgeIdx].id);
                    }
                    if (viewerLoopIdx >= 0) {
                        queue.push({ loopIdx: viewerLoopIdx, transparentWallIds: viewerTransparentWallIds });
                    }

                    let hasOutdoorEdge = false;

                    while (queue.length > 0) {
                        const { loopIdx, transparentWallIds } = queue.shift()!;

                        for (const wallId of transparentWallIds) {
                            const adjacentLoopIndices = wallToLoops.get(wallId) || [];
                            let foundAdjacentRoom = false;

                            for (const adjIdx of adjacentLoopIndices) {
                                if (visitedLoops.has(adjIdx)) {
                                    if (adjIdx !== loopIdx) foundAdjacentRoom = true;
                                    continue;
                                }
                                visitedLoops.add(adjIdx);
                                foundAdjacentRoom = true;

                                const adjLoop = allLoops[adjIdx];
                                // Cut out adjacent room interior
                                cutOutPoly(adjLoop.points);

                                // Find transparent edges in adjacent room for further expansion
                                const adjTransparentWallIds = new Set<string>();
                                for (let i = 0; i < adjLoop.wallObstacles.length; i++) {
                                    const wall = adjLoop.wallObstacles[i];
                                    if ((wall.type === 'door' && wall.isOpen) || wall.type === 'window') {
                                        adjTransparentWallIds.add(wall.id);
                                    } else if (wall.type === 'one-way-wall') {
                                        const nextIdx = (i + 1) % adjLoop.points.length;
                                        const seg = { p1: adjLoop.points[i], p2: adjLoop.points[nextIdx] };
                                        if (!isViewerBlockedByOneWayWall(viewerPos, seg, wall.direction || 'north')) {
                                            adjTransparentWallIds.add(wall.id);
                                        }
                                    }
                                }

                                if (adjTransparentWallIds.size > 0) {
                                    queue.push({ loopIdx: adjIdx, transparentWallIds: adjTransparentWallIds });
                                }
                            }

                            // If this transparent edge doesn't lead to any room → outdoor
                            if (!foundAdjacentRoom) hasOutdoorEdge = true;
                        }
                    }

                    // For transparent edges that lead to outdoors: draw vision cone
                    if (hasOutdoorEdge) {
                        const extendDistance = Math.max(mapBounds.width, mapBounds.height) * 2;

                        for (const edgeIdx of polyInfo.transparentEdgeIndices) {
                            const wall = polyInfo.wallObstacles[edgeIdx];
                            const adjIndices = wallToLoops.get(wall.id) || [];
                            const leadsToRoom = adjIndices.some(idx => idx !== viewerLoopIdx);
                            if (leadsToRoom) continue; // Already handled by BFS

                            const nextIdx = (edgeIdx + 1) % polyInfo.points.length;
                            const ep1 = polyInfo.points[edgeIdx];
                            const ep2 = polyInfo.points[nextIdx];

                            const dir1 = { x: ep1.x - viewerPos.x, y: ep1.y - viewerPos.y };
                            const dir2 = { x: ep2.x - viewerPos.x, y: ep2.y - viewerPos.y };
                            const len1 = Math.sqrt(dir1.x * dir1.x + dir1.y * dir1.y);
                            const len2 = Math.sqrt(dir2.x * dir2.x + dir2.y * dir2.y);
                            if (len1 < 0.001 || len2 < 0.001) continue;

                            const extended1 = {
                                x: ep1.x + (dir1.x / len1) * extendDistance,
                                y: ep1.y + (dir1.y / len1) * extendDistance,
                            };
                            const extended2 = {
                                x: ep2.x + (dir2.x / len2) * extendDistance,
                                y: ep2.y + (dir2.y / len2) * extendDistance,
                            };

                            exteriorCtx.beginPath();
                            const tp1 = transformPoint(ep1);
                            const te1 = transformPoint(extended1);
                            const te2 = transformPoint(extended2);
                            const tp2 = transformPoint(ep2);
                            exteriorCtx.moveTo(tp1.x, tp1.y);
                            exteriorCtx.lineTo(te1.x, te1.y);
                            exteriorCtx.lineTo(te2.x, te2.y);
                            exteriorCtx.lineTo(tp2.x, tp2.y);
                            exteriorCtx.closePath();
                            exteriorCtx.fill();
                        }

                        // Re-draw individual wall shadows to block outdoor cones
                        exteriorCtx.globalCompositeOperation = 'source-over';
                        exteriorCtx.fillStyle = 'black';
                        for (const obstacle of obstacles) {
                            if (obstacle.type === 'door' && obstacle.isOpen) continue;
                            if (obstacle.type === 'window') continue;
                            if (obstacle.type !== 'wall' && obstacle.type !== 'door' && obstacle.type !== 'one-way-wall') continue;
                            if (obstacle.points.length < 2) continue;

                            if (obstacle.type === 'one-way-wall') {
                                const seg = { p1: obstacle.points[0], p2: obstacle.points[1] };
                                if (!isViewerBlockedByOneWayWall(viewerPos, seg, obstacle.direction || 'north')) continue;
                            }

                            const segment = { p1: obstacle.points[0], p2: obstacle.points[1] };
                            const wallShadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
                            if (wallShadow.length >= 3) {
                                exteriorCtx.beginPath();
                                const sf = transformPoint(wallShadow[0]);
                                exteriorCtx.moveTo(sf.x, sf.y);
                                for (let j = 1; j < wallShadow.length; j++) {
                                    const sp = transformPoint(wallShadow[j]);
                                    exteriorCtx.lineTo(sp.x, sp.y);
                                }
                                exteriorCtx.closePath();
                                exteriorCtx.fill();
                            }
                        }
                        exteriorCtx.globalCompositeOperation = 'destination-out';
                        exteriorCtx.fillStyle = 'white';
                    }
                }

                // Legacy polygons (no wallObstacles): fall back to cone approach
                if (polyInfo.transparentEdgeIndices.length > 0 && !polyInfo.wallObstacles) {
                    const extendDistance = Math.max(mapBounds.width, mapBounds.height) * 2;
                    const polyPoints = polyInfo.points;

                    for (const edgeIdx of polyInfo.transparentEdgeIndices) {
                        const nextIdx = (edgeIdx + 1) % polyPoints.length;
                        const ep1 = polyPoints[edgeIdx];
                        const ep2 = polyPoints[nextIdx];

                        const dir1 = { x: ep1.x - viewerPos.x, y: ep1.y - viewerPos.y };
                        const dir2 = { x: ep2.x - viewerPos.x, y: ep2.y - viewerPos.y };
                        const len1 = Math.sqrt(dir1.x * dir1.x + dir1.y * dir1.y);
                        const len2 = Math.sqrt(dir2.x * dir2.x + dir2.y * dir2.y);
                        if (len1 < 0.001 || len2 < 0.001) continue;

                        const extended1 = {
                            x: ep1.x + (dir1.x / len1) * extendDistance,
                            y: ep1.y + (dir1.y / len1) * extendDistance,
                        };
                        const extended2 = {
                            x: ep2.x + (dir2.x / len2) * extendDistance,
                            y: ep2.y + (dir2.y / len2) * extendDistance,
                        };

                        exteriorCtx.beginPath();
                        const tp1 = transformPoint(ep1);
                        const te1 = transformPoint(extended1);
                        const te2 = transformPoint(extended2);
                        const tp2 = transformPoint(ep2);
                        exteriorCtx.moveTo(tp1.x, tp1.y);
                        exteriorCtx.lineTo(te1.x, te1.y);
                        exteriorCtx.lineTo(te2.x, te2.y);
                        exteriorCtx.lineTo(tp2.x, tp2.y);
                        exteriorCtx.closePath();
                        exteriorCtx.fill();
                    }
                }
            }

            // Re-draw shadows from ALL opaque walls inside revealed rooms
            // This adds shadows behind walls even inside rooms (corners, L-shapes, etc.)
            exteriorCtx.globalCompositeOperation = 'source-over';
            exteriorCtx.fillStyle = 'black';
            for (const obstacle of obstacles) {
                if (obstacle.type === 'door' && obstacle.isOpen) continue;
                if (obstacle.type === 'window') continue;
                if (obstacle.points.length < 2) continue;

                if (obstacle.type === 'one-way-wall') {
                    const seg = { p1: obstacle.points[0], p2: obstacle.points[1] };
                    if (!isViewerBlockedByOneWayWall(viewerPos, seg, obstacle.direction || 'north')) continue;
                }

                if (obstacle.type === 'wall' || obstacle.type === 'door' || obstacle.type === 'one-way-wall') {
                    const segment = { p1: obstacle.points[0], p2: obstacle.points[1] };
                    const wallShadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
                    if (wallShadow.length >= 3) {
                        exteriorCtx.beginPath();
                        const sf = transformPoint(wallShadow[0]);
                        exteriorCtx.moveTo(sf.x, sf.y);
                        for (let j = 1; j < wallShadow.length; j++) {
                            const sp = transformPoint(wallShadow[j]);
                            exteriorCtx.lineTo(sp.x, sp.y);
                        }
                        exteriorCtx.closePath();
                        exteriorCtx.fill();
                    }
                } else if (obstacle.type === 'rectangle' && obstacle.points.length >= 2) {
                    for (const segment of getSegmentsFromRectangle(obstacle.points[0], obstacle.points[1])) {
                        const wallShadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
                        if (wallShadow.length >= 3) {
                            exteriorCtx.beginPath();
                            const sf = transformPoint(wallShadow[0]);
                            exteriorCtx.moveTo(sf.x, sf.y);
                            for (let j = 1; j < wallShadow.length; j++) {
                                const sp = transformPoint(wallShadow[j]);
                                exteriorCtx.lineTo(sp.x, sp.y);
                            }
                            exteriorCtx.closePath();
                            exteriorCtx.fill();
                        }
                    }
                }
            }

            exteriorCtx.restore();

            // Composite the exterior mask onto the main temp canvas
            tempCtx.globalCompositeOperation = 'source-over';
            tempCtx.save();
            tempCtx.resetTransform();
            tempCtx.drawImage(exteriorCanvas, 0, 0);
            tempCtx.restore();
        }
    }
    tempCtx.restore();

    // Appliquer le canvas temporaire avec l'opacité désirée
    ctx.save();
    ctx.globalAlpha = fogOpacity;
    ctx.resetTransform(); // Ignorer les transformations pour dessiner le canvas 1:1
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
}

/**
 * Draw combined shadows from multiple viewers
 * Areas that are shadowed for ALL viewers remain dark
 * Areas visible to ANY viewer are clear
 */
export function drawCombinedShadows(
    ctx: CanvasRenderingContext2D,
    viewers: Array<{ x: number; y: number }>,
    obstacles: Obstacle[],
    mapBounds: { width: number; height: number },
    fogOpacity: number,
    transformPoint: (p: Point) => Point
): void {
    if (obstacles.length === 0 || viewers.length === 0) return;

    // For each viewer, draw their shadows
    // Using 'lighten' blend mode so overlapping shadows stay dark
    // but areas seen by any viewer become clear

    // Actually, for a proper implementation:
    // We should draw shadows for each viewer, then intersect them
    // For simplicity, let's just use the first viewer for now
    // TODO: Implement proper multi-viewer shadow intersection

    const viewer = viewers[0];
    drawShadows(ctx, { x: viewer.x, y: viewer.y }, obstacles, mapBounds, fogOpacity, transformPoint);
}

/**
 * Draw obstacles on the canvas (for debugging or MJ view)
 */
export function drawObstacles(
    ctx: CanvasRenderingContext2D,
    obstacles: Obstacle[],
    transformPoint: (p: Point) => Point,
    options: {
        strokeColor?: string;
        fillColor?: string;
        strokeWidth?: number;
        showHandles?: boolean;
        selectedId?: string | null;
        selectedIds?: string[]; // NEW: support multiple selected IDs
    } = {}
): void {
    const {
        strokeColor = 'rgba(255, 100, 100, 0.8)',
        fillColor = 'rgba(255, 100, 100, 0.2)',
        strokeWidth = 2,
        showHandles = false,
        selectedId = null,
        selectedIds = [],
    } = options;

    for (const obstacle of obstacles) {
        // Check if selected either by single ID or in array
        const isSelected = obstacle.id === selectedId || selectedIds.includes(obstacle.id);

        // Définir les couleurs selon le type d'obstacle
        let obstacleStrokeColor = strokeColor;
        let obstacleFillColor = fillColor;

        if (obstacle.type === 'one-way-wall') {
            obstacleStrokeColor = isSelected ? '#FFD700' : 'rgba(255, 165, 0, 0.9)'; // Orange
            obstacleFillColor = 'rgba(255, 165, 0, 0.2)';
        } else if (obstacle.type === 'door') {
            if (obstacle.isOpen) {
                obstacleStrokeColor = isSelected ? '#FFD700' : 'rgba(0, 255, 0, 0.9)'; // Vert si ouverte
                obstacleFillColor = 'rgba(0, 255, 0, 0.2)';
            } else if (obstacle.isLocked) {
                obstacleStrokeColor = isSelected ? '#FFD700' : 'rgba(200, 160, 50, 0.9)'; // Doré si verrouillée
                obstacleFillColor = 'rgba(200, 160, 50, 0.2)';
            } else {
                obstacleStrokeColor = isSelected ? '#FFD700' : 'rgba(255, 0, 0, 0.9)'; // Rouge si fermée
                obstacleFillColor = 'rgba(255, 0, 0, 0.2)';
            }
        } else if (obstacle.type === 'window') {
            obstacleStrokeColor = isSelected ? '#FFD700' : 'rgba(100, 180, 255, 0.9)'; // Bleu clair
            obstacleFillColor = 'rgba(100, 180, 255, 0.2)';
        }

        ctx.beginPath();
        ctx.strokeStyle = isSelected ? '#FFD700' : obstacleStrokeColor;
        ctx.fillStyle = isSelected ? 'rgba(255, 215, 0, 0.3)' : obstacleFillColor;
        ctx.lineWidth = isSelected ? strokeWidth * 2 : strokeWidth;

        if (obstacle.type === 'wall' && obstacle.points.length >= 2) {
            const p1 = transformPoint(obstacle.points[0]);
            const p2 = transformPoint(obstacle.points[1]);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        } else if (obstacle.type === 'one-way-wall' && obstacle.points.length >= 2) {
            // Dessiner le mur à sens unique
            const p1 = transformPoint(obstacle.points[0]);
            const p2 = transformPoint(obstacle.points[1]);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Dessiner une flèche STRICTEMENT PERPENDICULAIRE au mur
            // Indiquant le sens de la vision (du visible vers le bloqué)

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const arrowLength = 30; // Longueur de la flèche
            const arrowHeadSize = 10;

            ctx.save();
            ctx.strokeStyle = '#FFFFFF';
            ctx.fillStyle = '#FFFFFF';
            ctx.lineWidth = 3;

            ctx.beginPath();

            // 1. Vecteur Mur
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);

            // 2. Normale unitaire (tournée à 90 degrés)
            // n1 = (-dy, dx) / len
            let nx = -dy / len;
            let ny = dx / len;

            // 3. Orienter la normale selon la direction du backend
            // On veut que la flèche pointe dans le sens de la vision "autorisée"
            // Si direction='north' (bloque le nord), la vision va vers le nord (ny doit être negatif)

            let targetDx = 0, targetDy = 0;
            switch (obstacle.direction) {
                case 'north': targetDy = -1; break;
                case 'south': targetDy = 1; break;
                case 'east': targetDx = 1; break;
                case 'west': targetDx = -1; break;
                default: targetDy = -1; // Default North
            }

            // Produit scalaire pour vérifier l'alignement
            const dot = nx * targetDx + ny * targetDy;

            // Si le produit scalaire est négatif, la normale pointe dans le sens opposé -> on l'inverse
            if (dot < 0) {
                nx = -nx;
                ny = -ny;
            }

            // 4. Points de la flèche
            // Départ = Sur le mur (midX, midY)
            // Arrivée = midX + nx*len, midY + ny*len
            const startX = midX;
            const startY = midY;
            const endX = midX + nx * arrowLength;
            const endY = midY + ny * arrowLength;

            // Dessiner le corps de la flèche (du mur vers l'extérieur)
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            // Dessiner la tête de la flèche
            ctx.beginPath();
            const angle = Math.atan2(endY - startY, endX - startX);
            ctx.moveTo(endX, endY);
            ctx.lineTo(endX - arrowHeadSize * Math.cos(angle - Math.PI / 6), endY - arrowHeadSize * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(endX - arrowHeadSize * Math.cos(angle + Math.PI / 6), endY - arrowHeadSize * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();

            // Ajouter une petite base sur le mur pour l'esthétique
            ctx.beginPath();
            const barSize = 6;
            // Vecteur tangent unitaire (dx/len, dy/len)
            const tx = dx / len;
            const ty = dy / len;
            ctx.moveTo(midX - tx * barSize, midY - ty * barSize);
            ctx.lineTo(midX + tx * barSize, midY + ty * barSize);
            ctx.stroke();

            ctx.restore();
        } else if (obstacle.type === 'door' && obstacle.points.length >= 2) {
            // Dessiner la porte
            const p1 = transformPoint(obstacle.points[0]);
            const p2 = transformPoint(obstacle.points[1]);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Ajouter un symbole de porte au milieu
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const doorSize = 12;

            ctx.save();
            ctx.fillStyle = obstacleStrokeColor;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;

            // Rectangle pour représenter la porte
            ctx.beginPath();
            ctx.arc(midX, midY, doorSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Symbole : arc si ouverte, cadenas si verrouillée, ligne si fermée
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (obstacle.isOpen) {
                // Arc pour porte ouverte
                ctx.arc(midX, midY, doorSize * 0.5, -Math.PI / 4, Math.PI / 4);
                ctx.stroke();
            } else if (obstacle.isLocked) {
                // Cadenas pour porte verrouillée
                const lockW = doorSize * 0.6;
                const lockH = doorSize * 0.5;
                ctx.fillStyle = '#fff';
                // Corps du cadenas (rectangle)
                ctx.fillRect(midX - lockW / 2, midY - lockH / 2 + 1, lockW, lockH);
                // Anse du cadenas (arc)
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(midX, midY - lockH / 2 + 1, lockW * 0.35, Math.PI, 0);
                ctx.stroke();
            } else {
                // Ligne pour porte fermée
                ctx.moveTo(midX, midY - doorSize * 0.5);
                ctx.lineTo(midX, midY + doorSize * 0.5);
                ctx.stroke();
            }
            ctx.restore();
        } else if (obstacle.type === 'window' && obstacle.points.length >= 2) {
            // Dessiner la fenêtre
            const p1 = transformPoint(obstacle.points[0]);
            const p2 = transformPoint(obstacle.points[1]);
            ctx.setLineDash([6, 4]);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Symbole fenêtre au milieu (croix dans un cercle)
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const winSize = 10;

            ctx.save();
            ctx.fillStyle = obstacleStrokeColor;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.arc(midX, midY, winSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Croix à l'intérieur
            ctx.beginPath();
            ctx.moveTo(midX - winSize * 0.5, midY);
            ctx.lineTo(midX + winSize * 0.5, midY);
            ctx.moveTo(midX, midY - winSize * 0.5);
            ctx.lineTo(midX, midY + winSize * 0.5);
            ctx.stroke();
            ctx.restore();
        } else if (obstacle.type === 'rectangle' && obstacle.points.length >= 2) {
            const tl = transformPoint(obstacle.points[0]);
            const br = transformPoint(obstacle.points[1]);
            ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
            ctx.fill();
            ctx.stroke();
        }

        // Draw handles for editing
        if (showHandles && isSelected) {
            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;

            for (const point of obstacle.points) {
                const p = transformPoint(point);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
    }
}

// Keep old exports for compatibility (but they won't be used)
export function calculateVisibilityPolygon(): Point[] { return []; }
export function drawVisibilityMask(): void { }
/**
 * Check if a point is inside a polygon using Ray Casting algorithm
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Check if a point is in shadow (obscured by obstacles) from a viewer's perspective
 * Handles both walls (shadow cast behind) and polygons (interior hidden when outside, exterior hidden when inside)
 */
export function isPointInShadows(
    targetPoint: Point,
    viewerPos: Point,
    obstacles: Obstacle[],
    mapBounds: { width: number; height: number }
): boolean {
    // First check: is the target inside a shadow polygon cast by walls?
    const shadows = calculateShadowPolygons(viewerPos, obstacles, mapBounds);

    for (const shadow of shadows) {
        if (isPointInPolygon(targetPoint, shadow)) {
            return true; // The point is inside a shadow
        }
    }

    // Second check: if viewer is inside a polygon, points outside that polygon are in shadow
    // (sauf si le point est visible à travers une arête transparente)
    const polygonsContainingViewer = getPolygonsContainingViewer(viewerPos, obstacles);
    for (const polyInfo of polygonsContainingViewer) {
        const polyPoints = polyInfo.points;
        // If target point is OUTSIDE the polygon that contains the viewer, it's in shadow
        // SAUF si le point est accessible via une arête transparente
        if (!isPointInPolygon(targetPoint, polyPoints)) {
            if (polyInfo.transparentEdgeIndices.length === 0) {
                return true; // Aucune arête transparente, tout l'extérieur est ombré
            }
            // Vérifier si le point est dans un cône de vision d'une arête transparente
            let visibleThroughEdge = false;
            for (const edgeIdx of polyInfo.transparentEdgeIndices) {
                const nextIdx = (edgeIdx + 1) % polyPoints.length;
                const ep1 = polyPoints[edgeIdx];
                const ep2 = polyPoints[nextIdx];

                // Créer le cône de vision et vérifier si le target est dedans
                const extendDistance = Math.max(mapBounds.width, mapBounds.height) * 2;
                const dir1 = { x: ep1.x - viewerPos.x, y: ep1.y - viewerPos.y };
                const dir2 = { x: ep2.x - viewerPos.x, y: ep2.y - viewerPos.y };
                const len1 = Math.sqrt(dir1.x * dir1.x + dir1.y * dir1.y);
                const len2 = Math.sqrt(dir2.x * dir2.x + dir2.y * dir2.y);
                if (len1 < 0.001 || len2 < 0.001) continue;

                const extended1 = {
                    x: ep1.x + (dir1.x / len1) * extendDistance,
                    y: ep1.y + (dir1.y / len1) * extendDistance,
                };
                const extended2 = {
                    x: ep2.x + (dir2.x / len2) * extendDistance,
                    y: ep2.y + (dir2.y / len2) * extendDistance,
                };

                const cone = [ep1, extended1, extended2, ep2];
                if (isPointInPolygon(targetPoint, cone)) {
                    visibleThroughEdge = true;
                    break;
                }
            }
            if (!visibleThroughEdge) {
                return true;
            }
        }
    }

    return false;
}
