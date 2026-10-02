import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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
