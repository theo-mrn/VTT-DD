"use client";
import { Confetti, type ConfettiRef } from "@/components/ui/confetti";
import React, { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, useConvexPolyhedron } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import { DiceSkin, getSkinById, CriticalType } from './dice-definitions';
import * as THREE from 'three';
import { getCachedGeometry, getDieValue } from './geometry';
import { playRoll, startAmbience, ambienceForSkin, Ambience } from './audio';
import { Table, visibleHalfExtents, DICE_CAM_HEIGHT, DICE_CAM_FOV } from './scene';
import { VisualDie } from './visual-die';

// Physics-driven die: handles the cannon body, impact audio, settle detection,
// target snapping and criticals. Rendering is delegated to <VisualDie>.
const Die = React.forwardRef(({ type, position, impulse, skin, onResult, targetValue }: {
    type: string,
    position: [number, number, number],
    impulse: [number, number, number],
    skin: DiceSkin,
    onResult: (val: string) => void,
    targetValue?: number
}, fRef: any) => {
    const { vertices, faces, trueFaces } = getCachedGeometry(type);
    const [stopped, setStopped] = useState(false);
    const [canCheck, setCanCheck] = useState(false);
    const [critType, setCritType] = useState<CriticalType>(null);
    const [isShattered, setIsShattered] = useState(false);
    const lastImpactTime = useRef(0);
    const _q = useRef(new THREE.Quaternion());
    const _up = useRef(new THREE.Vector3(0, 1, 0));
    const _worldNormal = useRef(new THREE.Vector3());


    const [ref, api] = useConvexPolyhedron(() => ({
        mass: 5,
        position,
        // Random initial orientation: without this every die starts identity-
        // oriented, which can correlate the settled face with the (similar)
        // throw parameters and slightly bias results.
        rotation: [
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
        ] as [number, number, number],
        args: [vertices as any, faces],
        // Lower friction than before: at 0.28 the die's slide/roll bled off
        // within a bounce or two and it read as "dropped" rather than
        // "thrown". Enough grip to convert some sliding into tumbling, but
        // low enough that the die keeps traveling and rolling across the
        // table for multiple bounces.
        material: { friction: 0.12, restitution: 0.5 },
        // Low damping so dice keep tumbling across the table instead of dying
        // after the first bounce ("dropped" feel).
        linearDamping: 0.04,
        angularDamping: 0.02,
        allowSleep: true,
        onCollide: (e) => {
            const impactVelocity = e.contact.impactVelocity;
            const now = performance.now();

            // Only play sound if the impact is strong enough, and not more than
            // once every 40ms per die to avoid buzzing. Low threshold catches
            // even sliding bumps.
            if (impactVelocity > 0.1 && !stopped && (now - lastImpactTime.current > 40)) {
                lastImpactTime.current = now;
                playRoll(impactVelocity);
            }
        }
    }));

    React.useImperativeHandle(fRef, () => ({
        getPosition: () => position
    }));

    // Themed continuous ambience (e.g. soul: cold wind + murmur) for the whole
    // life of the die, regardless of how it rolls. Started on mount, faded out
    // on unmount (when the die disappears).
    useEffect(() => {
        const id = ambienceForSkin(skin);
        if (!id) return;
        const amb: Ambience | null = startAmbience(id);
        return () => { amb?.stop(); };
    }, [skin]);

    useEffect(() => {
        const t = setTimeout(() => setCanCheck(true), 400); // 400ms check delay
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (api) {
            // Natural tumbling spin: the DOMINANT rotation axis is perpendicular
            // to the horizontal throw direction (like a real die/ball rolling
            // forward end-over-end), not an independent random value per axis —
            // that's what made it look like it was spinning chaotically on the
            // spot instead of tumbling along its actual travel path. A smaller
            // random component is layered on top so dice don't all look
            // identical, plus a touch of twist around the travel axis itself.
            const horizontal = new THREE.Vector3(impulse[0], 0, impulse[2]);
            const travelDir = horizontal.lengthSq() > 1e-6 ? horizontal.normalize() : new THREE.Vector3(1, 0, 0);
            // Perpendicular to both travel direction and world-up: the "end
            // over end" tumble axis.
            const tumbleAxis = new THREE.Vector3().crossVectors(travelDir, new THREE.Vector3(0, 1, 0)).normalize();

            const tumbleSpeed = 14 + Math.random() * 10;   // main tumble, rad/s
            const twistSpeed = (Math.random() - 0.5) * 6;  // slight spin around travel axis
            const wobble = new THREE.Vector3(
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
                (Math.random() - 0.5) * 6,
            ); // small per-axis jitter so throws don't feel identical

            const angular = tumbleAxis.clone().multiplyScalar(tumbleSpeed)
                .addScaledVector(travelDir, twistSpeed)
                .add(wobble);

            api.angularVelocity.set(angular.x, angular.y, angular.z);
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

            // If strict target is set, we might want to intervene earlier or just wait for low speed
            if (speed < 0.5 && spin < 1.0) {
                const q = _q.current.set(quaternion.current[0], quaternion.current[1], quaternion.current[2], quaternion.current[3]);

                // --- SNAP TO TARGET LOGIC ---
                if (targetValue) {
                    // Find the face that corresponds to targetValue.
                    let targetFaceIndex = -1;
                    for (let i = 0; i < trueFaces.length; i++) {
                        if (getDieValue(type, i) === targetValue.toString()) {
                            targetFaceIndex = i;
                            break;
                        }
                    }

                    if (targetFaceIndex !== -1) {
                        // We want THIS face normal to point UP (0,1,0). If we are
                        // close to stopping, just SET the rotation and kill velocity.
                        const localNormal = trueFaces[targetFaceIndex].norm.clone();
                        const targetDir = new THREE.Vector3(0, 1, 0);
                        const targetQuat = new THREE.Quaternion().setFromUnitVectors(localNormal, targetDir);

                        api.velocity.set(0, 0, 0);
                        api.angularVelocity.set(0, 0, 0);
                        api.quaternion.set(targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w);

                        q.copy(targetQuat);
                        quaternion.current = [targetQuat.x, targetQuat.y, targetQuat.z, targetQuat.w];
                    }
                }
                // -----------------------------

                const up = _up.current;

                let maxDot = -Infinity;
                let bestIndex = -1;

                trueFaces.forEach((face, index) => {
                    const dot = _worldNormal.current.copy(face.norm).applyQuaternion(q).dot(up);
                    if (dot > maxDot) {
                        maxDot = dot;
                        bestIndex = index;
                    }
                });

                if (bestIndex !== -1) {
                    const resultValue = getDieValue(type, bestIndex);

                    if (targetValue && resultValue !== targetValue.toString()) {
                        console.warn(`Die landed on ${resultValue} but target was ${targetValue}. Snapping failed or mismatch.`);
                    }
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
        }, 80); // Checks every 80ms
        return () => clearInterval(interval);
    }, [stopped, canCheck, trueFaces, onResult, type, targetValue]);

    return (
        <group ref={ref as any}>
            <VisualDie
                type={type}
                skin={skin}
                isShattered={isShattered}
                critType={critType}
                stopped={stopped}
                onCritComplete={() => setCritType(null)}
                ref={null}
            />
        </group>
    );
});
Die.displayName = 'Die';

export const DiceThrower = () => {
    const [dice, setDice] = useState<{ id: string, rollId: string, type: string, pos: [number, number, number], imp: [number, number, number], skinId: string, targetValue?: number, tag?: string }[]>([]);
    const activeRollsRef = useRef<Map<string, { expected: number, results: { type: string, value: number, tag?: string }[] }>>(new Map());
    const diceRefs = useRef<any[]>([]);
    const confettiRef = useRef<ConfettiRef>(null);

    const handleResult = (rollId: string, type: string, val: string, tag?: string) => {
        if (type === 'd20' && val === '20') {
            const defaults = { origin: { y: 0.7 }, colors: ['#FFD700', '#FDB931', '#FFFFFF'] };

            // Central explosion
            confettiRef.current?.fire({
                ...defaults,
                particleCount: 100,
                spread: 100,
                startVelocity: 40,
                scalar: 1.2
            });

            // Side cannons
            setTimeout(() => {
                confettiRef.current?.fire({
                    particleCount: 80,
                    angle: 60,
                    spread: 80,
                    origin: { x: 0, y: 0.7 },
                    colors: ['#FFD700', '#FDB931', '#FFFFFF']
                });
                confettiRef.current?.fire({
                    particleCount: 80,
                    angle: 120,
                    spread: 80,
                    origin: { x: 1, y: 0.7 },
                    colors: ['#FFD700', '#FDB931', '#FFFFFF']
                });
            }, 250);
        }

        const rollData = activeRollsRef.current.get(rollId);
        if (rollData) {
            // tag : identifiant optionnel echoé tel quel (ex clé d'un dé à symboles) — permet à
            // l'appelant de réassocier chaque résultat à SON type de dé quand deux types partagent
            // la même forme physique (ex Aptitude et Difficulté, tous deux d8).
            rollData.results.push({ type, value: parseInt(val), ...(tag ? { tag } : {}) });
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

    const throwDice = (rollId: string, requests: { type: string, count: number, skinId?: string, tag?: string }[], event: any) => {
        const newDice: typeof dice = [];
        let totalDiceCount = 0;

        diceRefs.current = [];

        // Initialize available targets
        const availableTargets = (event.detail.targets || []) as { type: string, value: number }[];

        // Playable area derived from the ACTUAL viewport (same math as the
        // walls in scene.tsx): on narrow/portrait windows the visible width
        // shrinks a lot, so hardcoded spawn coords would land off-screen.
        const aspect = typeof window !== 'undefined'
            ? window.innerWidth / Math.max(window.innerHeight, 1)
            : 16 / 9;
        const { halfX, halfZ } = visibleHalfExtents(aspect);
        const dieMargin = 2.6; // wall inset + die radius, keeps results fully visible
        const maxX = Math.max(halfX - dieMargin, 2);
        const maxZ = Math.max(halfZ - dieMargin, 2);
        // Aim right-of-center, but always inside the visible area.
        const targetX = Math.min(maxX * 0.55, maxX);

        requests.forEach(req => {
            totalDiceCount += req.count;
            for (let i = 0; i < req.count; i++) {
                // Find a target value for this die type if available
                let targetValue: number | undefined = undefined;
                const targetIndex = availableTargets.findIndex(t => t.type === req.type);
                if (targetIndex !== -1) {
                    targetValue = availableTargets[targetIndex].value;
                    availableTargets.splice(targetIndex, 1);
                }

                const startX = Math.min(targetX + (Math.random() - 0.5) * Math.min(6, maxX * 0.4), maxX);
                const startZ = Math.min(12 + Math.random() * 2, maxZ);
                // Lower spawn height + smaller vertical force: a real dice
                // throw is a low, fast skim across the table, not a lob that
                // arcs up and drops back down.
                const startY = 2.5 + (Math.random() * 1.5) + (i * 1);

                // Real throwing energy: a leftward drive + a strong Z crossing so
                // the die travels and TUMBLES across the table. Force is a
                // fixed generous magnitude rather than scaled off startZ
                // (which is capped by the visible play area and could end up
                // tiny) — otherwise the die barely crosses the table and
                // reads as "dropped" instead of "thrown". More horizontal
                // punch, less vertical loft, for a flatter/faster throw.
                const forceX = -(startX - targetX) * (2.2 + Math.random() * 1.0) - (5 + Math.random() * 5);
                const forceY = 2.5 + Math.random() * 3;
                const forceZ = -(30 + Math.random() * 12);

                const id = crypto.randomUUID();
                newDice.push({
                    id: id,
                    rollId: rollId,
                    type: req.type,
                    pos: [startX, startY, startZ],
                    imp: [forceX, forceY, forceZ],
                    // Skin par requête (ex couleur d'un dé à symboles : Aptitude vert, Défi rouge...),
                    // sinon skin global de l'utilisateur, sinon or.
                    skinId: req.skinId || event.detail.skinId || event.detail.skin || 'gold',
                    targetValue: targetValue, // Pass the target value
                    tag: req.tag
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

    const hasDice = dice.length > 0;

    // The canvas stays mounted even with no dice so the WebGL context, the
    // (heavy) "city" environment map and the compiled skin shaders persist
    // between rolls instead of being recreated/recompiled on every throw.
    // When idle it's hidden and switched to on-demand rendering (no render
    // loop, ~0 cost).
    return (
        <div
            className="fixed inset-0 pointer-events-none z-[5]"
            style={{ visibility: hasDice ? 'visible' : 'hidden' }}
        >
            <Confetti
                ref={confettiRef}
                className="absolute left-0 top-0 z-0 size-full"
                manualstart
            />
            <Canvas
                camera={{ position: [0, DICE_CAM_HEIGHT, 0], fov: DICE_CAM_FOV }}
                gl={{ alpha: true, powerPreference: 'high-performance' }}
                // Same fill-cost cap as the fun thrower: procedural die
                // shaders are expensive per pixel, 1.25 dpr is invisible on
                // dice in motion.
                dpr={[1, 1.25]}
                frameloop={hasDice ? 'always' : 'demand'}
                style={{ pointerEvents: 'none' }}
            >
                {/* Flat, even lighting: mostly ambient with faint key lights, so
                    no single facet ever catches a face-wide blown highlight. */}
                <ambientLight intensity={1.05} />
                <spotLight
                    position={[15, 40, 15]}
                    angle={0.6}
                    penumbra={1}
                    intensity={0.45}
                />
                <spotLight
                    position={[-10, 30, -10]}
                    angle={0.5}
                    penumbra={1}
                    intensity={0.25}
                    color="#ffeedd"
                />
                <pointLight position={[0, 20, 0]} intensity={0.25} color="#fff8e7" />

                {/* Environment kept for metallic reflections, but dimmed so it
                    can't wash faces out. */}
                <Environment preset="city" environmentIntensity={0.55} />

                <Physics gravity={[0, -60, 0]} defaultContactMaterial={{ friction: 0.1, restitution: 0.5 }} allowSleep={true} iterations={7}>
                    <Table />
                    {dice.map((d, i) => (
                        <Die
                            key={d.id}
                            ref={(el) => { if (el) diceRefs.current[i] = { id: d.id, ref: { current: el } } }}
                            type={d.type}
                            position={d.pos}
                            impulse={d.imp}
                            skin={getSkinById(d.skinId)}
                            onResult={(val) => handleResult(d.rollId, d.type, val, d.tag)}
                            targetValue={d.targetValue}
                        />
                    ))}
                </Physics>
            </Canvas>
        </div>
    );
};
