"use client"

import React from 'react';
import { type MapObject, type LayerType } from '@/app/[roomid]/map/types';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';
import { type ShadowResult, isPointInPolygon } from '@/lib/visibility';
import { type Obstacle } from '@/lib/visibility';
import { type DetectedElement } from '@/components/(map)/ElementSelectionMenu';
import StaticToken from '@/components/(map)/StaticToken';

export interface ObjectsLayerProps {
  objects: MapObject[];
  isLayerVisible: (layerId: LayerType) => boolean;
  isObjectVisibleToUser: (obj: MapObject) => boolean;
  bgImageObject: HTMLImageElement | HTMLVideoElement | CanvasImageSource | null;
  containerSize: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  offset: { x: number; y: number };
  selectedObjectIndices: number[];
  precalculatedShadows: ShadowResult | null;
  isMJ: boolean;
  playerViewMode: boolean;
  fogMode: boolean;
  fullMapFog: boolean;
  fogGrid: Map<string, boolean>;
  fogCellSize: number;
  calculateFogOpacity: (cellX: number, cellY: number) => number;
  obstacles: Obstacle[];
  isBackgroundEditMode: boolean;
  activeElementType: 'light' | 'portal' | 'musicZone' | 'character' | 'object' | null;
  activeElementId: string | null;
  isResizingObject: boolean;
  panMode: boolean;
  performanceMode: string;
  mouseClickStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  setSelectedObjectIndices: (v: number[]) => void;
  setDragStart: (v: { x: number; y: number }) => void;
  setIsDraggingObject: (v: boolean) => void;
  setDraggedObjectIndex: (v: number | null) => void;
  setDraggedObjectOriginalPos: (v: { x: number; y: number }) => void;
  setDraggedObjectsOriginalPositions: (v: { index: number; x: number; y: number }[]) => void;
  setContextMenuObjectId: (v: string | null) => void;
  setContextMenuObjectOpen: (v: boolean) => void;
  handleResizeStart: (e: React.MouseEvent, index: number) => void;
  detectElementsAtPosition: (x: number, y: number) => DetectedElement[];
  setDetectedElements: (v: DetectedElement[]) => void;
  setSelectionMenuPosition: (v: { x: number; y: number }) => void;
  setShowElementSelectionMenu: (v: boolean) => void;
}

const ObjectsLayer = React.memo(function ObjectsLayer({
  objects,
  isLayerVisible,
  isObjectVisibleToUser,
  bgImageObject,
  containerSize,
  containerRef,
  zoom,
  offset,
  selectedObjectIndices,
  precalculatedShadows,
  isMJ,
  playerViewMode,
  fogMode,
  fullMapFog,
  fogGrid,
  fogCellSize,
  calculateFogOpacity,
  obstacles,
  isBackgroundEditMode,
  activeElementType,
  activeElementId,
  isResizingObject,
  panMode,
  performanceMode,
  mouseClickStartRef,
  bgCanvasRef,
  setSelectedObjectIndices,
  setDragStart,
  setIsDraggingObject,
  setDraggedObjectIndex,
  setDraggedObjectOriginalPos,
  setDraggedObjectsOriginalPositions,
  setContextMenuObjectId,
  setContextMenuObjectOpen,
  handleResizeStart,
  detectElementsAtPosition,
  setDetectedElements,
  setSelectionMenuPosition,
  setShowElementSelectionMenu,
}: ObjectsLayerProps) {
  return (
    <div className="objects-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
      {isLayerVisible('objects') && objects.map((obj, index) => {
        // Verifier la visibilite de l'objet pour l'utilisateur actuel
        if (!isObjectVisibleToUser(obj)) return null;

        if (!bgImageObject) return null;

        const image = bgImageObject;
        const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
        const cWidth = containerSize.width || containerRef.current?.clientWidth || 0;
        const cHeight = containerSize.height || containerRef.current?.clientHeight || 0;
        if (cWidth === 0 || cHeight === 0) return null;

        const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
        const scaledWidth = imgWidth * scale * zoom;
        const scaledHeight = imgHeight * scale * zoom;

        const x = (obj.x / imgWidth) * scaledWidth - offset.x;
        const y = (obj.y / imgHeight) * scaledHeight - offset.y;
        const w = (obj.width / imgWidth) * scaledWidth;
        const h = (obj.height / imgHeight) * scaledHeight;

        // Skip if any calculated values are invalid
        if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) {
          return null;
        }

        const isSelected = selectedObjectIndices.includes(index);

        // Visibility Check (Shadows & Fog) logic
        //  CALCUL DES OMBRES POUR MASQUER LES PNJs ET OBJETS (Cote Client seulement)
        let objectIsVisible = true;

        const activeShadows = precalculatedShadows?.shadows;
        const containingPolygons = precalculatedShadows?.polygonsContainingViewer;

        const objCenter = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };

        // 1. Check Fog of War Grid (if active)
        // Only apply if not GM (or simulating player) OR if full map fog is on
        const effectiveIsMJLocal = isMJ && !playerViewMode;

        if (fogMode || fullMapFog || fogGrid.size > 0) {
          const cellX = Math.floor(objCenter.x / fogCellSize);
          const cellY = Math.floor(objCenter.y / fogCellSize);
          const opacity = calculateFogOpacity(cellX, cellY);

          // If fog is opaque (>= 1), hide object completely.
          // This handles both fullMapFog and manual fog cells, plus character vision revealing it.
          if (opacity >= 0.99) {
            objectIsVisible = false;
          }
        }

        // 2. Check Dynamic Shadows (Walls)
        // Only filter if not GM (or simulating player) and obstacles are active
        if (objectIsVisible && (!effectiveIsMJLocal) && obstacles.length > 0 && isLayerVisible('obstacles') && activeShadows) {
          // Check shadow polygons
          for (const shadow of activeShadows) {
            if (isPointInPolygon(objCenter, shadow)) {
              objectIsVisible = false;
              break;
            }
          }

          // Check if viewer is inside a polygon but object is outside (hide exterior)
          if (objectIsVisible && containingPolygons && containingPolygons.length > 0) {
            for (const polyInfo of containingPolygons) {
              if (!isPointInPolygon(objCenter, polyInfo.points)) {
                objectIsVisible = false;
                break;
              }
            }
          }
        }

        if (!objectIsVisible) return null;


        return (
          <div
            key={obj.id}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: h,
              transform: `rotate(${obj.rotation}deg)`,
              pointerEvents: obj.isBackground && !isBackgroundEditMode ? 'none' : (
                // Desactiver les interactions si un autre element est actif
                activeElementType !== null && (activeElementType !== 'object' || activeElementId !== obj.id) ? 'none' : 'auto'
              ),
              cursor: isResizingObject ? 'nwse-resize' : (obj.isLocked && !isMJ ? 'default' : 'move'),
              zIndex: obj.isBackground ? 1 : 2,
              opacity: activeElementType !== null && (activeElementType !== 'object' || activeElementId !== obj.id) ? 0.3 : 1, // Semi-transparent si desactive
              transition: 'opacity 0.2s ease',
            }}
            onMouseDown={(e) => {
              // Si en mode Pan, laisser l'evenement remonter au canvas
              if (panMode) return;

              // Prevent canvas from picking up this click
              e.stopPropagation();

              // Verifier si un autre element est deja actif
              if (activeElementType !== null && (activeElementType !== 'object' || activeElementId !== obj.id)) {
                return; // Ne devrait pas arriver avec pointerEvents: none, mais securite
              }

              if (e.button === 0) {
                // Tracking for click vs drag - ALWAYS set this even if locked
                mouseClickStartRef.current = { x: e.clientX, y: e.clientY };

                // Empecher le drag si objet verrouille et utilisateur non-MJ
                if (obj.isLocked && !isMJ) {
                  return;
                }

                // Si cet objet est deja actif, bypasser la detection
                const isThisObjectActive = activeElementType === 'object' && activeElementId === obj.id;

                if (!isThisObjectActive) {
                  // Calculer coordonnees monde pour la detection
                  // On utilise les coords existantes du clic si possible, ou on recalcule
                  const rect = bgCanvasRef.current?.getBoundingClientRect();
                  if (rect) {
                    // approximatif car on n'a pas acces facile a scale ici sans recalculer
                    // Mais on peut utiliser e.clientX directement dans detectElementsAtPosition car il recalcule scale
                    const cWidth = containerRef.current?.clientWidth || 0;
                    const cHeight = containerRef.current?.clientHeight || 0;
                    if (cWidth > 0 && cHeight > 0 && bgImageObject) {
                      const { width: imgW, height: imgH } = getMediaDimensions(bgImageObject);
                      const scale = Math.min(cWidth / imgW, cHeight / imgH);
                      const sWidth = imgW * scale * zoom;
                      const sHeight = imgH * scale * zoom;
                      const clickMapX = ((e.clientX - rect.left + offset.x) / sWidth) * imgW;
                      const clickMapY = ((e.clientY - rect.top + offset.y) / sHeight) * imgH;

                      const elementsAtPosition = detectElementsAtPosition(clickMapX, clickMapY);

                      if (elementsAtPosition.length > 1) {
                        setDetectedElements(elementsAtPosition);
                        setSelectionMenuPosition({ x: e.clientX, y: e.clientY });
                        setShowElementSelectionMenu(true);
                        return;
                      }
                    }
                  }
                }

                // Select
                // Calculate which objects will be dragged BEFORE updating state
                // This is critical because React state updates are async
                let objectsToDrag: number[];
                if (!e.shiftKey) {
                  // Single selection - will drag only this object
                  objectsToDrag = [index];
                  setSelectedObjectIndices([index]);
                } else {
                  // Multi-select with Shift
                  if (selectedObjectIndices.includes(index)) {
                    // Already selected, drag all selected
                    objectsToDrag = selectedObjectIndices;
                  } else {
                    // Add to selection and drag all
                    objectsToDrag = [...selectedObjectIndices, index];
                    setSelectedObjectIndices(objectsToDrag);
                  }
                }

                // If clicking on an already selected object (without Shift), drag all selected
                if (!e.shiftKey && selectedObjectIndices.includes(index) && selectedObjectIndices.length > 1) {
                  objectsToDrag = selectedObjectIndices;
                }

                // Initiate Drag - Convert client coords to map coords for consistency
                const rect = bgCanvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                const containerWidth = containerRef.current?.clientWidth || rect.width;
                const containerHeight = containerRef.current?.clientHeight || rect.height;
                const image = bgImageObject;
                const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
                const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
                const scaledWidth = imgWidth * scale * zoom;
                const scaledHeight = imgHeight * scale * zoom;
                const startMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                const startMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                setDragStart({ x: startMapX, y: startMapY });
                setIsDraggingObject(true);
                setDraggedObjectIndex(index);
                setDraggedObjectOriginalPos({ x: obj.x, y: obj.y });

                // Store original positions for all objects to drag
                const originalPositions = objectsToDrag.map(idx => ({
                  index: idx,
                  x: objects[idx].x,
                  y: objects[idx].y
                }));
                setDraggedObjectsOriginalPositions(originalPositions);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              const start = mouseClickStartRef.current;
              if (start) {
                const dist = Math.sqrt(Math.pow(e.clientX - start.x, 2) + Math.pow(e.clientY - start.y, 2));
                if (dist < 5) {
                  // It was a click, not a drag
                  setContextMenuObjectId(obj.id);
                  setContextMenuObjectOpen(true);
                  // Ensure selection if not already (handled in mousedown but good to be safe)
                  if (!selectedObjectIndices.includes(index) && isMJ) {
                    setSelectedObjectIndices([index]);
                  }
                }
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenuObjectId(obj.id);
              setContextMenuObjectOpen(true);
              // Also select it if not selected (MJ only)
              if (!selectedObjectIndices.includes(index) && isMJ) {
                setSelectedObjectIndices([index]);
              }
            }}
          >
            <StaticToken
              src={obj.imageUrl}
              alt="Object"
              performanceMode={performanceMode}
              style={{
                width: '100%',
                height: '100%',
                border: isSelected ? '2px solid #00BFFF' : (obj.isBackground && isBackgroundEditMode ? '2px dashed rgba(255, 255, 255, 0.5)' : 'none'),
                opacity: obj.isBackground && isBackgroundEditMode ? 0.8 : 1,
                objectFit: 'fill',
                display: 'block'
              }}
            />

            {/* Resize Handle (Bottom Right) */}
            {isSelected && isMJ && (
              <div
                style={{
                  position: 'absolute',
                  bottom: -6,
                  right: -6,
                  width: 12,
                  height: 12,
                  backgroundColor: '#00BFFF',
                  borderRadius: '50%',
                  cursor: 'nwse-resize',
                  zIndex: 6 // Resize handles above objects
                }}
                onMouseDown={(e) => handleResizeStart(e, index)}
              />
            )}
          </div>
        )
      })}

    </div>
  );
});

export default ObjectsLayer;
