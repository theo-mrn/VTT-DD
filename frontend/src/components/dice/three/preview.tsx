'use client';

/**
 * Aperçu 3D d'un skin (page de détail de la boutique), repris de
 * `(dices)/dice-preview.tsx` : un seul canevas, monté au clic sur un dé et
 * démonté au retour, jamais au survol (le survol 3D faisait planter Chrome
 * sous Windows : création de contexte WebGL en rafale). La grille de la
 * boutique n'affiche que les vignettes pré-calculées (`public/dice/<skin>.png`).
 */
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { VisualDie } from './visual-die';
import { getSkinById } from './dice-definitions';

/** Dé qui tourne lentement sur lui-même. */
const AutoRotatingDie = ({ type, skinId }: { type: string; skinId: string }) => {
  const groupRef = useRef<THREE.Group>(null);
  const skin = getSkinById(skinId);
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
  });
  return (
    <group ref={groupRef} scale={1.5}>
      <VisualDie type={type} skin={skin} isShattered={false} critType={null} />
    </group>
  );
};

export function DicePreview({
  skinId,
  type = 'd20',
  className = '',
}: {
  skinId: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Canvas
        shadows
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 1.5]}
      >
        <ambientLight intensity={0.9} />
        <spotLight position={[10, 10, 10]} angle={0.6} penumbra={1} intensity={1.1} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.4} />
        <Environment preset="city" environmentIntensity={0.6} />
        <AutoRotatingDie type={type} skinId={skinId} />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}

export default DicePreview;
