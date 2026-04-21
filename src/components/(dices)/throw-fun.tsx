"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, usePlane, useConvexPolyhedron, useBox } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { getSkinById, DiceSkin, DICE_SKINS } from './dice-definitions';
import { VisualDie, createBeveledGeometry, getCachedGeometry, getAudioContext } from './throw';

// ============================================================================
// WALL & TABLE
// ============================================================================

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
        material: { friction: 0.4, restitution: 0.4 }
    }));

    return (
        <group>
            <mesh ref={ref as any} visible={false}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#1a1b26" roughness={0.5} transparent opacity={0} />
            </mesh>
            <Wall args={[60, 50, 1]} position={[0, 25, -16]} />
            <Wall args={[60, 50, 1]} position={[0, 25, 18]} />
            <Wall args={[1, 50, 60]} position={[-30, 25, 0]} />
            <Wall args={[1, 50, 60]} position={[30, 25, 0]} />
        </group>
    );
};

// ============================================================================
// FUN DIE COMPONENT (Physics only, no target/result logic)
// ============================================================================

const FunDie = React.forwardRef(({ type, position, impulse, angularVelocity, skin }: {
    type: string,
    position: [number, number, number],
    impulse: [number, number, number],
    angularVelocity: [number, number, number],
    skin: DiceSkin,
}, fRef: any) => {
    const { vertices, faces } = getCachedGeometry(type);
    const lastImpactTime = useRef(0);

    const playClick = useCallback((vel: number) => {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();
            osc.type = 'sine';
            const baseFreq = 120 + Math.random() * 40;
            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);
            oscGain.gain.setValueAtTime(Math.min(0.4, vel / 5), ctx.currentTime);
            oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            osc.connect(oscGain);
            oscGain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
        } catch (e) { }
    }, []);

    const [ref, api] = useConvexPolyhedron(() => ({
        mass: 5,
        position,
        args: [vertices as any, faces],
        material: { friction: 0.15, restitution: 0.5 },
        linearDamping: 0.08,
        angularDamping: 0.08,
        allowSleep: true,
        onCollide: (e) => {
            const impactVelocity = e.contact.impactVelocity;
            const now = performance.now();
            if (impactVelocity > 0.1 && (now - lastImpactTime.current > 40)) {
                lastImpactTime.current = now;
                playClick(impactVelocity);
            }
        }
    }));

    useEffect(() => {
        if (api) {
            api.angularVelocity.set(...angularVelocity);
            api.velocity.set(...impulse);
        }
    }, [api, impulse, angularVelocity]);

    return (
        <group ref={ref as any}>
            <VisualDie type={type} skin={skin} isShattered={false} critType={null} ref={null} />
        </group>
    );
});
FunDie.displayName = 'FunDie';

// ============================================================================
// FUN DICE THROWER (No DB, no result tracking, just visual)
// ============================================================================

interface FunDiceProps {
    className?: string;
    buttonText?: string;
    defaultDiceType?: string;
    defaultSkinId?: string;
}

export const FunDiceThrower: React.FC<FunDiceProps> = ({
    className = "",
    buttonText = "Lancer pour le fun",
    defaultDiceType = "d20",
    defaultSkinId = "amethyst"
}) => {
    const [dice, setDice] = useState<{ id: string, type: string, pos: [number, number, number], imp: [number, number, number], ang: [number, number, number], skinId: string }[]>([]);

    const rollDie = () => {
        // Random start position
        const startX = (Math.random() - 0.5) * 10;
        const startZ = 10 + (Math.random() * 5);
        const startY = 8 + (Math.random() * 4);

        // Throw towards center (0,0,0)
        const forceX = -startX * (1.2 + Math.random() * 0.5);
        const forceY = 4 + Math.random() * 4;
        const forceZ = -startZ * (1.2 + Math.random() * 0.5);

        // Random spin
        const angX = (Math.random() - 0.5) * 60;
        const angY = (Math.random() - 0.5) * 60;
        const angZ = (Math.random() - 0.5) * 60;

        const skinKeys = Object.keys(DICE_SKINS);
        const randomSkinId = skinKeys[Math.floor(Math.random() * skinKeys.length)];

        const newDie = {
            id: crypto.randomUUID(),
            type: defaultDiceType,
            pos: [startX, startY, startZ] as [number, number, number],
            imp: [forceX, forceY, forceZ] as [number, number, number],
            ang: [angX, angY, angZ] as [number, number, number],
            skinId: randomSkinId
        };

        setDice(prev => [...prev, newDie]);

        // Cleanup after 7 seconds (die has stopped and we don't need it lingering forever, or maybe leave it?)
        // Let's clear it automatically so it doesn't clutter.
        setTimeout(() => {
            setDice(prev => prev.filter(d => d.id !== newDie.id));
        }, 7000);
    };

    return (
        <div className={`relative ${className}`}>
            <button
                onClick={rollDie}
                className="px-4 py-2 bg-[var(--bg-canvas)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-panel)] hover:border-[var(--accent-brown)] transition-colors shadow-sm font-medium z-10 relative"
            >
                🎲 {buttonText}
            </button>

            <div className="fixed inset-0 pointer-events-none z-[100]" style={{ display: dice.length > 0 ? 'block' : 'none' }}>
                <Canvas camera={{ position: [0, 40, 0], fov: 45 }} gl={{ alpha: true }} style={{ pointerEvents: 'none' }}>
                    <ambientLight intensity={0.4} />
                    <spotLight position={[15, 40, 15]} angle={0.5} penumbra={0.5} intensity={2} />
                    <spotLight position={[-10, 30, -10]} angle={0.4} penumbra={0.8} intensity={1} color="#ffeedd" />
                    <pointLight position={[0, 20, 0]} intensity={0.8} color="#fff8e7" />
                    <Environment preset="city" />
                    <Physics gravity={[0, -60, 0]} defaultContactMaterial={{ friction: 0.1, restitution: 0.5 }} allowSleep={true} iterations={10}>
                        <Table />
                        {dice.map((d) => (
                            <FunDie
                                key={d.id}
                                type={d.type}
                                position={d.pos}
                                impulse={d.imp}
                                angularVelocity={d.ang}
                                skin={getSkinById(d.skinId)}
                            />
                        ))}
                    </Physics>
                </Canvas>
            </div>
        </div>
    );
};

export default FunDiceThrower;
