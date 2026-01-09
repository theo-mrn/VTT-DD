/**
 * Measurement utilities for D&D Area of Effect shapes
 */

export type MeasurementShape = 'line' | 'cone' | 'circle' | 'cube';

export interface SharedMeasurement {
    id: string;
    type: MeasurementShape;
    start: Point;
    end: Point;
    ownerId: string;
    cityId: string | null;
    color: string;
    unitName: string;
    coneWidth?: number | null;
    skin?: string | null;
    timestamp: number;
    permanent?: boolean; // If true, persists. If false, auto-deletes after 6s.
}

export interface Point {
    x: number;
    y: number;
}

export interface MeasurementRenderOptions {
    ctx: CanvasRenderingContext2D;
    start: Point;
    end: Point;
    zoom: number;
    scale: number; // Base image scale (container/image ratio)
    pixelsPerUnit: number;
    unitName: string;
    isCalibrating: boolean;
    coneAngle?: number;
    coneWidth?: number | null; // Width at the end of the cone in units
    skin?: string | null;
    skinElement?: HTMLVideoElement | HTMLImageElement | null;
}

/**
 * Calculate distance between two points
 */
export function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Calculate angle between two points (in radians)
 */
function calculateAngle(start: Point, end: Point): number {
    return Math.atan2(end.y - start.y, end.x - start.x);
}

/**
 * Format measurement text with area if applicable
 */
function formatMeasurement(
    distance: number,
    area: number | null,
    unitName: string,
    isCalibrating: boolean,
    pixelDist: number
): string {
    if (isCalibrating) {
        return `${pixelDist.toFixed(0)} px (Calibration)`;
    }

    if (area !== null) {
        return `${distance.toFixed(1)} ${unitName}\nAire: ${area.toFixed(1)} ${unitName}²`;
    }

    return `${distance.toFixed(1)} ${unitName}`;
}

/**
 * Render line measurement (ruler)
 */
export function renderLineMeasurement(options: MeasurementRenderOptions): void {
    const { ctx, start, end, zoom, scale, pixelsPerUnit, unitName, isCalibrating } = options;

    // Draw line
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = '#FFD700'; // Gold
    ctx.lineWidth = 3 * zoom;
    ctx.setLineDash([15, 10]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw endpoints
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 5 * zoom, 0, 2 * Math.PI);
    ctx.arc(end.x, end.y, 5 * zoom, 0, 2 * Math.PI);
    ctx.fill();

    // Calculate and display distance
    const pixelDist = calculateDistance(start.x, start.y, end.x, end.y);
    const validScale = (scale && scale > 0) ? scale : 1;
    const validPPU = (pixelsPerUnit && pixelsPerUnit > 0) ? pixelsPerUnit : 50;
    const unitDist = pixelDist / (validPPU * validScale * zoom);
    const text = formatMeasurement(unitDist, null, unitName, isCalibrating, pixelDist);

    drawLabel(ctx, text, (start.x + end.x) / 2, (start.y + end.y) / 2, zoom);
}

/**
 * Render cone measurement (spell cone)
 */
export function renderConeMeasurement(options: MeasurementRenderOptions): void {
    const { ctx, start, end, zoom, scale, pixelsPerUnit, unitName, isCalibrating, coneWidth, skinElement } = options;

    const angle = calculateAngle(start, end);
    const pixelDist = calculateDistance(start.x, start.y, end.x, end.y);
    const validScale = (scale && scale > 0) ? scale : 1;
    const validPPU = (pixelsPerUnit && pixelsPerUnit > 0) ? pixelsPerUnit : 50;
    const unitDist = pixelDist / (validPPU * validScale * zoom);

    let halfAngleRad: number;
    let actualConeWidth: number;

    if (coneWidth && coneWidth > 0) {
        // If width is specified, calculate angle from width and length
        // width = 2 * length * tan(halfAngle)
        // halfAngle = atan(width / (2 * length))
        halfAngleRad = Math.atan(coneWidth / (2 * unitDist));
        actualConeWidth = coneWidth;
    } else {
        // Default 30° cone (narrower per user request)
        const defaultAngle = 30;
        halfAngleRad = (defaultAngle / 2) * (Math.PI / 180);
        // Calculate width from angle: width = 2 * length * tan(halfAngle)
        actualConeWidth = 2 * unitDist * Math.tan(halfAngleRad);
    }

    // Calculate cone endpoints
    const leftAngle = angle - halfAngleRad;
    const rightAngle = angle + halfAngleRad;

    const leftEnd = {
        x: start.x + Math.cos(leftAngle) * pixelDist,
        y: start.y + Math.sin(leftAngle) * pixelDist
    };

    const rightEnd = {
        x: start.x + Math.cos(rightAngle) * pixelDist,
        y: start.y + Math.sin(rightAngle) * pixelDist
    };

    // Check if skinElement is ready to be drawn
    const isVideoReady = skinElement && (
        !(skinElement instanceof HTMLVideoElement) ||  // Images are always ready
        skinElement.readyState >= 2  // Videos need HAVE_CURRENT_DATA or better
    );

    if (isVideoReady) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(leftEnd.x, leftEnd.y);
        ctx.arc(start.x, start.y, pixelDist, leftAngle, rightAngle);
        ctx.lineTo(start.x, start.y);
        ctx.clip(); // Clip to cone shape

        // Transform for video alignment
        ctx.translate(start.x, start.y);
        ctx.rotate(angle); // Rotate to face direction of cone

        // Video Scaling:
        // Adjust scale to cover the cone area.
        const scaleFactor = 0.5; // Reduced to 0.5 to exactly fit length (1.0 * dist)
        const adjustedRadius = pixelDist * scaleFactor;
        const adjustedDiameter = adjustedRadius * 2;

        // Draw video aligned to the cone tip (start point)
        // We assume the video effect starts from the left side (if pointing right)
        // or we visually center it vertically.
        // Drawing at (0, -radius) puts the left-center of the video at the cone tip (0,0).
        ctx.drawImage(skinElement!, 0, -adjustedRadius, adjustedDiameter, adjustedDiameter);

        ctx.restore();
    } else {
        // Draw filled cone
        ctx.fillStyle = 'rgba(255, 140, 0, 0.25)'; // Semi-transparent orange
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(leftEnd.x, leftEnd.y);
        ctx.arc(start.x, start.y, pixelDist, leftAngle, rightAngle);
        ctx.lineTo(start.x, start.y);
        ctx.fill();
    }

    // Draw cone outline
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2 * zoom;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(leftEnd.x, leftEnd.y);
    ctx.arc(start.x, start.y, pixelDist, leftAngle, rightAngle);
    ctx.lineTo(start.x, start.y);
    ctx.stroke();

    // Draw center line (dashed)
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw origin point
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 5 * zoom, 0, 2 * Math.PI);
    ctx.fill();

    // Calculate area using the trapezoidal cone formula
    // For a cone: area ≈ (length * width) / 2
    const area = (unitDist * actualConeWidth) / 2;

    // Format with length and width info
    // Format with length and width info
    const text = `${unitDist.toFixed(1)} ${unitName} (L) x ${actualConeWidth.toFixed(1)} ${unitName} (W)\nAire: ${area.toFixed(1)} ${unitName}²`;

    drawLabel(ctx, text, end.x, end.y, zoom);
}

/**
 * Render circle/sphere measurement
 */
export function renderCircleMeasurement(options: MeasurementRenderOptions): void {
    const { ctx, start, end, zoom, scale, pixelsPerUnit, unitName, isCalibrating, skinElement } = options;

    const pixelDist = calculateDistance(start.x, start.y, end.x, end.y);
    const validScale = (scale && scale > 0) ? scale : 1;
    const validPPU = (pixelsPerUnit && pixelsPerUnit > 0) ? pixelsPerUnit : 50;
    const unitDist = pixelDist / (validPPU * validScale * zoom);

    // Check if skinElement is ready to be drawn
    const isVideoReady = skinElement && (
        !(skinElement instanceof HTMLVideoElement) ||  // Images are always ready
        skinElement.readyState >= 2  // Videos need HAVE_CURRENT_DATA or better
    );

    if (isVideoReady) {
        // Draw skin (centered)
        ctx.save();
        // Calculate dimensions: diameter = 2 * radius (pixelDist)
        // ⚡ Scale up the video slightly (1.35x) because the effect often has padding/transparency
        const scaleFactor = 1.35;
        const adjustedRadius = pixelDist * scaleFactor;
        const adjustedDiameter = adjustedRadius * 2;

        // Draw image centered at start.x, start.y
        ctx.translate(start.x, start.y);
        ctx.drawImage(skinElement!, -adjustedRadius, -adjustedRadius, adjustedDiameter, adjustedDiameter);
        ctx.restore();
    } else {
        // Draw filled circle
        ctx.fillStyle = 'rgba(0, 140, 255, 0.2)'; // Semi-transparent blue
        ctx.beginPath();
        ctx.arc(start.x, start.y, pixelDist, 0, 2 * Math.PI);
        ctx.fill();
    }

    // Draw circle outline
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2 * zoom;
    ctx.beginPath();
    ctx.arc(start.x, start.y, pixelDist, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw radius line (dashed)
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw center and edge points
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 5 * zoom, 0, 2 * Math.PI);
    ctx.arc(end.x, end.y, 5 * zoom, 0, 2 * Math.PI);
    ctx.fill();

    // Calculate area (circle area = π * r²)
    const area = Math.PI * Math.pow(unitDist, 2);
    const text = formatMeasurement(unitDist, area, unitName, isCalibrating, pixelDist);

    drawLabel(ctx, text, end.x, end.y, zoom);
}

/**
 * Render cube/square measurement
 */
export function renderCubeMeasurement(options: MeasurementRenderOptions): void {
    const { ctx, start, end, zoom, scale, pixelsPerUnit, unitName, isCalibrating } = options;

    const pixelDist = calculateDistance(start.x, start.y, end.x, end.y);
    const validScale = (scale && scale > 0) ? scale : 1;
    const validPPU = (pixelsPerUnit && pixelsPerUnit > 0) ? pixelsPerUnit : 50;
    const unitDist = pixelDist / (validPPU * validScale * zoom);

    // For a cube, we interpret the distance as the radius (half-width)
    // So the full side length is 2 * distance
    const sideLength = pixelDist;
    const unitSideLength = unitDist * 2; // Full side length in units

    // Calculate square corners (centered on start point)
    const halfSide = sideLength;
    const squareCorners = [
        { x: start.x - halfSide, y: start.y - halfSide },
        { x: start.x + halfSide, y: start.y - halfSide },
        { x: start.x + halfSide, y: start.y + halfSide },
        { x: start.x - halfSide, y: start.y + halfSide }
    ];

    // Draw filled square
    ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; // Semi-transparent red
    ctx.beginPath();
    ctx.moveTo(squareCorners[0].x, squareCorners[0].y);
    squareCorners.forEach(corner => ctx.lineTo(corner.x, corner.y));
    ctx.closePath();
    ctx.fill();

    // Draw square outline
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2 * zoom;
    ctx.stroke();

    // Draw radius line (dashed) from center to edge
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw center point
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 5 * zoom, 0, 2 * Math.PI);
    ctx.arc(end.x, end.y, 5 * zoom, 0, 2 * Math.PI);
    ctx.fill();

    // Calculate area (square area = side²)
    const area = Math.pow(unitSideLength, 2);
    const text = formatMeasurement(unitSideLength, area, unitName, isCalibrating, pixelDist);

    drawLabel(ctx, text, end.x, end.y, zoom);
}

/**
 * Draw measurement label with background
 */
// Draw measurement label with background
const drawLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, zoom: number): void => {
    const lines = text.split('\n');
    const fontSize = 11 * zoom; // Smaller font
    ctx.font = `500 ${fontSize}px "Inter", sans-serif`; // Normal weight

    // Calculate dimensions
    const textMetrics = lines.map(line => ctx.measureText(line));
    const maxWidth = Math.max(...textMetrics.map(m => m.width));
    const lineHeight = fontSize * 1.3;
    const totalHeight = lineHeight * lines.length;
    const horizontalPadding = 8 * zoom; // Reduced padding
    const verticalPadding = 5 * zoom;   // Reduced padding

    const boxWidth = maxWidth + horizontalPadding * 2;
    const boxHeight = totalHeight + verticalPadding * 2;
    const boxX = x - boxWidth / 2;
    const boxY = y - boxHeight / 2 - 20 * zoom; // Closer to point

    // Draw shadow (very subtle)
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 4 * zoom;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 * zoom;

    // Draw background (Rounded Rectangle, more transparent)
    ctx.fillStyle = 'rgba(15, 15, 20, 0.65)'; // More transparent
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6 * zoom); // Smaller radius
    } else {
        ctx.rect(boxX, boxY, boxWidth, boxHeight);
    }
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Borders removed for discretion

    // Draw text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    lines.forEach((line, index) => {
        const offsetY = (index - (lines.length - 1) / 2) * lineHeight;
        ctx.fillStyle = index === 0 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(line, x, boxY + boxHeight / 2 + offsetY);
    });
}

/**
 * Render start point indicator when no end point yet
 */
export function renderStartPoint(
    ctx: CanvasRenderingContext2D,
    start: Point,
    zoom: number,
    shapeName: string
): void {
    // Draw start point
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 7 * zoom, 0, 2 * Math.PI);
    ctx.fill();

    // Draw label
    const text = `Click to set ${shapeName} endpoint`;
    ctx.font = `bold ${12 * zoom}px Arial`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    const textMetrics = ctx.measureText(text);
    const padding = 6 * zoom;

    ctx.fillRect(
        start.x - textMetrics.width / 2 - padding,
        start.y - 35 * zoom,
        textMetrics.width + padding * 2,
        25 * zoom
    );

    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, start.x, start.y - 22 * zoom);
}

/**
 * Distance from point to line segment
 */
function distanceToSegment(p: Point, v: Point, w: Point): number {
    const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
    if (l2 === 0) return calculateDistance(p.x, p.y, v.x, v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return calculateDistance(p.x, p.y, v.x + t * (w.x - v.x), v.y + t * (w.y - v.y));
}

/**
 * Check if a point is within a measurement shape
 */
export function isPointInMeasurement(
    point: Point,
    measurement: SharedMeasurement,
    pixelsPerUnit: number,
    scale: number,
    zoom: number
): boolean {
    const { start, end, type, coneWidth } = measurement;

    const dist = calculateDistance(start.x, start.y, end.x, end.y);
    const validScale = (scale && scale > 0) ? scale : 1;
    const validPPU = (pixelsPerUnit && pixelsPerUnit > 0) ? pixelsPerUnit : 50;

    // Threshold for interaction (give it some buffer)
    // 15 screen pixels tolerance
    const threshold = 15 / (zoom * validScale);

    if (type === 'line') {
        return distanceToSegment(point, start, end) <= threshold;
    } else if (type === 'circle') {
        const d = calculateDistance(point.x, point.y, start.x, start.y);
        return d <= dist;
    } else if (type === 'cube') {
        const halfSide = dist;
        return point.x >= start.x - halfSide && point.x <= start.x + halfSide &&
            point.y >= start.y - halfSide && point.y <= start.y + halfSide;
    } else if (type === 'cone') {
        const d = calculateDistance(point.x, point.y, start.x, start.y);
        if (d > dist) return false;

        const pointAngle = Math.atan2(point.y - start.y, point.x - start.x);
        const coneAngle = Math.atan2(end.y - start.y, end.x - start.x);

        let halfAngleRad: number;
        if (coneWidth && coneWidth > 0) {
            const unitDist = dist / (validPPU * validScale); // World Units
            halfAngleRad = Math.atan(coneWidth / (2 * unitDist));
        } else {
            halfAngleRad = (53 / 2) * (Math.PI / 180);
        }

        let diff = Math.abs(pointAngle - coneAngle);
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;

        return Math.abs(diff) <= halfAngleRad;
    }

    return false;
}
