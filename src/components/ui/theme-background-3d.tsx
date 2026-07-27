'use client';

import * as React from 'react';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { BackgroundConfig } from '@/modules/game-system/types';

// Fond 3D optionnel d'un système de règles (cf GameSystemDefinition.background), affiché derrière le
// contenu d'AppBackground UNIQUEMENT sur les pages qui montent ce composant explicitement (ex
// /personnages) — jamais un changement global d'AppBackground, qui reste neutre pour dnd-classic et
// tout système sans fond déclaré. Un seul modèle, un seul contexte WebGL : profil GPU volontairement
// léger (pas de shader procédural, cf [[windows-webgl-crash]] qui concernait ~50 shaders compilés
// d'un coup pour les dés — sans rapport ici).

function SpinningModel({ src, scale = 1, spin = 0, onReady }: { src: string; scale?: number; spin?: number; onReady?: () => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(src);

  // Recentre/normalise comme ModelCore (cores.tsx) : un modèle de bundle externe n'a aucune garantie
  // d'échelle/origine cohérente avec la scène. Repose ensuite le modèle sur son point le plus bas
  // (au lieu de son centre) pour pouvoir le poser "au sol" de la scène plutôt qu'au milieu de l'écran.
  const { normalized, height } = useMemo(() => {
    const obj = scene.clone(true);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    obj.position.x -= center.x;
    obj.position.z -= center.z;
    obj.position.y -= box.min.y;
    return { normalized: obj, height: box.max.y - box.min.y };
  }, [scene]);

  // Ce composant ne monte qu'APRÈS que useGLTF a résolu (suspend tant que le .glb charge) — donc cet
  // effet est le signal fiable "le modèle est prêt à être affiché" pour le parent (personnages/page.tsx),
  // qui attend ce signal avant de faire apparaître les cartes personnage une par une.
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useFrame((state) => {
    if (groupRef.current && spin) {
      groupRef.current.rotation.y = state.clock.elapsedTime * spin;
    }
  });

  return (
    <group ref={groupRef} scale={scale} position={[0, -height * scale * 1.15, 0]}>
      <primitive object={normalized} />
    </group>
  );
}

export function ThemeBackground3D({ background, className, onReady }: { background: BackgroundConfig; className?: string; onReady?: () => void }) {
  // Un fond image/vidéo n'a pas de chargement asynchrone à attendre du point de vue de ce composant :
  // signale "prêt" immédiatement pour ne jamais bloquer l'apparition des cartes dans ce cas.
  useEffect(() => {
    if (background.type !== 'model') onReady?.();
  }, [background.type, onReady]);

  if (background.type !== 'model') return null;

  return (
    <div className={className} aria-hidden>
      <Suspense fallback={null}>
        <Canvas
          camera={{ position: [0, 0.9, 3.6], fov: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
          dpr={[1, 1.5]}
        >
          <ambientLight intensity={0.9} />
          <directionalLight position={[3, 5, 4]} intensity={1.4} />
          <directionalLight position={[-4, 2, -2]} intensity={0.6} color="#5ec8ff" />
          <Suspense fallback={null}>
            <SpinningModel src={background.src} scale={background.scale} spin={background.spin} onReady={onReady} />
            <Environment preset="city" />
          </Suspense>
        </Canvas>
      </Suspense>
    </div>
  );
}
