import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DiceSkin, CriticalType } from './dice-definitions';
import { dieShape } from './polyhedra';
import { engravingTexture, highlightRects, inkUniforms } from './engraving';
import { TexturedMaterial } from './materials/textured-material';
import { isVoidSkin, type EngravingProps } from './materials/procedural-material';
import { CriticalEffect, ShatteredDie } from './effects/critical';
import { DiceCore, OrbShell } from './cores';
import { FaceFadeDriver, type FadingLabels } from './face-number';
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

/** Lueur de l'encre : pigment sur un dé éclairé, lumineuse sur un dé sans éclairage ou en verre. */
const inkGlow = (skin: DiceSkin) => (skin.effectType === 'orb' ? 1 : isVoidSkin(skin) ? 0.9 : 0.12);

// Visual Die Component (Pure Rendering). The parent handles positioning /
// rotation via a Group, so this just renders the mesh + effects at 0,0,0.
// Reusable for both the physics die and previews (no physics).
//
// Forme et chiffres (`polyhedra.ts`, `engraving.ts`) : vrai polyèdre aux arêtes arrondies,
// chiffres gravés dans une texture partagée par type de dé. Un dé à symboles garde ses
// symboles posés sur les faces (sans gravure dessous).
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
      highlight = null,
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
       * Symbol die: symbols of each physical face (index of the shape's faces),
       * drawn instead of the numbers; an empty face shows nothing.
       */
      faceSymbols?: Die3DSymbol[][];
      /** Chiffre retenu sur le dé posé : doré (null : aucun). */
      highlight?: string | null;
    },
    _ref: unknown,
  ) => {
    const shape = dieShape(type);
    const { geometry, faces } = shape;
    const rootRef = useRef<THREE.Group>(null);
    // Maillages qui s'illuminent pendant un critique (corps, halo, coque).
    const flashRef = useRef<THREE.Group>(null);
    // Symboles fondus selon l'orientation, par une seule boucle.
    const labels = useMemo<FadingLabels>(() => new Map(), []);
    const [labelsFrozen, setLabelsFrozen] = useState(false);
    const rimGlow = useMemo(
      () => rimEmissive(skin),
      [skin.rimLightColor, skin.innerGlow, skin.innerGlowColor, skin.innerGlowIntensity],
    );
    const glow = inkGlow(skin);
    const ink = skin.effectType === 'orb' ? '#ffffff' : skin.textColor;
    const engraving = useMemo<EngravingProps | undefined>(
      () =>
        faceSymbols
          ? undefined
          : {
              map: engravingTexture(shape.type),
              ink: inkUniforms(ink, glow, skin.shadowColor),
            },
      [faceSymbols, shape.type, ink, glow, skin.shadowColor],
    );

    // Chiffre retenu : doré, en fondu ; un nouveau chiffre (dé bousculé) repart de zéro
    const hiTarget = useRef(0);
    useEffect(() => {
      if (!engraving) return;
      const rects = highlightRects(shape.type, highlight);
      engraving.ink.uHiRects.value.forEach((r, i) => r.copy(rects[i]!));
      engraving.ink.uHiAmount.value = 0;
      hiTarget.current = highlight ? 1 : 0;
    }, [engraving, highlight, shape.type]);
    useFrame((_, dt) => {
      const amount = engraving?.ink.uHiAmount;
      if (!amount || amount.value >= hiTarget.current) return;
      amount.value = Math.min(hiTarget.current, amount.value + dt * 4);
    });

    const symbols =
      faceSymbols && !simple && !isShattered
        ? faces.map((face, index) =>
            faceSymbols[index]?.length ? (
              <FaceSymbol
                key={index}
                face={face}
                index={index}
                labels={labels}
                symbols={faceSymbols[index]!}
                scale={type === 'd20' ? 0.45 : 0.7}
                color={skin.effectType === 'orb' ? '#ffffff' : skin.textColor}
                outlineColor={skin.shadowColor}
                radius={skin.effectType === 'orb' ? 0.92 : 1.01}
                maxOpacity={skin.effectType === 'orb' ? 0.85 : 1}
              />
            ) : null,
          )
        : null;

    const fadeDriver = symbols && !labelsFrozen && (
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

          {/* Core renders FIRST (low renderOrder) so the transmissive shell,
                    drawn last, can sample it and refract correctly. */}
          <group renderOrder={0}>
            <DiceCore skin={skin} />
          </group>

          {symbols}

          {/* Transparent glass shell (rolls with the die body), drawn LAST; its
                    numbers are engraved in the glass */}
          <group ref={flashRef}>
            <OrbShell skin={skin} geometry={geometry} engraving={engraving} />
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
            {/* Main die body, numbers engraved */}
            <mesh geometry={geometry}>
              <TexturedMaterial skin={skin} {...(engraving ? { engraving } : {})} />
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

        {symbols}
      </group>
    );
  },
);
VisualDie.displayName = 'VisualDie';
