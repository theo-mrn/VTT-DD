import React from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { DiceSkin } from '../dice-definitions';
import { ProceduralMaterial } from './procedural-material';

// Loads a texture if specified in the skin, otherwise falls back to the
// procedural material driven by the skin's effect type.
export const TexturedMaterial = ({ skin }: { skin: DiceSkin }) => {
    const hasTexture = Boolean(skin.textureMap);

    // No texture → procedural matter based on the skin's effect type.
    if (!hasTexture) {
        return <ProceduralMaterial skin={skin} />;
    }

    return <TextureMaterialLoader skin={skin} />;
};

// Component that actually loads the texture. useTexture suspends, so it is
// wrapped in Suspense with a solid-color fallback.
const TextureMaterialLoaderInner = ({ skin }: { skin: DiceSkin }) => {
    const texture = useTexture(skin.textureMap as string);

    if (texture) {
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
        />
    );
};

const TextureMaterialLoader = ({ skin }: { skin: DiceSkin }) => {
    return (
        <React.Suspense fallback={
            <meshStandardMaterial
                color={skin.bodyColor}
                metalness={skin.metalness}
                roughness={skin.roughness}
                transparent={skin.opacity < 1}
                opacity={skin.opacity}
            />
        }>
            <TextureMaterialLoaderInner skin={skin} />
        </React.Suspense>
    );
};
