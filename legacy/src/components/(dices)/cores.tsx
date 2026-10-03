import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { DiceSkin } from './dice-definitions';

// ============================================================================
// ORB DICE — transparent glass shell + billboarded core element
// ============================================================================

// Transparent glassy shell that rolls with the die body.
// IMPORTANT: the VTT canvas is transparent (alpha:true) — there is no opaque
// background to sample, so FBO-based MeshTransmissionMaterial renders as an
// opaque blob. meshPhysicalMaterial's transmission works WITHOUT an FBO and
// gives reliable glass on a transparent canvas, lit by <Environment city>.
export const OrbShell = ({ skin, geometry }: { skin: DiceSkin, geometry: THREE.BufferGeometry }) => {
    const shellColor = skin.shellColor || skin.bodyColor;
    // Higher attenuationDistance + lower thickness => less tint, clearer core.
    const tintDistance = skin.shellTintDistance ?? 2.5;
    const thickness = skin.shellThickness ?? 1.8;

    return (
        <group>
            {/* Colored glass body */}
            <mesh geometry={geometry} renderOrder={10}>
                <meshPhysicalMaterial
                    color={shellColor}
                    metalness={0}
                    roughness={0.08}
                    transmission={1}
                    thickness={thickness}
                    ior={1.45}
                    attenuationColor={shellColor}
                    attenuationDistance={tintDistance}
                    clearcoat={1}
                    clearcoatRoughness={0.04}
                    envMapIntensity={skin.envMapIntensity}
                    transparent
                    opacity={1}
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
};

// Procedural core — a dense, contrasted element seen through the glass.
// Dark saturated center + luminous fresnel rim (not a blown-out white lamp).
export const GlowCore = ({ skin }: { skin: DiceSkin }) => {
    const coreRef = useRef<THREE.Mesh>(null);
    const ringRef = useRef<THREE.Mesh>(null);
    const color = new THREE.Color(skin.coreColor || skin.edgeColor);
    const color2 = new THREE.Color(skin.coreColor2 || skin.bodyColor);
    const dark = color2.clone().multiplyScalar(0.18);

    // Fresnel material: dark at center, glowing at grazing angles.
    const coreMat = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                uDark: { value: dark },
                uGlow: { value: color },
                uTime: { value: 0 },
            },
            vertexShader: /* glsl */ `
                varying vec3 vNormal;
                varying vec3 vView;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    vNormal = normalize(normalMatrix * normal);
                    vView = normalize(-mv.xyz);
                    gl_Position = projectionMatrix * mv;
                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 uDark;
                uniform vec3 uGlow;
                uniform float uTime;
                varying vec3 vNormal;
                varying vec3 vView;
                void main() {
                    float f = 1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0);
                    float rim = pow(f, 2.2);
                    float pulse = 0.85 + 0.15 * sin(uTime * 2.0);
                    vec3 col = mix(uDark, uGlow, rim * pulse);
                    // small hot core highlight
                    col += uGlow * pow(rim, 6.0) * 1.4;
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
        });
    }, []);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        coreMat.uniforms.uTime.value = t;
        const pulse = 1 + Math.sin(t * 2) * 0.04;
        if (coreRef.current) coreRef.current.scale.setScalar(pulse);
        if (ringRef.current) {
            ringRef.current.scale.setScalar(pulse);
            (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 2) * 0.12;
        }
    });

    return (
        <group>
            {/* Dense fresnel core sphere */}
            <mesh ref={coreRef} material={coreMat} renderOrder={0}>
                <sphereGeometry args={[0.6, 48, 48]} />
            </mesh>
            {/* Luminous ring around the core (billboard plane) */}
            <mesh ref={ringRef} renderOrder={0}>
                <ringGeometry args={[0.62, 0.78, 64]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.5}
                    blending={THREE.AdditiveBlending}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>
            {/* Light cast into the surrounding glass so the orb feels lit from within */}
            <pointLight color={color} intensity={1.0} distance={4} decay={2} />
        </group>
    );
};

// Living eye core — a billboarded disc with a fully procedural eye:
// veined sclera, striated colored iris, deep pupil, specular glint, wandering
// gaze and occasional blink. All in one shader for richness without assets.
export const EyeCore = ({ skin }: { skin: DiceSkin }) => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const iris = new THREE.Color(skin.coreColor || '#1fa2ff');
    const irisDark = iris.clone().multiplyScalar(0.35);
    const sclera = new THREE.Color(skin.coreColor2 || '#eef4ff');

    const material = useMemo(() => new THREE.ShaderMaterial({
        // Opaque + depth-writing so the eye disc occludes the far-side face
        // numbers that would otherwise show through it. Pixels outside the
        // circle are discarded, so only the disc writes depth.
        transparent: false,
        depthWrite: true,
        depthTest: true,
        uniforms: {
            uTime: { value: 0 },
            uIris: { value: iris },
            uIrisDark: { value: irisDark },
            uSclera: { value: sclera },
            uGaze: { value: new THREE.Vector2(0, 0) },
            uBlink: { value: 0.5 }, // 0.5 = fully open
        },
        vertexShader: /* glsl */ `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */ `
            precision highp float;
            varying vec2 vUv;
            uniform float uTime;
            uniform vec3 uIris;
            uniform vec3 uIrisDark;
            uniform vec3 uSclera;
            uniform vec2 uGaze;
            uniform float uBlink;

            float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

            void main() {
                vec2 c = vUv - 0.5;
                float r = length(c) * 2.0;          // 0..1 across the disc radius
                if (r > 1.0) discard;               // round eyeball
                float ang = atan(c.y, c.x);

                // ---- Sclera (white) with subtle red veins ----
                vec3 col = uSclera;
                float vein = smoothstep(0.6, 1.0, sin(ang * 22.0 + sin(ang*7.0)*2.0) * 0.5 + 0.5);
                vein *= smoothstep(0.55, 1.0, r);
                col = mix(col, vec3(0.85, 0.2, 0.2), vein * 0.35);
                // soft shading toward the rim
                col *= mix(1.0, 0.6, smoothstep(0.7, 1.0, r));

                // ---- Iris ----
                vec2 gc = c - uGaze * 0.18;          // gaze offset
                float ir = length(gc) * 2.0;
                float irisR = 0.62;
                float pupilR = 0.26 + 0.04 * sin(uTime * 1.3);

                if (ir < irisR) {
                    float gang = atan(gc.y, gc.x);
                    // radial striations
                    float fib = 0.5 + 0.5 * sin(gang * 64.0 + hash(vec2(floor(gang*10.0),0.0))*6.28);
                    float radial = smoothstep(0.0, irisR, ir);
                    vec3 irisCol = mix(uIris, uIrisDark, radial);
                    irisCol = mix(irisCol, uIris * 1.4, fib * (1.0 - radial) * 0.6);
                    // dark limbal ring
                    irisCol *= mix(0.4, 1.0, smoothstep(irisR, irisR - 0.12, ir));
                    col = irisCol;

                    // ---- Pupil ----
                    if (ir < pupilR) {
                        float p = smoothstep(pupilR, pupilR - 0.04, ir);
                        col = mix(col, vec3(0.0), p);
                    }
                }

                // ---- Specular glint ----
                vec2 g = c - vec2(-0.18, 0.2);
                float glint = smoothstep(0.12, 0.0, length(g));
                col += glint * 0.9;
                float glint2 = smoothstep(0.05, 0.0, length(c - vec2(0.12, -0.1)));
                col += glint2 * 0.4;

                // ---- Eyelids ----
                // uBlink: 0.5 = fully open, 0 = fully closed. Lids close in from
                // top and bottom toward the center as uBlink shrinks.
                float open = uBlink;                 // half-height of the open gap
                float dy = abs(vUv.y - 0.5);
                float lidMask = smoothstep(open, open - 0.04, dy); // 1 inside gap, 0 under lid
                col = mix(vec3(0.05,0.02,0.02), col, lidMask);

                gl_FragColor = vec4(col, 1.0);
            }
        `,
    }), []);

    useFrame((state) => {
        const m = matRef.current;
        if (!m) return;
        const t = state.clock.elapsedTime;
        m.uniforms.uTime.value = t;
        // Wandering gaze (slow Lissajous + tiny saccades)
        const gx = Math.sin(t * 0.7) * 0.6 + Math.sin(t * 2.3) * 0.1;
        const gy = Math.cos(t * 0.9) * 0.5 + Math.cos(t * 3.1) * 0.1;
        m.uniforms.uGaze.value.set(gx, gy);
        // Eye stays open permanently (no blink).
    });

    // Keep matRef pointing at our shader material for per-frame uniform updates.
    matRef.current = material;

    return (
        <group>
            <mesh renderOrder={0} material={material}>
                <circleGeometry args={[0.72, 64]} />
            </mesh>
            <pointLight color={skin.coreColor || '#1fa2ff'} intensity={0.8} distance={4} decay={2} />
        </group>
    );
};

// Loaded .glb/.gltf core. Auto-centers and scales the model to fit inside the
// orb, with a gentle idle spin/bob so it feels alive. Lit from within.
const ModelCore = ({ skin, url }: { skin: DiceSkin, url: string }) => {
    const bobRef = useRef<THREE.Group>(null);
    const spinRef = useRef<THREE.Group>(null);
    const { scene } = useGLTF(url);

    // Clone, recenter on origin, and normalize to a target diameter (~1.3 units).
    const normalized = useMemo(() => {
        const obj = SkeletonUtils.clone(scene) as THREE.Group;
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const target = (skin.coreScale ?? 1) * 2.1;
        const s = target / maxDim;
        obj.position.sub(center.multiplyScalar(s));
        obj.scale.setScalar(s);
        return obj;
    }, [scene]);

    const spin = skin.coreSpin ?? 0;

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        // Subtle floating bob on the outer group (keeps the presentation tilt).
        if (bobRef.current) bobRef.current.position.y = Math.sin(t * 1.2) * 0.06;
        // Idle spin around the model's own up axis, so an inclined ring keeps
        // showing its face (never edge-on) while rotating.
        if (spinRef.current && spin) spinRef.current.rotation.y = t * spin;
    });

    const rot = skin.coreRotation ?? [0, 0, 0];

    return (
        <group>
            {/* outer = presentation tilt + bob ; inner = idle spin */}
            <group ref={bobRef} rotation={rot as [number, number, number]}>
                <group ref={spinRef}>
                    <primitive object={normalized} />
                </group>
            </group>
            {/* Dedicated rig so the model is always well-lit inside the glass,
                regardless of where the die rolls. */}
            <ambientLight intensity={1.4} />
            <directionalLight position={[2, 3, 4]} intensity={2.5} />
            <directionalLight position={[-3, 1, 2]} intensity={1.5} color={skin.coreColor || '#ffffff'} />
            <pointLight position={[0, 0, 2]} color={'#ffffff'} intensity={2} distance={6} decay={2} />
        </group>
    );
};

// The core element, billboarded so it always faces the camera and never rolls
// with the die. It lives inside the rolling die group, so we counter-rotate it
// every frame using the camera's world quaternion.
export const DiceCore = ({ skin }: { skin: DiceSkin }) => {
    const groupRef = useRef<THREE.Group>(null);
    const { camera } = useThree();
    const scale = skin.coreScale ?? 1;

    useFrame(() => {
        if (!groupRef.current) return;
        // Cancel the die's rotation and align to the camera (billboard).
        const parent = groupRef.current.parent;
        if (parent) {
            const parentQuat = parent.getWorldQuaternion(new THREE.Quaternion());
            // Desired world orientation = camera orientation; local = parent⁻¹ * camera
            const local = parentQuat.clone().invert().multiply(camera.quaternion);
            groupRef.current.quaternion.copy(local);
        } else {
            groupRef.current.quaternion.copy(camera.quaternion);
        }
    });

    return (
        <group ref={groupRef} scale={scale}>
            {skin.coreType === 'model' && skin.coreModelUrl ? (
                <React.Suspense fallback={<GlowCore skin={skin} />}>
                    <ModelCore skin={skin} url={skin.coreModelUrl} />
                </React.Suspense>
            ) : skin.coreType === 'eye' ? (
                <EyeCore skin={skin} />
            ) : (
                <GlowCore skin={skin} />
            )}
        </group>
    );
};
