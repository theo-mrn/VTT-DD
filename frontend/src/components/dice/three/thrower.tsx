'use client';

/**
 * Lanceur 3D des jets, copié de l'ancienne app
 * (`legacy/src/components/(dices)/throw.tsx`, puis `(dices)/throw.tsx` du
 * front de sauvegarde) : l'animation fait foi. Un écran demande un lancer
 * (`roll3D` de `lib/dice-throw.ts`), les dés roulent, la face du dessus de
 * chaque dé est lue quand il s'arrête, puis ces faces sont rendues à
 * l'appelant, qui les envoie au service dice. Jamais de valeur imposée à
 * l'atterrissage.
 *
 * Différences avec l'ancienne app :
 * - chargé à la demande (`DiceThrowerHost`) plutôt que monté avec la carte ;
 * - demandes et résultats par l'API typée de `lib/dice-throw.ts` (store
 *   zustand) au lieu des événements `window` (`vtt-trigger-3d-roll`,
 *   `vtt-prepare-3d-roll`, `vtt-3d-roll-started`, `vtt-3d-roll-complete`) ;
 * - shaders des skins d'un jet préchauffés par lots avant le premier lancer
 *   (`ShaderWarmer`, sans `compileAsync`), protection des GPU Windows (TDR) ;
 * - une requête peut porter les symboles de ses faces (`faces`, dés à
 *   symboles) : ils remplacent les numéros sur le dé, et la face lue reste le
 *   numéro de la face déclarée ;
 * - canevas au-dessus des fenêtres de l'app (dés visibles depuis la boutique
 *   ou le lanceur rapide), sans jamais capter la souris ;
 * - pas de confettis sur un 20 naturel (bibliothèque absente du front) :
 *   l'effet critique du dé et la carte de résultat le signalent.
 */
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, useConvexPolyhedron } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import { DiceSkin, getSkinById, CriticalType } from './dice-definitions';
import * as THREE from 'three';
import { getCachedGeometry, getDieValue } from './geometry';
import { playRoll, startAmbience, ambienceForSkin, playOneShotForSkin, Ambience } from './audio';
import { Table, visibleHalfExtents, DICE_CAM_HEIGHT, DICE_CAM_FOV } from './scene';
import { VisualDie } from './visual-die';
import { ShaderWarmer } from './shader-warmer';
import {
  diceThrowerChannel,
  useDiceThrowStore,
  type Die3DSymbol,
  type QueuedThrow,
  type ThrowRequest,
  type ThrowResult,
} from '@/lib/dice-throw';

/**
 * Délai maximal du préchauffage, compté quand il démarre vraiment (la scène
 * attend la carte d'environnement) : au-delà, les jets partent quand même, le
 * préchauffage n'est qu'une optimisation.
 */
const WARM_DEADLINE_MS = 4000;

/**
 * Délai après lequel un dé sans aucune donnée du moteur physique fait relancer
 * ce moteur (voir `physicsEpoch`).
 */
const STALL_TIMEOUT_MS = 1500;

/** Safety net: NEVER hold rolls hostage to a warm-up that hangs or is slow. */
const WarmDeadline = ({ onExpire }: { onExpire: () => void }) => {
  useEffect(() => {
    const t = window.setTimeout(onExpire, WARM_DEADLINE_MS);
    return () => window.clearTimeout(t);
  }, [onExpire]);
  return null;
};

// Physics-driven die: handles the cannon body, impact audio, settle detection
// and criticals. Rendering is delegated to <VisualDie>.
const Die = React.forwardRef(
  (
    {
      type,
      position,
      impulse,
      skin,
      onResult,
      onStall,
      faces,
    }: {
      type: string;
      position: [number, number, number];
      impulse: [number, number, number];
      skin: DiceSkin;
      onResult: (val: string) => void;
      /** Le moteur physique n'a rien envoyé à ce dé : il faut le relancer. */
      onStall?: () => void;
      faces?: Die3DSymbol[][];
    },
    fRef: any,
  ) => {
    const { vertices, faces: hull, trueFaces } = getCachedGeometry(type);
    const [stopped, setStopped] = useState(false);
    const [canCheck, setCanCheck] = useState(false);
    const [critType, setCritType] = useState<CriticalType>(null);
    const [isShattered, setIsShattered] = useState(false);
    const lastImpactTime = useRef(0);
    const _q = useRef(new THREE.Quaternion());
    const _up = useRef(new THREE.Vector3(0, 1, 0));
    const _worldNormal = useRef(new THREE.Vector3());

    // Symbol die: each physical face shows the symbols of the declared face
    // whose number it carries, so the face read on top IS the face drawn.
    const faceSymbols = useMemo(
      () =>
        faces?.length
          ? trueFaces.map((_, i) => faces[Number(getDieValue(type, i)) - 1] ?? [])
          : undefined,
      [faces, trueFaces, type],
    );

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
      args: [vertices as any, hull],
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
        if (impactVelocity > 0.1 && !stopped && now - lastImpactTime.current > 40) {
          lastImpactTime.current = now;
          playRoll(impactVelocity);
        }
      },
    }));

    React.useImperativeHandle(fRef, () => ({
      getPosition: () => position,
    }));

    // Themed continuous ambience (e.g. soul: cold wind + murmur) for the whole
    // life of the die, regardless of how it rolls. Started on mount, faded out
    // on unmount (when the die disappears).
    useEffect(() => {
      const id = ambienceForSkin(skin);
      if (!id) return;
      const amb: Ambience | null = startAmbience(id);
      return () => {
        amb?.stop();
      };
    }, [skin]);

    // One-shot themed sound (e.g. butterfly wings) — plays once when this die
    // is thrown, no loop.
    useEffect(() => {
      playOneShotForSkin(skin);
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
        const travelDir =
          horizontal.lengthSq() > 1e-6 ? horizontal.normalize() : new THREE.Vector3(1, 0, 0);
        // Perpendicular to both travel direction and world-up: the "end
        // over end" tumble axis.
        const tumbleAxis = new THREE.Vector3()
          .crossVectors(travelDir, new THREE.Vector3(0, 1, 0))
          .normalize();

        const tumbleSpeed = 14 + Math.random() * 10; // main tumble, rad/s
        const twistSpeed = (Math.random() - 0.5) * 6; // slight spin around travel axis
        const wobble = new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 6,
        ); // small per-axis jitter so throws don't feel identical

        const angular = tumbleAxis
          .clone()
          .multiplyScalar(tumbleSpeed)
          .addScaledVector(travelDir, twistSpeed)
          .add(wobble);

        api.angularVelocity.set(angular.x, angular.y, angular.z);
        api.velocity.set(...impulse);
      }
    }, [api, impulse]);

    const velocity = useRef([0, 0, 0]);
    // Vrai dès que le moteur physique (worker cannon) a envoyé une donnée pour
    // ce dé. Sans elle, vitesse et orientation sont celles du départ : lire une
    // face donnerait toujours la même (le « 20 » en boucle quand le worker est
    // mort, par exemple après un rechargement à chaud).
    const physicsAlive = useRef(false);
    useEffect(
      () =>
        api.velocity.subscribe((v) => {
          velocity.current = v;
          physicsAlive.current = true;
        }),
      [api],
    );
    useEffect(() => {
      if (!onStall) return;
      const t = setTimeout(() => {
        if (!physicsAlive.current) onStall();
      }, STALL_TIMEOUT_MS);
      return () => clearTimeout(t);
    }, [api, onStall]);

    const angularVelocity = useRef([0, 0, 0]);
    useEffect(() => api.angularVelocity.subscribe((v) => (angularVelocity.current = v)), [api]);

    const quaternion = useRef([0, 0, 0, 1]);
    useEffect(() => api.quaternion.subscribe((q) => (quaternion.current = q)), [api]);

    // Track physics position for particles (world space)
    const physicsPosition = useRef<[number, number, number]>(position);
    useEffect(
      () =>
        api.position.subscribe((p) => (physicsPosition.current = p as [number, number, number])),
      [api],
    );

    useEffect(() => {
      if (!canCheck || stopped) return;

      const interval = setInterval(() => {
        // Aucune donnée physique : le dé n'a pas roulé, rien à lire
        if (!physicsAlive.current) return;
        const v = velocity.current;
        const av = angularVelocity.current;

        const speed = Math.abs(v[0]!) + Math.abs(v[1]!) + Math.abs(v[2]!);
        const spin = Math.abs(av[0]!) + Math.abs(av[1]!) + Math.abs(av[2]!);

        if (speed < 0.5 && spin < 1.0) {
          // The die lies still: the face whose normal points most upward is
          // the result. No target, no snapping — the animation is the roll.
          const q = _q.current.set(
            quaternion.current[0]!,
            quaternion.current[1]!,
            quaternion.current[2]!,
            quaternion.current[3]!,
          );
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
    }, [stopped, canCheck, trueFaces, onResult, type]);

    return (
      <group ref={ref as any}>
        <VisualDie
          type={type}
          skin={skin}
          isShattered={isShattered}
          critType={critType}
          stopped={stopped}
          onCritComplete={() => setCritType(null)}
          faceSymbols={faceSymbols}
          ref={null}
        />
      </group>
    );
  },
);
Die.displayName = 'Die';

type ThrownDie = {
  id: string;
  rollId: string;
  type: string;
  pos: [number, number, number];
  imp: [number, number, number];
  skinId: string;
  tag?: string;
  faces?: Die3DSymbol[][];
};

/** Skin de chaque dé d'une requête : le sien, sinon celui du jet, sinon or. */
const requestSkin = (req: ThrowRequest, skinId?: string) => req.skinId || skinId || 'gold';

export const DiceThrower = () => {
  const [dice, setDice] = useState<ThrownDie[]>([]);
  const activeRollsRef = useRef<
    Map<string, { expected: number; results: { type: string; value: number; tag?: string }[] }>
  >(new Map());
  const diceRefs = useRef<any[]>([]);

  // Shader warm-up (per canvas: compiled programs belong to ONE WebGL
  // context). A roll whose skins are not warmed yet waits in `queuedRef`
  // while they compile a batch at a time.
  const warmedRef = useRef(new Set<string>());
  const [warming, setWarming] = useState<{ skins: string[]; type: string } | null>(null);
  const warmingRef = useRef<string[] | null>(null);
  const queuedRef = useRef<QueuedThrow[]>([]);
  const pendingSkinsRef = useRef(new Set<string>());

  // Le worker de @react-three/cannon ne survit pas à un remontage de <Physics>
  // pendant un pas de calcul (rechargement à chaud, remontage React) : ses
  // tampons partent avec l'ancien worker et le nouveau ne calcule plus rien.
  // Un dé qui ne reçoit aucune donnée relance le moteur (nouvelle clé) ; les
  // dés en cours sont alors remontés et relancés depuis leur position de départ.
  const [physicsEpoch, setPhysicsEpoch] = useState(0);
  const stalledEpochRef = useRef(-1);
  const handleStall = useCallback(() => {
    setPhysicsEpoch((epoch) => {
      if (stalledEpochRef.current === epoch) return epoch;
      stalledEpochRef.current = epoch;
      console.warn('Moteur physique des dés sans réponse : relance');
      return epoch + 1;
    });
  }, []);

  const handleResult = (rollId: string, type: string, val: string, tag?: string) => {
    const rollData = activeRollsRef.current.get(rollId);
    if (rollData) {
      // tag : identifiant optionnel echoé tel quel (ex clé d'un dé à symboles) — permet à
      // l'appelant de réassocier chaque résultat à SON type de dé quand deux types partagent la
      // même forme physique (ex Aptitude et Difficulté, tous deux d8).
      rollData.results.push({ type, value: parseInt(val), ...(tag ? { tag } : {}) });
      if (rollData.results.length === rollData.expected) {
        activeRollsRef.current.delete(rollId);
        diceThrowerChannel.completed(rollId, rollData.results);
      }
    }
  };

  const throwDice = (rollId: string, requests: ThrowRequest[], skinId?: string) => {
    const newDice: ThrownDie[] = [];
    let totalDiceCount = 0;

    diceRefs.current = [];

    // Playable area derived from the ACTUAL viewport (same math as the
    // walls in scene.tsx): on narrow/portrait windows the visible width
    // shrinks a lot, so hardcoded spawn coords would land off-screen.
    const aspect =
      typeof window !== 'undefined' ? window.innerWidth / Math.max(window.innerHeight, 1) : 16 / 9;
    const { halfX, halfZ } = visibleHalfExtents(aspect);
    const dieMargin = 2.6; // wall inset + die radius, keeps results fully visible
    const maxX = Math.max(halfX - dieMargin, 2);
    const maxZ = Math.max(halfZ - dieMargin, 2);
    // Aim right-of-center, but always inside the visible area.
    const targetX = Math.min(maxX * 0.55, maxX);
    // Reference arena (the size the base throw force below was tuned for).
    // On shorter/narrower viewports maxZ shrinks a lot — throwing with the
    // full fixed force then slams the die into the far wall almost
    // immediately, killing its speed+spin together right where it lands
    // and making it settle-detect as "stuck" near the spawn wall instead
    // of tumbling. Scale the force down with how cramped the arena
    // actually is so small arenas get a proportionally gentler throw.
    const REFERENCE_MAX_Z = 12;
    const forceScale = Math.min(maxZ / REFERENCE_MAX_Z, 1);

    requests.forEach((req) => {
      totalDiceCount += req.count;
      for (let i = 0; i < req.count; i++) {
        const startX = Math.min(targetX + (Math.random() - 0.5) * Math.min(6, maxX * 0.4), maxX);
        const startZ = Math.min(12 + Math.random() * 2, maxZ);
        // Lower spawn height + smaller vertical force: a real dice
        // throw is a low, fast skim across the table, not a lob that
        // arcs up and drops back down.
        const startY = 2.5 + Math.random() * 1.5 + i * 1;

        // Real throwing energy: a leftward drive + a strong Z crossing so
        // the die travels and TUMBLES across the table. Force is a
        // fixed generous magnitude rather than scaled off startZ
        // (which is capped by the visible play area and could end up
        // tiny) — otherwise the die barely crosses the table and
        // reads as "dropped" instead of "thrown". More horizontal
        // punch, less vertical loft, for a flatter/faster throw.
        const forceX =
          (-(startX - targetX) * (2.2 + Math.random() * 1.0) - (5 + Math.random() * 5)) *
          forceScale;
        const forceY = 2.5 + Math.random() * 3;
        const forceZ = -(30 + Math.random() * 12) * forceScale;

        const id = crypto.randomUUID();
        newDice.push({
          id: id,
          rollId: rollId,
          type: req.type,
          pos: [startX, startY, startZ],
          imp: [forceX, forceY, forceZ],
          // Skin par requête (ex couleur d'un dé à symboles : Aptitude vert, Défi rouge...),
          // sinon skin global de l'utilisateur, sinon or.
          skinId: requestSkin(req, skinId),
          tag: req.tag,
          faces: req.faces,
        });
      }
    });

    if (totalDiceCount > 0) {
      activeRollsRef.current.set(rollId, { expected: totalDiceCount, results: [] });
      setDice((prev) => [...prev, ...newDice]);
      // Les dés partent vraiment maintenant (après chargement et préchauffage) :
      // l'appelant ne fait courir son délai de repli qu'à partir d'ici.
      diceThrowerChannel.started(rollId);
      setTimeout(() => {
        setDice((prev) => prev.filter((d) => !newDice.find((nd) => nd.id === d.id)));
      }, 8000);
    }
  };
  const throwDiceRef = useRef(throwDice);
  throwDiceRef.current = throwDice;

  /** Lance les jets en attente dont les skins sont prêts ; préchauffe ceux qui manquent. */
  const flush = useCallback(() => {
    const warmed = warmedRef.current;
    const waiting: QueuedThrow[] = [];
    for (const q of queuedRef.current.splice(0)) {
      const ready = q.requests.every((r) => warmed.has(requestSkin(r, q.skinId)));
      if (ready) throwDiceRef.current(q.rollId, q.requests, q.skinId);
      else waiting.push(q);
    }
    queuedRef.current = waiting;
    const missing = [...pendingSkinsRef.current].filter((s) => !warmed.has(s));
    pendingSkinsRef.current.clear();
    if (!missing.length || warmingRef.current) {
      missing.forEach((s) => pendingSkinsRef.current.add(s));
      return;
    }
    warmingRef.current = missing;
    const type = waiting[0]?.requests[0]?.type ?? 'd20';
    setWarming({ skins: missing, type });
  }, []);

  // Warm-up finished (or given up on, see WarmDeadline): its skins count as
  // warmed and the waiting rolls are thrown.
  const handleWarmed = useCallback(() => {
    const skins = warmingRef.current;
    if (!skins) return; // idempotent (real onDone + safety net)
    skins.forEach((s) => warmedRef.current.add(s));
    warmingRef.current = null;
    setWarming(null);
    flush();
  }, [flush]);

  // Demandes de lancer et de préchauffage : prises dans le store à chaque ajout
  // (et au montage : celles arrivées pendant le chargement du module).
  const revision = useDiceThrowStore((st) => st.revision);
  useEffect(() => {
    const { throws, warmup } = diceThrowerChannel.take();
    if (!throws.length && !warmup.length) return;
    for (const q of throws) {
      queuedRef.current.push(q);
      q.requests.forEach((r) => pendingSkinsRef.current.add(requestSkin(r, q.skinId)));
    }
    warmup.forEach((skin) => pendingSkinsRef.current.add(skin));
    flush();
  }, [revision, flush]);

  const hasDice = dice.length > 0;

  // The canvas stays mounted even with no dice so the WebGL context, the
  // (heavy) "city" environment map and the compiled skin shaders persist
  // between rolls instead of being recreated/recompiled on every throw.
  // When idle it's hidden and switched to on-demand rendering (no render
  // loop, ~0 cost). While warming it keeps rendering: drivers only progress
  // async shader compiles (KHR_parallel_shader_compile) while the context
  // does work.
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{ visibility: hasDice ? 'visible' : 'hidden' }}
    >
      <Canvas
        camera={{ position: [0, DICE_CAM_HEIGHT, 0], fov: DICE_CAM_FOV }}
        gl={{ alpha: true, powerPreference: 'high-performance' }}
        // Same fill-cost cap as the fun thrower: procedural die
        // shaders are expensive per pixel, 1.25 dpr is invisible on
        // dice in motion.
        dpr={[1, 1.25]}
        frameloop={hasDice || warming ? 'always' : 'demand'}
        style={{ pointerEvents: 'none' }}
      >
        {/* Flat, even lighting: mostly ambient with faint key lights, so
                    no single facet ever catches a face-wide blown highlight. */}
        <ambientLight intensity={1.05} />
        <spotLight position={[15, 40, 15]} angle={0.6} penumbra={1} intensity={0.45} />
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

        {warming && (
          <React.Fragment key={warming.skins.join(',')}>
            <ShaderWarmer diceType={warming.type} skins={warming.skins} onDone={handleWarmed} />
            <WarmDeadline onExpire={handleWarmed} />
          </React.Fragment>
        )}

        <Physics
          key={physicsEpoch}
          gravity={[0, -60, 0]}
          defaultContactMaterial={{ friction: 0.1, restitution: 0.5 }}
          allowSleep={true}
          iterations={7}
        >
          <Table />
          {dice.map((d, i) => (
            <Die
              key={d.id}
              ref={(el: any) => {
                if (el) diceRefs.current[i] = { id: d.id, ref: { current: el } };
              }}
              type={d.type}
              position={d.pos}
              impulse={d.imp}
              skin={getSkinById(d.skinId)}
              onResult={(val) => handleResult(d.rollId, d.type, val, d.tag)}
              onStall={handleStall}
              faces={d.faces}
            />
          ))}
        </Physics>
      </Canvas>
    </div>
  );
};

export default DiceThrower;
