"use client";

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { VisualDie, getSkinById } from './throw';
import * as THREE from 'three';

const AutoRotatingDie = ({ type, skinId }: { type: string, skinId: string }) => {
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
            <VisualDie
                type={type}
                skin={skin}
                isShattered={false}
                critType={null}
            />
        </group>
    );
};

export function DicePreview({ skinId, type = "d20", className = "" }: { skinId: string, type?: string, className?: string }) {
    return (
        <div className={`relative ${className}`}>
            <Canvas
                shadows
                camera={{ position: [0, 0, 8], fov: 45 }}
                gl={{ alpha: true, antialias: true }}
            >
                <ambientLight intensity={0.6} />
                <spotLight
                    position={[10, 10, 10]}
                    angle={0.5}
                    penumbra={1}
                    intensity={2}
                    castShadow
                />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                <Environment preset="studio" />

                <AutoRotatingDie type={type} skinId={skinId} />

                <OrbitControls enableZoom={false} enablePan={false} />
            </Canvas>
        </div>
    );
}
