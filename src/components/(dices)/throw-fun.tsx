"use client";

import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, usePlane, useConvexPolyhedron, useBox } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { getSkinById, DiceSkin, DICE_SKINS } from './dice-definitions';
import { VisualDie } from './visual-die';
import { createBeveledGeometry, getCachedGeometry } from './geometry';
import { getAudioContext } from './audio';

// Skins eligible for the random "for fun" roll. Orb skins use a heavier
// transmission + GLTF-core path, so we keep the random pool to the procedural
// skins — those are the ones whose shaders we pre-warm below.
const FUN_SKIN_POOL = Object.values(DICE_SKINS)
    .filter((s) => s.effectType !== 'orb')
    .map((s) => s.id);

// Module-level guard so the (expensive) shader pre-compile only runs once per
// session, no matter how many FunDiceThrower instances mount.
let shadersWarmed = false;

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
// SHADER WARMER
// ----------------------------------------------------------------------------
// Renders every pooled skin once, far off-screen, and asks the renderer to
// compile their shader programs asynchronously. This moves the (synchronous,
// frame-blocking) shader compilation off the click path, so throwing dice no
// longer freezes the page the first time a given skin appears.
// ============================================================================

const ShaderWarmer = ({ diceType, onDone }: { diceType: string, onDone: () => void }) => {
    const { gl, scene, camera } = useThree();
    const groupRef = useRef<THREE.Group>(null);

    useEffect(() => {
        let cancelled = false;
        const compile = async () => {
            // Wait a tick so the offscreen meshes are in the scene graph.
            await new Promise((r) => requestAnimationFrame(r));
            if (cancelled) return;
            try {
                const anyGl = gl as any;
                if (typeof anyGl.compileAsync === 'function') {
                    await anyGl.compileAsync(scene, camera);
                } else {
                    gl.compile(scene, camera);
                }
            } catch {
                // best-effort warmup — ignore failures
            }
            if (!cancelled) onDone();
        };
        compile();
        return () => { cancelled = true; };
    }, [gl, scene, camera, onDone]);

    return (
        // Pushed far away + tiny so it never shows; only there to exist in the
        // scene graph long enough for the programs to compile.
        <group ref={groupRef} position={[0, -1000, 0]} scale={0.001}>
            {FUN_SKIN_POOL.map((skinId) => (
                <VisualDie
                    key={skinId}
                    type={diceType}
                    skin={getSkinById(skinId)}
                    isShattered={false}
                    critType={null}
                    simple
                />
            ))}
        </group>
    );
};

// ============================================================================
// FUN DICE THROWER (No DB, no result tracking, just visual)
// ============================================================================

interface FunDiceProps {
    className?: string;
    buttonText?: string;
    defaultDiceType?: string;
    /** Hide the built-in button — control rolls imperatively via ref instead */
    hideButton?: boolean;
    /** z-index of the physics canvas overlay */
    overlayZIndex?: number;
}

export interface FunDiceHandle {
    /** Roll a die with a specific skin (falls back to a random skin) */
    roll: (skinId?: string, diceType?: string) => void;
}

export const FunDiceThrower = forwardRef<FunDiceHandle, FunDiceProps>(({
    className = "",
    buttonText = "Lancer pour le fun",
    defaultDiceType = "d20",
    hideButton = false,
    overlayZIndex = 100,
}, ref) => {
    const [dice, setDice] = useState<{ id: string, type: string, pos: [number, number, number], imp: [number, number, number], ang: [number, number, number], skinId: string }[]>([]);
    // Pre-warm shaders once per session. We start the warmup shortly after mount
    // so it doesn't compete with the initial page load. `startWarm` mounts the
    // offscreen warmup canvas; `warmDone` unmounts it once compilation finishes.
    const [startWarm, setStartWarm] = useState(false);
    const [warmDone, setWarmDone] = useState(shadersWarmed);

    useEffect(() => {
        if (shadersWarmed) return;
        const id = window.setTimeout(() => setStartWarm(true), 600);
        return () => window.clearTimeout(id);
    }, []);

    const handleWarmed = useCallback(() => {
        shadersWarmed = true;
        setWarmDone(true);
    }, []);

    const rollDie = useCallback((skinId?: string, diceType?: string) => {
        // Pick a random skin (from the pre-warmed pool) when none is requested.
        const resolvedSkinId = skinId ||
            FUN_SKIN_POOL[Math.floor(Math.random() * FUN_SKIN_POOL.length)];

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

        const newDie = {
            id: crypto.randomUUID(),
            type: diceType || defaultDiceType,
            pos: [startX, startY, startZ] as [number, number, number],
            imp: [forceX, forceY, forceZ] as [number, number, number],
            ang: [angX, angY, angZ] as [number, number, number],
            skinId: resolvedSkinId,
        };

        setDice(prev => [...prev, newDie]);

        // Auto-cleanup so the die doesn't linger forever
        setTimeout(() => {
            setDice(prev => prev.filter(d => d.id !== newDie.id));
        }, 7000);
    }, [defaultDiceType]);

    useImperativeHandle(ref, () => ({ roll: rollDie }), [rollDie]);

    return (
        <div className={`relative ${className}`}>
            {!hideButton && (
                <button
                    onClick={() => rollDie()}
                    className="px-4 py-2 bg-[var(--bg-canvas)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-panel)] hover:border-[var(--accent-brown)] transition-colors shadow-sm font-medium z-10 relative"
                >
                    🎲 {buttonText}
                </button>
            )}

            {/* One persistent canvas. It hosts both the dice and the offscreen
                shader warmer so they share a single WebGL context — programs
                compiled by the warmer are then reused (no compile stall) when
                dice are actually thrown. It only mounts once warming starts or
                dice exist, and stays mounted afterwards to keep the cache warm. */}
            {(startWarm || dice.length > 0) && (
                <div
                    className="fixed inset-0 pointer-events-none"
                    style={{ zIndex: overlayZIndex, visibility: dice.length > 0 ? 'visible' : 'hidden' }}
                >
                    <Canvas
                        camera={{ position: [0, 40, 0], fov: 45 }}
                        gl={{ alpha: true }}
                        dpr={[1, 1.5]}
                        frameloop={dice.length > 0 ? 'always' : 'demand'}
                        style={{ pointerEvents: 'none' }}
                    >
                        <ambientLight intensity={0.4} />
                        <spotLight position={[15, 40, 15]} angle={0.5} penumbra={0.5} intensity={2} />
                        <spotLight position={[-10, 30, -10]} angle={0.4} penumbra={0.8} intensity={1} color="#ffeedd" />
                        <pointLight position={[0, 20, 0]} intensity={0.8} color="#fff8e7" />
                        <Environment preset="city" />

                        {!warmDone && <ShaderWarmer diceType={defaultDiceType} onDone={handleWarmed} />}

                        {dice.length > 0 && (
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
                        )}
                    </Canvas>
                </div>
            )}
        </div>
    );
});
FunDiceThrower.displayName = 'FunDiceThrower';

export default FunDiceThrower;
