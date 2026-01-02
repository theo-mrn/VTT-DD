/**
 * Dynamic Line-of-Sight (LoS) Visibility System
 * Implements shadow casting - obstacles block vision and create shadows behind them
 * Vision is infinite by default, only blocked by obstacles
 */

export type Point = { x: number; y: number };

export type Segment = {
    p1: Point;
    p2: Point;
};

export type Obstacle = {
    id: string;
    type: 'wall' | 'rectangle' | 'polygon';
    points: Point[]; // Pour wall: [start, end], rectangle: [topLeft, bottomRight], polygon: [points...]
    color?: string;
    opacity?: number;
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
 * Calculate all shadow polygons from obstacles
 * Walls cast shadows behind them, polygons only block their interior (or exterior if viewer inside)
 */
export function calculateShadowPolygons(
    viewerPos: Point,
    obstacles: Obstacle[],
    mapBounds: { width: number; height: number }
): Point[][] {
    const shadows: Point[][] = [];

    for (const obstacle of obstacles) {
        if (obstacle.type === 'polygon' && obstacle.points.length >= 3) {
            // For polygons: check if viewer is inside or outside
            const viewerInside = isPointInPolygon(viewerPos, obstacle.points);

            if (viewerInside) {
                // Viewer is INSIDE the polygon: hide everything OUTSIDE
                // We'll handle this separately in drawShadows with a special mask
                // For now, we don't add shadow polygons here - it will be handled in drawShadowsWithPolygonBehavior
            } else {
                // Viewer is OUTSIDE the polygon: hide the polygon's interior
                // Just add the polygon itself as a shadow (not shadows cast behind it)
                shadows.push([...obstacle.points]);
            }
        } else {
            // For walls (and chains): cast shadows behind each segment
            const segments = obstacle.type === 'wall' && obstacle.points.length >= 2
                ? [{ p1: obstacle.points[0], p2: obstacle.points[1] }]
                : obstacle.type === 'rectangle' && obstacle.points.length >= 2
                    ? getSegmentsFromRectangle(obstacle.points[0], obstacle.points[1])
                    : [];

            // For chain walls (polygon with type 'wall'), handle each segment
            if (obstacle.type === 'wall' && obstacle.points.length > 2) {
                // This is a chain of walls
                for (let i = 0; i < obstacle.points.length - 1; i++) {
                    const segment = { p1: obstacle.points[i], p2: obstacle.points[i + 1] };
                    const shadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
                    if (shadow.length >= 3) {
                        shadows.push(shadow);
                    }
                }
            } else {
                for (const segment of segments) {
                    const shadow = calculateShadowPolygon(viewerPos, segment, mapBounds);
                    if (shadow.length >= 3) {
                        shadows.push(shadow);
                    }
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
 * Get polygons where the viewer is inside (for special exterior masking)
 */
export function getPolygonsContainingViewer(
    viewerPos: Point,
    obstacles: Obstacle[]
): Obstacle[] {
    return obstacles.filter(
        obs => obs.type === 'polygon' &&
            obs.points.length >= 3 &&
            isPointInPolygon(viewerPos, obs.points)
    );
}

/**
 * Draw shadow polygons on the canvas
 * Uses a temporary canvas to avoid opacity stacking when shadows overlap
 * Also handles special case where viewer is inside a polygon (hides exterior)
 */
export type ShadowResult = {
    shadows: Point[][];
    polygonsContainingViewer: Obstacle[];
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
    let polygonsContainingViewer: Obstacle[];

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

    // 2. Handle case where viewer is INSIDE a polygon
    // In this case, we need to hide everything OUTSIDE the polygon
    if (polygonsContainingViewer.length > 0) {
        // Use destination-out to "cut holes" where the polygon interiors are
        // First, we need a different approach: draw everything black, then cut out the polygon

        // Create another temp canvas for the exterior mask
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

            // Cut out the interior of each polygon the viewer is inside
            exteriorCtx.globalCompositeOperation = 'destination-out';
            exteriorCtx.fillStyle = 'white';

            for (const polygon of polygonsContainingViewer) {
                if (polygon.points.length < 3) continue;

                exteriorCtx.beginPath();
                const first = transformPoint(polygon.points[0]);
                exteriorCtx.moveTo(first.x, first.y);

                for (let i = 1; i < polygon.points.length; i++) {
                    const p = transformPoint(polygon.points[i]);
                    exteriorCtx.lineTo(p.x, p.y);
                }

                exteriorCtx.closePath();
                exteriorCtx.fill();
            }
            exteriorCtx.restore();

            // Composite the exterior mask onto the main temp canvas
            tempCtx.globalCompositeOperation = 'source-over';
            tempCtx.save();
            tempCtx.resetTransform();
            tempCtx.drawImage(exteriorCanvas, 0, 0);
            tempCtx.restore();
            // Restoring scaleX/scaleY is handled by tempCtx.restore() but we didn't save before resetTransform in original code safely. 
            // In this new block, we rely on the outer tempCtx.save().
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
    } = {}
): void {
    const {
        strokeColor = 'rgba(255, 100, 100, 0.8)',
        fillColor = 'rgba(255, 100, 100, 0.2)',
        strokeWidth = 2,
        showHandles = false,
        selectedId = null,
    } = options;

    for (const obstacle of obstacles) {
        const isSelected = obstacle.id === selectedId;

        ctx.beginPath();
        ctx.strokeStyle = isSelected ? '#FFD700' : strokeColor;
        ctx.fillStyle = isSelected ? 'rgba(255, 215, 0, 0.3)' : fillColor;
        ctx.lineWidth = isSelected ? strokeWidth * 2 : strokeWidth;

        if (obstacle.type === 'wall' && obstacle.points.length >= 2) {
            const p1 = transformPoint(obstacle.points[0]);
            const p2 = transformPoint(obstacle.points[1]);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        } else if (obstacle.type === 'rectangle' && obstacle.points.length >= 2) {
            const tl = transformPoint(obstacle.points[0]);
            const br = transformPoint(obstacle.points[1]);
            ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
            ctx.fill();
            ctx.stroke();
        } else if (obstacle.type === 'polygon' && obstacle.points.length >= 3) {
            const first = transformPoint(obstacle.points[0]);
            ctx.moveTo(first.x, first.y);
            for (let i = 1; i < obstacle.points.length; i++) {
                const p = transformPoint(obstacle.points[i]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
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
    const polygonsContainingViewer = getPolygonsContainingViewer(viewerPos, obstacles);
    for (const polygon of polygonsContainingViewer) {
        // If target point is OUTSIDE the polygon that contains the viewer, it's in shadow
        if (!isPointInPolygon(targetPoint, polygon.points)) {
            return true;
        }
    }

    return false;
}
