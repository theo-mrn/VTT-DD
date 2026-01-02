/**
 * Measurement utilities for D&D Area of Effect shapes
 */

export type MeasurementShape = 'line' | 'cone' | 'circle' | 'cube';

export interface Point {
    x: number;
    y: number;
}

export interface MeasurementRenderOptions {
    ctx: CanvasRenderingContext2D;
    start: Point;
    end: Point;
    zoom: number;
    pixelsPerUnit: number;
    unitName: string;
    isCalibrating: boolean;
    coneAngle?: number;
    coneWidth?: number; // Width at the end of the cone in units
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
        return `Calibration: ${pixelDist.toFixed(0)} px`;
    }

    if (area !== null) {
        return `${distance.toFixed(1)} ${unitName}\n${area.toFixed(1)} ${unitName}²`;
    }

    return `${distance.toFixed(1)} ${unitName}`;
}

/**
 * Render line measurement (ruler)
 */
export function renderLineMeasurement(options: MeasurementRenderOptions): void {
    const { ctx, start, end, zoom, pixelsPerUnit, unitName, isCalibrating } = options;

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
    const unitDist = pixelDist / (pixelsPerUnit * zoom);
    const text = formatMeasurement(unitDist, null, unitName, isCalibrating, pixelDist);

    drawLabel(ctx, text, (start.x + end.x) / 2, (start.y + end.y) / 2, zoom);
}

/**
 * Render cone measurement (spell cone)
 */
export function renderConeMeasurement(options: MeasurementRenderOptions): void {
    const { ctx, start, end, zoom, pixelsPerUnit, unitName, isCalibrating, coneWidth } = options;

    const angle = calculateAngle(start, end);
    const pixelDist = calculateDistance(start.x, start.y, end.x, end.y);
    const unitDist = pixelDist / (pixelsPerUnit * zoom);

    let halfAngleRad: number;
    let actualConeWidth: number;

    if (coneWidth !== undefined && coneWidth > 0) {
        // If width is specified, calculate angle from width and length
        // width = 2 * length * tan(halfAngle)
        // halfAngle = atan(width / (2 * length))
        halfAngleRad = Math.atan(coneWidth / (2 * unitDist));
        actualConeWidth = coneWidth;
    } else {
        // Default 53° cone
        const defaultAngle = 53;
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

    // Draw filled cone
    ctx.fillStyle = 'rgba(255, 140, 0, 0.25)'; // Semi-transparent orange
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(leftEnd.x, leftEnd.y);
    ctx.arc(start.x, start.y, pixelDist, leftAngle, rightAngle);
    ctx.lineTo(start.x, start.y);
    ctx.fill();

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
    const text = `L:${unitDist.toFixed(1)} W:${actualConeWidth.toFixed(1)} ${unitName}\n${area.toFixed(1)} ${unitName}²`;

    drawLabel(ctx, text, end.x, end.y, zoom);
}

/**
 * Render circle/sphere measurement
 */
export function renderCircleMeasurement(options: MeasurementRenderOptions): void {
    const { ctx, start, end, zoom, pixelsPerUnit, unitName, isCalibrating } = options;

    const pixelDist = calculateDistance(start.x, start.y, end.x, end.y);
    const unitDist = pixelDist / (pixelsPerUnit * zoom);

    // Draw filled circle
    ctx.fillStyle = 'rgba(0, 140, 255, 0.2)'; // Semi-transparent blue
    ctx.beginPath();
    ctx.arc(start.x, start.y, pixelDist, 0, 2 * Math.PI);
    ctx.fill();

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
    const { ctx, start, end, zoom, pixelsPerUnit, unitName, isCalibrating } = options;

    const pixelDist = calculateDistance(start.x, start.y, end.x, end.y);
    const unitDist = pixelDist / (pixelsPerUnit * zoom);

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
function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, zoom: number): void {
    const lines = text.split('\n');
    const fontSize = 14 * zoom;
    ctx.font = `bold ${fontSize}px Arial`;

    // Calculate max width for background
    const textMetrics = lines.map(line => ctx.measureText(line));
    const maxWidth = Math.max(...textMetrics.map(m => m.width));
    const lineHeight = fontSize * 1.2;
    const totalHeight = lineHeight * lines.length;
    const padding = 6 * zoom;

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(
        x - maxWidth / 2 - padding,
        y - totalHeight / 2 - padding - 15 * zoom,
        maxWidth + padding * 2,
        totalHeight + padding * 2
    );

    // Draw text
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    lines.forEach((line, index) => {
        const offsetY = (index - (lines.length - 1) / 2) * lineHeight;
        ctx.fillText(line, x, y - 15 * zoom + offsetY);
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
