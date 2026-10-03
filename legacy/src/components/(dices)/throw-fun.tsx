"use client";

import React, { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, usePlane, useConvexPolyhedron, useBox } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { getSkinById, DiceSkin, DICE_SKINS } from './dice-definitions';
import { VisualDie } from './visual-die';
import { createBeveledGeometry, getCachedGeometry } from './geometry';
import { getAudioContext, playOneShotForSkin } from './audio';

// Skins eligible for the random "for fun" roll. Orb skins use a heavier
// transmission + GLTF-core path, so we keep the random pool to the procedural
// skins — those are the ones whose shaders we pre-warm below.
const FUN_SKIN_POOL = Object.values(DICE_SKINS)
    .filter((s) => s.effectType !== 'orb')
    .map((s) => s.id);

// NOTE: compiled shader programs belong to ONE WebGL context. Warming must
// therefore happen once per <Canvas>, never once per session — an earlier
// module-wide "already warmed" flag made every FunDiceThrower after the first
// (e.g. the store modal's, which mounts its own canvas) skip warming, so its
// first throw cold-compiled the die's whole shader set in one synchronous
// burst on a fresh context. On some Windows GPUs that burst trips the
// driver's timeout watchdog (TDR) and kills Chrome's GPU process outright.

// One full-fidelity die (face numbers, rim, inner-glow point light) is warmed
// alongside the simple pool: the text/rim programs — and the extra-light
// shader permutation an innerGlow creates — are what the first real throw
// needs, and none of them are covered by `simple` warm dice.
const FULL_WARM_SKIN =
    Object.values(DICE_SKINS).find((s) => s.effectType !== 'orb' && s.innerGlow && s.rimLight) ||
    Object.values(DICE_SKINS).find((s) => s.effectType !== 'orb' && s.innerGlow) ||
    getSkinById(Object.values(DICE_SKINS).filter((s) => s.effectType !== 'orb')[0].id);

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

    // One-shot themed sound (e.g. butterfly wings) — plays once when this die
    // is thrown, no loop.
    useEffect(() => {
        playOneShotForSkin(skin);
    }, [skin]);

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

// Each skin's onBeforeCompile injects distinct GLSL, so ~50 pooled skins mean
// ~50 separate shader programs. `gl.compile()` (even via `compileAsync`,
// which runs it synchronously under the hood) issues every compile/link call
// for the whole scene in a single JS tick — a one-shot GPU burst big enough
// to trip Windows' driver-timeout watchdog (TDR) on some machines: Chrome's
// GPU process dies instantly with no JS error. So the pool is warmed a few
// skins at a time, yielding a frame between batches.
const WARM_BATCH_SIZE = 4;

const ShaderWarmer = ({ diceType, onDone }: { diceType: string, onDone: () => void }) => {
    const { gl, scene, camera } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const [batchEnd, setBatchEnd] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            for (let end = WARM_BATCH_SIZE; end < FUN_SKIN_POOL.length + WARM_BATCH_SIZE; end += WARM_BATCH_SIZE) {
                if (cancelled) return;
                // Let the new batch's meshes mount before compiling them.
                await new Promise((r) => requestAnimationFrame(r));
                if (cancelled) return;
                setBatchEnd(Math.min(end, FUN_SKIN_POOL.length));
                await new Promise((r) => requestAnimationFrame(r));
                if (cancelled) return;
                try {
                    const anyGl = gl as any;
                    if (typeof anyGl.compileAsync === 'function') {
                        // compileAsync polls KHR_parallel_shader_compile, and
                        // some drivers only progress that status while the
                        // context is doing work — never let one stuck batch
                        // hang the whole warm-up (and with it the roll queue).
                        await Promise.race([
                            anyGl.compileAsync(scene, camera),
                            new Promise((r) => setTimeout(r, 1200)),
                        ]);
                    } else {
                        gl.compile(scene, camera);
                    }
                } catch {
                    // best-effort warmup — ignore failures
                }
            }
            if (!cancelled) onDone();
        };
        run();
        return () => { cancelled = true; };
    }, [gl, scene, camera, onDone]);

    return (
        // Pushed far away + tiny so it never shows; only there to exist in the
        // scene graph long enough for the programs to compile.
        <group ref={groupRef} position={[0, -1000, 0]} scale={0.001}>
            {/* Full-fidelity die mounted for the WHOLE warm-up (not batched):
                compiles the face-number text + rim programs, and keeps the
                scene's light count constant across batches (its innerGlow
                point light would otherwise invalidate previously-warmed
                programs mid-run). */}
            <VisualDie type={diceType} skin={FULL_WARM_SKIN} isShattered={false} critType={null} />
            {FUN_SKIN_POOL.slice(0, batchEnd).map((skinId) => (
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
    // Pre-warm shaders once per INSTANCE (i.e. per WebGL context — see note
    // above FULL_WARM_SKIN). We start shortly after mount so it doesn't
    // compete with the initial page load; a click before then starts it
    // immediately.
    const [startWarm, setStartWarm] = useState(false);
    const [warmDone, setWarmDone] = useState(false);
    const warmDoneRef = useRef(false);
    // Rolls requested while shaders are still compiling: spawning a die
    // mid-warm-up both cold-compiles its programs and (via its glow light)
    // invalidates every already-warmed program in the scene — one giant
    // recompile burst, the exact thing that crashes Windows GPU drivers. So
    // early rolls wait here and fire as soon as the warm-up finishes.
    const pendingRolls = useRef<{ skinId?: string, diceType?: string }[]>([]);

    useEffect(() => {
        const id = window.setTimeout(() => setStartWarm(true), 600);
        return () => window.clearTimeout(id);
    }, []);

    const spawnDie = useCallback((skinId?: string, diceType?: string) => {
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

    const handleWarmed = useCallback(() => {
        if (warmDoneRef.current) return; // idempotent (real onDone + safety net below)
        warmDoneRef.current = true;
        setWarmDone(true);
        // Fire the rolls that were requested during warm-up, slightly
        // staggered so several queued dice don't all mount in one frame.
        const pending = pendingRolls.current.splice(0);
        pending.forEach((p, i) => setTimeout(() => spawnDie(p.skinId, p.diceType), i * 150));
    }, [spawnDie]);

    // Safety net: NEVER hold rolls hostage to a warm-up that hangs or is slow
    // (e.g. a driver that only progresses async shader compiles while frames
    // render). Warming is an optimisation, not a gate — after this deadline
    // the queue flushes no matter what.
    useEffect(() => {
        if (!startWarm || warmDone) return;
        const t = window.setTimeout(handleWarmed, 4000);
        return () => window.clearTimeout(t);
    }, [startWarm, warmDone, handleWarmed]);

    const rollDie = useCallback((skinId?: string, diceType?: string) => {
        if (!warmDoneRef.current) {
            pendingRolls.current.push({ skinId, diceType });
            setStartWarm(true); // mount the canvas + warmer right away
            return;
        }
        spawnDie(skinId, diceType);
    }, [spawnDie]);

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
                        gl={{ alpha: true, powerPreference: 'high-performance' }}
                        // Procedural die shaders are expensive PER PIXEL (many
                        // fbm calls) — capping dpr at 1.25 cuts fill cost ~30%
                        // vs 1.5 for an invisible difference on moving dice.
                        dpr={[1, 1.25]}
                        // Keep rendering while warming: drivers only progress
                        // async shader compiles (KHR_parallel_shader_compile)
                        // while the context does work — with 'demand' here the
                        // warm-up never finished and queued rolls never fired.
                        frameloop={dice.length > 0 || !warmDone ? 'always' : 'demand'}
                        style={{ pointerEvents: 'none' }}
                    >
                        <ambientLight intensity={0.4} />
                        <spotLight position={[15, 40, 15]} angle={0.5} penumbra={0.5} intensity={2} />
                        <spotLight position={[-10, 30, -10]} angle={0.4} penumbra={0.8} intensity={1} color="#ffeedd" />
                        <pointLight position={[0, 20, 0]} intensity={0.8} color="#fff8e7" />
                        <Environment preset="city" />

                        {!warmDone && <ShaderWarmer diceType={defaultDiceType} onDone={handleWarmed} />}

                        {dice.length > 0 && (
                            <Physics gravity={[0, -60, 0]} defaultContactMaterial={{ friction: 0.1, restitution: 0.5 }} allowSleep={true} iterations={7}>
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
