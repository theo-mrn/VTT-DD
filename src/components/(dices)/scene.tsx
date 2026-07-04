import React, { useEffect } from 'react';
import { usePlane, useBox } from '@react-three/cannon';
import { useThree } from '@react-three/fiber';

// Shared camera constants for the dice scene. The walls AND the spawn logic
// (throw.tsx) both derive the playable area from these, so dice always settle
// fully on screen regardless of the window's aspect ratio.
export const DICE_CAM_HEIGHT = 40;
export const DICE_CAM_FOV = 45;

// Half-extents of the ground area visible by the top-down dice camera.
// halfZ is fixed by fov+height; halfX scales with the viewport aspect ratio
// (this is why hardcoded walls broke on narrow/portrait windows).
export const visibleHalfExtents = (aspect: number) => {
    const halfZ = Math.tan((DICE_CAM_FOV / 2) * Math.PI / 180) * DICE_CAM_HEIGHT;
    return { halfX: halfZ * aspect, halfZ };
};

// Invisible static wall whose position follows the viewport (repositioned via
// the cannon api on resize — static bodies can be moved through the api).
const Wall = ({ args, position }: {
    args: [number, number, number],
    position: [number, number, number],
}) => {
    const [, api] = useBox(() => ({ type: 'Static', args, position }));
    useEffect(() => {
        api.position.set(position[0], position[1], position[2]);
    }, [api, position[0], position[1], position[2]]);
    return null;
};

export const Table = () => {
    const { size } = useThree();
    const [ref] = usePlane(() => ({
        rotation: [-Math.PI / 2, 0, 0],
        position: [0, 0, 0],
        material: { friction: 0.4, restitution: 0.4 } // Slightly more bounce/slide than before
    }));

    // Fit the arena to what the camera actually sees (with a small margin so a
    // die resting against a wall is still fully visible).
    const { halfX, halfZ } = visibleHalfExtents(size.width / Math.max(size.height, 1));
    const margin = 0.6;      // inner face inset from the visible edge
    const halfThick = 1;     // wall half-thickness (args)
    const wx = Math.max(halfX - margin, 4) + halfThick;
    const wz = Math.max(halfZ - margin, 4) + halfThick;

    return (
        <group>
            <mesh ref={ref as any} visible={false}>
                <planeGeometry args={[200, 200]} />
                <meshStandardMaterial color="#1a1b26" roughness={0.5} transparent opacity={0} />
            </mesh>
            {/* Murs invisibles, hauteur large pour couvrir tous les rebonds.
                Positions dérivées du viewport -> l'arène = l'écran. */}
            <Wall args={[80, 50, halfThick]} position={[0, 25, -wz]} />
            <Wall args={[80, 50, halfThick]} position={[0, 25, wz]} />
            <Wall args={[halfThick, 50, 80]} position={[-wx, 25, 0]} />
            <Wall args={[halfThick, 50, 80]} position={[wx, 25, 0]} />
        </group>
    );
};
