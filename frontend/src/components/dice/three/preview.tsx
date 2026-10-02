'use client';

/**
 * Aperçu 3D d'un skin (page de détail de la boutique), repris de
 * `(dices)/dice-preview.tsx` : un seul canevas, monté au clic sur un dé et
 * démonté au retour, jamais au survol (le survol 3D faisait planter Chrome
 * sous Windows : création de contexte WebGL en rafale). La grille de la
 * boutique n'affiche que les vignettes pré-calculées (`public/dice/<skin>.png`).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { VisualDie } from './visual-die';
import { getSkinById } from './dice-definitions';
import { DICE_ENVIRONMENT } from './environment';
import { useDiceThrowStore } from '@/lib/dice-throw';

/**
 * Dé qui tourne lentement sur lui-même. Le canevas est en `demand` : chaque
 * image en demande une suivante tant qu'il est actif (frameloop `never` sinon).
 */
const AutoRotatingDie = ({ type, skinId }: { type: string; skinId: string }) => {
  const groupRef = useRef<THREE.Group>(null);
  const skin = getSkinById(skinId);
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
    state.invalidate();
  });
  return (
    <group ref={groupRef} scale={1.5}>
      <VisualDie type={type} skin={skin} isShattered={false} critType={null} />
    </group>
  );
};

/** Relance le rendu quand l'aperçu redevient actif. */
const Resume = ({ active }: { active: boolean }) => {
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);
  return null;
};

/** Le canevas est visible : dans la fenêtre et onglet affiché. */
const useOnScreen = (ref: React.RefObject<HTMLElement | null>) => {
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  useEffect(() => {
    const onChange = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return inView && pageVisible;
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
  const hostRef = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(hostRef);
  // « Essayer un lancer » : l'aperçu se fige tant que des dés roulent, le GPU
  // va au lanceur.
  const diceRolling = useDiceThrowStore((st) => st.onScreen);
  const active = onScreen && !diceRolling;
  return (
    <div ref={hostRef} className={`relative ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'default', stencil: false }}
        dpr={[1, 1.25]}
        frameloop={active ? 'demand' : 'never'}
      >
        <Resume active={active} />
        {/* Pas de projecteur : à 17 unités, en unités physiques, il n'éclairait presque rien */}
        <ambientLight intensity={0.9} />
        <Environment files={DICE_ENVIRONMENT} environmentIntensity={0.6} />
        <AutoRotatingDie type={type} skinId={skinId} />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  );
}

export default DicePreview;
