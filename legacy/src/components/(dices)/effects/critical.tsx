import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CriticalType } from '../dice-definitions';

const CRIT_PARTICLE_COUNT = 60;

export const CriticalEffect = ({ type, onComplete }: { type: CriticalType, onComplete: () => void }) => {
    const pointsRef = useRef<THREE.Points>(null);
    const lightRef = useRef<THREE.PointLight>(null);
    const progressRef = useRef(0);
    const completedRef = useRef(false);

    const isSuccess = type === 'success';
    const primaryColor = isSuccess ? '#ffd700' : '#ff2200';
    const secondaryColor = isSuccess ? '#ffffff' : '#440000';

    const { geometry, material } = useMemo(() => {
        const positions = new Float32Array(CRIT_PARTICLE_COUNT * 3);
        const colors = new Float32Array(CRIT_PARTICLE_COUNT * 3);
        const sizes = new Float32Array(CRIT_PARTICLE_COUNT);

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

            sizes[i] = 0.2 + Math.random() * 0.3;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: 0.4,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        return { geometry: geo, material: mat };
    }, [primaryColor, secondaryColor]);

    // Store velocities for explosion
    const velocitiesRef = useRef<Float32Array | null>(null);
    useEffect(() => {
        const velocities = new Float32Array(CRIT_PARTICLE_COUNT * 3);
        for (let i = 0; i < CRIT_PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            // Random direction for explosion
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const speed = isSuccess ? (8 + Math.random() * 10) : (4 + Math.random() * 6);

            velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
            velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed + (isSuccess ? 3 : -2);
            velocities[i3 + 2] = Math.cos(phi) * speed;
        }
        velocitiesRef.current = velocities;
    }, [isSuccess]);

    useFrame((_, delta) => {
        if (!pointsRef.current || !velocitiesRef.current) return;

        progressRef.current += delta;
        const progress = progressRef.current;
        const duration = isSuccess ? 1.5 : 1.2;

        if (progress >= duration && !completedRef.current) {
            completedRef.current = true;
            onComplete();
            return;
        }

        const posAttr = pointsRef.current.geometry.attributes.position;
        const sizeAttr = pointsRef.current.geometry.attributes.size;
        const positions = posAttr.array as Float32Array;
        const sizes = sizeAttr.array as Float32Array;
        const velocities = velocitiesRef.current;

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

            // Fade out size
            const fadeProgress = progress / duration;
            sizes[i] = (0.3 + Math.random() * 0.2) * (1 - fadeProgress);
        }

        posAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;

        // Animate light
        if (lightRef.current) {
            const fadeProgress = progress / duration;
            lightRef.current.intensity = (isSuccess ? 5 : 3) * (1 - fadeProgress);
        }

        // Fade material opacity
        material.opacity = 1 - (progress / duration);
    });

    if (!type) return null;

    return (
        <group>
            <points ref={pointsRef} geometry={geometry} material={material} />
            <pointLight
                ref={lightRef}
                position={[0, 0, 0]}
                color={primaryColor}
                intensity={isSuccess ? 5 : 3}
                distance={20}
                decay={2}
            />
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

export const ShatteredDie = ({ color, onComplete }: { color: string, onComplete: () => void }) => {
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
                    (Math.random() - 0.5) * 0.5
                ),
                velocity: new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta) * speed,
                    Math.sin(phi) * Math.sin(theta) * speed + 5,
                    Math.cos(phi) * speed
                ),
                rotation: new THREE.Euler(
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2
                ),
                rotationSpeed: new THREE.Vector3(
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 15
                ),
                scale: 1
            });
        }

        return { fragments: frags, fragmentData: data };
    }, []);

    useFrame((_, delta) => {
        if (!groupRef.current) return;

        progressRef.current += delta;

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
                data.position.add(data.velocity.clone().multiplyScalar(delta));

                // Update rotation
                data.rotation.x += data.rotationSpeed.x * delta;
                data.rotation.y += data.rotationSpeed.y * delta;
                data.rotation.z += data.rotationSpeed.z * delta;
            } else {
                // Stop at floor
                data.position.y = floorY;
                data.velocity.set(0, 0, 0);

                // Slow down rotation when grounded
                data.rotationSpeed.multiplyScalar(0.95);
                data.rotation.x += data.rotationSpeed.x * delta;
                data.rotation.y += data.rotationSpeed.y * delta;
                data.rotation.z += data.rotationSpeed.z * delta;
            }

            // Apply to mesh (no fading, stay visible)
            child.position.copy(data.position);
            child.rotation.copy(data.rotation);
            child.scale.setScalar(data.scale);
        });
    });

    return (
        <group ref={groupRef}>
            {fragments.map((geo, i) => (
                <mesh key={i} geometry={geo}>
                    <meshStandardMaterial
                        color={color}
                        metalness={0.8}
                        roughness={0.2}
                    />
                </mesh>
            ))}
        </group>
    );
};
