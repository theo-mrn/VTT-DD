"use client"

import React from 'react';
import { Lightbulb } from 'lucide-react';
import { type LightSource } from '@/app/[roomid]/map/types';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';
import { type DetectedElement } from '@/components/(map)/ElementSelectionMenu';

export interface LightsLayerProps {
  lights: LightSource[];
  isMJ: boolean;
  bgImageObject: HTMLImageElement | HTMLVideoElement | CanvasImageSource | null;
  containerSize: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  offset: { x: number; y: number };
  panMode: boolean;
  activeElementType: 'light' | 'portal' | 'musicZone' | 'character' | 'object' | null;
  activeElementId: string | null;
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  setIsDraggingLight: (v: boolean) => void;
  setDraggedLightId: (v: string | null) => void;
  setDraggedLightOriginalPos: (v: { x: number; y: number }) => void;
  setDragStart: (v: { x: number; y: number }) => void;
  setContextMenuLightId: (v: string | null) => void;
  setContextMenuLightOpen: (v: boolean) => void;
  detectElementsAtPosition: (x: number, y: number) => DetectedElement[];
  setDetectedElements: (v: DetectedElement[]) => void;
  setSelectionMenuPosition: (v: { x: number; y: number }) => void;
  setShowElementSelectionMenu: (v: boolean) => void;
}

export default function LightsLayer({
  lights,
  isMJ,
  bgImageObject,
  containerSize,
  containerRef,
  zoom,
  offset,
  panMode,
  activeElementType,
  activeElementId,
  bgCanvasRef,
  setIsDraggingLight,
  setDraggedLightId,
  setDraggedLightOriginalPos,
  setDragStart,
  setContextMenuLightId,
  setContextMenuLightOpen,
  detectElementsAtPosition,
  setDetectedElements,
  setSelectionMenuPosition,
  setShowElementSelectionMenu,
}: LightsLayerProps) {
  return (
    <div className="lights-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: 45 }}>
      {/* Only visible for MJ to edit. Players see the light effect, not the icon. */}
      {isMJ && lights.map((light) => {
        if (!bgImageObject) return null;
        const image = bgImageObject;
        const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
        const cWidth = containerSize.width || containerRef.current?.clientWidth || 0;
        const cHeight = containerSize.height || containerRef.current?.clientHeight || 0;
        if (cWidth === 0 || cHeight === 0) return null;

        const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
        const scaledWidth = imgWidth * scale * zoom;
        const scaledHeight = imgHeight * scale * zoom;

        const lightScreenX = (light.x / imgWidth) * scaledWidth;
        const lightScreenY = (light.y / imgHeight) * scaledHeight;
        const size = 40 * zoom;

        // Desactiver les interactions si un autre element est actif
        const isThisElementActive = activeElementType === 'light' && activeElementId === light.id;
        const shouldDisableInteraction = activeElementType !== null && !isThisElementActive;

        return (
          <div
            key={light.id}
            style={{
              position: 'absolute',
              left: lightScreenX - offset.x,
              top: lightScreenY - offset.y,
              width: size + 'px',
              height: size + 'px',
              transform: 'translate(-50%, -50%)',
              pointerEvents: shouldDisableInteraction ? 'none' : 'auto',
              cursor: isMJ ? 'move' : 'default',
              opacity: shouldDisableInteraction ? 0.3 : 1,
              transition: 'opacity 0.2s ease',
              zIndex: 50
            }}
            onMouseDown={(e) => {
              if (!isMJ) return;
              if (panMode) return;

              // Verifier si un autre element est actuellement actif
              if (activeElementType !== null && (activeElementType !== 'light' || activeElementId !== light.id)) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }

              e.preventDefault();
              e.stopPropagation();

              // Calculer les coordonnees monde pour la detection
              const rect = bgCanvasRef.current?.getBoundingClientRect();
              if (!rect) return;

              const clickMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
              const clickMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;

              // Si cet element est deja actif, bypasser la detection et commencer le drag directement
              if (activeElementType === 'light' && activeElementId === light.id) {
                setIsDraggingLight(true);
                setDraggedLightId(light.id);
                setDraggedLightOriginalPos({ x: light.x, y: light.y });
                const startMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                const startMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                setDragStart({ x: startMapX, y: startMapY });
                return;
              }

              // Detection d'elements superposes (seulement si pas encore actif)
              const elementsAtPosition = detectElementsAtPosition(clickMapX, clickMapY);

              if (elementsAtPosition.length > 1) {
                // Plusieurs elements detectes -> afficher le menu
                setDetectedElements(elementsAtPosition);
                setSelectionMenuPosition({ x: e.clientX, y: e.clientY });
                setShowElementSelectionMenu(true);
                return;
              }

              // Un seul element ou element deja actif -> commencer le drag
              setIsDraggingLight(true);
              setDraggedLightId(light.id);
              setDraggedLightOriginalPos({ x: light.x, y: light.y });

              if (rect) {
                const startMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                const startMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                setDragStart({ x: startMapX, y: startMapY });
              }
            }}
            onDoubleClick={(e) => {
              if (!isMJ) return;
              e.preventDefault();
              e.stopPropagation();
              setContextMenuLightId(light.id);
              setContextMenuLightOpen(true);
            }}
            onContextMenu={(e) => {
              if (!isMJ) return;
              e.preventDefault();
              setContextMenuLightId(light.id);
              setContextMenuLightOpen(true);
            }}
          >
            <div className={`w-full h-full rounded-full flex items-center justify-center border-2 transition-transform hover:scale-110 ${light.visible ? 'bg-yellow-500/20 border-yellow-400 shadow-[0_0_20px_rgba(255,215,0,0.4)]' : 'bg-gray-500/20 border-gray-400'}`}>
              <Lightbulb size={size * 0.6} className={light.visible ? "text-yellow-100 fill-yellow-500/50" : "text-gray-400"} />
            </div>
            {isMJ && (
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-0.5 rounded text-[10px] text-yellow-500 whitespace-nowrap pointer-events-none opacity-0 hover:opacity-100 transition-opacity">
                {light.radius}m
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
