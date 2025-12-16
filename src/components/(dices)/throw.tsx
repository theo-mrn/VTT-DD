"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, usePlane, useConvexPolyhedron, useBox } from '@react-three/cannon';
import { Text, Environment, Line } from '@react-three/drei';

import * as THREE from 'three';

// ============================================================================
// DICE SKIN SYSTEM - WITH VISUAL EFFECTS & PARTICLES
// ============================================================================

export type SkinEffectType = 'metallic' | 'gem' | 'glass' | 'stone' | 'magic' | 'dark';
export type ParticleType = 'none' | 'fire' | 'ice' | 'sparkle' | 'smoke' | 'gold_dust' | 'silver_dust' | 'magic';

export interface DiceSkin {
    id: string;
    name: string;
    // Colors
    bodyColor: string;
    edgeColor: string;
    borderColor: string;
    textColor: string;
    shadowColor: string;
    // Material
    metalness: number;
    roughness: number;
    envMapIntensity: number;
    // Visual Effects
    effectType: SkinEffectType;
    emissive: string;
    emissiveIntensity: number;
    opacity: number;
    innerGlow: boolean;
    innerGlowColor: string;
    innerGlowIntensity: number;
    rimLight: boolean;
    rimLightColor: string;
    // Particles
    particleType: ParticleType;
    particleColor: string;
    particleColor2?: string;  // Secondary color for gradient effects
}

export const DICE_SKINS: Record<string, DiceSkin> = {
    gold: {
        id: 'gold',
        name: 'Or Royal',
        bodyColor: '#c9a227',
        edgeColor: '#ffe066',
        borderColor: '#ffd700',
        textColor: '#1a1000',
        shadowColor: '#000000',
        metalness: 0.95,
        roughness: 0.12,
        envMapIntensity: 2.0,
        effectType: 'metallic',
        emissive: '#ff9500',
        emissiveIntensity: 0.15,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffe066',
        particleType: 'gold_dust',
        particleColor: '#ffd700',
        particleColor2: '#ffaa00',
    },
    silver: {
        id: 'silver',
        name: 'Argent',
        bodyColor: '#c0c0c0',
        edgeColor: '#ffffff',
        borderColor: '#e8e8e8',
        textColor: '#1a1a2e',
        shadowColor: '#000000',
        metalness: 1.0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'metallic',
        emissive: '#ffffff',
        emissiveIntensity: 0.1,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'silver_dust',
        particleColor: '#ffffff',
        particleColor2: '#c0c0c0',
    },
    ruby: {
        id: 'ruby',
        name: 'Rubis',
        bodyColor: '#cc0033',
        edgeColor: '#ff3366',
        borderColor: '#ff6699',
        textColor: '#ffffff',
        shadowColor: '#330011',
        metalness: 0.3,
        roughness: 0.1,
        envMapIntensity: 2.0,
        effectType: 'gem',
        emissive: '#ff0033',
        emissiveIntensity: 0.4,
        opacity: 0.85,
        innerGlow: true,
        innerGlowColor: '#ff3366',
        innerGlowIntensity: 0.8,
        rimLight: true,
        rimLightColor: '#ff6699',
        particleType: 'sparkle',
        particleColor: '#ff3366',
        particleColor2: '#ffffff',
    },
    obsidian: {
        id: 'obsidian',
        name: 'Obsidienne',
        bodyColor: '#0a0a0a',
        edgeColor: '#1a1a2e',
        borderColor: '#6633ff',
        textColor: '#aa88ff',
        shadowColor: '#000000',
        metalness: 0.95,
        roughness: 0.02,
        envMapIntensity: 3.0,
        effectType: 'dark',
        emissive: '#4400aa',
        emissiveIntensity: 0.25,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#6633ff',
        innerGlowIntensity: 0.5,
        rimLight: true,
        rimLightColor: '#8855ff',
        particleType: 'smoke',
        particleColor: '#6633ff',
        particleColor2: '#220044',
    },
    jade: {
        id: 'jade',
        name: 'Jade',
        bodyColor: '#00b377',
        edgeColor: '#33ffaa',
        borderColor: '#66ffcc',
        textColor: '#003322',
        shadowColor: '#001a11',
        metalness: 0.2,
        roughness: 0.4,
        envMapIntensity: 1.2,
        effectType: 'stone',
        emissive: '#00ff88',
        emissiveIntensity: 0.1,
        opacity: 0.92,
        innerGlow: true,
        innerGlowColor: '#33ff99',
        innerGlowIntensity: 0.3,
        rimLight: false,
        rimLightColor: '#00ff88',
        particleType: 'magic',
        particleColor: '#33ff99',
        particleColor2: '#00ff88',
    },
    crystal: {
        id: 'crystal',
        name: 'Cristal',
        bodyColor: '#eeeeff',
        edgeColor: '#ffffff',
        borderColor: '#aaccff',
        textColor: '#0044aa',
        shadowColor: '#6688cc',
        metalness: 0.1,
        roughness: 0.02,
        envMapIntensity: 3.5,
        effectType: 'glass',
        emissive: '#aaccff',
        emissiveIntensity: 0.2,
        opacity: 0.7,
        innerGlow: true,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 1.0,
        rimLight: true,
        rimLightColor: '#aaccff',
        particleType: 'sparkle',
        particleColor: '#ffffff',
        particleColor2: '#aaccff',
    },
    sapphire: {
        id: 'sapphire',
        name: 'Saphir',
        bodyColor: '#0044cc',
        edgeColor: '#3377ff',
        borderColor: '#66aaff',
        textColor: '#ffffff',
        shadowColor: '#001144',
        metalness: 0.35,
        roughness: 0.08,
        envMapIntensity: 2.2,
        effectType: 'gem',
        emissive: '#0066ff',
        emissiveIntensity: 0.35,
        opacity: 0.88,
        innerGlow: true,
        innerGlowColor: '#3399ff',
        innerGlowIntensity: 0.7,
        rimLight: true,
        rimLightColor: '#66ccff',
        particleType: 'sparkle',
        particleColor: '#3399ff',
        particleColor2: '#ffffff',
    },
    amethyst: {
        id: 'amethyst',
        name: 'Améthyste',
        bodyColor: '#7722aa',
        edgeColor: '#aa44dd',
        borderColor: '#cc77ff',
        textColor: '#ffffff',
        shadowColor: '#220044',
        metalness: 0.3,
        roughness: 0.12,
        envMapIntensity: 2.0,
        effectType: 'gem',
        emissive: '#9933ff',
        emissiveIntensity: 0.35,
        opacity: 0.85,
        innerGlow: true,
        innerGlowColor: '#bb66ff',
        innerGlowIntensity: 0.6,
        rimLight: true,
        rimLightColor: '#dd99ff',
        particleType: 'sparkle',
        particleColor: '#bb66ff',
        particleColor2: '#ffffff',
    },
    inferno: {
        id: 'inferno',
        name: 'Inferno',
        bodyColor: '#ff3300',
        edgeColor: '#ff6600',
        borderColor: '#ffaa00',
        textColor: '#ffffff',
        shadowColor: '#330000',
        metalness: 0.4,
        roughness: 0.3,
        envMapIntensity: 1.5,
        effectType: 'magic',
        emissive: '#ff4400',
        emissiveIntensity: 0.8,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ffaa00',
        innerGlowIntensity: 1.2,
        rimLight: true,
        rimLightColor: '#ff6600',
        particleType: 'fire',
        particleColor: '#ff6600',
        particleColor2: '#ffaa00',
    },
    frost: {
        id: 'frost',
        name: 'Givre',
        bodyColor: '#88ccff',
        edgeColor: '#aaeeff',
        borderColor: '#ffffff',
        textColor: '#003366',
        shadowColor: '#004488',
        metalness: 0.2,
        roughness: 0.15,
        envMapIntensity: 2.5,
        effectType: 'magic',
        emissive: '#66ddff',
        emissiveIntensity: 0.5,
        opacity: 0.8,
        innerGlow: true,
        innerGlowColor: '#aaeeff',
        innerGlowIntensity: 0.9,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'ice',
        particleColor: '#aaeeff',
        particleColor2: '#ffffff',
    },
};

// Default skin
export const DEFAULT_SKIN = DICE_SKINS.gold;

// Helper to get skin by ID or return default
export const getSkinById = (skinId: string): DiceSkin => {
    return DICE_SKINS[skinId] || DEFAULT_SKIN;
};

// Helper for consistent values
const getDieValue = (type: string, index: number) => {
    if (type === 'd10') {
        const val = index % 10;
        return val === 0 ? "10" : val.toString();
    }
    if (type === 'd6') {
        return (index + 1).toString();
    }
    return (index + 1).toString();
};

// Create beveled geometry for premium look
const createBeveledGeometry = (type: string) => {
    let geo: THREE.BufferGeometry;
    const detail = 0; // Higher detail for smoother look

    switch (type) {
        case 'd4': geo = new THREE.TetrahedronGeometry(1.8, detail); break;
        case 'd6': geo = new THREE.BoxGeometry(2.2, 2.2, 2.2, 2, 2, 2); break;
        case 'd8': geo = new THREE.OctahedronGeometry(1.8, detail); break;
        case 'd10': geo = new THREE.IcosahedronGeometry(1.8, detail); break;
        case 'd12': geo = new THREE.DodecahedronGeometry(1.8, detail); break;
        case 'd20': geo = new THREE.IcosahedronGeometry(1.8, detail); break;
        default: geo = new THREE.BoxGeometry(2.2, 2.2, 2.2, 2, 2, 2);
    }

    geo = geo.toNonIndexed();
    geo.computeVertexNormals();

    const position = geo.attributes.position;

    const groupedFaces: { normal: THREE.Vector3, centers: THREE.Vector3[], vertices: THREE.Vector3[][] }[] = [];
    for (let i = 0; i < position.count; i += 3) {
        const a = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
        const b = new THREE.Vector3(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
        const c = new THREE.Vector3(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));

        const center = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
        const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).normalize();

        let found = groupedFaces.find(g => g.normal.dot(normal) > 0.90);
        if (found) {
            found.centers.push(center);
            found.vertices.push([a.clone(), b.clone(), c.clone()]);
        } else {
            groupedFaces.push({ normal, centers: [center], vertices: [[a.clone(), b.clone(), c.clone()]] });
        }
    }

    const trueFaces = groupedFaces.map(g => {
        const avgCenter = new THREE.Vector3();
        g.centers.forEach(c => avgCenter.add(c));
        avgCenter.divideScalar(g.centers.length);

        // Collect unique edge vertices for border decoration
        const allVerts: THREE.Vector3[] = [];
        g.vertices.forEach(tri => {
            tri.forEach(v => {
                if (!allVerts.some(ev => ev.distanceTo(v) < 0.01)) {
                    allVerts.push(v);
                }
            });
        });

        return { pos: avgCenter, norm: g.normal, edgeVerts: allVerts };
    });

    const uniqueVertices: number[][] = [];
    const cannonFaces: number[][] = [];
    const vertMap = new Map<string, number>();

    const getVertIndex = (x: number, y: number, z: number) => {
        const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
        if (vertMap.has(key)) return vertMap.get(key)!;
        const idx = uniqueVertices.length;
        uniqueVertices.push([x, y, z]);
        vertMap.set(key, idx);
        return idx;
    };

    for (let i = 0; i < position.count; i += 3) {
        const i1 = getVertIndex(position.getX(i), position.getY(i), position.getZ(i));
        const i2 = getVertIndex(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
        const i3 = getVertIndex(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));
        cannonFaces.push([i1, i2, i3]);
    }

    return {
        vertices: uniqueVertices,
        faces: cannonFaces,
        trueFaces,
        geometry: geo
    };
};

// ============================================================================
// PARTICLE SYSTEM FOR DICE
// ============================================================================

const PARTICLE_COUNT = 30;

interface ParticleData {
    positions: Float32Array;
    velocities: Float32Array;
    lifetimes: Float32Array;
    colors: Float32Array;
    sizes: Float32Array;
}

// Particles that stay world-oriented by counter-rotating
const DiceParticles = ({ skin, quaternionRef }: {
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

// ============================================================================
// CRITICAL HIT/FAIL EFFECT
// ============================================================================

type CriticalType = 'success' | 'fail' | null;

const CRIT_PARTICLE_COUNT = 60;

const CriticalEffect = ({ type, onComplete }: { type: CriticalType, onComplete: () => void }) => {
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

const ShatteredDie = ({ color, onComplete }: { color: string, onComplete: () => void }) => {
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

const Wall = ({ args, position, rotation, visible = false }: any) => {
    useBox(() => ({ type: 'Static', args, position, rotation }));
    return visible ? (
        <mesh position={position} rotation={rotation}>
            <boxGeometry args={args.map((x: number) => x * 2)} />
            <meshStandardMaterial color="orange" wireframe />
        </mesh>
    ) : null;
};

const Table = () => {
    const [ref] = usePlane(() => ({
        rotation: [-Math.PI / 2, 0, 0],
        position: [0, 0, 0],
        material: { friction: 0.3, restitution: 0.5 }
    }));

    return (
        <group>
            <mesh ref={ref as any} receiveShadow visible={false}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#1a1b26" roughness={0.5} transparent opacity={0} />
            </mesh>
            {/* Murs invisibles : Hauteur augmentée pour éviter les sauts (args=[w, h, d] => geometry=[w*2, h*2, d*2]) */}
            {/* Position Y rehaussée pour couvrir tout rebond vertical */}

            {/* Mur du Fond (Haut écran) */}
            <Wall args={[60, 50, 1]} position={[0, 25, -16]} />

            {/* Mur de Devant (Bas écran) */}
            <Wall args={[60, 50, 1]} position={[0, 25, 18]} />

            {/* Mur Gauche */}
            <Wall args={[1, 50, 60]} position={[-30, 25, 0]} />

            {/* Mur Droit */}
            <Wall args={[1, 50, 60]} position={[30, 25, 0]} />
        </group>
    );
};

// Decorative edge lines for each face
const FaceDecorations = ({ face, borderColor }: {
    face: { pos: THREE.Vector3, norm: THREE.Vector3, edgeVerts: THREE.Vector3[] },
    borderColor: string
}) => {
    const linePoints = useMemo(() => {
        let verts = face.edgeVerts;

        if (verts.length < 3) return null;

        const center = face.pos.clone();
        const normal = face.norm.clone();

        // Create a local coordinate system on the face
        let up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(normal.dot(up)) > 0.99) {
            up.set(1, 0, 0);
        }
        const tangent = new THREE.Vector3().crossVectors(normal, up).normalize();
        const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

        // Project vertices to 2D on the face plane
        const projected2D = verts.map(v => {
            const d = new THREE.Vector3().subVectors(v, center);
            return {
                x: d.dot(tangent),
                y: d.dot(bitangent),
                original: v
            };
        });

        // Find convex hull corners only (for d6, just get the 4 corners)
        const distances = projected2D.map(p => Math.sqrt(p.x * p.x + p.y * p.y));
        const maxDist = Math.max(...distances);
        const threshold = maxDist * 0.8;

        // Keep only corner vertices
        const corners = projected2D.filter((_, i) => distances[i] > threshold);

        if (corners.length < 3) return null;

        // Sort corners by angle for proper polygon ordering
        const sortedCorners = [...corners].sort((a, b) => {
            const angleA = Math.atan2(a.y, a.x);
            const angleB = Math.atan2(b.y, b.x);
            return angleA - angleB;
        });

        // Create inner border (scaled down towards center)
        const scale = 0.75;
        const innerVerts = sortedCorners.map(p => {
            const dir = new THREE.Vector3().subVectors(p.original, center);
            return center.clone().add(dir.multiplyScalar(scale));
        });

        // Create points array for Line component
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < innerVerts.length; i++) {
            points.push(innerVerts[i]);
        }
        // Close the loop
        if (innerVerts.length > 0) {
            points.push(innerVerts[0].clone());
        }

        return points;
    }, [face]);

    if (!linePoints || linePoints.length < 2) return null;

    return (
        <Line
            points={linePoints}
            color={borderColor}
            lineWidth={1.5}
        />
    );
};

// Premium Die component with skin-based appearance
const Die = React.forwardRef(({ type, position, impulse, skin, onResult }: {
    type: string,
    position: [number, number, number],
    impulse: [number, number, number],
    skin: DiceSkin,
    onResult: (val: string) => void
}, fRef: any) => {
    const { vertices, faces, trueFaces, geometry } = useMemo(() => createBeveledGeometry(type), [type]);
    const [stopped, setStopped] = useState(false);
    const [canCheck, setCanCheck] = useState(false);
    const [critType, setCritType] = useState<CriticalType>(null);
    const [isShattered, setIsShattered] = useState(false);

    const [ref, api] = useConvexPolyhedron(() => ({
        mass: 5,
        position,
        args: [vertices as any, faces],
        material: { friction: 0.1, restitution: 0.5 },
        linearDamping: 0.2,
        angularDamping: 0.2,
        allowSleep: false
    }));

    React.useImperativeHandle(fRef, () => ({
        getPosition: () => position
    }));

    useEffect(() => {
        const t = setTimeout(() => setCanCheck(true), 500);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (api) {
            const randomSpin = [Math.random() * 30, Math.random() * 30, Math.random() * 30] as [number, number, number];
            api.angularVelocity.set(...randomSpin);
            api.velocity.set(...impulse);
        }
    }, [api, impulse]);

    const velocity = useRef([0, 0, 0]);
    useEffect(() => api.velocity.subscribe((v) => (velocity.current = v)), [api]);

    const angularVelocity = useRef([0, 0, 0]);
    useEffect(() => api.angularVelocity.subscribe((v) => (angularVelocity.current = v)), [api]);

    const quaternion = useRef([0, 0, 0, 1]);
    useEffect(() => api.quaternion.subscribe((q) => (quaternion.current = q)), [api]);

    // Track physics position for particles (world space)
    const physicsPosition = useRef<[number, number, number]>(position);
    useEffect(() => api.position.subscribe((p) => (physicsPosition.current = p as [number, number, number])), [api]);

    useEffect(() => {
        if (!canCheck || stopped) return;

        const interval = setInterval(() => {
            const v = velocity.current;
            const av = angularVelocity.current;

            const speed = Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]);
            const spin = Math.abs(av[0]) + Math.abs(av[1]) + Math.abs(av[2]);

            if (speed < 0.2 && spin < 0.5) {
                const q = new THREE.Quaternion(quaternion.current[0], quaternion.current[1], quaternion.current[2], quaternion.current[3]);
                const up = new THREE.Vector3(0, 1, 0);

                let maxDot = -Infinity;
                let bestIndex = -1;

                trueFaces.forEach((face, index) => {
                    const worldNormal = face.norm.clone().applyQuaternion(q);
                    const dot = worldNormal.dot(up);
                    if (dot > maxDot) {
                        maxDot = dot;
                        bestIndex = index;
                    }
                });

                if (bestIndex !== -1) {
                    const resultValue = getDieValue(type, bestIndex);
                    console.log(`Die stopped. Face: ${bestIndex}, Native: ${resultValue}`);

                    // Check for critical on d20
                    if (type === 'd20') {
                        if (resultValue === '20') {
                            setCritType('success');
                        } else if (resultValue === '1') {
                            setCritType('fail');
                            // Shatter the die after a delay so player sees the 1
                            setTimeout(() => setIsShattered(true), 2000);
                        }
                    }

                    setStopped(true);
                    onResult(resultValue);
                }
            }
        }, 100);
        return () => clearInterval(interval);
    }, [stopped, canCheck, trueFaces, onResult, type]);

    return (
        <group ref={ref as any}>
            {/* Critical hit/fail effect */}
            {critType && <CriticalEffect type={critType} onComplete={() => setCritType(null)} />}

            {/* Shattered die fragments */}
            {isShattered && <ShatteredDie color={skin.bodyColor} onComplete={() => { }} />}

            {/* Particle effects - counter-rotated to stay world-oriented */}
            {!isShattered && <DiceParticles skin={skin} quaternionRef={quaternion as React.MutableRefObject<[number, number, number, number]>} />}

            {/* Inner glow effect - positioned at center */}
            {!isShattered && skin.innerGlow && (
                <pointLight
                    position={[0, 0, 0]}
                    color={skin.innerGlowColor}
                    intensity={skin.innerGlowIntensity}
                    distance={5}
                    decay={2}
                />
            )}

            {/* Main die body with full material effects */}
            {!isShattered && (
                <mesh castShadow receiveShadow geometry={geometry}>
                    <meshStandardMaterial
                        color={skin.bodyColor}
                        metalness={skin.metalness}
                        roughness={skin.roughness}
                        envMapIntensity={skin.envMapIntensity}
                        emissive={skin.emissive}
                        emissiveIntensity={skin.emissiveIntensity}
                        transparent={skin.opacity < 1}
                        opacity={skin.opacity}
                    />
                </mesh>
            )}

            {/* Rim lighting effect - backface glow */}
            {!isShattered && skin.rimLight && (
                <mesh geometry={geometry} scale={[1.02, 1.02, 1.02]}>
                    <meshStandardMaterial
                        color={skin.rimLightColor}
                        emissive={skin.rimLightColor}
                        emissiveIntensity={0.5}
                        metalness={0}
                        roughness={1}
                        transparent
                        opacity={0.25}
                        side={THREE.BackSide}
                    />
                </mesh>
            )}

            {/* Edge highlight mesh */}
            {!isShattered && (
                <mesh geometry={geometry} scale={[1.01, 1.01, 1.01]}>
                    <meshStandardMaterial
                        color={skin.edgeColor}
                        emissive={skin.emissive}
                        emissiveIntensity={skin.emissiveIntensity * 0.5}
                        metalness={0.8}
                        roughness={0.2}
                        transparent
                        opacity={0.35}
                        side={THREE.BackSide}
                    />
                </mesh>
            )}

            {/* Decorative borders on each face */}
            {!isShattered && trueFaces.map((face, index) => (
                <FaceDecorations key={`deco-${index}`} face={face} borderColor={skin.borderColor} />
            ))}

            {/* Face numbers with stylized look */}
            {!isShattered && trueFaces.map((face, index) => {
                const textPos = face.pos.clone().multiplyScalar(1.01);
                const displayValue = getDieValue(type, index);

                return (
                    <group key={index} position={textPos} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.norm)}>
                        {/* Shadow/depth effect */}
                        <Text
                            scale={type === 'd20' ? [0.45, 0.45, 0.45] : [0.7, 0.7, 0.7]}
                            color={skin.shadowColor}
                            fontSize={1}
                            fontWeight={900}
                            anchorX="center"
                            anchorY="middle"
                            position={[0.02, -0.02, -0.01]}
                        >
                            {displayValue}
                        </Text>
                        {/* Main number */}
                        <Text
                            scale={type === 'd20' ? [0.45, 0.45, 0.45] : [0.7, 0.7, 0.7]}
                            color={skin.textColor}
                            fontSize={1}
                            fontWeight={900}
                            anchorX="center"
                            anchorY="middle"
                        >
                            {displayValue}
                        </Text>
                    </group>
                )
            })}
        </group>
    );
});
Die.displayName = 'Die';

export const DiceThrower = () => {
    const [dice, setDice] = useState<{ id: string, rollId: string, type: string, pos: [number, number, number], imp: [number, number, number], skinId: string }[]>([]);
    const activeRollsRef = useRef<Map<string, { expected: number, results: { type: string, value: number }[] }>>(new Map());
    const diceRefs = useRef<any[]>([]);

    const handleResult = (rollId: string, type: string, val: string) => {
        const rollData = activeRollsRef.current.get(rollId);
        if (rollData) {
            rollData.results.push({ type, value: parseInt(val) });
            if (rollData.results.length === rollData.expected) {
                window.dispatchEvent(new CustomEvent('vtt-3d-roll-complete', {
                    detail: {
                        rollId,
                        results: rollData.results,
                        total: rollData.results.reduce((a, b) => a + b.value, 0)
                    }
                }));
                activeRollsRef.current.delete(rollId);
            }
        }
    };

    const throwDice = (rollId: string, requests: { type: string, count: number }[], event: any) => {
        const newDice: typeof dice = [];
        let totalDiceCount = 0;

        diceRefs.current = [];

        requests.forEach(req => {
            totalDiceCount += req.count;
            for (let i = 0; i < req.count; i++) {
                // Décalage significatif vers la droite (2/3 de l'écran)
                // Écran visible environ [-25, 25] -> 2/3 Droite correspond à X ~ 15-18
                const startX = 15 + (Math.random() - 0.5) * 6; // Zone de départ entre X=15 et X=21
                const startZ = 12 + (Math.random() * 2);
                const startY = 6 + (Math.random() * 4) + (i * 1.5);

                // Force dirigée pour rester dans le tiers droit (cible X=15)
                const targetX = 15;
                const forceX = -(startX - targetX) * (0.8 + Math.random() * 0.4) + (Math.random() - 0.5) * 2;
                const forceY = Math.random() * 5;
                const forceZ = -startZ * (0.5 + Math.random() * 0.3); // Légèrement ralenti pour rester visible

                const id = crypto.randomUUID();
                newDice.push({
                    id: id,
                    rollId: rollId,
                    type: req.type,
                    pos: [startX, startY, startZ],
                    imp: [forceX, forceY, forceZ],
                    // Use skin from event or default to gold
                    skinId: event.detail.skinId || event.detail.skin || 'gold'
                });
            }
        });

        if (totalDiceCount > 0) {
            activeRollsRef.current.set(rollId, { expected: totalDiceCount, results: [] });
            setDice(prev => [...prev, ...newDice]);
            setTimeout(() => {
                setDice(prev => prev.filter(d => !newDice.find(nd => nd.id === d.id)));
            }, 8000);
        }
    };

    useEffect(() => {
        const handleRoll = (e: any) => {
            const { rollId, requests } = e.detail;
            if (rollId && requests && Array.isArray(requests)) {
                throwDice(rollId, requests, e);
            }
        };
        window.addEventListener('vtt-trigger-3d-roll', handleRoll);
        return () => window.removeEventListener('vtt-trigger-3d-roll', handleRoll);
    }, []);

    if (dice.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-[5]">
            <Canvas shadows camera={{ position: [0, 40, 0], fov: 45 }} gl={{ alpha: true }}>
                {/* Enhanced lighting for metallic materials */}
                <ambientLight intensity={0.4} />
                <spotLight
                    position={[15, 40, 15]}
                    angle={0.5}
                    penumbra={0.5}
                    intensity={2}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                />
                <spotLight
                    position={[-10, 30, -10]}
                    angle={0.4}
                    penumbra={0.8}
                    intensity={1}
                    color="#ffeedd"
                />
                <pointLight position={[0, 20, 0]} intensity={0.8} color="#fff8e7" />

                {/* Studio environment for better reflections */}
                <Environment preset="studio" />

                <Physics gravity={[0, -40, 0]} defaultContactMaterial={{ friction: 0.01, restitution: 0.6 }} allowSleep={false} iterations={20}>
                    <Table />
                    {dice.map((d, i) => (
                        <Die
                            key={d.id}
                            ref={(el) => { if (el) diceRefs.current[i] = { id: d.id, ref: { current: el } } }}
                            type={d.type}
                            position={d.pos}
                            impulse={d.imp}
                            skin={getSkinById(d.skinId)}
                            onResult={(val) => handleResult(d.rollId, d.type, val)}
                        />
                    ))}
                </Physics>
            </Canvas>
        </div>
    );
};
