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
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, useConvexPolyhedron } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import { DiceSkin, getSkinById, CriticalType } from './dice-definitions';
import * as THREE from 'three';
import { DIE_TYPES, dieShape, readTop } from './polyhedra';
import { engravingTexture } from './engraving';
import { playRoll, startAmbience, ambienceForSkin, playOneShotForSkin, Ambience } from './audio';
import { Table, visibleHalfExtents, DICE_CAM_HEIGHT, DICE_CAM_FOV } from './scene';
import { VisualDie } from './visual-die';
import { isAnimatedSkin } from './materials/procedural-material';
import { ShaderWarmer } from './shader-warmer';
import { DICE_ENVIRONMENT } from './environment';
import { prefersEconomy } from '@/lib/perf/device';
import {
  diceThrowerChannel,
  useDiceThrowStore,
  type Die3DSymbol,
  type QueuedThrow,
  type ThrowRequest,
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

/** Les dés d'un lancer restent affichés ce temps après l'arrêt du dernier. */
const SETTLED_DISPLAY_MS = 2000;
/** Délai minimal après la fin d'un effet critique (éclats posés, lueur éteinte). */
const AFTER_EFFECT_MS = 800;
/** Filet de sécurité : un dé qui ne s'arrête jamais disparaît quand même. */
const MAX_DIE_LIFETIME_MS = 12_000;
/**
 * Cadence de rendu quand tous les dés sont arrêtés et qu'aucun effet ne
 * court : les shaders animés des faces continuent, sans 60 images par seconde.
 */
const IDLE_FRAME_MS = 40;
/** Images entretenues après l'arrêt, le temps du fondu du chiffre doré. */
const SETTLE_FRAMES_MS = 600;
/**
 * Cadence pendant le préchauffage : les pilotes ne font avancer les
 * compilations parallèles (KHR_parallel_shader_compile) que si le contexte
 * travaille, inutile pour autant de rendre en continu.
 */
const WARM_FRAME_MS = 50;

/**
 * Rend une image toutes les `intervalMs` en mode `demand` : animations des
 * faces au ralenti, sans boucle de rendu continue.
 */
const FrameTicker = ({ intervalMs }: { intervalMs: number }) => {
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    invalidate();
    const id = window.setInterval(() => invalidate(), intervalMs);
    return () => window.clearInterval(id);
  }, [invalidate, intervalMs]);
  return null;
};

/**
 * Gravures et géométries des six formes, préparées une par une aux moments libres et envoyées
 * au GPU d'avance : le premier jet d'une forme ne calcule plus sa texture au moment du clic.
 */
const ShapeWarmer = () => {
  const gl = useThree((st) => st.gl);
  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const idle = (run: () => void) =>
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(run, { timeout: 2000 })
        : window.setTimeout(run, 200);
    const next = () => {
      if (cancelled || i >= DIE_TYPES.length) return;
      const type = DIE_TYPES[i++]!;
      dieShape(type);
      gl.initTexture(engravingTexture(type));
      idle(next);
    };
    idle(next);
    return () => {
      cancelled = true;
    };
  }, [gl]);
  return null;
};

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
      id,
      type,
      position,
      impulse,
      skin,
      onResult,
      onEffect,
      onStall,
      faces,
      final,
    }: {
      id: string;
      type: string;
      position: [number, number, number];
      impulse: [number, number, number];
      skin: DiceSkin;
      /**
       * Le dé s'est arrêté sur `val` (relu s'il est bousculé avant la fin du lancer) ; vrai si
       * la valeur est retenue, faux si le lancer est déjà fini.
       */
      onResult: (id: string, val: string) => boolean;
      /** Lancer fini : les valeurs sont parties, plus rien ne change. */
      final: boolean;
      /** Un effet critique commence (true) ou est terminé (false). */
      onEffect: (id: string, active: boolean) => void;
      /** Le moteur physique n'a rien envoyé à ce dé : il faut le relancer. */
      onStall?: () => void;
      faces?: Die3DSymbol[][];
    },
    fRef: any,
  ) => {
    const shape = dieShape(type);
    const { hull } = shape;
    const [stopped, setStopped] = useState(false);
    // Valeur retenue (dorée sur le dé) et dernière face lue
    const [shown, setShown] = useState<string | null>(null);
    const lastRead = useRef<string | null>(null);
    const [canCheck, setCanCheck] = useState(false);
    const [critType, setCritType] = useState<CriticalType>(null);
    const [isShattered, setIsShattered] = useState(false);
    const lastImpactTime = useRef(0);
    const _q = useRef(new THREE.Quaternion());

    // Symbol die: each physical face shows the symbols of the declared face
    // whose number it carries, so the face read on top IS the face drawn.
    const faceSymbols = useMemo(
      () => (faces?.length ? shape.faces.map((f) => faces[Number(f.value) - 1] ?? []) : undefined),
      [faces, shape],
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
      args: [hull.vertices as any, hull.faces],
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

    // Rappels lus par référence : l'intervalle de lecture n'est pas recréé
    // quand le lanceur se rend à nouveau.
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;
    const onEffectRef = useRef(onEffect);
    onEffectRef.current = onEffect;

    useEffect(() => {
      if (!canCheck || final) return;

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
          // Face du dessus ; d4 : coin du sommet. Relue tant que le lancer n'est pas fini : un
          // dé bousculé par un autre change de valeur (et de chiffre doré)
          const resultValue = readTop(shape, q);
          if (resultValue && resultValue !== lastRead.current) {
            lastRead.current = resultValue;
            if (onResultRef.current(id, resultValue)) setShown(resultValue);
            setStopped(true);
          }
        }
      }, 80); // Checks every 80ms
      return () => clearInterval(interval);
    }, [final, canCheck, shape, id]);

    // Critique d'un d20, sur la valeur définitive (lancer fini)
    const critDone = useRef(false);
    useEffect(() => {
      if (!final || critDone.current || type !== 'd20') return;
      critDone.current = true;
      if (shown === '20') {
        setCritType('success');
        onEffectRef.current(id, true);
      } else if (shown === '1') {
        setCritType('fail');
        onEffectRef.current(id, true);
        // Shatter the die after a delay so player sees the 1
        setTimeout(() => setIsShattered(true), 2000);
      }
    }, [final, shown, type, id]);

    // Fin de l'effet : lueur éteinte pour un 20, éclats posés pour un 1
    const critTypeRef = useRef(critType);
    critTypeRef.current = critType;
    const handleCritComplete = useCallback(() => {
      // Un 1 reste « en effet » jusqu'à ce que ses éclats soient posés
      if (critTypeRef.current === 'success') onEffectRef.current(id, false);
      setCritType(null);
    }, [id]);
    const handleShatterComplete = useCallback(() => onEffectRef.current(id, false), [id]);

    return (
      <group ref={ref as any}>
        <VisualDie
          type={type}
          skin={skin}
          isShattered={isShattered}
          critType={critType}
          stopped={stopped}
          onCritComplete={handleCritComplete}
          onShatterComplete={handleShatterComplete}
          faceSymbols={faceSymbols}
          highlight={shown}
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

/** Affichage d'un lancer : ses dés, ceux encore en mouvement, ses minuteries. */
type RollDisplay = {
  dieIds: string[];
  rolling: number;
  lastStop: number;
  effectEnded: boolean;
  removeTimer?: number;
  capTimer?: number;
};

export const DiceThrower = () => {
  const [dice, setDice] = useState<ThrownDie[]>([]);
  // Dés arrêtés (face lue) et dés dont l'effet critique court encore : ils
  // décident de la boucle de rendu et de la pause du moteur physique.
  const [stoppedIds, setStoppedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [effectIds, setEffectIds] = useState<ReadonlySet<string>>(() => new Set());
  const effectIdsRef = useRef(new Set<string>());
  const stoppedRef = useRef(new Set<string>());
  const diceByIdRef = useRef(new Map<string, ThrownDie>());
  const displayRef = useRef(new Map<string, RollDisplay>());
  // Lancers en cours : valeur retenue de chaque dé (remplacée si le dé est bousculé)
  const activeRollsRef = useRef<
    Map<
      string,
      {
        expected: number;
        order: string[];
        results: Map<string, { type: string; value: number; tag?: string }>;
      }
    >
  >(new Map());
  // Lancers finis : leurs dés ne changent plus de valeur
  const [finalRolls, setFinalRolls] = useState<ReadonlySet<string>>(() => new Set());
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

  /** Retire de l'écran les dés d'un lancer. */
  const removeRoll = useCallback((rollId: string) => {
    const display = displayRef.current.get(rollId);
    if (!display) return;
    window.clearTimeout(display.removeTimer);
    window.clearTimeout(display.capTimer);
    displayRef.current.delete(rollId);
    const ids = new Set(display.dieIds);
    ids.forEach((id) => {
      diceByIdRef.current.delete(id);
      effectIdsRef.current.delete(id);
      stoppedRef.current.delete(id);
    });
    setDice((prev) => prev.filter((d) => !ids.has(d.id)));
    const without = (prev: ReadonlySet<string>) => {
      const next = new Set([...prev].filter((id) => !ids.has(id)));
      return next.size === prev.size ? prev : next;
    };
    setStoppedIds(without);
    setEffectIds(without);
    setFinalRolls((prev) => {
      if (!prev.has(rollId)) return prev;
      const next = new Set(prev);
      next.delete(rollId);
      return next;
    });
  }, []);

  /**
   * Programme le retrait d'un lancer dont tous les dés sont arrêtés et dont
   * aucun effet critique ne court plus : 2 s après le dernier arrêt, et au
   * moins 0,8 s après la fin du dernier effet.
   */
  const scheduleRemoval = useCallback(
    (rollId: string) => {
      const display = displayRef.current.get(rollId);
      if (!display || display.rolling > 0) return;
      if (display.dieIds.some((id) => effectIdsRef.current.has(id))) return;
      window.clearTimeout(display.removeTimer);
      const delay = Math.max(
        SETTLED_DISPLAY_MS - (performance.now() - display.lastStop),
        display.effectEnded ? AFTER_EFFECT_MS : 0,
      );
      display.removeTimer = window.setTimeout(() => removeRoll(rollId), delay);
    },
    [removeRoll],
  );

  // Minuteries des lancers encore affichés, coupées si le lanceur est démonté
  useEffect(
    () => () => {
      displayRef.current.forEach((d) => {
        window.clearTimeout(d.removeTimer);
        window.clearTimeout(d.capTimer);
      });
    },
    [],
  );

  /**
   * Un dé s'est arrêté sur `val` : valeur retenue (ou remplacée, s'il a été bousculé) tant que
   * son lancer n'est pas fini. Le lancer finit quand chaque dé a une valeur : elles partent à
   * l'appelant, dans l'ordre des dés. Faux : lancer déjà fini, la valeur ne compte plus.
   */
  const handleDieResult = useCallback(
    (dieId: string, val: string): boolean => {
      const die = diceByIdRef.current.get(dieId);
      if (!die) return false;
      const roll = activeRollsRef.current.get(die.rollId);
      if (!roll) return false;
      // tag : identifiant optionnel echoé tel quel (ex clé d'un dé à symboles) — permet à
      // l'appelant de réassocier chaque résultat à SON type de dé quand deux types partagent la
      // même forme physique (ex Aptitude et Difficulté, tous deux d8).
      roll.results.set(dieId, {
        type: die.type,
        value: parseInt(val),
        ...(die.tag ? { tag: die.tag } : {}),
      });
      const display = displayRef.current.get(die.rollId);
      // Premier arrêt du dé (une seule fois, même s'il a été remonté : relance du moteur)
      if (!stoppedRef.current.has(dieId)) {
        stoppedRef.current.add(dieId);
        setStoppedIds((prev) => (prev.has(dieId) ? prev : new Set(prev).add(dieId)));
        if (display) display.rolling -= 1;
      }
      if (display) {
        display.lastStop = performance.now();
        scheduleRemoval(die.rollId);
      }
      if (roll.results.size === roll.expected) {
        activeRollsRef.current.delete(die.rollId);
        diceThrowerChannel.completed(
          die.rollId,
          roll.order.map((id) => roll.results.get(id)!),
        );
        setFinalRolls((prev) => new Set(prev).add(die.rollId));
      }
      return true;
    },
    [scheduleRemoval],
  );

  /** Effet critique d'un dé commencé ou fini (lueur, bris puis éclats posés). */
  const handleDieEffect = useCallback(
    (dieId: string, active: boolean) => {
      const effects = effectIdsRef.current;
      if (active === effects.has(dieId)) return;
      if (active) effects.add(dieId);
      else effects.delete(dieId);
      setEffectIds(new Set(effects));
      const die = diceByIdRef.current.get(dieId);
      const display = die && displayRef.current.get(die.rollId);
      if (!active && display) {
        display.effectEnded = true;
        scheduleRemoval(die.rollId);
      }
    },
    [scheduleRemoval],
  );

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
      activeRollsRef.current.set(rollId, {
        expected: totalDiceCount,
        order: newDice.map((d) => d.id),
        results: new Map(),
      });
      newDice.forEach((d) => diceByIdRef.current.set(d.id, d));
      // Retrait 2 s après l'arrêt du dernier dé (voir scheduleRemoval), ou au
      // bout de MAX_DIE_LIFETIME_MS si un dé ne s'arrête jamais.
      displayRef.current.set(rollId, {
        dieIds: newDice.map((d) => d.id),
        rolling: newDice.length,
        lastStop: performance.now(),
        effectEnded: false,
        capTimer: window.setTimeout(() => removeRoll(rollId), MAX_DIE_LIFETIME_MS),
      });
      setDice((prev) => [...prev, ...newDice]);
      // Les dés partent vraiment maintenant (après chargement et préchauffage) :
      // l'appelant ne fait courir son délai de repli qu'à partir d'ici.
      diceThrowerChannel.started(rollId);
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
  useEffect(() => diceThrowerChannel.shown(hasDice), [hasDice]);
  useEffect(() => () => diceThrowerChannel.shown(false), []);
  // Un dé roule encore : moteur physique et rendu à pleine cadence. Tous
  // arrêtés : le moteur est en pause (sinon chaque pas relance un rendu), et
  // seule une image toutes les 40 ms entretient les shaders animés, sauf
  // pendant un effet critique (particules, bris), rendu à pleine cadence.
  const rolling = dice.some((d) => !stoppedIds.has(d.id));
  const animating = rolling || effectIds.size > 0;
  // Au repos, des images seulement si un dé visible bouge encore (motif animé, orbe), et le
  // temps du fondu du chiffre doré juste après l'arrêt
  const anyAnimated = dice.some((d) => isAnimatedSkin(getSkinById(d.skinId)));
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    if (rolling || !hasDice) return;
    setSettling(true);
    const t = window.setTimeout(() => setSettling(false), SETTLE_FRAMES_MS);
    return () => window.clearTimeout(t);
  }, [rolling, hasDice]);
  const idleTick = anyAnimated || settling ? IDLE_FRAME_MS : 0;
  const tickMs = hasDice && !animating ? idleTick : warming && !animating ? WARM_FRAME_MS : 0;

  // Réglages lus une fois. Machine économe (Windows, machine modeste) : pas
  // d'antialiasing, densité 1. Ailleurs l'antialiasing reste : la densité
  // rendue est plafonnée à 1,25, même sur un écran haute densité, où les
  // arêtes se verraient sans lui.
  const glSettings = useMemo(() => {
    const economy = prefersEconomy();
    return {
      economy,
      gl: {
        alpha: true,
        // Canevas jamais démonté : ne pas réclamer le GPU puissant (portables
        // à deux GPU, batterie) pour quelques dés.
        powerPreference: 'default' as const,
        antialias: !economy,
        stencil: false,
      },
    };
  }, []);

  // The canvas stays mounted even with no dice so the WebGL context, the
  // environment map and the compiled skin shaders persist between rolls
  // instead of being recreated/recompiled on every throw. When idle it's
  // hidden and switched to on-demand rendering (no render loop, ~0 cost).
  // The scene's light count NEVER changes (no light per die; model cores are
  // lit in their own shader, `cores.tsx`): a new die, a critical or a model orb reuses the programs
  // already compiled instead of recompiling all of them mid-roll.
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{ visibility: hasDice ? 'visible' : 'hidden' }}
    >
      <Canvas
        camera={{ position: [0, DICE_CAM_HEIGHT, 0], fov: DICE_CAM_FOV }}
        gl={glSettings.gl}
        // Same fill-cost cap as the fun thrower: procedural die
        // shaders are expensive per pixel, 1.25 dpr is invisible on
        // dice in motion (1 on economy machines).
        // En mouvement, densité 1 (la différence ne se voit pas) ; arrêtés, 1,25 pour les
        // chiffres et le doré
        dpr={glSettings.economy || rolling ? 1 : [1, 1.25]}
        frameloop={animating ? 'always' : 'demand'}
        style={{ pointerEvents: 'none' }}
      >
        {tickMs > 0 && <FrameTicker intervalMs={tickMs} />}
        <ShapeWarmer />
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
        <Environment files={DICE_ENVIRONMENT} environmentIntensity={0.55} />

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
          isPaused={!rolling}
        >
          <Table />
          {dice.map((d, i) => (
            <Die
              key={d.id}
              ref={(el: any) => {
                if (el) diceRefs.current[i] = { id: d.id, ref: { current: el } };
              }}
              id={d.id}
              type={d.type}
              position={d.pos}
              impulse={d.imp}
              skin={getSkinById(d.skinId)}
              onResult={handleDieResult}
              onEffect={handleDieEffect}
              onStall={handleStall}
              faces={d.faces}
              final={finalRolls.has(d.rollId)}
            />
          ))}
        </Physics>
      </Canvas>
    </div>
  );
};

export default DiceThrower;
