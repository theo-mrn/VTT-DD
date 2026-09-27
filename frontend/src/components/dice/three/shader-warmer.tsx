'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DiceSkin, getSkinById } from './dice-definitions';
import { VisualDie } from './visual-die';

// ============================================================================
// SHADER WARMER
// ----------------------------------------------------------------------------
// Renders the given skins once, far off-screen, and compiles their shader
// programs before any die is thrown. This moves the (synchronous,
// frame-blocking) shader compilation off the click path, so throwing dice no
// longer freezes the page the first time a given skin appears. Shared by the
// fun thrower (`throw-fun`, whole pool) and the roll thrower (`throw`, the
// skins a roll needs).
// ============================================================================

// Each skin's onBeforeCompile injects distinct GLSL, so ~50 pooled skins mean
// ~50 separate shader programs. `gl.compile()` (even via `compileAsync`,
// which runs it synchronously under the hood) issues every compile/link call
// for the whole scene in a single JS tick — a one-shot GPU burst big enough
// to trip Windows' driver-timeout watchdog (TDR) on some machines: Chrome's
// GPU process dies instantly with no JS error. So the pool is warmed a few
// skins at a time, yielding a frame between batches.
export const WARM_BATCH_SIZE = 4;

/**
 * Attend que les programmes des matériaux soient liés (extension
 * KHR_parallel_shader_compile), sans jamais lever d'erreur : un matériau
 * libéré ou sans programme compte comme prêt, et l'attente s'arrête sur
 * annulation ou au bout de `timeoutMs` (certains pilotes ne progressent pas).
 */
export async function waitProgramsReady(
  gl: THREE.WebGLRenderer,
  materials: Set<THREE.Material>,
  isCancelled: () => boolean,
  timeoutMs: number,
): Promise<void> {
  if (!gl.extensions.get('KHR_parallel_shader_compile')) return;
  const deadline = performance.now() + timeoutMs;
  const pending = new Set(materials);
  while (pending.size && !isCancelled() && performance.now() < deadline) {
    for (const material of pending) {
      const program = (gl.properties.get(material) as { currentProgram?: { isReady?(): boolean } })
        .currentProgram;
      if (!program?.isReady || program.isReady()) pending.delete(material);
    }
    if (pending.size) await new Promise((r) => setTimeout(r, 10));
  }
}

export const ShaderWarmer = ({
  diceType,
  skins,
  fullSkin,
  simple = false,
  onDone,
}: {
  diceType: string;
  /** Skins to warm, a batch at a time. Must be stable (memoised). */
  skins: readonly string[];
  /**
   * Full-fidelity die mounted for the whole warm-up (face numbers, rim,
   * inner glow), when the batched dice are `simple`.
   */
  fullSkin?: DiceSkin;
  /** Warm the batched skins without face numbers (body programs only). */
  simple?: boolean;
  onDone: () => void;
}) => {
  const { gl, scene, camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const [batchEnd, setBatchEnd] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (
        let end = WARM_BATCH_SIZE;
        end < skins.length + WARM_BATCH_SIZE;
        end += WARM_BATCH_SIZE
      ) {
        if (cancelled) return;
        // Let the new batch's meshes mount before compiling them.
        await new Promise((r) => requestAnimationFrame(r));
        if (cancelled) return;
        setBatchEnd(Math.min(end, skins.length));
        await new Promise((r) => requestAnimationFrame(r));
        if (cancelled) return;
        try {
          // Pas de `gl.compileAsync()` : sa boucle interne (setTimeout
          // toutes les 10 ms) continue après notre délai et plante hors de
          // ce try (`program.isReady` d'un matériau libéré entre-temps).
          // On compile le lot puis on attend nous-mêmes, arrêt garanti.
          const materials = gl.compile(scene, camera);
          await waitProgramsReady(gl, materials, () => cancelled, 1200);
        } catch {
          // best-effort warmup — ignore failures
        }
      }
      if (!cancelled) onDone();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, skins, onDone]);

  return (
    // Pushed far away + tiny so it never shows; only there to exist in the
    // scene graph long enough for the programs to compile.
    <group ref={groupRef} position={[0, -1000, 0]} scale={0.001}>
      {/* Full-fidelity die mounted for the WHOLE warm-up (not batched):
                compiles the face-number text + rim programs, and keeps the
                scene's light count constant across batches (its innerGlow
                point light would otherwise invalidate previously-warmed
                programs mid-run). */}
      {fullSkin && (
        <VisualDie type={diceType} skin={fullSkin} isShattered={false} critType={null} />
      )}
      {skins.slice(0, batchEnd).map((skinId) => (
        <VisualDie
          key={skinId}
          type={diceType}
          skin={getSkinById(skinId)}
          isShattered={false}
          critType={null}
          simple={simple}
        />
      ))}
    </group>
  );
};
