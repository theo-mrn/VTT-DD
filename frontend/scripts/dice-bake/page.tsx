/**
 * Page de cuisson (scripts/dice-bake/run.mjs) : un seul dé, le d20 du skin demandé
 * (`?skin=<id>`), face 20 vers l'objectif, sur fond transparent, rendu par le vrai composant
 * de l'app (VisualDie, même environnement que l'aperçu de la boutique). Reprend le cadrage de
 * l'ancienne page legacy/src/app/dice-bake.
 */
import { Environment } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { DICE_ENVIRONMENT } from '@/components/dice/three/environment';
import { DICE_SKINS, getSkinById } from '@/components/dice/three/dice-definitions';
import { dieShape } from '@/components/dice/three/polyhedra';
import { VisualDie } from '@/components/dice/three/visual-die';

declare global {
  interface Window {
    __skins: string[];
    __dieReady: boolean;
    /** Image du canevas en WebP, `size` px et vignette `thumb` px, en data URL. */
    __export(size: number, thumb: number): { large: string; small: string };
  }
}

/** Taille d'affichage du canevas ; rendu au double (dpr 2) puis réduit : bords lissés. */
const SIZE = 512;

function Die({ skinId }: Readonly<{ skinId: string }>) {
  const { gl, scene, camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const frames = useRef(0);
  const skin = getSkinById(skinId);
  // Face « 20 » tournée vers la caméra (+Z), de face
  const quat = useMemo(() => {
    const faces = dieShape('d20').faces;
    const face = faces.find((f) => f.value === '20') ?? faces[0]!;
    return new THREE.Quaternion().setFromUnitVectors(
      face.norm.clone().normalize(),
      new THREE.Vector3(0, 0, 1),
    );
  }, []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    frames.current++;
    if (frames.current === 1) g.quaternion.copy(quat);
    // Cadrage une fois le dé monté : centré, 88 % de la hauteur visible
    if (frames.current === 3) {
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const cam = camera as THREE.PerspectiveCamera;
      const visible = 2 * cam.position.z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const factor = (visible * 0.88) / Math.max(size.x, size.y);
      g.scale.multiplyScalar(factor);
      g.position.sub(center.multiplyScalar(factor));
    }
    // Shaders, textures et environnement le temps de se poser, puis une image et c'est prêt
    if (frames.current === 30) {
      gl.render(scene, camera);
      window.__dieReady = true;
    }
  });

  return (
    <group ref={group}>
      <VisualDie type="d20" skin={skin} isShattered={false} critType={null} stopped />
    </group>
  );
}

function exportCanvas(size: number, thumb: number) {
  const source = document.querySelector('canvas')!;
  const scaled = (px: number, quality: number) => {
    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, px, px);
    return c.toDataURL('image/webp', quality);
  };
  return { large: scaled(size, 0.9), small: scaled(thumb, 0.9) };
}

const skinId = new URLSearchParams(window.location.search).get('skin') ?? 'gold';
window.__skins = Object.keys(DICE_SKINS);
window.__dieReady = false;
window.__export = exportCanvas;

createRoot(document.getElementById('root')!).render(
  <div style={{ width: SIZE, height: SIZE }}>
    <Canvas
      camera={{ position: [0, 0, 8], fov: 45 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      dpr={2}
      style={{ width: SIZE, height: SIZE }}
    >
      <ambientLight intensity={0.9} />
      <Suspense fallback={null}>
        <Environment files={DICE_ENVIRONMENT} environmentIntensity={0.6} />
        <Die skinId={skinId} />
      </Suspense>
    </Canvas>
  </div>,
);
