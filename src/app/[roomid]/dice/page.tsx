"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, usePlane, useConvexPolyhedron, useBox } from '@react-three/cannon';
import { OrbitControls, Stars, Text, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from "@/components/ui/button";

// --- MATH CONSTANTS ---
// Hardcoding geometry data ensures perfect text placement and collision shapes.

const D6_VERTICES = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
];
const D6_FACES = [
  [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4],
  [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]
].map(f => [f[0], f[1], f[2]]); // Triangulate for ConvexPolyhedron (needs to be triangles mainly or carefully ordered)
// Canonical D6 Face Centers/Rotations for numbers 1-6
// 1: Right (x+), 2: Left (x-), 3: Top (y+), 4: Bottom (y-), 5: Front (z+), 6: Back (z-)
// Orientation depends on uv mapping usually, here we position text in 3D.
const D6_LABELS = [
  { pos: [1.1, 0, 0], rot: [0, Math.PI / 2, 0], val: "1" },
  { pos: [-1.1, 0, 0], rot: [0, -Math.PI / 2, 0], val: "6" },
  { pos: [0, 1.1, 0], rot: [-Math.PI / 2, 0, 0], val: "2" },
  { pos: [0, -1.1, 0], rot: [Math.PI / 2, 0, 0], val: "5" },
  { pos: [0, 0, 1.1], rot: [0, 0, 0], val: "3" },
  { pos: [0, 0, -1.1], rot: [0, Math.PI, 0], val: "4" }
];

// D20 Constants (simplified)
const t = (1 + Math.sqrt(5)) / 2;
const D20_VERTICES = [
  [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
  [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
  [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
];
// Indices for 20 faces...
// For the sake of this tasks length, utilizing a procedural generator for D20/D12/D8/D4 is safer than manual indices which are error prone.
// I will reuse Three.js geometries to EXTRACT the exact data for physics, but use the known face centers.

// Helper for consistent values
const getDieValue = (type: string, index: number) => {
  if (type === 'd10') {
    // D10 usually 0-9. Face 0->0, Face 1->1.
    return (index % 10).toString();
  }
  return (index + 1).toString();
};

const createGeometryData = (type: string) => {
  let geo: THREE.BufferGeometry;
  switch (type) {
    case 'd4': geo = new THREE.TetrahedronGeometry(1.5); break;
    case 'd6': geo = new THREE.BoxGeometry(2, 2, 2); break;
    case 'd8': geo = new THREE.OctahedronGeometry(1.5); break;
    case 'd10': geo = new THREE.IcosahedronGeometry(1.5); break;
    case 'd12': geo = new THREE.DodecahedronGeometry(1.5); break;
    case 'd20': geo = new THREE.IcosahedronGeometry(1.5); break;
    default: geo = new THREE.BoxGeometry(2, 2, 2);
  }

  // VISUAL & LOGIC: Non-indexed for easy face center calculation
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();

  const position = geo.attributes.position;

  // 1. Calculate Face Centers (Visual/Logic) logic stays same
  const groupedFaces: { normal: THREE.Vector3, centers: THREE.Vector3[] }[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const a = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
    const b = new THREE.Vector3(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
    const c = new THREE.Vector3(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));

    const center = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
    const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a)).normalize();

    let found = groupedFaces.find(g => g.normal.dot(normal) > 0.90);
    if (found) found.centers.push(center);
    else groupedFaces.push({ normal, centers: [center] });
  }

  const trueFaces = groupedFaces.map(g => {
    const avgCenter = new THREE.Vector3();
    g.centers.forEach(c => avgCenter.add(c));
    avgCenter.divideScalar(g.centers.length);
    return { pos: avgCenter, norm: g.normal };
  });

  // Debug log to ensure we found the right number of faces
  // console.log(`Type: ${type}, Faces: ${trueFaces.length}`);

  // 2. PHYSICS: Merge Vertices for stable ConvexPolyhedron
  // Cannon hates duplicated vertices (which non-indexed geo has tons of).
  // We must weld them.
  const uniqueVertices: number[][] = [];
  const cannonFaces: number[][] = [];
  const vertMap = new Map<string, number>();

  const getVertIndex = (x: number, y: number, z: number) => {
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`; // Precision limit implies merge tolerance
    if (vertMap.has(key)) return vertMap.get(key)!;
    const idx = uniqueVertices.length;
    uniqueVertices.push([x, y, z]);
    vertMap.set(key, idx);
    return idx;
  };

  for (let i = 0; i < position.count; i += 3) {
    const i1 = getVertIndex(position.getX(i), position.getY(i), position.getZ(i));
    const i2 = getVertIndex(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1));
    const i3 = getVertIndex(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2));
    cannonFaces.push([i1, i2, i3]);
  }

  return {
    vertices: uniqueVertices, // CLEAN vertices for Physics
    faces: cannonFaces,       // INDEXED faces for Physics
    trueFaces,                // Data for Text labels
    geometry: geo             // Visual geometry
  };
};

// --- COMPONENTS ---

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
  // Floor
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
    material: { friction: 0.3, restitution: 0.5 }
  }));

  return (
    <group>
      <mesh ref={ref as any} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#1a1b26" roughness={0.5} />
      </mesh>
      <gridHelper args={[100, 100, 0x444444, 0x222222]} />

      {/* Invisible Walls to keep dice on table */}
      <Wall args={[50, 10, 1]} position={[0, 5, -15]} />
      <Wall args={[50, 10, 1]} position={[0, 5, 15]} />
      <Wall args={[1, 10, 50]} position={[-25, 5, 0]} />
      <Wall args={[1, 10, 50]} position={[25, 5, 0]} />
    </group>
  );
};

const Die = ({ type, position, impulse, onResult }: { type: string, position: [number, number, number], impulse: [number, number, number], onResult: (val: string) => void }) => {
  const { vertices, faces, trueFaces, geometry } = useMemo(() => createGeometryData(type), [type]);
  const [stopped, setStopped] = useState(false);
  const [canCheck, setCanCheck] = useState(false);

  const [ref, api] = useConvexPolyhedron(() => ({
    mass: 5,
    position,
    args: [vertices, faces], // Now sending clean indexed data
    material: { friction: 0.1, restitution: 0.6 }, // Lower friction for sliding/bouncing
    linearDamping: 0.1,
    angularDamping: 0.1,
    allowSleep: false
  }));

  useEffect(() => {
    const t = setTimeout(() => setCanCheck(true), 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (api) {
      const randomSpin = [Math.random() * 30, Math.random() * 30, Math.random() * 30] as [number, number, number];
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

  useEffect(() => {
    if (!canCheck || stopped) return;

    const interval = setInterval(() => {
      const v = velocity.current;
      const av = angularVelocity.current;

      const speed = Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]);
      const spin = Math.abs(av[0]) + Math.abs(av[1]) + Math.abs(av[2]);

      if (speed < 0.1 && spin < 0.5) { // Stricter spin check to ensure full stop
        const q = new THREE.Quaternion(quaternion.current[0], quaternion.current[1], quaternion.current[2], quaternion.current[3]);
        const up = new THREE.Vector3(0, 1, 0);

        let maxDot = -Infinity;
        let bestIndex = -1;

        trueFaces.forEach((face, index) => {
          const worldNormal = face.norm.clone().applyQuaternion(q);
          const dot = worldNormal.dot(up);
          if (dot > maxDot) {
            maxDot = dot;
            bestIndex = index;
          }
        });

        if (bestIndex !== -1) {
          setStopped(true);
          onResult(getDieValue(type, bestIndex));
        }
      }
    }, 200);
    return () => clearInterval(interval);
  }, [stopped, canCheck, trueFaces, onResult, type]);

  return (
    <group ref={ref as any}>
      <mesh castShadow receiveShadow geometry={geometry}>
        <meshStandardMaterial color="#4f46e5" metalness={0.2} roughness={0.1} />
      </mesh>
      {trueFaces.map((face, index) => {
        const textPos = face.pos.clone().multiplyScalar(1.15);
        return (
          <group key={index} position={textPos} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.norm)}>
            <Text
              scale={type === 'd20' ? [0.5, 0.5, 0.5] : [0.8, 0.8, 0.8]}
              color="white"
              fontSize={1}
              fontWeight={800}
              anchorX="center"
              anchorY="middle"
            >
              {getDieValue(type, index)}
            </Text>
          </group>
        )
      })}
    </group>
  )
};

export default function DiceRollerPage() {
  const [dice, setDice] = useState<{ id: string, type: string, pos: [number, number, number], imp: [number, number, number] }[]>([]);
  const [results, setResults] = useState<{ id: string, val: string }[]>([]);
  const [count, setCount] = useState(1);

  // Logic to handle result results
  const handleResult = (id: string, val: string) => {
    setResults(prev => {
      if (prev.find(r => r.id === id)) return prev;
      // Handle D10 0-9 vs 1-10 display if needed
      // The Die component passes 1-based index (1-20 for D20/D10 geo), we mapped text to 0-9.
      // Wait, we need to map the result similarly! 
      // The Die's onResult passes (bestIndex+1).
      // But for D10, we displayed (index % 10).
      // So we should fix the logic inside Die to return the DISPLAYED value.
      return [...prev, { id, val }];
    });
  };

  const throwDice = (type: string, amount: number) => {
    const newDice: typeof dice = [];

    for (let i = 0; i < amount; i++) {
      const startX = (Math.random() - 0.5) * 10;
      const startZ = 10 + (Math.random() * 2); // Spread depth slightly
      const startY = 5 + (Math.random() * 5) + (i * 1.5); // Stack them vertically to prevent instant collision

      const forceX = -startX * (0.8 + Math.random() * 0.4);
      const forceY = Math.random() * 5;
      const forceZ = -startZ * (0.8 + Math.random() * 0.4);

      newDice.push({
        id: crypto.randomUUID(),
        type,
        pos: [startX, startY, startZ],
        imp: [forceX, forceY, forceZ]
      });
    }

    setDice(prev => [...prev, ...newDice]);
  };

  const clear = () => {
    setDice([]);
    setResults([]);
  };

  return (
    <div className="w-screen h-screen relative bg-black overflow-hidden">
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-20 bg-gray-900/80 p-4 rounded-lg text-white border border-gray-700 min-w-[200px] shadow-2xl backdrop-blur-md">
        <h2 className="text-xl font-bold mb-4 text-[#c0a080]">Table de Jeu 3D</h2>

        {/* Controls */}
        <div className="mb-4 flex items-center justify-between bg-black/40 p-2 rounded">
          <span className="text-sm font-bold text-gray-400">Quantité:</span>
          <input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 bg-transparent text-white text-right font-bold text-xl focus:outline-none border-b border-gray-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {['d4', 'd6', 'd8', 'd10', 'd12', 'd20'].map(dType => (
            <Button key={dType} onClick={() => throwDice(dType, count)} className="font-bold relative overflow-hidden group">
              {dType.toUpperCase()}
              <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          ))}
        </div>

        <Button variant="destructive" onClick={clear} className="w-full font-bold tracking-wider">
          TOUT EFFACER
        </Button>
      </div>

      {/* Results Display */}
      {results.length > 0 && (
        <div className="absolute top-4 right-4 z-20 bg-black/80 p-4 rounded-xl border border-white/20 backdrop-blur-md max-w-sm">
          <h3 className="text-gray-400 text-sm uppercase font-bold mb-2">Résultats ({results.length}/{dice.length})</h3>
          <div className="flex flex-wrap gap-2 max-h-[60vh] overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="bg-white text-black font-black w-10 h-10 flex items-center justify-center rounded-lg shadow-lg text-xl border-2 border-gray-200 animate-in zoom-in duration-300">
                {r.val}
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 text-right">
            <span className="text-gray-400 text-sm mr-2">Total:</span>
            <span className="text-3xl font-bold text-[#4f46e5]">
              {results.reduce((acc, curr) => acc + parseInt(curr.val), 0)}
            </span>
          </div>
        </div>
      )}

      <Canvas shadows camera={{ position: [0, 25, 15], fov: 45 }}>
        <color attach="background" args={['#0f172a']} />
        <ambientLight intensity={0.6} />
        <spotLight position={[10, 40, 20]} angle={0.4} penumbra={0.5} intensity={2} castShadow />
        <pointLight position={[-10, 10, -10]} intensity={1} color="#c0a080" />

        <Physics gravity={[0, -40, 0]} defaultContactMaterial={{ friction: 0.01, restitution: 0.6 }} allowSleep={false} iterations={20}>
          <Table />
          {dice.map(d => (
            <Die
              key={d.id}
              type={d.type}
              position={d.pos}
              impulse={d.imp}
              onResult={(val) => handleResult(d.id, val)}
            />
          ))}
        </Physics>

        <OrbitControls maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}