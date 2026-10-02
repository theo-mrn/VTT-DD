'use client';

/**
 * Ombre de contact d'un dé : une tache douce posée sur la table sous le dé, qui le suit. Plus
 * marquée quand il touche la table, plus large et plus pâle quand il saute ; légèrement décalée à
 * l'opposé de la lumière principale (en haut à droite). Sans carte d'ombres ni lumière en plus :
 * un plan et une texture de dégradé partagée par tous les dés.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';

/** Hauteur du centre d'un dé posé (environ) : au-dessus, il est en l'air. */
const REST_HEIGHT = 1.5;
/** Opacité de l'ombre d'un dé posé. */
const OPACITY = 0.8;
/** Rayon de l'ombre d'un dé posé (unités de la scène). */
const RADIUS = 2.7;

let gradient: THREE.CanvasTexture | null = null;
/** Dégradé radial (noir au centre, transparent au bord), créé une fois. */
function shadowTexture(): THREE.CanvasTexture {
  if (gradient) return gradient;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.65)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  gradient = new THREE.CanvasTexture(canvas);
  return gradient;
}

const PLANE = new THREE.PlaneGeometry(2, 2);
const _p = new THREE.Vector3();

export function ContactShadow({ target }: { target: RefObject<THREE.Object3D | null> }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: shadowTexture(),
        color: '#000000',
        transparent: true,
        opacity: OPACITY,
        depthWrite: false,
      }),
    [],
  );
  useFrame(() => {
    const t = target.current;
    const m = mesh.current;
    if (!t || !m) return;
    // Position du dé lue dans sa matrice : le moteur physique l'y écrit, sans toucher à `position`
    const p = _p.setFromMatrixPosition(t.matrix);
    const air = Math.max(0, p.y - REST_HEIGHT);
    // En l'air : plus large, plus pâle, plus décalée
    const spread = 1 + air * 0.12;
    m.position.set(p.x - 0.3 * spread, 0.02, p.z - 0.3 * spread);
    m.scale.setScalar(RADIUS * spread);
    material.opacity = OPACITY / (1 + air * 0.35);
  });
  return (
    <mesh
      ref={mesh}
      geometry={PLANE}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={-1}
    />
  );
}
