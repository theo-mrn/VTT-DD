import React from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { DiceSkin } from '../dice-definitions';
import { ENGRAVING_NORMAL_SCALE, injectInk } from '../engraving';
import { ProceduralMaterial, type EngravingProps } from './procedural-material';

// Loads a texture if specified in the skin, otherwise falls back to the
// procedural material driven by the skin's effect type.
export const TexturedMaterial = ({
  skin,
  engraving,
}: {
  skin: DiceSkin;
  engraving?: EngravingProps;
}) => {
  const hasTexture = Boolean(skin.textureMap);

  // No texture → procedural matter based on the skin's effect type.
  if (!hasTexture) {
    return <ProceduralMaterial skin={skin} {...(engraving ? { engraving } : {})} />;
  }

  return <TextureMaterialLoader skin={skin} engraving={engraving} />;
};

/** Propriétés de gravure d'un matériau standard (chiffres gravés, `engraving.ts`). */
const engraved = (engraving?: EngravingProps) =>
  engraving
    ? {
        normalMap: engraving.map,
        normalScale: ENGRAVING_NORMAL_SCALE,
        onBeforeCompile: (shader: THREE.WebGLProgramParametersWithUniforms) =>
          injectInk(shader, engraving.ink),
      }
    : {};

// Component that actually loads the texture. useTexture suspends, so it is
// wrapped in Suspense with a solid-color fallback.
// Textures are cached by drei and shared by every die of a skin: configure each
// one ONCE. Setting `needsUpdate` on every render re-uploaded the whole image
// to the GPU each time a die re-rendered.
const configured = new WeakSet<THREE.Texture>();

const TextureMaterialLoaderInner = ({
  skin,
  engraving,
}: {
  skin: DiceSkin;
  engraving?: EngravingProps;
}) => {
  const texture = useTexture(skin.textureMap as string);

  if (texture && !configured.has(texture)) {
    configured.add(texture);
    // With our planar per-face UVs, one texture tile fills each face.
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.center.set(0.5, 0.5);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }

  return (
    <meshStandardMaterial
      map={texture}
      color={skin.tintTexture ? skin.bodyColor : '#ffffff'}
      metalness={skin.metalness}
      roughness={skin.roughness}
      envMapIntensity={skin.envMapIntensity}
      emissive={skin.emissive}
      emissiveIntensity={skin.emissiveIntensity}
      transparent={skin.opacity < 1}
      opacity={skin.opacity}
      {...engraved(engraving)}
    />
  );
};

const TextureMaterialLoader = ({
  skin,
  engraving,
}: {
  skin: DiceSkin;
  engraving?: EngravingProps;
}) => {
  return (
    <React.Suspense
      fallback={
        <meshStandardMaterial
          color={skin.bodyColor}
          metalness={skin.metalness}
          roughness={skin.roughness}
          transparent={skin.opacity < 1}
          opacity={skin.opacity}
          {...engraved(engraving)}
        />
      }
    >
      <TextureMaterialLoaderInner skin={skin} engraving={engraving} />
    </React.Suspense>
  );
};
