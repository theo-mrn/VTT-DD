import { createElement, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { Die3DSymbol } from '@/lib/dice-throw';
import type { FadingLabel, FadingLabels } from './face-number';

// Symbols of one face of a symbol die (Star Wars…), drawn like the face numbers
// of <FaceNumber>: same place, same size, same fade toward faces pointing away.
// Each distinct (symbols, colours) set is drawn ONCE into a small canvas
// texture shared by every face and every die that shows it.

const CELL = 128;
const FONT = '900 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const planeCache = new Map<number, THREE.PlaneGeometry>();
const plane = (size: number) => {
  let g = planeCache.get(size);
  if (!g) {
    g = new THREE.PlaneGeometry(size, size);
    planeCache.set(size, g);
  }
  return g;
};

/** Lucide icon rendered to an image (the icon set is only loaded for symbol dice). */
const iconCache = new Map<string, Promise<HTMLImageElement | null>>();
const iconImage = (name: string, color: string, strokeWidth: number) => {
  const key = `${name}|${color}|${strokeWidth}`;
  let p = iconCache.get(key);
  if (!p) {
    p = (async () => {
      const [{ LucideIcon }, { createRoot }, { flushSync }] = await Promise.all([
        import('./lucide-icon'),
        import('react-dom/client'),
        import('react-dom'),
      ]);
      const host = document.createElement('div');
      const root = createRoot(host);
      flushSync(() =>
        root.render(createElement(LucideIcon, { name, size: 96, color, strokeWidth })),
      );
      const svg = host.innerHTML;
      root.unmount();
      if (!svg.startsWith('<svg')) return null;
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      return img;
    })().catch(() => null);
    iconCache.set(key, p);
  }
  return p;
};

/** Centres and size of n symbols laid out in a cell of side 1. */
const layout = (n: number): { size: number; at: [number, number][] } => {
  if (n <= 1) return { size: 0.74, at: [[0.5, 0.5]] };
  if (n === 2)
    return {
      size: 0.5,
      at: [
        [0.27, 0.5],
        [0.73, 0.5],
      ],
    };
  if (n === 3)
    return {
      size: 0.44,
      at: [
        [0.5, 0.27],
        [0.27, 0.72],
        [0.73, 0.72],
      ],
    };
  return {
    size: 0.42,
    at: [
      [0.28, 0.28],
      [0.72, 0.28],
      [0.28, 0.72],
      [0.72, 0.72],
    ],
  };
};

const textureCache = new Map<string, Promise<THREE.CanvasTexture | null>>();
const symbolTexture = (symbols: Die3DSymbol[], fill: string, outline: string) => {
  const key = JSON.stringify([symbols, fill, outline]);
  let p = textureCache.get(key);
  if (!p) {
    p = (async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = CELL;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const { size, at } = layout(symbols.length);
      const px = size * CELL;
      for (let i = 0; i < Math.min(symbols.length, 4); i++) {
        const s = symbols[i]!;
        const [cx, cy] = at[i]!;
        const x = cx * CELL - px / 2;
        const y = cy * CELL - px / 2;
        const color = s.color ?? fill;
        const [under, over] = s.icon
          ? await Promise.all([iconImage(s.icon, outline, 5.5), iconImage(s.icon, color, 2.5)])
          : [null, null];
        if (under && over) {
          ctx.drawImage(under, x, y, px, px);
          ctx.drawImage(over, x, y, px, px);
        } else {
          // No icon (or unknown name): the short label, drawn like a face number.
          const text = (s.label ?? '?').slice(0, 2);
          ctx.font = FONT.replace('64px', `${Math.round(px * 0.8)}px`);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = px * 0.1;
          ctx.strokeStyle = outline;
          ctx.fillStyle = color;
          ctx.strokeText(text, cx * CELL, cy * CELL, px);
          ctx.fillText(text, cx * CELL, cy * CELL, px);
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return texture;
    })().catch(() => null);
    textureCache.set(key, p);
  }
  return p;
};

export const FaceSymbol = ({
  face,
  index,
  labels,
  symbols,
  scale,
  color,
  outlineColor,
  radius = 1.01,
  maxOpacity = 1,
}: {
  face: { pos: THREE.Vector3; norm: THREE.Vector3 };
  /** Index de la face, clé de l'étiquette dans `labels`. */
  index: number;
  labels?: FadingLabels;
  symbols: Die3DSymbol[];
  scale: number;
  color: string;
  outlineColor: string;
  radius?: number;
  maxOpacity?: number;
}) => {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let alive = true;
    symbolTexture(symbols, color, outlineColor).then((t) => alive && setTexture(t));
    return () => {
      alive = false;
    };
  }, [symbols, color, outlineColor]);

  // One material per face (its opacity follows the face); the texture is shared.
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    [],
  );
  useEffect(() => {
    material.map = texture;
    material.needsUpdate = true;
  }, [material, texture]);
  useEffect(() => () => material.dispose(), [material]);

  const quat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.norm),
    [face.norm],
  );
  const pos = useMemo(() => face.pos.clone().multiplyScalar(radius), [face.pos, radius]);

  // Same fade as <FaceNumber>: readable on top, gone on faces pointing away
  // (driven by the die's single <FaceFadeDriver>).
  useEffect(() => {
    if (!labels) return;
    const label: FadingLabel = {
      norm: face.norm,
      setOpacity: (o) => {
        material.opacity = o * maxOpacity;
      },
    };
    labels.set(index, label);
    return () => {
      if (labels.get(index) === label) labels.delete(index);
    };
  }, [labels, index, face.norm, material, maxOpacity]);

  if (!texture) return null;
  return (
    <group position={pos} quaternion={quat} renderOrder={1}>
      <mesh geometry={plane(scale * 1.6)} material={material} renderOrder={1} />
    </group>
  );
};
