"use client";

import React from 'react';
import { type Portal, type Point } from '@/app/[roomid]/map/types';
import { type DetectedElement } from '@/components/(map)/ElementSelectionMenu';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';

type ActiveElementType = 'light' | 'portal' | 'musicZone' | 'character' | 'object' | null;

interface PortalsLayerProps {
  portals: Portal[];
  selectedCityId: string | null;
  isMJ: boolean;
  bgImageObject: HTMLImageElement | HTMLVideoElement | null;
  containerSize: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  offset: Point;
  panMode: boolean;
  contextMenuPortalId: string | null;
  activeElementType: ActiveElementType;
  activeElementId: string | null;
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  setIsDraggingPortal: (v: boolean) => void;
  setDraggedPortalId: (id: string | null) => void;
  setDraggedPortalOriginalPos: (pos: { x: number; y: number }) => void;
  setDragStart: (pos: { x: number; y: number }) => void;
  setEditingPortal: (portal: Portal | null) => void;
  setShowPortalConfig: (v: boolean) => void;
  setContextMenuPortalId: (id: string | null) => void;
  setContextMenuPortalOpen: (v: boolean) => void;
  detectElementsAtPosition: (clickX: number, clickY: number) => DetectedElement[];
  setDetectedElements: (elements: DetectedElement[]) => void;
  setSelectionMenuPosition: (pos: { x: number; y: number }) => void;
  setShowElementSelectionMenu: (v: boolean) => void;
}

export default function PortalsLayer({
  portals,
  selectedCityId,
  isMJ,
  bgImageObject,
  containerSize,
  containerRef,
  zoom,
  offset,
  panMode,
  contextMenuPortalId,
  activeElementType,
  activeElementId,
  bgCanvasRef,
  setIsDraggingPortal,
  setDraggedPortalId,
  setDraggedPortalOriginalPos,
  setDragStart,
  setEditingPortal,
  setShowPortalConfig,
  setContextMenuPortalId,
  setContextMenuPortalOpen,
  detectElementsAtPosition,
  setDetectedElements,
  setSelectionMenuPosition,
  setShowElementSelectionMenu,
}: PortalsLayerProps) {
  return (
    <div className="portals-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: 46 }}>
      {isMJ && portals.filter(p => !p.cityId || p.cityId === selectedCityId).map((portal, index) => {
        if (!bgImageObject) return null;
        const image = bgImageObject;
        const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
        const cWidth = containerSize.width || containerRef.current?.clientWidth || 0;
        const cHeight = containerSize.height || containerRef.current?.clientHeight || 0;
        if (cWidth === 0 || cHeight === 0) return null;

        const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
        const scaledWidth = imgWidth * scale * zoom;
        const scaledHeight = imgHeight * scale * zoom;

        const portalScreenX = (portal.x / imgWidth) * scaledWidth;
        const portalScreenY = (portal.y / imgHeight) * scaledHeight;
        const size = 40 * zoom;
        const isSelected = contextMenuPortalId === portal.id;

        // Desactiver les interactions si un autre element est actif
        const isThisElementActive = activeElementType === 'portal' && activeElementId === portal.id;
        const shouldDisableInteraction = activeElementType !== null && !isThisElementActive;

        return (
          <div
            key={`${portal.id}-${index}`}
            style={{
              position: 'absolute',
              left: portalScreenX - offset.x,
              top: portalScreenY - offset.y,
              width: size + 'px',
              height: size + 'px',
              transform: 'translate(-50%, -50%)',
              pointerEvents: shouldDisableInteraction ? 'none' : 'auto',
              cursor: 'move',
              opacity: shouldDisableInteraction ? 0.3 : 1,
              transition: 'opacity 0.2s ease',
              zIndex: 50
            }}
            onMouseDown={(e) => {
              if (panMode) return;

              // Verifier si un autre element est actuellement actif
              if (activeElementType !== null && (activeElementType !== 'portal' || activeElementId !== portal.id)) {
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
              if (activeElementType === 'portal' && activeElementId === portal.id) {
                setIsDraggingPortal(true);
                setDraggedPortalId(portal.id);
                setDraggedPortalOriginalPos({ x: portal.x, y: portal.y });
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
              setIsDraggingPortal(true);
              setDraggedPortalId(portal.id);
              setDraggedPortalOriginalPos({ x: portal.x, y: portal.y });

              if (rect) {
                const startMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                const startMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                setDragStart({ x: startMapX, y: startMapY });
              }
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingPortal(portal);
              setShowPortalConfig(true);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenuPortalId(portal.id);
              setContextMenuPortalOpen(true);
            }}
          >
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: portal.color || '#3b82f6',
              border: isSelected ? '4px solid #fbbf24' : '3px solid white',
              boxShadow: isSelected
                ? '0 0 20px rgba(251, 191, 36, 0.8), 0 0 10px rgba(0,0,0,0.3)'
                : '0 0 10px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              transform: isSelected ? 'scale(1.1)' : 'scale(1)'
            }}>
              <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" />
                <path d="M12 4 L12 20 M4 12 L20 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            {portal.name && (
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-0.5 rounded text-[10px] text-white whitespace-nowrap pointer-events-none">
                {portal.name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
