import { type Point, type SavedDrawing, type DrawingTool } from './types';

// ... (existing functions isPointOnDrawing, getResizeHandles)

// Helper type for the coordinate transformation function
export type TransformPoint = (p: Point) => Point;

export const renderDrawings = (
    ctx: CanvasRenderingContext2D,
    drawings: SavedDrawing[],
    transformPoint: TransformPoint,
    selectedDrawingIndex: number | null,
    imageWidth: number,
    imageHeight: number,
    zoom: number,
    offset: Point,
    scaledWidth: number,
    scaledHeight: number
) => {
    if (!drawings) return;

    drawings.forEach((drawing, index) => {
        if (drawing.points && Array.isArray(drawing.points)) {
            ctx.beginPath();
            ctx.strokeStyle = drawing.color;
            ctx.lineWidth = drawing.width * zoom;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (drawing.type === 'line') {
                if (drawing.points.length >= 2) {
                    const p1 = drawing.points[0];
                    const p2 = drawing.points[1];
                    const t1 = transformPoint(p1);
                    const t2 = transformPoint(p2);
                    ctx.moveTo(t1.x, t1.y);
                    ctx.lineTo(t2.x, t2.y);
                }
            } else if (drawing.type === 'rectangle') {
                if (drawing.points.length >= 2) {
                    const p1 = drawing.points[0];
                    const p2 = drawing.points[1];
                    const t1 = transformPoint(p1);
                    const t2 = transformPoint(p2);
                    ctx.strokeRect(t1.x, t1.y, t2.x - t1.x, t2.y - t1.y);
                }
            } else if (drawing.type === 'circle') {
                if (drawing.points.length >= 2) {
                    const p1 = drawing.points[0];
                    const p2 = drawing.points[1];
                    const t1 = transformPoint(p1);
                    const t2 = transformPoint(p2);

                    const radius = Math.sqrt(Math.pow(t2.x - t1.x, 2) + Math.pow(t2.y - t1.y, 2));
                    ctx.beginPath();
                    ctx.arc(t1.x, t1.y, radius, 0, 2 * Math.PI);
                }
            } else {
                // 'pen' or undefined
                drawing.points.forEach((point, idx) => {
                    const t = transformPoint(point);
                    if (idx === 0) {
                        ctx.moveTo(t.x, t.y);
                    } else {
                        ctx.lineTo(t.x, t.y);
                    }
                });
            }
            ctx.stroke();

            // Draw Resize Handles if Selected
            if (selectedDrawingIndex === index) {
                const handles = getResizeHandles(drawing);
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;

                handles.forEach((handle) => {
                    const tHandle = transformPoint(handle);
                    ctx.beginPath();
                    ctx.arc(tHandle.x, tHandle.y, 6, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.stroke();
                });
            }
        }
    });
};

export const renderCurrentPath = (
    ctx: CanvasRenderingContext2D,
    currentPath: Point[],
    currentTool: DrawingTool,
    drawingColor: string,
    drawingSize: number,
    zoom: number,
    transformPoint: TransformPoint
) => {
    if (currentPath.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = currentTool === 'eraser' ? 'rgba(255,0,0,0.5)' : drawingColor;
        ctx.lineWidth = drawingSize * zoom;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (currentTool === 'line') {
            if (currentPath.length >= 2) {
                const p1 = currentPath[0];
                const p2 = currentPath[currentPath.length - 1];
                const t1 = transformPoint(p1);
                const t2 = transformPoint(p2);
                ctx.moveTo(t1.x, t1.y);
                ctx.lineTo(t2.x, t2.y);
            }
        } else if (currentTool === 'rectangle') {
            if (currentPath.length >= 2) {
                const p1 = currentPath[0];
                const p2 = currentPath[currentPath.length - 1];
                const t1 = transformPoint(p1);
                const t2 = transformPoint(p2);
                ctx.strokeRect(t1.x, t1.y, t2.x - t1.x, t2.y - t1.y);
            }
        } else if (currentTool === 'circle') {
            if (currentPath.length >= 2) {
                const p1 = currentPath[0];
                const p2 = currentPath[currentPath.length - 1];
                const t1 = transformPoint(p1);
                const t2 = transformPoint(p2);
                const radius = Math.sqrt(Math.pow(t2.x - t1.x, 2) + Math.pow(t2.y - t1.y, 2));
                ctx.beginPath();
                ctx.arc(t1.x, t1.y, radius, 0, 2 * Math.PI);
            }
        } else {
            // Pen
            currentPath.forEach((point, index) => {
                const t = transformPoint(point);
                if (index === 0) {
                    ctx.moveTo(t.x, t.y);
                } else {
                    ctx.lineTo(t.x, t.y);
                }
            });
        }
        ctx.stroke();
    }
};


export const getResizeHandles = (drawing: SavedDrawing): Point[] => {
    if (!drawing.points || drawing.points.length < 2) return [];
    const handles: Point[] = [];

    if (drawing.type === 'line') {
        handles.push(drawing.points[0]); // Start
        handles.push(drawing.points[1]); // End
    } else if (drawing.type === 'rectangle') {
        const p1 = drawing.points[0];
        const p2 = drawing.points[1];
        handles.push(p1);
        handles.push({ x: p2.x, y: p1.y });
        handles.push(p2);
        handles.push({ x: p1.x, y: p2.y });
    } else if (drawing.type === 'circle') {
        // Handle at outer radius
        handles.push(drawing.points[1]);
    }

    return handles;
};

export const isPointOnDrawing = (clickX: number, clickY: number, drawing: SavedDrawing, zoom: number): boolean => {
    if (!drawing.points || drawing.points.length < 2) return false;

    const strokeWidth = (drawing.width || 5);
    const deleteDistance = (strokeWidth / 2 + 10 / zoom); // Tolerance

    if (drawing.type === 'line') {
        const p1 = drawing.points[0];
        const p2 = drawing.points[1];
        const A = clickX - p1.x;
        const B = clickY - p1.y;
        const C = p2.x - p1.x;
        const D = p2.y - p1.y;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) { xx = p1.x; yy = p1.y; }
        else if (param > 1) { xx = p2.x; yy = p2.y; }
        else { xx = p1.x + param * C; yy = p1.y + param * D; }
        const dist = Math.sqrt(Math.pow(clickX - xx, 2) + Math.pow(clickY - yy, 2));
        return dist < deleteDistance;
    } else if (drawing.type === 'rectangle') {
        const p1 = drawing.points[0];
        const p2 = drawing.points[1];
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        // Click on edges
        if (Math.abs(clickX - minX) < deleteDistance && clickY >= minY && clickY <= maxY) return true;
        if (Math.abs(clickX - maxX) < deleteDistance && clickY >= minY && clickY <= maxY) return true;
        if (Math.abs(clickY - minY) < deleteDistance && clickX >= minX && clickX <= maxX) return true;
        if (Math.abs(clickY - maxY) < deleteDistance && clickX >= minX && clickX <= maxX) return true;
        return false;
    } else if (drawing.type === 'circle') {
        const p1 = drawing.points[0];
        const p2 = drawing.points[1];
        const radius = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        const distToCenter = Math.sqrt(Math.pow(clickX - p1.x, 2) + Math.pow(clickY - p1.y, 2));
        return Math.abs(distToCenter - radius) < deleteDistance;
    } else {
        // Pen (Freehand)
        for (let i = 0; i < drawing.points.length - 1; i++) {
            const p1 = drawing.points[i];
            const p2 = drawing.points[i + 1];
            const A = clickX - p1.x;
            const B = clickY - p1.y;
            const C = p2.x - p1.x;
            const D = p2.y - p1.y;
            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            let param = -1;
            if (len_sq !== 0) param = dot / len_sq;
            let xx, yy;
            if (param < 0) { xx = p1.x; yy = p1.y; }
            else if (param > 1) { xx = p2.x; yy = p2.y; }
            else { xx = p1.x + param * C; yy = p1.y + param * D; }
            const dist = Math.sqrt(Math.pow(clickX - xx, 2) + Math.pow(clickY - yy, 2));
            if (dist < deleteDistance) return true;
        }
    }
    return false;
};
