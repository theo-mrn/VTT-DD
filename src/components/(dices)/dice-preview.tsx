"use client";

import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { VisualDie } from './throw';
import { getSkinById, DICE_SKINS } from './dice-definitions';
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

// Static 2D representation of a die
export function StaticDie2D({ skinId, type = "d20" }: { skinId: string, type?: string }) {
    const skin = getSkinById(skinId);

    return (
        <div className="w-full h-full flex items-center justify-center rounded-lg border-2 transition-all duration-200"
            style={{
                background: `linear-gradient(135deg, ${skin.bodyColor} 0%, ${skin.edgeColor} 100%)`,
                borderColor: skin.borderColor,
                boxShadow: `0 4px 12px ${skin.shadowColor}66, inset 0 1px 2px ${skin.edgeColor}44`
            }}
        >
            <div className="text-center">
                <div className="text-4xl font-bold mb-1" style={{ color: skin.textColor }}>
                    {type.toUpperCase()}
                </div>
                <div className="text-xs opacity-75" style={{ color: skin.textColor }}>
                    {skin.name}
                </div>
            </div>
        </div>
    );
}

// Individual dice item in the grid
function DiceGridItem({ skinId, type = "d20" }: { skinId: string, type?: string }) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="relative aspect-square cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Static 2D version - always rendered */}
            <div className={`absolute inset-0 transition-opacity duration-300 ${isHovered ? 'opacity-0' : 'opacity-100'}`}>
                <StaticDie2D skinId={skinId} type={type} />
            </div>

            {/* 3D animated version - only visible on hover */}
            <div className={`absolute inset-0 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {isHovered && <DicePreview skinId={skinId} type={type} className="w-full h-full" />}
            </div>
        </div>
    );
}

// Main grid modal component
export function DiceGridModal({
    isOpen,
    onClose,
    type = "d20",
    onSelectSkin
}: {
    isOpen: boolean,
    onClose: () => void,
    type?: string,
    onSelectSkin?: (skinId: string) => void
}) {
    if (!isOpen) return null;

    const skinEntries = Object.entries(DICE_SKINS);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div className="bg-gray-900 rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-700">
                    <h2 className="text-2xl font-bold text-white">
                        Choisir un skin de dé - {type.toUpperCase()}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors p-2"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Grid */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {skinEntries.map(([skinId, skin]) => (
                            <div
                                key={skinId}
                                onClick={() => onSelectSkin?.(skinId)}
                                className="hover:scale-105 transition-transform duration-200"
                            >
                                <DiceGridItem skinId={skinId} type={type} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
