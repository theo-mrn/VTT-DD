import React, { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { DiceSkin, CriticalType } from './dice-definitions';
import { getCachedGeometry, getDieValue } from './geometry';
import { TexturedMaterial } from './materials/textured-material';
import { CriticalEffect, ShatteredDie } from './effects/critical';
import { DiceCore, OrbShell } from './cores';
import { FaceFadeDriver, FaceNumber, type FadingLabels } from './face-number';
import { FaceSymbol } from './face-symbol';
import type { Die3DSymbol } from '@/lib/dice-throw';

/**
 * Émissif du halo (`rimLight`). La lueur intérieure (`innerGlow`) était une
 * lumière ponctuelle au centre de chaque dé : sur le dé lui-même elle
 * n'éclairait que la face interne du halo (rendu en BackSide, normales vers le
 * centre), le corps et les chiffres lui tournant le dos ou étant non éclairés.
 * Mais chaque dé lumineux changeait le nombre de lumières de la scène, donc
 * recompilait tous les programmes au lancer. Elle est reproduite ici en
 * émissif : l'éclairement d'une lumière d'intensité I à ~1 unité, renvoyé en
 * diffus par le halo (couleur du halo × I / π).
 */
const rimEmissive = (skin: DiceSkin) => {
  const rim = new THREE.Color(skin.rimLightColor);
  const emissive = rim.clone().multiplyScalar(0.5);
  if (skin.innerGlow && skin.innerGlowIntensity > 0)
    emissive.add(
      new THREE.Color(skin.innerGlowColor)
        .multiply(rim)
        .multiplyScalar(skin.innerGlowIntensity / Math.PI),
    );
  return emissive;
};

// Visual Die Component (Pure Rendering). The parent handles positioning /
// rotation via a Group, so this just renders the mesh + effects at 0,0,0.
// Reusable for both the physics die and previews (no physics).
export const VisualDie = React.forwardRef(
  (
    {
      type,
      skin,
      isShattered,
      critType,
      stopped = false,
      simple = false,
      onCritComplete,
      onShatterComplete,
      faceSymbols,
    }: {
      type: string;
      skin: DiceSkin;
      isShattered: boolean;
      critType: CriticalType;
      stopped?: boolean;
      simple?: boolean;
      onCritComplete?: () => void;
      /** Les éclats du dé brisé sont posés : l'effet est fini. */
      onShatterComplete?: () => void;
      /**
       * Symbol die: symbols of each physical face (index of `trueFaces`),
       * drawn instead of the numbers; an empty face shows nothing.
       */
      faceSymbols?: Die3DSymbol[][];
    },
    ref: any,
  ) => {
    const { trueFaces, geometry } = getCachedGeometry(type);
    const rootRef = useRef<THREE.Group>(null);
    // Maillages qui s'illuminent pendant un critique (corps, halo, coque).
    const flashRef = useRef<THREE.Group>(null);
    // Chiffres et symboles fondus selon l'orientation, par une seule boucle.
    const labels = useMemo<FadingLabels>(() => new Map(), []);
    const [labelsFrozen, setLabelsFrozen] = useState(false);
    const rimGlow = useMemo(
      () => rimEmissive(skin),
      [skin.rimLightColor, skin.innerGlow, skin.innerGlowColor, skin.innerGlowIntensity],
    );

    const fadeDriver = !simple && !labelsFrozen && (
      <FaceFadeDriver
        labels={labels}
        root={rootRef}
        stopped={stopped}
        onFrozen={() => setLabelsFrozen(true)}
      />
    );

    // ── ORB SKINS ──────────────────────────────────────────────
    // Transparent shell that rolls + a billboarded core that stays facing the camera.
    if (skin.effectType === 'orb' && !isShattered) {
      return (
        <group ref={rootRef}>
          {critType && (
            <CriticalEffect
              type={critType}
              onComplete={onCritComplete ?? (() => {})}
              flashTarget={flashRef}
            />
          )}
          {fadeDriver}

          {/* Core + numbers render FIRST (low renderOrder) so the transmissive
                    shell, drawn last, can sample them and refract correctly. */}

          {/* Billboarded core element (never rotates with the die) */}
          <group renderOrder={0}>
            <DiceCore skin={skin} />
          </group>

          {/* Face numbers — opacity driven per-frame by face orientation:
                    top faces (toward the camera) stay readable, others fade out. */}
          {!simple &&
            trueFaces.map((face, index) =>
              faceSymbols ? (
                faceSymbols[index]?.length ? (
                  <FaceSymbol
                    key={index}
                    face={face}
                    index={index}
                    labels={labels}
                    symbols={faceSymbols[index]!}
                    scale={type === 'd20' ? 0.45 : 0.7}
                    color={'#ffffff'}
                    outlineColor={skin.shadowColor}
                    radius={0.92}
                    maxOpacity={0.85}
                  />
                ) : null
              ) : (
                <FaceNumber
                  key={index}
                  face={face}
                  index={index}
                  labels={labels}
                  value={getDieValue(type, index)}
                  scale={type === 'd20' ? 0.45 : 0.7}
                  color={'#ffffff'}
                  outlineColor={skin.shadowColor}
                  radius={0.92}
                  maxOpacity={0.85}
                  outlineWidth={0}
                />
              ),
            )}

          {/* Transparent glass shell (rolls with the die body), drawn LAST */}
          <group ref={flashRef}>
            <OrbShell skin={skin} geometry={geometry} />
          </group>
        </group>
      );
    }

    return (
      <group ref={rootRef}>
        {/* Critical hit/fail effect */}
        {critType && (
          <CriticalEffect
            type={critType}
            onComplete={onCritComplete ?? (() => {})}
            flashTarget={flashRef}
          />
        )}
        {fadeDriver}

        {/* Shattered die fragments */}
        {isShattered && (
          <ShatteredDie color={skin.bodyColor} onComplete={onShatterComplete ?? (() => {})} />
        )}

        {!isShattered && (
          <group ref={flashRef}>
            {/* Main die body */}
            <mesh geometry={geometry}>
              <TexturedMaterial skin={skin} />
            </mesh>

            {/* Rim lighting effect (+ the inner glow, as emissive) */}
            {!simple && skin.rimLight && (
              <mesh geometry={geometry} scale={[1.02, 1.02, 1.02]}>
                <meshStandardMaterial
                  color={skin.rimLightColor}
                  emissive={rimGlow}
                  emissiveIntensity={1}
                  metalness={0}
                  roughness={1}
                  transparent
                  opacity={0.25}
                  side={THREE.BackSide}
                />
              </mesh>
            )}
          </group>
        )}

        {/* Face numbers — fade out on faces pointing away from the camera */}
        {!isShattered &&
          !simple &&
          trueFaces.map((face, index) =>
            faceSymbols ? (
              faceSymbols[index]?.length ? (
                <FaceSymbol
                  key={index}
                  face={face}
                  index={index}
                  labels={labels}
                  symbols={faceSymbols[index]!}
                  scale={type === 'd20' ? 0.45 : 0.7}
                  color={skin.textColor}
                  outlineColor={skin.shadowColor}
                  radius={1.01}
                  maxOpacity={1}
                />
              ) : null
            ) : (
              <FaceNumber
                key={index}
                face={face}
                index={index}
                labels={labels}
                value={getDieValue(type, index)}
                scale={type === 'd20' ? 0.45 : 0.7}
                color={skin.textColor}
                outlineColor={skin.shadowColor}
                radius={1.01}
                maxOpacity={1}
                outlineWidth={0.06}
              />
            ),
          )}
      </group>
    );
  },
);
VisualDie.displayName = 'VisualDie';
