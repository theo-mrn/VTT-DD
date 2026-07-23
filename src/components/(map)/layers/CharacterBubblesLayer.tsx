"use client"

import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { type Character } from '@/app/[roomid]/map/types';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';
import CharacterBubble from '@/components/(map)/CharacterBubble';
import { type BubblesMap } from '@/hooks/map/useCharacterBubbles';

export interface CharacterBubblesLayerProps {
  characters: Character[];
  bubbles: BubblesMap;
  bgImageObject: HTMLImageElement | HTMLVideoElement | null;
  containerSize: { width: number; height: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  offset: { x: number; y: number };
  globalTokenScale: number;
}

const CharacterBubblesLayer: React.FC<CharacterBubblesLayerProps> = ({
  characters,
  bubbles,
  bgImageObject,
  containerSize,
  containerRef,
  zoom,
  offset,
  globalTokenScale,
}) => {
  const bubbledCharacters = characters.filter(c => bubbles[c.id]);
  if (bubbledCharacters.length === 0 || !bgImageObject) return null;

  const image = bgImageObject;
  const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
  const cWidth = containerSize.width || containerRef.current?.clientWidth || 0;
  const cHeight = containerSize.height || containerRef.current?.clientHeight || 0;
  if (cWidth === 0 || cHeight === 0) return null;
  // Fond vidéo (.webm) non chargé ⇒ imgWidth/Height à 0 ⇒ NaN. On saute tant que non valide.
  if (!Number.isFinite(imgWidth) || imgWidth <= 0 || !Number.isFinite(imgHeight) || imgHeight <= 0) return null;

  const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
  const scaledWidth = imgWidth * scale * zoom;
  const scaledHeight = imgHeight * scale * zoom;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
      <AnimatePresence>
        {bubbledCharacters.map(char => {
          if (typeof char.x !== 'number' || typeof char.y !== 'number' || isNaN(char.x) || isNaN(char.y)) return null;

          const x = (char.x / imgWidth) * scaledWidth - offset.x;
          const y = (char.y / imgHeight) * scaledHeight - offset.y;
          if (!isFinite(x) || !isFinite(y)) return null;

          const isPlayerCharacter = char.type === 'joueurs';
          const baseRadius = (isPlayerCharacter ? 0.027 : 0.018) * imgWidth;
          const charScale = char.scale || 1;
          const iconRadius = baseRadius * charScale * globalTokenScale * zoom * scale;

          const bubble = bubbles[char.id];

          return (
            <CharacterBubble
              key={`${char.id}-${bubble.timestamp}`}
              content={bubble.content}
              type={bubble.type}
              x={x}
              y={y}
              iconRadius={iconRadius}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default CharacterBubblesLayer;
