"use client";

import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { VisualDie } from '@/components/(dices)/visual-die';
import { getSkinById } from '@/components/(dices)/dice-definitions';

// Isolated test page to debug orb dice / cores without physics or a game room.
// Renders the eye orb and the aqua orb side by side, big, on a dark background.
export default function TestDicePage() {
    const skins = ['shield_orb', 'book_orb', 'potion_orb', 'mug_orb', 'mimique_orb', 'ring_orb', 'beholder_orb', 'eye_orb', 'aqua_orb'];

    return (
        <div className="w-screen min-h-screen bg-neutral-900 grid grid-cols-3 auto-rows-[50vh]">
            {skins.map((skinId) => (
                <div key={skinId} className="relative border border-neutral-700">
                    <div className="absolute top-2 left-2 z-10 text-white text-sm font-mono">
                        {skinId}
                    </div>
                    <Canvas camera={{ position: [0, 0, 8], fov: 45 }} gl={{ alpha: true, antialias: true }}>
                        <ambientLight intensity={0.6} />
                        <spotLight position={[10, 10, 10]} angle={0.5} penumbra={1} intensity={2} />
                        <pointLight position={[-10, -10, -10]} intensity={0.5} />
                        <Environment preset="city" />
                        <group scale={1.6}>
                            <VisualDie type="d20" skin={getSkinById(skinId)} isShattered={false} critType={null} />
                        </group>
                        <OrbitControls enableZoom={true} enablePan={false} />
                    </Canvas>
                </div>
            ))}
        </div>
    );
}
