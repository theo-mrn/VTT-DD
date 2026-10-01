import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Chiffre ou symbole d'une face dont l'opacité suit l'orientation du dé :
 * lisible sur le dessus, effacé sur les faces tournées vers la table.
 */
export interface FadingLabel {
  /** Normale de la face, dans le repère du dé. */
  norm: THREE.Vector3;
  /** Opacité de 0 à 1 (le plafond propre au dé est appliqué par l'étiquette). */
  setOpacity(o: number): void;
}
/** Étiquettes d'un dé, par index de face, animées par une seule boucle. */
export type FadingLabels = Map<number, FadingLabel>;

/**
 * Une seule boucle par dé pour les opacités de toutes ses faces (auparavant un
 * `useFrame` par face : 20 par d20). Elle lit l'orientation du dé dans la
 * matrice monde de `root` (mise à jour par le dernier rendu). Une fois le dé
 * arrêté, un dernier calcul fige les opacités et `onFrozen` démonte la boucle :
 * plus aucun travail par image.
 */
export const FaceFadeDriver = ({
  labels,
  root,
  stopped,
  onFrozen,
}: {
  labels: FadingLabels;
  root: React.RefObject<THREE.Object3D | null>;
  stopped: boolean;
  onFrozen: () => void;
}) => {
  const _wn = useRef(new THREE.Vector3());
  const frozenRef = useRef(false);
  useFrame(() => {
    if (frozenRef.current) return;
    const r = root.current;
    if (r && labels.size) {
      for (const label of labels.values()) {
        // dot with world up = y of the world normal: 1 = facing the camera
        // (top), <= 0 = bottom/side. Map [0.1 .. 0.9] of upward-ness to [0 .. 1].
        const up = _wn.current.copy(label.norm).transformDirection(r.matrixWorld).y;
        label.setOpacity(THREE.MathUtils.clamp((up - 0.1) / 0.8, 0, 1));
      }
    }
    if (stopped) {
      frozenRef.current = true;
      onFrozen();
    }
  });
  return null;
};

// A single face number. Its fade (see <FaceFadeDriver>) only applies without
// an outline: with one, troika draws the text with TWO materials (outline +
// text, `material` is then an array) and the old per-face fade, which wrote
// the opacity on that array, never had any effect — outlined numbers have
// always stayed fully opaque. They are kept that way, and not registered.
export const FaceNumber = ({
  face,
  index,
  labels,
  value,
  scale,
  color,
  outlineColor,
  radius = 1.01,
  maxOpacity = 1,
  outlineWidth = 0.06,
}: {
  face: { pos: THREE.Vector3; norm: THREE.Vector3 };
  /** Index de la face, clé de l'étiquette dans `labels`. */
  index: number;
  labels?: FadingLabels;
  value: string;
  scale: number;
  color: string;
  outlineColor: string;
  radius?: number;
  maxOpacity?: number;
  outlineWidth?: number;
}) => {
  const textRef = useRef<any>(null);
  const quat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.norm),
    [face.norm],
  );
  const pos = useMemo(() => face.pos.clone().multiplyScalar(radius), [face.pos, radius]);

  useEffect(() => {
    if (!labels || outlineWidth) return;
    const label: FadingLabel = {
      norm: face.norm,
      // Mutating the derived material opacity directly avoids a costly troika sync().
      setOpacity: (o) => {
        const mat = textRef.current?.material as THREE.Material | THREE.Material[] | undefined;
        if (mat && !Array.isArray(mat)) mat.opacity = o * maxOpacity;
      },
    };
    labels.set(index, label);
    return () => {
      if (labels.get(index) === label) labels.delete(index);
    };
  }, [labels, index, face.norm, maxOpacity, outlineWidth]);

  return (
    <group position={pos} quaternion={quat} renderOrder={1}>
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
export const FaceDecorations = ({
  face,
  borderColor,
}: {
  face: { pos: THREE.Vector3; norm: THREE.Vector3; edgeVerts: THREE.Vector3[] };
  borderColor: string;
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
    const projected2D = verts.map((v) => {
      const d = new THREE.Vector3().subVectors(v, center);
      return {
        x: d.dot(tangent),
        y: d.dot(bitangent),
        original: v,
      };
    });

    // Find convex hull corners only (for d6, just get the 4 corners)
    const distances = projected2D.map((p) => Math.sqrt(p.x * p.x + p.y * p.y));
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
    const innerVerts = sortedCorners.map((p) => {
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

  return <Line points={linePoints} color={borderColor} lineWidth={1.5} />;
};
