import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CriticalType } from '../dice-definitions';

const CRIT_PARTICLE_COUNT = 60;
/** Taille de départ des particules, réduite jusqu'à 0 au fil de l'effet. */
const CRIT_PARTICLE_SIZE = 0.4;
/** Lueur émissive ajoutée au dé au début de l'effet (puis éteinte). */
const CRIT_FLASH = { success: 0.9, fail: 0.6 };

type Emissive = THREE.Material & { emissive: THREE.Color; emissiveIntensity: number };
const hasEmissive = (m: THREE.Material): m is Emissive =>
  (m as Partial<Emissive>).emissive instanceof THREE.Color;

/**
 * Matériaux émissifs des maillages de `root` (corps, halo, coque d'orbe), avec
 * leur émissif d'origine pour le rendre à la fin. Les chiffres (matériaux de
 * base, sans émissif) ne sont pas touchés.
 */
const collectEmissive = (root: THREE.Object3D) => {
  const found: { mat: Emissive; color: THREE.Color; intensity: number }[] = [];
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).material : [];
    for (const m of [mats].flat()) {
      if (hasEmissive(m) && !found.some((f) => f.mat === m))
        found.push({ mat: m, color: m.emissive.clone(), intensity: m.emissiveIntensity });
    }
  });
  return found;
};

export const CriticalEffect = ({
  type,
  onComplete,
  flashTarget,
}: {
  type: CriticalType;
  onComplete: () => void;
  /**
   * Maillages du dé qui s'illuminent pendant l'effet. Auparavant une lumière
   * ponctuelle au centre du dé : sa venue changeait le nombre de lumières de
   * la scène, donc recompilait tous les programmes au pire moment. La lueur
   * passe par l'émissif des matériaux, sans aucune recompilation.
   */
  flashTarget?: React.RefObject<THREE.Object3D | null>;
}) => {
  const pointsRef = useRef<THREE.Points>(null);
  const progressRef = useRef(0);
  const completedRef = useRef(false);
  const flashRef = useRef<ReturnType<typeof collectEmissive> | null>(null);
  const _flash = useRef(new THREE.Color());

  const isSuccess = type === 'success';
  const primaryColor = isSuccess ? '#ffd700' : '#ff2200';
  const secondaryColor = isSuccess ? '#ffffff' : '#440000';

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(CRIT_PARTICLE_COUNT * 3);
    const colors = new Float32Array(CRIT_PARTICLE_COUNT * 3);

    const color1 = new THREE.Color(primaryColor);
    const color2 = new THREE.Color(secondaryColor);

    for (let i = 0; i < CRIT_PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Start at center
      positions[i3] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;

      const t = Math.random();
      const c = color1.clone().lerp(color2, t);
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // PointsMaterial n'a qu'une taille pour tous les points (pas d'attribut
    // `size` par point) : c'est elle qui est animée.
    const mat = new THREE.PointsMaterial({
      size: CRIT_PARTICLE_SIZE,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return { geometry: geo, material: mat };
  }, [primaryColor, secondaryColor]);
  // Passed as props, so R3F does not dispose them on unmount.
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // Store velocities for explosion
  const velocitiesRef = useRef<Float32Array | null>(null);
  useEffect(() => {
    const velocities = new Float32Array(CRIT_PARTICLE_COUNT * 3);
    for (let i = 0; i < CRIT_PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Random direction for explosion
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = isSuccess ? 8 + Math.random() * 10 : 4 + Math.random() * 6;

      velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed + (isSuccess ? 3 : -2);
      velocities[i3 + 2] = Math.cos(phi) * speed;
    }
    velocitiesRef.current = velocities;
  }, [isSuccess]);

  // L'émissif d'origine est toujours rendu, même si le dé disparaît en cours d'effet.
  const restoreFlash = () => {
    for (const f of flashRef.current ?? []) {
      f.mat.emissive.copy(f.color);
      f.mat.emissiveIntensity = f.intensity;
    }
    flashRef.current = [];
  };
  useEffect(() => () => restoreFlash(), []);

  useFrame((_, delta) => {
    if (completedRef.current || !pointsRef.current || !velocitiesRef.current) return;

    progressRef.current += delta;
    const progress = progressRef.current;
    const duration = isSuccess ? 1.5 : 1.2;

    if (progress >= duration) {
      completedRef.current = true;
      restoreFlash();
      onComplete();
      return;
    }

    const posAttr = pointsRef.current.geometry.attributes.position;
    const positions = posAttr.array as Float32Array;
    const velocities = velocitiesRef.current;
    const fade = 1 - progress / duration;

    // Animate particles
    for (let i = 0; i < CRIT_PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      positions[i3] += velocities[i3] * delta;
      positions[i3 + 1] += velocities[i3 + 1] * delta;
      positions[i3 + 2] += velocities[i3 + 2] * delta;

      // Apply gravity for success (upward then falling)
      if (isSuccess) {
        velocities[i3 + 1] -= 15 * delta;
      } else {
        // Pull inward for failure
        velocities[i3] *= 0.97;
        velocities[i3 + 2] *= 0.97;
      }
    }

    posAttr.needsUpdate = true;

    // Particles shrink and fade out together
    material.size = CRIT_PARTICLE_SIZE * fade;
    material.opacity = fade;

    // Lueur du dé : l'émissif d'origine plus la couleur du critique, qui
    // s'éteint avec l'effet (simples uniformes, aucun programme recompilé).
    if (!flashRef.current && flashTarget?.current)
      flashRef.current = collectEmissive(flashTarget.current);
    const glow = _flash.current
      .set(primaryColor)
      .multiplyScalar((isSuccess ? CRIT_FLASH.success : CRIT_FLASH.fail) * fade);
    for (const f of flashRef.current ?? []) {
      f.mat.emissive.copy(f.color).multiplyScalar(f.intensity).add(glow);
      f.mat.emissiveIntensity = 1;
    }
  });

  if (!type) return null;

  return <points ref={pointsRef} geometry={geometry} material={material} />;
};

/**
 * Programmes des effets critiques (particules, éclats), à compiler pendant le
 * préchauffage plutôt qu'au moment du 20 ou du 1 : mêmes réglages de
 * matériaux, géométries minuscules, jamais visibles (hors champ).
 */
const warmPoints = () => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3), 3));
  return geo;
};
export const CriticalWarmup = () => {
  const { geometry, points, fragment, fragmentGeometry } = useMemo(
    () => ({
      geometry: warmPoints(),
      points: new THREE.PointsMaterial({
        size: CRIT_PARTICLE_SIZE,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
      fragment: new THREE.MeshStandardMaterial({ metalness: 0.8, roughness: 0.2 }),
      fragmentGeometry: new THREE.TetrahedronGeometry(0.3, 0),
    }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      points.dispose();
      fragment.dispose();
      fragmentGeometry.dispose();
    },
    [geometry, points, fragment, fragmentGeometry],
  );
  return (
    <group>
      <points geometry={geometry} material={points} />
      <mesh geometry={fragmentGeometry} material={fragment} />
    </group>
  );
};

// ============================================================================
// SHATTERED DIE EFFECT (for critical failures)
// ============================================================================

const FRAGMENT_COUNT = 12;

interface FragmentData {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  rotationSpeed: THREE.Vector3;
  scale: number;
}

/** Rotation résiduelle (rad/s) sous laquelle un éclat posé est considéré immobile. */
const FRAGMENT_REST_SPIN = 0.3;

export const ShatteredDie = ({ color, onComplete }: { color: string; onComplete: () => void }) => {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useRef(0);
  const completedRef = useRef(false);

  // Create random fragment geometries and initial states
  const { fragments, fragmentData } = useMemo(() => {
    const frags: THREE.BufferGeometry[] = [];
    const data: FragmentData[] = [];

    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      // Random tetrahedron-like fragment
      const size = 0.3 + Math.random() * 0.5;
      const geo = new THREE.TetrahedronGeometry(size, 0);
      frags.push(geo);

      // Random direction for explosion
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 5 + Math.random() * 8;

      data.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
        ),
        velocity: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.sin(phi) * Math.sin(theta) * speed + 5,
          Math.cos(phi) * speed,
        ),
        rotation: new THREE.Euler(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        ),
        rotationSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
        ),
        scale: 1,
      });
    }

    return { fragments: frags, fragmentData: data };
  }, []);
  // Fragment geometries are passed as props: dispose them ourselves.
  useEffect(() => () => fragments.forEach((g) => g.dispose()), [fragments]);

  useFrame((_, delta) => {
    // Tous les éclats posés et immobiles : plus rien à animer
    if (completedRef.current || !groupRef.current) return;

    progressRef.current += delta;
    let resting = true;

    // Update each fragment
    groupRef.current.children.forEach((child, i) => {
      const data = fragmentData[i];
      if (!data) return;

      // Floor collision (relative to die center, floor is around y = -3)
      const floorY = -3;
      const isGrounded = data.position.y <= floorY;

      if (!isGrounded) {
        // Apply gravity
        data.velocity.y -= 20 * delta;

        // Update position
        data.position.addScaledVector(data.velocity, delta);

        // Update rotation
        data.rotation.x += data.rotationSpeed.x * delta;
        data.rotation.y += data.rotationSpeed.y * delta;
        data.rotation.z += data.rotationSpeed.z * delta;
      } else {
        // Stop at floor
        data.position.y = floorY;
        data.velocity.set(0, 0, 0);

        // Slow down rotation when grounded (×0.95 per 60 Hz frame, whatever
        // the actual frame rate)
        data.rotationSpeed.multiplyScalar(Math.pow(0.95, delta * 60));
        data.rotation.x += data.rotationSpeed.x * delta;
        data.rotation.y += data.rotationSpeed.y * delta;
        data.rotation.z += data.rotationSpeed.z * delta;
      }

      if (!isGrounded || data.rotationSpeed.lengthSq() > FRAGMENT_REST_SPIN ** 2) resting = false;

      // Apply to mesh (no fading, stay visible)
      child.position.copy(data.position);
      child.rotation.copy(data.rotation);
      child.scale.setScalar(data.scale);
    });

    if (resting) {
      completedRef.current = true;
      onComplete();
    }
  });

  return (
    <group ref={groupRef}>
      {fragments.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
};
