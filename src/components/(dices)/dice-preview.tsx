"use client";

import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { VisualDie } from './visual-die';
import { getSkinById, DICE_SKINS } from './dice-definitions';
import * as THREE from 'three';

// ============================================================================
// SHOP DICE PREVIEWS — GPU-friendly.
// ============================================================================
// Rendering a live WebGL canvas per card melts the machine (12+ animated
// contexts). Strategy:
//   1. Each die is rendered in 3D ONCE, then captured to a still image
//      (snapshot) cached in-memory & in localStorage. The grid shows that
//      image — zero WebGL at rest.
//   2. A single animated 3D canvas mounts only for the ONE hovered card
//      (global lock), giving the live 3D feel without the cost.
// A pre-generated PNG per skin can later replace the runtime snapshot with no
// call-site change (see getPrebakedUrl).
// ============================================================================

// ── Optional pre-baked images (drop PNGs in public/dice/<skinId>.png) ───────
const PREBAKED_BASE = '/dice';
const prebakedMissing = new Set<string>();
const getPrebakedUrl = (skinId: string) =>
    prebakedMissing.has(skinId) ? null : `${PREBAKED_BASE}/${skinId}.png`;

// In-memory snapshot cache for skins that lack a pre-baked PNG (lazy, on hover).
const snapshotCache = new Map<string, string>();

// ── Global single-canvas lock (only one live canvas at a time) ──────────────
// Used both for the hover 3D and for serialising snapshot captures.
let activeCanvasId: symbol | null = null;
const canvasListeners = new Set<() => void>();
const notifyCanvas = () => canvasListeners.forEach(fn => fn());

function useCanvasLock(wants: boolean) {
    const idRef = useRef<symbol>(Symbol('canvas'));
    const [, force] = useState(0);
    useEffect(() => {
        const rerender = () => force(n => n + 1);
        canvasListeners.add(rerender);
        return () => { canvasListeners.delete(rerender); };
    }, []);
    useEffect(() => {
        const id = idRef.current;
        if (wants) {
            if (activeCanvasId == null) { activeCanvasId = id; notifyCanvas(); }
        } else if (activeCanvasId === id) {
            activeCanvasId = null; notifyCanvas();
        }
        return () => { if (activeCanvasId === idRef.current) { activeCanvasId = null; notifyCanvas(); } };
    }, [wants]);
    return activeCanvasId === idRef.current;
}

// Priority lock for hover: steals the lock immediately (snapshots yield to it).
function useHoverLock(wants: boolean) {
    const idRef = useRef<symbol>(Symbol('hover'));
    const [, force] = useState(0);
    useEffect(() => {
        const rerender = () => force(n => n + 1);
        canvasListeners.add(rerender);
        return () => { canvasListeners.delete(rerender); };
    }, []);
    useEffect(() => {
        const id = idRef.current;
        if (wants) {
            if (activeCanvasId !== id) { activeCanvasId = id; notifyCanvas(); }
        } else if (activeCanvasId === id) {
            activeCanvasId = null; notifyCanvas();
        }
        return () => { if (activeCanvasId === idRef.current) { activeCanvasId = null; notifyCanvas(); } };
    }, [wants]);
    return activeCanvasId === idRef.current;
}

function useInView<T extends HTMLElement>(rootMargin = '150px') {
    const ref = useRef<T>(null);
    const [inView, setInView] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
        observer.observe(el);
        return () => observer.disconnect();
    }, [rootMargin]);
    return [ref, inView] as const;
}

// Slowly rotating die (used by the live hover canvas + preview page).
export const AutoRotatingDie = ({ type, skinId }: { type: string, skinId: string }) => {
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
            <VisualDie type={type} skin={skin} isShattered={false} critType={null} />
        </group>
    );
};

// Renders a few frames at a fixed nice angle, captures the canvas to a PNG,
// caches it, and reports done (so the parent can unmount this canvas).
function SnapshotScene({ type, skinId, onCapture }: { type: string; skinId: string; onCapture: (dataUrl: string) => void }) {
    const { gl, scene, camera } = useThree();
    const frame = useRef(0);
    const groupRef = useRef<THREE.Group>(null);
    const skin = getSkinById(skinId);

    useFrame(() => {
        // A pleasant static 3/4 angle.
        if (groupRef.current) groupRef.current.rotation.set(0.35, -0.5, 0);
        frame.current++;
        // Let materials/shaders settle a couple of frames, then capture.
        if (frame.current === 4) {
            gl.render(scene, camera);
            try {
                const url = (gl.domElement as HTMLCanvasElement).toDataURL('image/png');
                onCapture(url);
            } catch { onCapture(''); }
        }
    });

    return (
        <group ref={groupRef} scale={1.5}>
            <VisualDie type={type} skin={skin} isShattered={false} critType={null} />
        </group>
    );
}

function SnapshotCanvas({ type, skinId, onCapture }: { type: string; skinId: string; onCapture: (dataUrl: string) => void }) {
    return (
        <Canvas
            camera={{ position: [0, 0, 8], fov: 45 }}
            gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' }}
            dpr={1.5}
            frameloop="always"
            style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
        >
            <ambientLight intensity={0.9} />
            <spotLight position={[10, 10, 10]} angle={0.5} penumbra={1} intensity={1.4} />
            <pointLight position={[-10, -10, -10]} intensity={0.4} />
            <Environment preset="city" environmentIntensity={0.55} />
            <SnapshotScene type={type} skinId={skinId} onCapture={onCapture} />
        </Canvas>
    );
}

// Standalone spinning preview (used by the shop "try" / preview page). Single
// canvas, fine on its own.
export function DicePreview({ skinId, type = "d20", className = "" }: { skinId: string, type?: string, className?: string }) {
    return (
        <div className={`relative ${className}`}>
            <Canvas
                shadows
                camera={{ position: [0, 0, 8], fov: 45 }}
                gl={{ alpha: true, antialias: true }}
                dpr={[1, 1.5]}
            >
                <ambientLight intensity={0.9} />
                <spotLight position={[10, 10, 10]} angle={0.6} penumbra={1} intensity={1.1} castShadow />
                <pointLight position={[-10, -10, -10]} intensity={0.4} />
                <Environment preset="city" environmentIntensity={0.6} />
                <AutoRotatingDie type={type} skinId={skinId} />
                <OrbitControls enableZoom={false} enablePan={false} />
            </Canvas>
        </div>
    );
}

/**
 * DicePreviewCard — grid/card preview built for the shop.
 *
 * - Shows the pre-baked PNG (public/dice/<skinId>.png) — a plain <img>, so the
 *   whole grid loads instantly and in parallel with ZERO WebGL.
 * - Live animated 3D only for the ONE hovered card (global lock) — the feel of
 *   3D without the cost.
 * - If a PNG is missing, a lazy one-shot 3D snapshot fills the gap on hover
 *   only (never a mass capture at load — that was what made loading slow).
 */
export function DicePreviewCard({ skinId, type = "d20", active }: { skinId: string; type?: string; active?: boolean }) {
    const [ref, inView] = useInView<HTMLDivElement>('150px');
    const [selfHover, setSelfHover] = useState(false);
    const wantHover = (active ?? selfHover) && inView;

    const prebaked = getPrebakedUrl(skinId);
    const [snapshot, setSnapshot] = useState<string | null>(() => snapshotCache.get(skinId) ?? null);
    const [prebakedFailed, setPrebakedFailed] = useState(false);
    const stillUrl = (!prebakedFailed && prebaked) || snapshot;

    const hoverLive = useHoverLock(wantHover);
    // Only capture a snapshot lazily, on hover, when there's no image at all —
    // never for the whole grid at once.
    const needsSnapshot = !stillUrl && wantHover && !hoverLive;
    const captureLive = useCanvasLock(needsSnapshot);

    const handleCapture = (dataUrl: string) => {
        if (dataUrl) { snapshotCache.set(skinId, dataUrl); setSnapshot(dataUrl); }
    };

    const onImgError = () => { prebakedMissing.add(skinId); setPrebakedFailed(true); };

    return (
        <div
            ref={ref}
            className="absolute inset-0 w-full h-full"
            onPointerEnter={() => setSelfHover(true)}
            onPointerLeave={() => setSelfHover(false)}
        >
            {/* Pre-baked still image — always shown unless the hover 3D is up */}
            {stillUrl && (
                <img
                    src={stillUrl}
                    alt=""
                    onError={onImgError}
                    loading="lazy"
                    className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${hoverLive ? 'opacity-0' : 'opacity-100'}`}
                    draggable={false}
                    style={{ pointerEvents: 'none' }}
                />
            )}

            {/* Lazy one-shot snapshot (only if no image AND hovered) */}
            {captureLive && (
                <div className="absolute inset-0 opacity-0" style={{ pointerEvents: 'none' }}>
                    <SnapshotCanvas type={type} skinId={skinId} onCapture={handleCapture} />
                </div>
            )}

            {/* Live animated 3D — only the single hovered, lock-holding card */}
            {hoverLive && (
                <div className="absolute inset-0 animate-in fade-in duration-300" style={{ pointerEvents: 'none' }}>
                    <Canvas
                        camera={{ position: [0, 0, 8], fov: 45 }}
                        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
                        dpr={[1, 1.25]}
                        style={{ pointerEvents: 'none' }}
                    >
                        <ambientLight intensity={0.85} />
                        <spotLight position={[10, 10, 10]} angle={0.5} penumbra={1} intensity={1.4} />
                        <pointLight position={[-10, -10, -10]} intensity={0.4} />
                        <Environment preset="city" environmentIntensity={0.55} />
                        <AutoRotatingDie type={type} skinId={skinId} />
                    </Canvas>
                </div>
            )}

            {/* Neutral placeholder while an image isn't available yet */}
            {!stillUrl && !hoverLive && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-darker)]">
                    <Dice5Silhouette />
                </div>
            )}
        </div>
    );
}

// Sober neutral placeholder icon (no fake coloured die).
function Dice5Silhouette() {
    return (
        <svg viewBox="0 0 100 100" className="w-1/3 h-1/3 opacity-20">
            <polygon points="50,8 88,29 88,71 50,92 12,71 12,29" fill="none" stroke="currentColor" strokeWidth="4" className="text-[var(--text-secondary)]" />
        </svg>
    );
}

// Main grid modal (kept for compatibility with existing callers).
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-gray-900 rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-gray-700">
                    <h2 className="text-2xl font-bold text-white">Choisir un skin de dé - {type.toUpperCase()}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {skinEntries.map(([skinId]) => (
                            <div key={skinId} onClick={() => onSelectSkin?.(skinId)} className="relative aspect-square cursor-pointer hover:scale-105 transition-transform duration-200">
                                <DicePreviewCard skinId={skinId} type={type} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
