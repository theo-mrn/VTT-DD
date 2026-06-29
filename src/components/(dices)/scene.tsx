import React from 'react';
import { usePlane, useBox } from '@react-three/cannon';

const Wall = ({ args, position, rotation, visible = false }: any) => {
    useBox(() => ({ type: 'Static', args, position, rotation }));
    return visible ? (
        <mesh position={position} rotation={rotation}>
            <boxGeometry args={args.map((x: number) => x * 2)} />
            <meshStandardMaterial color="orange" wireframe />
        </mesh>
    ) : null;
};

export const Table = () => {
    const [ref] = usePlane(() => ({
        rotation: [-Math.PI / 2, 0, 0],
        position: [0, 0, 0],
        material: { friction: 0.4, restitution: 0.4 } // Slightly more bounce/slide than before
    }));

    return (
        <group>
            <mesh ref={ref as any} visible={false}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#1a1b26" roughness={0.5} transparent opacity={0} />
            </mesh>
            {/* Murs invisibles : Hauteur augmentée pour éviter les sauts (args=[w, h, d] => geometry=[w*2, h*2, d*2]) */}
            {/* Position Y rehaussée pour couvrir tout rebond vertical */}

            {/* Mur du Fond (Haut écran) */}
            <Wall args={[60, 50, 1]} position={[0, 25, -16]} />

            {/* Mur de Devant (Bas écran) */}
            <Wall args={[60, 50, 1]} position={[0, 25, 18]} />

            {/* Mur Gauche */}
            <Wall args={[1, 50, 60]} position={[-30, 25, 0]} />

            {/* Mur Droit */}
            <Wall args={[1, 50, 60]} position={[30, 25, 0]} />
        </group>
    );
};
