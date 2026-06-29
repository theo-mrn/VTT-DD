import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DiceSkin } from '../dice-definitions';

const PARTICLE_COUNT = 30;

interface ParticleData {
    positions: Float32Array;
    velocities: Float32Array;
    lifetimes: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
}

// Particles that stay world-oriented by counter-rotating
export const DiceParticles = ({ skin, quaternionRef }: {
    skin: DiceSkin,
    quaternionRef: React.MutableRefObject<[number, number, number, number]>
}) => {
    const pointsRef = useRef<THREE.Points>(null);
    const groupRef = useRef<THREE.Group>(null);
    const dataRef = useRef<ParticleData | null>(null);

    const { geometry, material } = useMemo(() => {
        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);
        const sizes = new Float32Array(PARTICLE_COUNT);
        const velocities = new Float32Array(PARTICLE_COUNT * 3);
        const lifetimes = new Float32Array(PARTICLE_COUNT);

        const color1 = new THREE.Color(skin.particleColor);
        const color2 = new THREE.Color(skin.particleColor2 || skin.particleColor);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            const t = Math.random();

            // Random position around the die
            const angle = Math.random() * Math.PI * 2;
            const radius = 2.5 + Math.random() * 1.5;
            positions[i3] = Math.cos(angle) * radius;
            positions[i3 + 1] = (Math.random() - 0.5) * 4;
            positions[i3 + 2] = Math.sin(angle) * radius;

            const c = color1.clone().lerp(color2, t);
            colors[i3] = c.r;
            colors[i3 + 1] = c.g;
            colors[i3 + 2] = c.b;

            sizes[i] = 0.15 + Math.random() * 0.2;
            lifetimes[i] = Math.random();

            velocities[i3] = (Math.random() - 0.5) * 0.5;
            velocities[i3 + 1] = Math.random() * 0.5;
            velocities[i3 + 2] = (Math.random() - 0.5) * 0.5;
        }

        dataRef.current = { positions, velocities, lifetimes, colors, sizes };

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: 0.25,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        return { geometry: geo, material: mat };
    }, [skin]);

    useFrame((_, delta) => {
        if (!dataRef.current || !pointsRef.current || !groupRef.current) return;

        // Counter-rotate the particle group to stay world-oriented
        const q = quaternionRef.current;
        const dieQuat = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
        const inverseQuat = dieQuat.clone().invert();
        groupRef.current.quaternion.copy(inverseQuat);

        const { velocities, lifetimes } = dataRef.current;

        // Get arrays directly from geometry attributes
        const posAttr = pointsRef.current.geometry.attributes.position;
        const sizeAttr = pointsRef.current.geometry.attributes.size;
        const positions = posAttr.array as Float32Array;
        const sizes = sizeAttr.array as Float32Array;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const i3 = i * 3;
            lifetimes[i] -= delta * 0.5;

            if (lifetimes[i] <= 0) {
                lifetimes[i] = 0.8 + Math.random() * 0.4;
                const angle = Math.random() * Math.PI * 2;
                const radius = 2.5 + Math.random() * 1;

                positions[i3] = Math.cos(angle) * radius;
                positions[i3 + 2] = Math.sin(angle) * radius;

                switch (skin.particleType) {
                    case 'fire':
                        positions[i3 + 1] = -3;
                        velocities[i3 + 1] = 12 + Math.random() * 8;
                        velocities[i3] = (Math.random() - 0.5) * 3;
                        velocities[i3 + 2] = (Math.random() - 0.5) * 3;
                        break;
                    case 'ice':
                        positions[i3 + 1] = 5;
                        velocities[i3 + 1] = -6 - Math.random() * 4;
                        velocities[i3] = (Math.random() - 0.5) * 2;
                        velocities[i3 + 2] = (Math.random() - 0.5) * 2;
                        break;
                    case 'smoke':
                        positions[i3 + 1] = -2;
                        velocities[i3 + 1] = 5 + Math.random() * 3;
                        velocities[i3] = (Math.random() - 0.5) * 4;
                        velocities[i3 + 2] = (Math.random() - 0.5) * 4;
                        break;
                    default:
                        positions[i3 + 1] = (Math.random() - 0.5) * 5;
                        velocities[i3] = (Math.random() - 0.5) * 5;
                        velocities[i3 + 1] = (Math.random() - 0.5) * 5;
                        velocities[i3 + 2] = (Math.random() - 0.5) * 5;
                }
            }

            positions[i3] += velocities[i3] * delta;
            positions[i3 + 1] += velocities[i3 + 1] * delta;
            positions[i3 + 2] += velocities[i3 + 2] * delta;

            switch (skin.particleType) {
                case 'fire':
                    velocities[i3] *= 0.94;
                    velocities[i3 + 2] *= 0.94;
                    sizes[i] = 0.4 * lifetimes[i];
                    break;
                case 'ice':
                    positions[i3] += Math.sin(lifetimes[i] * 15) * 0.2;
                    positions[i3 + 2] += Math.cos(lifetimes[i] * 12) * 0.15;
                    sizes[i] = 0.2 + 0.15 * lifetimes[i];
                    break;
                case 'smoke':
                    velocities[i3] += (Math.random() - 0.5) * 1.5;
                    velocities[i3 + 2] += (Math.random() - 0.5) * 1.5;
                    sizes[i] = 0.35 * lifetimes[i];
                    break;
                case 'sparkle':
                    positions[i3] += (Math.random() - 0.5) * 0.3;
                    positions[i3 + 2] += (Math.random() - 0.5) * 0.3;
                    sizes[i] = 0.25 * (0.2 + 0.8 * Math.sin(lifetimes[i] * 40));
                    break;
                case 'magic':
                    const t = (1 - lifetimes[i]) * Math.PI * 10;
                    const r = 4 + Math.sin(t * 3) * 1;
                    positions[i3] = Math.cos(t + i * 0.2) * r;
                    positions[i3 + 2] = Math.sin(t + i * 0.2) * r;
                    positions[i3 + 1] += Math.sin(t * 5) * 0.2;
                    sizes[i] = 0.2;
                    break;
                case 'gold_dust':
                case 'silver_dust':
                    positions[i3] += Math.sin(lifetimes[i] * 8 + i) * 0.15;
                    positions[i3 + 1] += Math.sin(lifetimes[i] * 10 + i) * 0.1;
                    positions[i3 + 2] += Math.cos(lifetimes[i] * 7 + i) * 0.15;
                    sizes[i] = 0.18 + 0.12 * Math.sin(lifetimes[i] * 15);
                    break;
            }
        }

        posAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
    });

    if (skin.particleType === 'none') return null;

    return (
        <group ref={groupRef}>
            <points ref={pointsRef} geometry={geometry} material={material} />
        </group>
    );
};
