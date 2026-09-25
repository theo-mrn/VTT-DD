"use client";

// Offline baking route: renders ONE die full-frame on a transparent bg for the
// snapshot script (scripts/bake-dice.mjs). Not linked in the app UI.
// Usage: /dice-bake?skin=<skinId>

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { VisualDie } from '@/components/(dices)/visual-die';
import { getSkinById, DICE_SKINS } from '@/components/(dices)/dice-definitions';
import { getCachedGeometry, getDieValue } from '@/components/(dices)/geometry';
import * as THREE from 'three';

// Quaternion that brings the "20" face toward the camera (+Z), with a small
// downward tilt so the die keeps its 3D relief instead of looking flat.
function useFace20Quaternion() {
    return React.useMemo(() => {
        const { trueFaces } = getCachedGeometry('d20');
        let idx = trueFaces.findIndex((_, i) => getDieValue('d20', i) === '20');
        if (idx < 0) idx = 0;
        const normal = trueFaces[idx].norm.clone().normalize();
        // Face the camera, straight on (no tilt).
        return new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, 0, 1));
    }, []);
}

function Die({ skinId, onReady }: { skinId: string; onReady: () => void }) {
    const { gl, scene, camera } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const frame = useRef(0);
    const skin = getSkinById(skinId);
    const quat = useFace20Quaternion();

    useFrame(() => {
        // Orient the 20 toward the camera, and shift the die DOWN so that face
        // (which sits above the die centre on an icosahedron) lands in the
        // middle of the frame.
        if (groupRef.current) {
            groupRef.current.quaternion.copy(quat);
            groupRef.current.position.set(0, -0.7, 0);
        }
        frame.current++;
        // Let shaders/models settle, render once, then flag ready.
        if (frame.current === 12) {
            gl.render(scene, camera);
            (window as any).__dieReady = true;
            onReady();
        }
    });

    return (
        <group ref={groupRef} scale={1.6}>
            <VisualDie type="d20" skin={skin} isShattered={false} critType={null} />
        </group>
    );
}

export default function DiceBakePage() {
    const [skinId, setSkinId] = useState<string>('gold');

    useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        setSkinId(p.get('skin') || 'gold');
        (window as any).__dieReady = false;
        // Expose the full skin id list so the baking script can iterate.
        (window as any).__allSkins = Object.keys(DICE_SKINS);
    }, []);

    return (
        <div className="bake-root" style={{ width: 512, height: 512, background: 'transparent' }}>
            <Canvas
                camera={{ position: [0, 0, 8], fov: 45 }}
                gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
                dpr={2}
                style={{ width: 512, height: 512 }}
            >
                <ambientLight intensity={0.9} />
                <spotLight position={[10, 10, 10]} angle={0.5} penumbra={1} intensity={1.4} />
                <pointLight position={[-10, -10, -10]} intensity={0.4} />
                <Environment preset="city" environmentIntensity={0.55} />
                <React.Suspense fallback={null}>
                    <Die skinId={skinId} onReady={() => { }} />
                </React.Suspense>
            </Canvas>
        </div>
    );
}
