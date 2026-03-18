/**
 * Coordinate transformation utilities for the map canvas.
 * Centralizes screen-to-map coordinate conversion that was duplicated ~23 times in page.tsx.
 */

export const getMediaDimensions = (media: HTMLImageElement | HTMLVideoElement | CanvasImageSource) => {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight };
  }
  if (media instanceof HTMLImageElement) {
    return { width: media.width, height: media.height };
  }
  return { width: (media as any).width || 0, height: (media as any).height || 0 };
};

export interface MapCoords {
  x: number;
  y: number;
  imgWidth: number;
  imgHeight: number;
  scale: number;
  scaledWidth: number;
  scaledHeight: number;
  containerWidth: number;
  containerHeight: number;
}

/**
 * Convert screen (client) coordinates to map (image) coordinates.
 *
 * @param clientX - Mouse clientX
 * @param clientY - Mouse clientY
 * @param rect - Canvas bounding client rect
 * @param containerWidth - Container element width
 * @param containerHeight - Container element height
 * @param bgImage - Background image/video element
 * @param zoom - Current zoom level
 * @param offset - Current pan offset {x, y}
 */
export function screenToMapCoords(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  containerWidth: number,
  containerHeight: number,
  bgImage: HTMLImageElement | HTMLVideoElement | CanvasImageSource,
  zoom: number,
  offset: { x: number; y: number }
): MapCoords {
  const { width: imgWidth, height: imgHeight } = getMediaDimensions(bgImage);
  const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
  const scaledWidth = imgWidth * scale * zoom;
  const scaledHeight = imgHeight * scale * zoom;
  const x = ((clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
  const y = ((clientY - rect.top + offset.y) / scaledHeight) * imgHeight;

  return { x, y, imgWidth, imgHeight, scale, scaledWidth, scaledHeight, containerWidth, containerHeight };
}

/**
 * Convert map (image) coordinates to screen (pixel) coordinates for rendering.
 */
export function mapToScreenCoords(
  mapX: number,
  mapY: number,
  imgWidth: number,
  imgHeight: number,
  scaledWidth: number,
  scaledHeight: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  const x = (mapX / imgWidth) * scaledWidth - offsetX;
  const y = (mapY / imgHeight) * scaledHeight - offsetY;
  return { x, y };
}
