import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DiceSkin } from '../dice-definitions';

// Maps a style name to the numeric id consumed by the shader.
export const STYLE_ID: Record<string, number> = {
    metallic: 1, stone: 2, magic: 3, gem: 4, dark: 5, cyber: 6,
    spectre: 7,  // signature: ethereal ghost mist
    poison: 8,   // signature: bubbling toxic acid
};

// Default style derived from effectType (a skin can override via procStyle).
export const EFFECT_STYLE: Record<string, number> = {
    metallic: 1,   // brushed / swirled metal
    stone: 2,      // veined marble / rough stone
    magic: 3,      // pulsing lava / energy
    gem: 4,        // faceted crystal depth
    dark: 5,       // smoky obsidian
    cyber: 6,      // grid / circuitry
    organic: 2,
    celestial: 3,
    cursed: 5,
};

export const resolveStyleId = (skin: DiceSkin): number => {
    if (skin.procStyle && STYLE_ID[skin.procStyle] != null) return STYLE_ID[skin.procStyle];
    return EFFECT_STYLE[skin.effectType] ?? 2;
};

// Deterministic seed in [0,1) from a skin id, so each skin gets a unique
// procedural variation even when sharing the same effect style.
export const skinSeed = (id: string) => {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
};

// Procedural material for solid-color dice (no textureMap). Extends
// meshStandardMaterial (keeps full PBR + envMap) and injects per-effect
// procedural matter so flat colors gain veins, brushing, lava, etc.
export const ProceduralMaterial = ({ skin }: { skin: DiceSkin }) => {
    const matRef = useRef<THREE.MeshStandardMaterial>(null);
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uStyle: { value: resolveStyleId(skin) },
        uAccent: { value: new THREE.Color(skin.edgeColor) },
        uDeep: { value: new THREE.Color(skin.bodyColor).multiplyScalar(0.45) },
        // Per-skin seed so two skins of the same effect look different.
        uSeed: { value: skinSeed(skin.id) },
    }), [skin.effectType, skin.procStyle, skin.edgeColor, skin.bodyColor, skin.id]);

    const onBeforeCompile = useMemo(() => (shader: any) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.uniforms.uStyle = uniforms.uStyle;
        shader.uniforms.uAccent = uniforms.uAccent;
        shader.uniforms.uDeep = uniforms.uDeep;
        shader.uniforms.uSeed = uniforms.uSeed;

        // Pass local position + view-space data to the fragment shader.
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vLocalPos;\nvarying vec3 vVNormal;\nvarying vec3 vVPos;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLocalPos = position;`)
            .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>\nvVNormal = normalize(transformedNormal);`)
            // mvPosition is defined inside <project_vertex>; safe place for view pos.
            .replace('#include <project_vertex>', `#include <project_vertex>\nvVPos = mvPosition.xyz;`);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                varying vec3 vLocalPos;
                varying vec3 vVNormal;
                varying vec3 vVPos;
                uniform float uTime;
                uniform float uStyle;
                uniform vec3 uAccent;
                uniform vec3 uDeep;
                uniform float uSeed;
                float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
                float noise(vec3 x){
                    vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
                    return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
                }
                float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5;} return v; }
                // Extra emissive accumulated by signature styles (consumed later).
                vec3 emissiveAccum;
            `)
            .replace('#include <color_fragment>', `#include <color_fragment>
                {
                    // Per-skin variation: offset, rotate and scale-jitter the
                    // noise domain so two skins of the same effect differ.
                    float sx = uSeed * 43.0;
                    vec3 seedOff = vec3(sx, sx * 1.7, sx * 0.6);
                    float ca = cos(uSeed * 6.2831), sa = sin(uSeed * 6.2831);
                    float scl = 1.6 * (0.8 + uSeed * 0.6);
                    vec3 p = vLocalPos * scl + seedOff;
                    p.xz = mat2(ca, -sa, sa, ca) * p.xz; // rotate pattern orientation
                    vec3 base = diffuseColor.rgb;
                    float procAlpha = 1.0;
                    emissiveAccum = vec3(0.0);
                    vec3 col = base;
                    if (uStyle < 1.5) {
                        // metallic: fine brushed swirl
                        float b = fbm(p * vec3(8.0, 1.0, 8.0));
                        col = mix(uDeep, base, 0.5 + 0.5*b);
                        col += uAccent * pow(b, 4.0) * 0.4;
                    } else if (uStyle < 2.5) {
                        // ── LUXURY MARBLE ──
                        // Domain-warped turbulence makes organic serpentine veins;
                        // deep coloured body, lighter marbled patches, bright veins.
                        vec3 q = vec3(fbm(p), fbm(p + vec3(5.2, 1.3, 2.7)), fbm(p + vec3(1.7, 9.2, 4.4)));
                        vec3 r = vec3(fbm(p + 4.0*q + vec3(1.7,9.2,0.0)),
                                      fbm(p + 4.0*q + vec3(8.3,2.8,0.0)),
                                      fbm(p + 4.0*q + vec3(3.1,5.6,7.2)));
                        float marble = fbm(p + 4.0*r);            // soft cloudy base
                        // serpentine vein lines (ridged turbulence)
                        float t = abs(fbm(p * 1.8 + r * 2.5) - 0.5) * 2.0;
                        float vein = smoothstep(0.06, 0.0, t);    // very thin sharp veins
                        float vein2 = smoothstep(0.16, 0.02, t);  // tight halo around veins

                        // body: deep colour -> lighter marbled patches
                        vec3 light = mix(base, vec3(1.0), 0.4);   // pale marble patches
                        col = mix(uDeep, light, smoothstep(0.3, 0.75, marble));
                        // metallic gold veins (slim and discreet, not flooding)
                        vec3 gold = uAccent;
                        col = mix(col, gold * 0.7, vein2 * 0.35);  // subtle vein halo
                        col = mix(col, gold, vein * 0.9);          // bright thin vein core
                        // subtle polished sheen variation
                        col *= 0.92 + 0.16 * marble;
                    } else if (uStyle < 3.5) {
                        // magic/lava: cracked glow that pulses
                        float n = fbm(p * 2.0 + uTime * 0.15);
                        float crack = smoothstep(0.45, 0.5, n) - smoothstep(0.5, 0.55, n);
                        col = mix(uDeep, base, n);
                        float glow = crack * (0.7 + 0.3*sin(uTime*3.0));
                        col += uAccent * glow * 2.5;
                    } else if (uStyle < 4.5) {
                        // gem: internal faceted depth
                        float f = fbm(p * 3.0);
                        float facet = abs(fract(f * 4.0) - 0.5);
                        col = mix(uDeep, base, 0.4 + f*0.6);
                        col += uAccent * smoothstep(0.1, 0.0, facet) * 0.5;
                    } else if (uStyle < 5.5) {
                        // dark: obsidian — smoky black base + glassy violet veins
                        float n = fbm(p * 2.5);
                        col = mix(uDeep, base, n*n);
                        // marbled veins of accent colour swirling through the glass
                        float vein = abs(fbm(p * 3.2 + n * 1.5) - 0.5) * 2.0;
                        vein = smoothstep(0.22, 0.0, vein);
                        col = mix(col, uAccent, vein * 0.85);
                        // soft inner glow highlights
                        col += uAccent * pow(n, 5.0) * 0.9;
                    } else if (uStyle < 6.5) {
                        // cyber: grid lines
                        vec3 g = abs(fract(p * 2.0) - 0.5);
                        float line = smoothstep(0.46, 0.5, max(max(g.x,g.y),g.z));
                        col = mix(base, uAccent, line * (0.4 + 0.3*sin(uTime*2.0)));
                    } else if (uStyle < 7.5) {
                        // ── SIGNATURE: SPECTRE (dark living mist) ──
                        // Dark green fog that churns and swirls internally. Built from
                        // an animated double domain-warp so the mist visibly moves
                        // and folds inside the die. Emissive-only (the material is
                        // set unlit) so the hue stays pure green, never washing out.
                        vec3 lp = vLocalPos / 1.8;                  // stable shell coords ~[-1,1]
                        float fres = pow(1.0 - max(dot(normalize(vVNormal), normalize(-vVPos)), 0.0), 1.6);

                        float t = uTime * 0.65;          // faster, more alive
                        // First warp: large moving currents (bigger amplitude).
                        vec3 q = vec3(
                            fbm(lp * 1.6 + vec3(t, t*0.6, -t*0.4)),
                            fbm(lp * 1.6 + vec3(2.3 - t*0.5, 1.7, t*0.3)),
                            fbm(lp * 1.6 + vec3(-t*0.35, 4.1, t*0.45))
                        );
                        // Second warp: finer swirls riding on the currents.
                        vec3 r = vec3(
                            fbm(lp * 2.4 + q * 3.0 + t*0.9),
                            fbm(lp * 2.4 + q * 3.0 + 3.3 - t*0.7),
                            fbm(lp * 2.4 + q * 3.0 + 6.1 + t*0.4)
                        );
                        float smoke = fbm(lp * 2.0 + r * 3.0);       // stronger churn [0..1]

                        // Sharpen into wispy dense clumps vs thin gaps.
                        float dense = smoothstep(0.45, 0.8, smoke);
                        // bright filament veins where the smoke folds
                        float veins = smoothstep(0.035, 0.0, abs(smoke - 0.6));

                        // Emissive-only, kept DARK: mostly black void with only the
                        // densest smoke + thin veins faintly glowing green.
                        vec3 hue = normalize(uAccent + 1e-4);
                        float lum =
                              0.02                       // almost-black base
                            + dense * 0.35               // dim smoke clumps
                            + veins * 0.45               // thin glowing veins
                            + fres  * 0.35;              // subtle ethereal rim
                        lum = clamp(lum, 0.0, 1.0);
                        col = vec3(0.0);                 // unlit diffuse
                        emissiveAccum += hue * lum;

                        procAlpha = clamp(0.25 + dense*0.45 + veins*0.45 + fres*0.35, 0.0, 1.0);
                    } else {
                        // ── SIGNATURE: POISON (bubbling toxic acid) ──
                        // A churning acid surface: rising viscous bubbles, sickly
                        // glow concentrated in the cell cores, drifting scum.
                        vec3 bp = p * 2.2 + vec3(0.0, -uTime * 0.5, 0.0); // bubbles rise
                        // cellular bubble field (worley-ish via ridged fbm)
                        float cell = fbm(bp);
                        float bubbles = 1.0 - abs(fbm(bp * 1.6 + cell) - 0.5) * 2.0;
                        bubbles = pow(clamp(bubbles, 0.0, 1.0), 2.5);
                        // viscous swirling scum on top
                        float scum = fbm(p * 1.4 + vec3(uTime * 0.1, 0.0, uTime * 0.07));
                        float boil = 0.6 + 0.4 * sin(uTime * 3.0 + cell * 8.0);
                        // body: dark sludge -> toxic green
                        col = mix(uDeep * 0.6, base, smoothstep(0.25, 0.7, scum));
                        // glowing bubble cores
                        float core = smoothstep(0.6, 0.95, bubbles);
                        col = mix(col, uAccent, core * boil);
                        col += uAccent * pow(bubbles, 4.0) * 1.8 * boil; // hot acid glow
                        // rim sheen of slime
                        float fres = pow(1.0 - max(dot(normalize(vVNormal), normalize(-vVPos)), 0.0), 3.0);
                        col += uAccent * fres * 0.7;
                        emissiveAccum += uAccent * core * boil * 1.2;
                    }
                    diffuseColor.rgb = col;
                    diffuseColor.a *= procAlpha;
                }
            `)
            // Add our extra emissive contribution so glows actually emit light.
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += emissiveAccum;`);
    }, [uniforms]);

    useFrame((state) => {
        uniforms.uTime.value = state.clock.elapsedTime;
    });

    const needsPhysical = skin.effectType === 'glass' || skin.effectType === 'gem';
    // "Void" signature styles render an emissive-only look (souls/mist in the
    // dark). Scene lights + envMap would wash the dark void to a pale colour, so
    // we make them effectively unlit: no reflections, fully matte, no base
    // emissive — only our procedural emissiveAccum lights them.
    const isVoid = skin.procStyle === 'spectre' || skin.procStyle === 'poison';
    const common = {
        ref: matRef as any,
        color: skin.bodyColor,
        metalness: isVoid ? 0 : skin.metalness,
        roughness: isVoid ? 1 : Math.max(skin.roughness, 0.18), // avoid mirror-like blown highlights
        envMapIntensity: isVoid ? 0 : Math.min(skin.envMapIntensity, 1.2), // soften blown reflections
        emissive: isVoid ? '#000000' : skin.emissive,
        emissiveIntensity: isVoid ? 1 : skin.emissiveIntensity,
        transparent: skin.opacity < 1,
        opacity: skin.opacity,
        onBeforeCompile,
        // Unique per skin id so no two skins share a compiled program by mistake.
        customProgramCacheKey: () => 'proc-' + skin.id,
    };

    if (needsPhysical) {
        return <meshPhysicalMaterial {...common} clearcoat={0.8} clearcoatRoughness={0.15} />;
    }
    return <meshStandardMaterial {...common} />;
};
