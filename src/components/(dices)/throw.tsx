"use client";
import { Confetti, type ConfettiRef } from "@/components/ui/confetti";
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, useConvexPolyhedron } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import { DiceSkin, getSkinById, CriticalType } from './dice-definitions';
import * as THREE from 'three';
import { getCachedGeometry, getDieValue } from './geometry';
import { getAudioContext } from './audio';
import { Table } from './scene';
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

    // Procedural WebAudio heavy dice impact generator
    const playClick = useCallback((velocity: number) => {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;

            // 1. Low frequency "thud" (the weight of the die)
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();
            osc.type = 'sine';

            // Start low, drop lower quickly (percussion envelope)
            const baseFreq = 120 + Math.random() * 40;
            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.08);

            // Lowered overall volume for the thud
            oscGain.gain.setValueAtTime(Math.min(0.4, velocity / 5), ctx.currentTime);
            oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

            osc.connect(oscGain);
            oscGain.connect(ctx.destination);

            // 2. Short noise burst for the "clack/scrape" on the mat
            const bufferSize = ctx.sampleRate * 0.05; // 50ms of noise
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            // Filter noise to make it sound like a soft mat, not harsh glass
            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.value = 800 + velocity * 100; // Opens up slightly on harder hits

            // Lowered overall volume for the scratch/clack
            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(Math.min(0.4, velocity / 10), ctx.currentTime);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03); // Very short snap

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctx.destination);

            osc.start();
            noise.start();
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

            // Only play sound if the impact is strong enough, and not more than
            // once every 40ms per die to avoid buzzing. Low threshold catches
            // even sliding bumps.
            if (impactVelocity > 0.1 && !stopped && (now - lastImpactTime.current > 40)) {
                lastImpactTime.current = now;
                playClick(impactVelocity);
            }
        }
    }));

    React.useImperativeHandle(fRef, () => ({
        getPosition: () => position
    }));

    useEffect(() => {
        const t = setTimeout(() => setCanCheck(true), 400); // 400ms check delay
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (api) {
            const randomSpin = [(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60] as [number, number, number];
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
            <VisualDie type={type} skin={skin} isShattered={isShattered} critType={critType} ref={null} />
        </group>
    );
});
Die.displayName = 'Die';

export const DiceThrower = () => {
    const [dice, setDice] = useState<{ id: string, rollId: string, type: string, pos: [number, number, number], imp: [number, number, number], skinId: string, targetValue?: number }[]>([]);
    const activeRollsRef = useRef<Map<string, { expected: number, results: { type: string, value: number }[] }>>(new Map());
    const diceRefs = useRef<any[]>([]);
    const confettiRef = useRef<ConfettiRef>(null);

    const handleResult = (rollId: string, type: string, val: string) => {
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

        // Initialize available targets
        const availableTargets = (event.detail.targets || []) as { type: string, value: number }[];

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

                // Décalage significatif vers la droite (2/3 de l'écran)
                // Écran visible environ [-25, 25] -> 2/3 Droite correspond à X ~ 15-18
                const startX = 15 + (Math.random() - 0.5) * 6; // Zone de départ entre X=15 et X=21
                const startZ = 12 + (Math.random() * 2);
                const startY = 6 + (Math.random() * 4) + (i * 1.5);

                // Force dirigée pour rester dans le tiers droit (cible X=15)
                const targetX = 15;
                // Forces équilibrées
                const forceX = -(startX - targetX) * (1.2 + Math.random() * 0.6) + (Math.random() - 0.5) * 3;
                const forceY = 4 + Math.random() * 8;
                const forceZ = -startZ * (0.8 + Math.random() * 0.4);

                const id = crypto.randomUUID();
                newDice.push({
                    id: id,
                    rollId: rollId,
                    type: req.type,
                    pos: [startX, startY, startZ],
                    imp: [forceX, forceY, forceZ],
                    // Use skin from event or default to gold
                    skinId: event.detail.skinId || event.detail.skin || 'gold',
                    targetValue: targetValue // Pass the target value
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
            <Confetti
                ref={confettiRef}
                className="absolute left-0 top-0 z-0 size-full"
                manualstart
            />
            <Canvas camera={{ position: [0, 40, 0], fov: 45 }} gl={{ alpha: true }} style={{ pointerEvents: 'none' }}>
                {/* Softer lighting: higher ambient + gentler key lights so solid
                    dice don't get blown-out white highlights. */}
                <ambientLight intensity={0.7} />
                <spotLight
                    position={[15, 40, 15]}
                    angle={0.6}
                    penumbra={1}
                    intensity={1.1}
                />
                <spotLight
                    position={[-10, 30, -10]}
                    angle={0.5}
                    penumbra={1}
                    intensity={0.6}
                    color="#ffeedd"
                />
                <pointLight position={[0, 20, 0]} intensity={0.5} color="#fff8e7" />

                {/* City environment for high-contrast premium reflections */}
                <Environment preset="city" />

                <Physics gravity={[0, -60, 0]} defaultContactMaterial={{ friction: 0.1, restitution: 0.5 }} allowSleep={true} iterations={10}>
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
                            targetValue={d.targetValue}
                        />
                    ))}
                </Physics>
            </Canvas>
        </div>
    );
};
