import React, { useRef } from 'react';
import * as THREE from 'three';
import { DiceSkin, CriticalType } from './dice-definitions';
import { getCachedGeometry, getDieValue } from './geometry';
import { TexturedMaterial } from './materials/textured-material';
import { CriticalEffect, ShatteredDie } from './effects/critical';
import { DiceCore, OrbShell } from './cores';
import { FaceNumber } from './face-number';

// Visual Die Component (Pure Rendering). The parent handles positioning /
// rotation via a Group, so this just renders the mesh + effects at 0,0,0.
// Reusable for both the physics die and previews (no physics).
export const VisualDie = React.forwardRef(({ type, skin, isShattered, critType, simple = false }: {
    type: string,
    skin: DiceSkin,
    isShattered: boolean,
    critType: CriticalType,
    simple?: boolean
}, ref: any) => {
    const { trueFaces, geometry } = getCachedGeometry(type);

    // ── ORB SKINS ──────────────────────────────────────────────
    // Transparent shell that rolls + a billboarded core that stays facing the camera.
    if (skin.effectType === 'orb' && !isShattered) {
        return (
            <group>
                {critType && <CriticalEffect type={critType} onComplete={() => { }} />}

                {/* Core + numbers render FIRST (low renderOrder) so the transmissive
                    shell, drawn last, can sample them and refract correctly. */}

                {/* Billboarded core element (never rotates with the die) */}
                <group renderOrder={0}>
                    <DiceCore skin={skin} />
                </group>

                {/* Face numbers — opacity driven per-frame by face orientation:
                    top faces (toward the camera) stay readable, others fade out. */}
                {!simple && trueFaces.map((face, index) => (
                    <FaceNumber
                        key={index}
                        face={face}
                        value={getDieValue(type, index)}
                        scale={type === 'd20' ? 0.45 : 0.7}
                        color={'#ffffff'}
                        outlineColor={skin.shadowColor}
                        radius={0.92}
                        maxOpacity={0.85}
                        outlineWidth={0}
                    />
                ))}

                {/* Transparent glass shell (rolls with the die body), drawn LAST */}
                <OrbShell skin={skin} geometry={geometry} />
            </group>
        );
    }

    return (
        <group>
            {/* Critical hit/fail effect */}
            {critType && <CriticalEffect type={critType} onComplete={() => { }} />}

            {/* Shattered die fragments */}
            {isShattered && <ShatteredDie color={skin.bodyColor} onComplete={() => { }} />}

            {/* Inner glow effect */}
            {!isShattered && skin.innerGlow && (
                <pointLight
                    position={[0, 0, 0]}
                    color={skin.innerGlowColor}
                    intensity={skin.innerGlowIntensity}
                    distance={5}
                    decay={2}
                />
            )}

            {/* Main die body */}
            {!isShattered && (
                <mesh geometry={geometry}>
                    <TexturedMaterial skin={skin} />
                </mesh>
            )}

            {/* Rim lighting effect */}
            {!isShattered && !simple && skin.rimLight && (
                <mesh geometry={geometry} scale={[1.02, 1.02, 1.02]}>
                    <meshStandardMaterial
                        color={skin.rimLightColor}
                        emissive={skin.rimLightColor}
                        emissiveIntensity={0.5}
                        metalness={0}
                        roughness={1}
                        transparent
                        opacity={0.25}
                        side={THREE.BackSide}
                    />
                </mesh>
            )}

            {/* Face numbers — fade out on faces pointing away from the camera */}
            {!isShattered && !simple && trueFaces.map((face, index) => (
                <FaceNumber
                    key={index}
                    face={face}
                    value={getDieValue(type, index)}
                    scale={type === 'd20' ? 0.45 : 0.7}
                    color={skin.textColor}
                    outlineColor={skin.shadowColor}
                    radius={1.01}
                    maxOpacity={1}
                    outlineWidth={0.06}
                />
            ))}
        </group>
    );
});
VisualDie.displayName = 'VisualDie';
