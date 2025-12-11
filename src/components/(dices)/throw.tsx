"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, usePlane, useConvexPolyhedron, useBox } from '@react-three/cannon';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";

// Helper for consistent values
const getDieValue = (type: string, index: number) => {
    if (type === 'd10') {
        // D10 usually 0-9. Face 0->0, Face 1->1.
        return (index % 10).toString();
    }
    return (index + 1).toString();
};

const createGeometryData = (type: string) => {
    let geo: THREE.BufferGeometry;
    switch (type) {
        case 'd4': geo = new THREE.TetrahedronGeometry(1.5); break;
        case 'd6': geo = new THREE.BoxGeometry(2, 2, 2); break;
        case 'd8': geo = new THREE.OctahedronGeometry(1.5); break;
        case 'd10': geo = new THREE.IcosahedronGeometry(1.5); break;
        case 'd12': geo = new THREE.DodecahedronGeometry(1.5); break;
        case 'd20': geo = new THREE.IcosahedronGeometry(1.5); break;
        default: geo = new THREE.BoxGeometry(2, 2, 2);
    }

    // VISUAL & LOGIC: Non-indexed for easy face center calculation
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();

    const position = geo.attributes.position;

    // 1. Calculate Face Centers (Visual/Logic) logic stays same
    const groupedFaces: { normal: THREE.Vector3, centers: THREE.Vector3[] }[] = [];
    for (let i = 0; i < position.count; i += 3) {
        const a = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
        const b = new THREE.Vector3(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
        const c = new THREE.Vector3(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));

        const center = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
        const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).normalize();

        let found = groupedFaces.find(g => g.normal.dot(normal) > 0.90);
        if (found) found.centers.push(center);
        else groupedFaces.push({ normal, centers: [center] });
    }

    const trueFaces = groupedFaces.map(g => {
        const avgCenter = new THREE.Vector3();
        g.centers.forEach(c => avgCenter.add(c));
        avgCenter.divideScalar(g.centers.length);
        return { pos: avgCenter, norm: g.normal };
    });

    // 2. PHYSICS: Merge Vertices for stable ConvexPolyhedron
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
        vertices: uniqueVertices, // CLEAN vertices for Physics
        faces: cannonFaces,       // INDEXED faces for Physics
        trueFaces,                // Data for Text labels
        geometry: geo             // Visual geometry
    };
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
            <Wall args={[50, 10, 1]} position={[0, 5, -15]} />
            <Wall args={[50, 10, 1]} position={[0, 5, 15]} />
            <Wall args={[1, 10, 50]} position={[-25, 5, 0]} />
            <Wall args={[1, 10, 50]} position={[25, 5, 0]} />
        </group>
    );
};

const Die = ({ type, position, impulse, onResult }: { type: string, position: [number, number, number], impulse: [number, number, number], onResult: (val: string) => void }) => {
    const { vertices, faces, trueFaces, geometry } = useMemo(() => createGeometryData(type), [type]);
    const [stopped, setStopped] = useState(false);
    const [canCheck, setCanCheck] = useState(false);

    const [ref, api] = useConvexPolyhedron(() => ({
        mass: 5,
        position,
        args: [vertices as any, faces],
        material: { friction: 0.1, restitution: 0.5 }, // Lower restitution slightly to reduce bouncing
        linearDamping: 0.2, // Increase damping to make them stop faster
        angularDamping: 0.2,
        allowSleep: false
    }));

    useEffect(() => {
        const t = setTimeout(() => setCanCheck(true), 500); // Check faster
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

    useEffect(() => {
        if (!canCheck || stopped) return;

        const interval = setInterval(() => {
            const v = velocity.current;
            const av = angularVelocity.current;

            const speed = Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]);
            const spin = Math.abs(av[0]) + Math.abs(av[1]) + Math.abs(av[2]);

            // Relaxed thresholds for faster detection
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
                    setStopped(true);
                    onResult(resultValue);
                }
            }
        }, 100); // Poll faster
        return () => clearInterval(interval);
    }, [stopped, canCheck, trueFaces, onResult, type]);

    return (
        <group ref={ref as any}>
            <mesh castShadow receiveShadow geometry={geometry}>
                <meshStandardMaterial color="#4f46e5" metalness={0.2} roughness={0.1} />
            </mesh>
            {trueFaces.map((face, index) => {
                const textPos = face.pos.clone().multiplyScalar(1.15);
                const displayValue = getDieValue(type, index);

                return (
                    <group key={index} position={textPos} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.norm)}>
                        <Text
                            scale={type === 'd20' ? [0.5, 0.5, 0.5] : [0.8, 0.8, 0.8]}
                            color="white"
                            fontSize={1}
                            fontWeight={800}
                            anchorX="center"
                            anchorY="middle"
                        >
                            {displayValue}
                        </Text>
                    </group>
                )
            })}
        </group>
    )
};

export const DiceThrower = () => {
    // track dice by internal ID
    const [dice, setDice] = useState<{ id: string, rollId: string, type: string, pos: [number, number, number], imp: [number, number, number] }[]>([]);

    // Store results in a Ref to avoid stale closures in timeouts/effects if we used state for aggregation logic
    // But we need state to trigger re-renders or effects? Actually we just need to emit when complete.
    // Let's use a Ref for currently active rolls we are tracking to know when to emit.
    const activeRollsRef = useRef<Map<string, { expected: number, results: { type: string, value: number }[] }>>(new Map());

    const handleResult = (rollId: string, type: string, val: string) => {
        const rollData = activeRollsRef.current.get(rollId);
        if (rollData) {
            rollData.results.push({ type, value: parseInt(val) });

            console.log(`[DiceThrower] Got result for ${rollId}: ${val} (${type}). Progress: ${rollData.results.length}/${rollData.expected}`);

            if (rollData.results.length === rollData.expected) {
                console.log(`[DiceThrower] Roll ${rollId} complete! Emitting results:`, rollData.results);
                window.dispatchEvent(new CustomEvent('vtt-3d-roll-complete', {
                    detail: {
                        rollId,
                        results: rollData.results,
                        total: rollData.results.reduce((a, b) => a + b.value, 0)
                    }
                }));
                // Cleanup this roll from tracking map
                activeRollsRef.current.delete(rollId);
            }
        }
    };

    const throwDice = (rollId: string, requests: { type: string, count: number }[]) => {
        const newDice: typeof dice = [];
        let totalDiceCount = 0;

        requests.forEach(req => {
            totalDiceCount += req.count;
            for (let i = 0; i < req.count; i++) {
                const startX = (Math.random() - 0.5) * 10;
                const startZ = 10 + (Math.random() * 2);
                const startY = 5 + (Math.random() * 5) + (i * 1.5);

                const forceX = -startX * (0.8 + Math.random() * 0.4);
                const forceY = Math.random() * 5;
                const forceZ = -startZ * (0.8 + Math.random() * 0.4);

                newDice.push({
                    id: crypto.randomUUID(),
                    rollId: rollId,
                    type: req.type,
                    pos: [startX, startY, startZ],
                    imp: [forceX, forceY, forceZ]
                });
            }
        });

        // Initialize tracking for this roll
        if (totalDiceCount > 0) {
            activeRollsRef.current.set(rollId, { expected: totalDiceCount, results: [] });

            setDice(prev => [...prev, ...newDice]);

            // Auto clear visual dice after 8 seconds
            setTimeout(() => {
                setDice(prev => prev.filter(d => !newDice.find(nd => nd.id === d.id)));
            }, 8000);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handleRoll = (e: any) => {
            console.log("DiceThrower received event:", e.detail);
            const { rollId, requests } = e.detail;
            // Expect requests to be array of { type: string, count: number }
            if (rollId && requests && Array.isArray(requests)) {
                throwDice(rollId, requests);
            }
        };
        window.addEventListener('vtt-trigger-3d-roll', handleRoll);
        return () => window.removeEventListener('vtt-trigger-3d-roll', handleRoll);
    }, []);

    if (dice.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-[5]">
            <Canvas shadows camera={{ position: [0, 40, 0], fov: 45 }} gl={{ alpha: true }}>
                <ambientLight intensity={0.6} />
                <spotLight position={[10, 40, 20]} angle={0.4} penumbra={0.5} intensity={2} castShadow />
                <pointLight position={[-10, 10, -10]} intensity={1} color="#c0a080" />

                <Physics gravity={[0, -40, 0]} defaultContactMaterial={{ friction: 0.01, restitution: 0.6 }} allowSleep={false} iterations={20}>
                    <Table />
                    {dice.map(d => (
                        <Die
                            key={d.id}
                            type={d.type}
                            position={d.pos}
                            impulse={d.imp}
                            onResult={(val) => handleResult(d.rollId, d.type, val)}
                        />
                    ))}
                </Physics>
            </Canvas>
        </div>
    );
};
