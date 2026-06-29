import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';

// A single face number that fades based on whether its face points up toward
// the (top-down) camera: top faces stay readable, bottom/side faces fade out so
// the focus stays on the visible result. Used by every die type.
export const FaceNumber = ({ face, value, scale, color, outlineColor, radius = 1.01, maxOpacity = 1, outlineWidth = 0.06 }: {
    face: { pos: THREE.Vector3, norm: THREE.Vector3 },
    value: string,
    scale: number,
    color: string,
    outlineColor: string,
    radius?: number,
    maxOpacity?: number,
    outlineWidth?: number,
}) => {
    const groupRef = useRef<THREE.Group>(null);
    const textRef = useRef<any>(null);
    const _wn = useRef(new THREE.Vector3());
    const _up = useRef(new THREE.Vector3(0, 1, 0));
    const quat = useMemo(
        () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.norm),
        [face.norm]
    );
    const pos = useMemo(() => face.pos.clone().multiplyScalar(radius), [face.pos, radius]);

    useFrame(() => {
        const t = textRef.current;
        const g = groupRef.current;
        const mat = t?.material as THREE.Material & { opacity: number; transparent: boolean } | undefined;
        if (!t || !g || !mat) return;
        // World normal of this face = parent(die) world rotation applied to local normal
        const parent = g.parent;
        const wn = _wn.current.copy(face.norm);
        if (parent) wn.applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()));
        // dot with world up: 1 = facing camera (top), <=0 = bottom/side
        const up = _up.current.dot(wn);
        // Map [0.1 .. 0.9] of upward-ness to [0 .. 0.85] opacity. Mutating the
        // derived material opacity directly avoids a costly troika sync().
        const o = THREE.MathUtils.clamp((up - 0.1) / 0.8, 0, 1);
        mat.transparent = true;
        mat.opacity = o * maxOpacity;
        const outline = (t as any).outlineMaterial as { opacity: number; transparent: boolean } | undefined;
        if (outline) {
            outline.transparent = true;
            outline.opacity = o * maxOpacity;
        }
    });

    return (
        <group ref={groupRef} position={pos} quaternion={quat} renderOrder={1}>
            <Text
                ref={textRef}
                scale={[scale, scale, scale]}
                color={color}
                fontSize={1}
                fontWeight={900}
                anchorX="center"
                anchorY="middle"
                outlineWidth={outlineWidth}
                outlineColor={outlineColor}
            >
                {value}
            </Text>
        </group>
    );
};

// Decorative edge lines for each face
export const FaceDecorations = ({ face, borderColor }: {
    face: { pos: THREE.Vector3, norm: THREE.Vector3, edgeVerts: THREE.Vector3[] },
    borderColor: string
}) => {
    const linePoints = useMemo(() => {
        let verts = face.edgeVerts;

        if (verts.length < 3) return null;

        const center = face.pos.clone();
        const normal = face.norm.clone();

        // Create a local coordinate system on the face
        let up = new THREE.Vector3(0, 1, 0);
        if (Math.abs(normal.dot(up)) > 0.99) {
            up.set(1, 0, 0);
        }
        const tangent = new THREE.Vector3().crossVectors(normal, up).normalize();
        const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

        // Project vertices to 2D on the face plane
        const projected2D = verts.map(v => {
            const d = new THREE.Vector3().subVectors(v, center);
            return {
                x: d.dot(tangent),
                y: d.dot(bitangent),
                original: v
            };
        });

        // Find convex hull corners only (for d6, just get the 4 corners)
        const distances = projected2D.map(p => Math.sqrt(p.x * p.x + p.y * p.y));
        const maxDist = Math.max(...distances);
        const threshold = maxDist * 0.8;

        // Keep only corner vertices
        const corners = projected2D.filter((_, i) => distances[i] > threshold);

        if (corners.length < 3) return null;

        // Sort corners by angle for proper polygon ordering
        const sortedCorners = [...corners].sort((a, b) => {
            const angleA = Math.atan2(a.y, a.x);
            const angleB = Math.atan2(b.y, b.x);
            return angleA - angleB;
        });

        // Create inner border (scaled down towards center)
        const scale = 0.75;
        const innerVerts = sortedCorners.map(p => {
            const dir = new THREE.Vector3().subVectors(p.original, center);
            return center.clone().add(dir.multiplyScalar(scale));
        });

        // Create points array for Line component
        const points: THREE.Vector3[] = [];
        for (let i = 0; i < innerVerts.length; i++) {
            points.push(innerVerts[i]);
        }
        // Close the loop
        if (innerVerts.length > 0) {
            points.push(innerVerts[0].clone());
        }

        return points;
    }, [face]);

    if (!linePoints || linePoints.length < 2) return null;

    return (
        <Line
            points={linePoints}
            color={borderColor}
            lineWidth={1.5}
        />
    );
};
