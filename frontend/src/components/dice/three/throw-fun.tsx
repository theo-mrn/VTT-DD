'use client';

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, usePlane, useConvexPolyhedron, useBox } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import { getSkinById, DiceSkin, DICE_SKINS } from './dice-definitions';
import { VisualDie } from './visual-die';
import { dieShape } from './polyhedra';
import { ContinuousFrames } from './scene';
import { getAudioContext, playOneShotForSkin } from './audio';
import { prefersEconomy } from '@/lib/perf/device';

// Skins eligible for the random "for fun" roll. Orb skins use a heavier
// transmission + GLTF-core path, so we keep the random pool to the procedural
// skins.
const FUN_SKIN_POOL = Object.values(DICE_SKINS)
  .filter((s) => s.effectType !== 'orb')
  .map((s) => s.id);

const randomPoolSkin = () => FUN_SKIN_POOL[Math.floor(Math.random() * FUN_SKIN_POOL.length)];

// NOTE: compiled shader programs belong to ONE WebGL context, so warming is
// tracked per FunDiceThrower instance (= per <Canvas>).
//
// Préchauffage à l'intention uniquement : rien n'est compilé tant que
// l'utilisateur n'a pas survolé, focalisé ou cliqué le bouton du dé. Et on ne
// compile QUE le skin qui sera lancé (tiré au sort d'avance), jamais le pool
// entier : l'ancienne compilation de ~60 skins par lots cumulatifs était une
// rafale GPU qui faisait planter Chrome sous Windows (TDR du pilote). Le
// nombre de lumières de la scène est désormais constant (plus de pointLight
// innerGlow, cf. visual-die.tsx) : un programme compilé reste valide.

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
    material: { friction: 0.4, restitution: 0.4 },
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

// Seuils d'immobilité (somme des composantes) et nombre de relevés consécutifs
// sous ces seuils avant de considérer le dé arrêté.
const REST_SPEED = 0.3;
const REST_SPIN = 0.5;
const REST_CHECKS = 2;
const REST_CHECK_MS = 150;

const FunDie = ({
  type,
  position,
  impulse,
  angularVelocity,
  skin,
  onStopped,
}: {
  type: string;
  position: [number, number, number];
  impulse: [number, number, number];
  angularVelocity: [number, number, number];
  skin: DiceSkin;
  onStopped: () => void;
}) => {
  const { hull } = dieShape(type);
  const lastImpactTime = useRef(0);
  const [stopped, setStopped] = useState(false);

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
    } catch {
      // Audio indisponible (contexte suspendu, navigateur sans Web Audio) : sans son
    }
  }, []);

  const [ref, api] = useConvexPolyhedron(() => ({
    mass: 5,
    position,
    args: [hull.vertices as any, hull.faces],
    material: { friction: 0.15, restitution: 0.5 },
    linearDamping: 0.08,
    angularDamping: 0.08,
    allowSleep: true,
    onCollide: (e) => {
      const impactVelocity = e.contact.impactVelocity;
      const now = performance.now();
      if (impactVelocity > 0.1 && now - lastImpactTime.current > 40) {
        lastImpactTime.current = now;
        playClick(impactVelocity);
      }
    },
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

  // Détection de l'arrêt : une fois le dé immobile, les numéros de faces
  // cessent leurs calculs par image et le lanceur passe la boucle de rendu
  // en mode « à la demande ».
  const velocity = useRef<number[] | null>(null);
  const spin = useRef<number[] | null>(null);
  const onStoppedRef = useRef(onStopped);
  useEffect(() => {
    onStoppedRef.current = onStopped;
  });
  useEffect(() => api.velocity.subscribe((v) => (velocity.current = v)), [api]);
  useEffect(() => api.angularVelocity.subscribe((v) => (spin.current = v)), [api]);
  useEffect(() => {
    if (stopped) return;
    let calm = 0;
    const id = window.setInterval(() => {
      const v = velocity.current;
      const av = spin.current;
      if (!v || !av) return;
      const speed = Math.abs(v[0]!) + Math.abs(v[1]!) + Math.abs(v[2]!);
      const turn = Math.abs(av[0]!) + Math.abs(av[1]!) + Math.abs(av[2]!);
      calm = speed < REST_SPEED && turn < REST_SPIN ? calm + 1 : 0;
      if (calm >= REST_CHECKS) {
        setStopped(true);
        onStoppedRef.current();
      }
    }, REST_CHECK_MS);
    return () => window.clearInterval(id);
  }, [stopped]);

  return (
    <group ref={ref as any}>
      <VisualDie type={type} skin={skin} isShattered={false} critType={null} stopped={stopped} />
    </group>
  );
};

// ============================================================================
// SHADER WARMER
// ----------------------------------------------------------------------------
// Rend UN seul dé (celui qui sera lancé), loin hors champ, et demande au
// renderer de compiler ses programmes de façon asynchrone : le premier lancer
// ne fige plus la page, sans rafale de compilation.
// ============================================================================

const ShaderWarmer = ({
  diceType,
  skinId,
  onDone,
}: {
  diceType: string;
  skinId: string;
  onDone: () => void;
}) => {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Let the die's meshes mount before compiling them.
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;
      try {
        const anyGl = gl as any;
        if (typeof anyGl.compileAsync === 'function') {
          // compileAsync polls KHR_parallel_shader_compile, and some
          // drivers only progress that status while the context is doing
          // work — never let it hang the roll queue.
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
      if (!cancelled) onDone();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, onDone]);

  return (
    // Pushed far away + tiny so it never shows; only there to exist in the
    // scene graph long enough for the programs to compile.
    <group position={[0, -1000, 0]} scale={0.001}>
      <VisualDie
        type={diceType}
        skin={getSkinById(skinId)}
        isShattered={false}
        critType={null}
        stopped
      />
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
  /** Préchauffe le prochain dé (intention : survol, focus du bouton) */
  warm: (diceType?: string) => void;
}

interface FunDieState {
  id: string;
  type: string;
  pos: [number, number, number];
  imp: [number, number, number];
  ang: [number, number, number];
  skinId: string;
}

const warmKey = (type: string, skinId: string) => `${type}:${skinId}`;

export const FunDiceThrower = forwardRef<FunDiceHandle, FunDiceProps>(
  (
    {
      className = '',
      buttonText = 'Lancer pour le fun',
      defaultDiceType = 'd20',
      hideButton = false,
      overlayZIndex = 100,
    },
    ref,
  ) => {
    const [dice, setDice] = useState<FunDieState[]>([]);
    // Dés arrêtés (ids) : quand tous le sont, la boucle de rendu passe en
    // « à la demande ».
    const [stoppedIds, setStoppedIds] = useState<ReadonlySet<string>>(() => new Set());
    // Le canevas n'est monté qu'à la première intention, puis reste en place
    // pour garder les programmes compilés.
    const [canvasOn, setCanvasOn] = useState(false);
    // Skin en cours de préchauffage (un seul à la fois).
    const [warmTarget, setWarmTarget] = useState<{ skinId: string; type: string } | null>(null);
    const warmTargetRef = useRef<{ skinId: string; type: string } | null>(null);
    const warmed = useRef(new Set<string>());
    // Prochain skin aléatoire, tiré d'avance pour être préchauffé avant le lancer.
    const nextSkin = useRef<string | null>(null);
    // Lancers demandés pendant un préchauffage : ils partent dès qu'il finit
    // (un dé qui apparaît en pleine compilation la rallonge d'autant).
    const pendingRolls = useRef<{ skinId: string; diceType: string }[]>([]);
    const [economy] = useState(() => prefersEconomy());

    const startWarm = useCallback((skinId: string, type: string) => {
      setCanvasOn(true);
      if (warmed.current.has(warmKey(type, skinId)) || warmTargetRef.current) return;
      const target = { skinId, type };
      warmTargetRef.current = target;
      setWarmTarget(target);
    }, []);

    const spawnDie = useCallback((skinId: string, diceType: string) => {
      // Random start position
      const startX = (Math.random() - 0.5) * 10;
      const startZ = 10 + Math.random() * 5;
      const startY = 8 + Math.random() * 4;

      // Throw towards center (0,0,0)
      const forceX = -startX * (1.2 + Math.random() * 0.5);
      const forceY = 4 + Math.random() * 4;
      const forceZ = -startZ * (1.2 + Math.random() * 0.5);

      // Random spin
      const angX = (Math.random() - 0.5) * 60;
      const angY = (Math.random() - 0.5) * 60;
      const angZ = (Math.random() - 0.5) * 60;

      const newDie: FunDieState = {
        id: crypto.randomUUID(),
        type: diceType,
        pos: [startX, startY, startZ],
        imp: [forceX, forceY, forceZ],
        ang: [angX, angY, angZ],
        skinId,
      };

      setCanvasOn(true);
      setDice((prev) => [...prev, newDie]);

      // Auto-cleanup so the die doesn't linger forever
      setTimeout(() => {
        setDice((prev) => prev.filter((d) => d.id !== newDie.id));
        setStoppedIds((prev) => {
          if (!prev.has(newDie.id)) return prev;
          const next = new Set(prev);
          next.delete(newDie.id);
          return next;
        });
      }, 7000);
    }, []);

    const handleWarmed = useCallback(() => {
      const target = warmTargetRef.current;
      if (!target) return; // idempotent (real onDone + safety net below)
      warmed.current.add(warmKey(target.type, target.skinId));
      warmTargetRef.current = null;
      setWarmTarget(null);
      // Fire the rolls that were requested during warm-up, slightly
      // staggered so several queued dice don't all mount in one frame.
      const pending = pendingRolls.current.splice(0);
      pending.forEach((p, i) =>
        i === 0
          ? spawnDie(p.skinId, p.diceType)
          : setTimeout(() => spawnDie(p.skinId, p.diceType), i * 150),
      );
    }, [spawnDie]);

    // Safety net: warming is an optimisation, not a gate — after this
    // deadline the queue flushes no matter what.
    useEffect(() => {
      if (!warmTarget) return;
      const t = window.setTimeout(handleWarmed, 4000);
      return () => window.clearTimeout(t);
    }, [warmTarget, handleWarmed]);

    const warm = useCallback(
      (diceType?: string) => {
        if (!nextSkin.current) nextSkin.current = randomPoolSkin();
        startWarm(nextSkin.current, diceType || defaultDiceType);
      },
      [startWarm, defaultDiceType],
    );

    const rollDie = useCallback(
      (skinId?: string, diceType?: string) => {
        const type = diceType || defaultDiceType;
        let resolved = skinId;
        if (!resolved) {
          // Le skin tiré d'avance (préchauffé au survol), sinon un nouveau.
          resolved = nextSkin.current || randomPoolSkin();
          nextSkin.current = null;
        }
        const ready = warmed.current.has(warmKey(type, resolved));
        // Dés déjà à l'écran : un seul programme à compiler, on lance tout de suite.
        if (ready || (dice.length > 0 && !warmTargetRef.current)) {
          spawnDie(resolved, type);
          return;
        }
        pendingRolls.current.push({ skinId: resolved, diceType: type });
        startWarm(resolved, type);
      },
      [defaultDiceType, dice.length, spawnDie, startWarm],
    );

    // Table vide après un lancer : on prépare le dé suivant (un seul skin).
    useEffect(() => {
      if (!canvasOn || dice.length > 0 || warmTarget) return;
      if (warmed.current.size === 0) return; // pas encore d'intention
      if (!nextSkin.current) nextSkin.current = randomPoolSkin();
      startWarm(nextSkin.current, defaultDiceType);
    }, [canvasOn, dice.length, warmTarget, startWarm, defaultDiceType]);

    const markStopped = useCallback((id: string) => {
      setStoppedIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }, []);

    useImperativeHandle(ref, () => ({ roll: rollDie, warm }), [rollDie, warm]);

    const moving = dice.some((d) => !stoppedIds.has(d.id));

    return (
      <div className={`relative ${className}`}>
        {!hideButton && (
          <button
            onClick={() => rollDie()}
            onPointerEnter={() => warm()}
            onFocus={() => warm()}
            className="px-4 py-2 bg-[var(--bg-canvas)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] hover:bg-[var(--bg-panel)] hover:border-[var(--accent-brown)] transition-colors shadow-sm font-medium z-10 relative"
          >
            🎲 {buttonText}
          </button>
        )}

        {/* One persistent canvas. It hosts both the dice and the offscreen
                shader warmer so they share a single WebGL context — programs
                compiled by the warmer are then reused (no compile stall) when
                dice are actually thrown. It only mounts on the first intent,
                and stays mounted afterwards to keep the cache warm. */}
        {canvasOn && (
          <div
            className="fixed inset-0 pointer-events-none"
            style={{ zIndex: overlayZIndex, visibility: dice.length > 0 ? 'visible' : 'hidden' }}
          >
            <Canvas
              camera={{ position: [0, 40, 0], fov: 45 }}
              gl={{ alpha: true, powerPreference: 'default' }}
              // Procedural die shaders are expensive PER PIXEL (many
              // fbm calls) — capping dpr cuts fill cost for an invisible
              // difference on moving dice.
              dpr={economy ? 1 : [1, 1.25]}
              // Rendu continu (`ContinuousFrames`, sans changer de boucle : cela remettrait
              // l'horloge à zéro) seulement pendant un préchauffage (certains pilotes ne font
              // avancer la compilation asynchrone que si le contexte travaille) ou tant qu'un dé
              // roule ; une fois les dés arrêtés, RestTicker entretient les shaders animés à
              // cadence réduite.
              frameloop="demand"
              style={{ pointerEvents: 'none' }}
            >
              {/* Pas de projecteurs : à cette distance, en unités physiques, ils n'éclairaient
                  presque rien (voir `thrower.tsx`) */}
              <ambientLight intensity={0.4} />
              <Environment preset="city" />

              {warmTarget && (
                <ShaderWarmer
                  key={warmKey(warmTarget.type, warmTarget.skinId)}
                  diceType={warmTarget.type}
                  skinId={warmTarget.skinId}
                  onDone={handleWarmed}
                />
              )}

              {(moving || warmTarget) && <ContinuousFrames />}
              {dice.length > 0 && !moving && <RestTicker fps={economy ? 12 : 24} />}

              {dice.length > 0 && (
                <Physics
                  gravity={[0, -60, 0]}
                  defaultContactMaterial={{ friction: 0.1, restitution: 0.5 }}
                  allowSleep={true}
                  iterations={7}
                >
                  <Table />
                  {dice.map((d) => (
                    <FunDie
                      key={d.id}
                      type={d.type}
                      position={d.pos}
                      impulse={d.imp}
                      angularVelocity={d.ang}
                      skin={getSkinById(d.skinId)}
                      onStopped={() => markStopped(d.id)}
                    />
                  ))}
                </Physics>
              )}
            </Canvas>
          </div>
        )}
      </div>
    );
  },
);
FunDiceThrower.displayName = 'FunDiceThrower';

/**
 * Dés arrêtés, boucle « à la demande » : quelques images par seconde suffisent
 * à garder vivantes les lueurs animées des faces (shaders), au lieu de 60.
 */
function RestTicker({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = window.setInterval(() => invalidate(), 1000 / fps);
    return () => window.clearInterval(id);
  }, [invalidate, fps]);
  return null;
}

export default FunDiceThrower;
