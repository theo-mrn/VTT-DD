import {
  type MeasurementShape,
  type SharedMeasurement,
  type Point,
  renderLineMeasurement,
  renderConeMeasurement,
  renderCircleMeasurement,
  renderCubeMeasurement,
  renderStartPoint,
} from '../measurements';

export interface MeasurementRenderState {
  offset: { x: number; y: number };
  zoom: number;
  measurements: SharedMeasurement[];
  measureMode: boolean;
  measureStart: Point | null;
  measureEnd: Point | null;
  measurementShape: MeasurementShape;
  pixelsPerUnit: number;
  unitName: string;
  isCalibrating: boolean;
  coneAngle: number;
  coneShape: 'flat' | 'rounded';
  coneMode: 'angle' | 'dimensions';
  coneLength: number | undefined;
  coneWidth: number | undefined;
  fireballVideo: HTMLVideoElement | null;
  measurementSkins: Record<string, HTMLVideoElement>;
}

export function drawMeasurements(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  scaledWidth: number,
  scaledHeight: number,
  state: MeasurementRenderState
) {
  const {
    offset,
    zoom,
    measurements,
    measureMode,
    measureStart,
    measureEnd,
    measurementShape,
    pixelsPerUnit,
    unitName,
    isCalibrating,
    coneAngle,
    coneShape,
    coneMode,
    coneLength,
    coneWidth,
    fireballVideo,
    measurementSkins,
  } = state;

  // 1. Shared Measurements
  measurements.forEach(m => {
    // REMOVED: Skip logic - let all measurements render
    // The local measurement will draw on top if both exist

    const p1 = m.start;
    const p2 = m.end;
    if (!p1 || !p2) return;

    const x1 = (p1.x / imgWidth) * scaledWidth - offset.x;
    const y1 = (p1.y / imgHeight) * scaledHeight - offset.y;
    const x2 = (p2.x / imgWidth) * scaledWidth - offset.x;
    const y2 = (p2.y / imgHeight) * scaledHeight - offset.y;

    const screenStart = { x: x1, y: y1 };
    const screenEnd = { x: x2, y: y2 };
    const currentScale = scaledWidth / (imgWidth * zoom);

    const renderOptions = {
      ctx,
      start: screenStart,
      end: screenEnd,
      zoom,
      scale: currentScale,
      pixelsPerUnit,
      unitName: m.unitName || unitName,
      isCalibrating: false,

      coneAngle: m.coneAngle || 53.13,
      coneShape: m.coneShape || 'rounded',
      coneMode: m.coneMode || 'angle',
      fixedLength: m.fixedLength,
      coneWidth: m.coneWidth,
      skinElement: (m.skin && measurementSkins[m.skin]) ? measurementSkins[m.skin] : null
    };

    switch (m.type) {
      case 'line': renderLineMeasurement(renderOptions); break;
      case 'cone': renderConeMeasurement(renderOptions); break;
      case 'circle': renderCircleMeasurement(renderOptions); break;
      case 'cube': renderCubeMeasurement(renderOptions); break;
    }
  });

  // 2. Active Local Measurement
  if (measureMode && measureStart) {
    const p1 = measureStart;
    const p2 = measureEnd;

    if (p1 && p2) {
      const x1 = (p1.x / imgWidth) * scaledWidth - offset.x;
      const y1 = (p1.y / imgHeight) * scaledHeight - offset.y;
      const x2 = (p2.x / imgWidth) * scaledWidth - offset.x;
      const y2 = (p2.y / imgHeight) * scaledHeight - offset.y;

      const screenStart = { x: x1, y: y1 };
      const screenEnd = { x: x2, y: y2 };
      const currentScale = scaledWidth / (imgWidth * zoom);

      const renderOptions = {
        ctx,
        start: screenStart,
        end: screenEnd,
        zoom,
        scale: currentScale,
        pixelsPerUnit,
        unitName,
        isCalibrating,
        coneAngle: coneAngle,
        coneShape: coneShape,
        coneMode: coneMode,
        fixedLength: coneLength,
        coneWidth: coneWidth, // Custom
        skinElement: ((measurementShape === 'circle' || measurementShape === 'cone') && fireballVideo) ? fireballVideo : null
      };

      switch (measurementShape) {
        case 'line': renderLineMeasurement(renderOptions); break;
        case 'cone': renderConeMeasurement(renderOptions); break;
        case 'circle': renderCircleMeasurement(renderOptions); break;
        case 'cube': renderCubeMeasurement(renderOptions); break;
      }
    } else if (p1 && !p2) {
      // Start point only
      const x1 = (p1.x / imgWidth) * scaledWidth - offset.x;
      const y1 = (p1.y / imgHeight) * scaledHeight - offset.y;

      const shapeNames = { line: 'line', cone: 'cone', circle: 'circle', cube: 'cube' };
      renderStartPoint(ctx, { x: x1, y: y1 }, zoom, shapeNames[measurementShape]);
    }
  }
}
