"use client"

import React from 'react';
import { type Character, type LayerType } from '@/app/[roomid]/map/types';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';
import { calculateDistance } from '@/app/[roomid]/map/shadows';
import StaticToken from '@/components/(map)/StaticToken';

export interface CharactersLayerProps {
  characters: Character[];
  bgImageObject: HTMLImageElement | HTMLVideoElement | null;
  containerSize: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  offset: { x: number; y: number };
  isMJ: boolean;
  persoId: string | null;
  viewAsPersoId: string | null;
  playerViewMode: boolean;
  globalTokenScale: number;
  performanceMode: string;
  activeElementType: 'light' | 'portal' | 'musicZone' | 'character' | 'object' | null;
  activeElementId: string | null;
  isLayerVisible: (layerId: LayerType) => boolean;
  isCharacterVisibleToUser: (char: Character) => boolean;
}

const CharactersLayer: React.FC<CharactersLayerProps> = ({
  characters,
  bgImageObject,
  containerSize,
  containerRef,
  zoom,
  offset,
  isMJ,
  persoId,
  viewAsPersoId,
  playerViewMode,
  globalTokenScale,
  performanceMode,
  activeElementType,
  activeElementId,
  isLayerVisible,
  isCharacterVisibleToUser,
}) => {
  return (
    <div className="characters-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
      {isLayerVisible('characters') && characters.map((char, index) => {
        if (!bgImageObject) return null;
        const image = bgImageObject;
        const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
        const cWidth = containerSize.width || containerRef.current?.clientWidth || 0;
        const cHeight = containerSize.height || containerRef.current?.clientHeight || 0;
        if (cWidth === 0 || cHeight === 0) return null;

        // Vérifier que le personnage a des coordonnées valides
        if (typeof char.x !== 'number' || typeof char.y !== 'number' || isNaN(char.x) || isNaN(char.y)) {
          console.warn('⚠️ [Character Render] Skipping character with invalid coordinates:', char.id, char.name, 'x:', char.x, 'y:', char.y);
          return null;
        }

        const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
        const scaledWidth = imgWidth * scale * zoom;
        const scaledHeight = imgHeight * scale * zoom;

        // 💡 LIGHT SOURCE RENDER LOOP REMOVED - NOW HANDLED IN SEPARATE LAYER


        const x = (char.x / imgWidth) * scaledWidth - offset.x;
        const y = (char.y / imgHeight) * scaledHeight - offset.y;

        // Vérifier que les positions calculées sont valides
        if (!isFinite(x) || !isFinite(y)) {
          console.warn('⚠️ [Character Render] Skipping character with invalid calculated position:', char.id, char.name, 'x:', x, 'y:', y);
          return null;
        }

        let isVisible = true;
        let effectiveVisibility = char.visibility;

        // Utiliser la fonction centralisée qui gère les lumières, le brouillard, etc.
        if (!isCharacterVisibleToUser(char)) {
          if (char.visibility === 'invisible') return null;
          effectiveVisibility = 'hidden';
        }

        if (char.visibility === 'ally') {
          isVisible = true;
        } else if (effectiveVisibility === 'hidden') {
          const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
          const isInPlayerViewMode = playerViewMode && viewAsPersoId;

          if (isInPlayerViewMode) {
            const viewer = characters.find(c => c.id === effectivePersoId);
            if (viewer) {
              const viewerScreenX = (viewer.x / imgWidth) * scaledWidth - offset.x;
              const viewerScreenY = (viewer.y / imgHeight) * scaledHeight - offset.y;
              const dist = calculateDistance(x, y, viewerScreenX, viewerScreenY);
              const radiusScreen = ((viewer?.visibilityRadius ?? 100) / imgWidth) * scaledWidth;
              isVisible = dist <= radiusScreen;
            } else {
              isVisible = false;
            }
          } else {
            isVisible = isMJ || (() => {
              const viewer = characters.find(c => c.id === effectivePersoId);
              if (!viewer) return false;
              const viewerScreenX = (viewer.x / imgWidth) * scaledWidth - offset.x;
              const viewerScreenY = (viewer.y / imgHeight) * scaledHeight - offset.y;
              const dist = calculateDistance(x, y, viewerScreenX, viewerScreenY);
              const radiusScreen = ((viewer.visibilityRadius ?? 100) / imgWidth) * scaledWidth;
              return dist <= radiusScreen;
            })();
          }
        }

        if (!isVisible) return null;

        const isPlayerCharacter = char.type === 'joueurs';
        const baseRadius = isPlayerCharacter ? 30 : 20;
        const charScale = char.scale || 1;
        const iconRadius = baseRadius * charScale * globalTokenScale * zoom;

        // Déterminer si on doit appliquer l'effet d'invisibilité
        const effectiveIsMJ = (playerViewMode && viewAsPersoId) ? false : isMJ;
        const shouldApplyInvisibilityEffect = (effectiveVisibility === 'hidden' || effectiveVisibility === 'custom') && effectiveIsMJ && char.type !== 'joueurs';

        // Déterminer le borderRadius en fonction de la forme choisie ou par défaut
        let borderRadius = isPlayerCharacter ? '0' : '50%';
        if (char.shape === 'square') borderRadius = '0';
        if (char.shape === 'circle') borderRadius = '50%';

        // 🎯 Désactiver visuellement si un autre élément est actif
        const isThisCharacterActive = activeElementType === 'character' && activeElementId === char.id;
        const shouldDisableCharacter = activeElementType !== null && !isThisCharacterActive;

        return (
          <div
            key={char.id}
            style={{
              position: 'absolute',
              left: x - iconRadius,
              top: y - iconRadius,
              width: iconRadius * 2,
              height: iconRadius * 2,
              pointerEvents: 'none',
              borderRadius: borderRadius,
              overflow: 'hidden',
              opacity: shouldDisableCharacter ? 0.3 : 1, // Semi-transparent si désactivé
              transition: 'opacity 0.2s ease',
              zIndex: 5 // Characters above objects (z=2) and borders (z=3)
            }}
          >
            {char.imageUrl && (
              <StaticToken
                src={typeof char.imageUrl === 'object' ? char.imageUrl.src : char.imageUrl}
                alt={char.name}
                performanceMode={performanceMode}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  ...(shouldApplyInvisibilityEffect ? {
                    opacity: 0.72
                  } : {})
                }}
              />
            )}
            {shouldApplyInvisibilityEffect && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'radial-gradient(circle, transparent 0%, transparent 30%, rgba(255, 255, 255, 0.6) 65%, rgba(255, 255, 255, 0.95) 100%)',
                  mixBlendMode: 'screen',
                  pointerEvents: 'none',
                  borderRadius: isPlayerCharacter ? '0' : '50%'
                }}
              />
            )}
            {/* Status Effect Veils */}
            {char.conditions?.includes('poisoned') && char.type !== 'joueurs' && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'radial-gradient(circle, transparent 0%, transparent 30%, rgba(255, 255, 255, 0.6) 65%, rgba(255, 255, 255, 0.95) 100%)',
                    mixBlendMode: 'screen',
                    pointerEvents: 'none',
                    borderRadius: '50%'
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'radial-gradient(circle, transparent 0%, transparent 20%, rgba(0, 255, 100, 0.6) 55%, rgba(0, 255, 100, 0.95) 100%)',
                    mixBlendMode: 'overlay',
                    pointerEvents: 'none',
                    borderRadius: '50%'
                  }}
                />
              </>
            )}
            {char.conditions?.includes('stunned') && char.type !== 'joueurs' && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'radial-gradient(circle, transparent 0%, transparent 30%, rgba(255, 255, 255, 0.6) 65%, rgba(255, 255, 255, 0.95) 100%)',
                    mixBlendMode: 'screen',
                    pointerEvents: 'none',
                    borderRadius: '50%'
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'radial-gradient(circle, transparent 0%, transparent 40%, rgba(255, 200, 0, 1) 90%)',
                    mixBlendMode: 'overlay',
                    pointerEvents: 'none',
                    borderRadius: '50%'
                  }}
                />
              </>
            )}
            {char.conditions?.includes('blinded') && char.type !== 'joueurs' && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  background: 'radial-gradient(circle, transparent 0%, transparent 20%, rgba(30, 30, 30, 0.7) 55%, rgba(10, 10, 10, 0.95) 100%)',
                  mixBlendMode: 'multiply',
                  pointerEvents: 'none',
                  borderRadius: isPlayerCharacter ? '0' : '50%'
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  );
};

export default CharactersLayer;
