import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DiceSkin } from '../dice-definitions';

// Maps a style name to the numeric id consumed by the shader.
export const STYLE_ID: Record<string, number> = {
    metallic: 1, stone: 2, magic: 3, gem: 4, dark: 5, cyber: 6,
    spectre: 7,  // signature: ethereal ghost mist
    poison: 8,   // signature: bubbling toxic acid
    eclipse: 9,  // signature: black sun with a living fire corona
    storm: 10,   // signature: storm clouds with branching lightning strikes
    magma: 11,   // signature: cracked basalt crust over living magma veins
    prism: 12,   // signature: pearlescent opal with view-dependent iridescence
    astral: 13,  // signature: a living galaxy — nebula, stars, shooting stars
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
        // CPU-driven event envelopes (storm strikes / magma surge): computed
        // in useFrame so the matching SOUND fires exactly with the visuals.
        uFlash1: { value: 0 },
        uFlash2: { value: 0 },
        uSeed1: { value: 0 },
        uSeed2: { value: 0 },
        uSurge: { value: 0 },
    }), [skin.effectType, skin.procStyle, skin.edgeColor, skin.bodyColor, skin.id]);

    const onBeforeCompile = useMemo(() => (shader: any) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.uniforms.uStyle = uniforms.uStyle;
        shader.uniforms.uAccent = uniforms.uAccent;
        shader.uniforms.uDeep = uniforms.uDeep;
        shader.uniforms.uSeed = uniforms.uSeed;
        shader.uniforms.uFlash1 = uniforms.uFlash1;
        shader.uniforms.uFlash2 = uniforms.uFlash2;
        shader.uniforms.uSeed1 = uniforms.uSeed1;
        shader.uniforms.uSeed2 = uniforms.uSeed2;
        shader.uniforms.uSurge = uniforms.uSurge;

        // Pass local position + view-space data to the fragment shader.
        // vVSphereN is the view-space "sphere normal" (direction from the die's
        // centre): it varies SMOOTHLY across flat facets, so silhouette-based
        // effects (eclipse corona) form a thin ring instead of tinting whole
        // faces like the flat face normal would.
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vLocalPos;\nvarying vec3 vVNormal;\nvarying vec3 vVPos;\nvarying vec3 vVSphereN;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLocalPos = position;`)
            .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>\nvVNormal = normalize(transformedNormal);\nvVSphereN = normalize(normalMatrix * normalize(position));`)
            // mvPosition is defined inside <project_vertex>; safe place for view pos.
            .replace('#include <project_vertex>', `#include <project_vertex>\nvVPos = mvPosition.xyz;`);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                varying vec3 vLocalPos;
                varying vec3 vVNormal;
                varying vec3 vVPos;
                varying vec3 vVSphereN;
                uniform float uTime;
                uniform float uStyle;
                uniform vec3 uAccent;
                uniform vec3 uDeep;
                uniform float uSeed;
                uniform float uFlash1;
                uniform float uFlash2;
                uniform float uSeed1;
                uniform float uSeed2;
                uniform float uSurge;
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
                    } else if (uStyle < 8.5) {
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
                    } else if (uStyle < 9.5) {
                        // ── SIGNATURE: ECLIPSE (black sun, living fire corona) ──
                        // The die is a totally-eclipsed sun: a hot-black obsidian
                        // disc ringed by a dancing corona of fire. Rare convection
                        // embers smolder under the surface; every few seconds a
                        // solar prominence erupts somewhere on the limb. All the
                        // fire is emissive so scene lighting can never wash it out.
                        vec3 nlp = normalize(vLocalPos);
                        // Silhouette factor from the SMOOTH sphere normal: 0 facing
                        // the camera -> 1 on the limb (varies across flat facets).
                        float silh = 1.0 - abs(dot(normalize(vVSphereN), normalize(-vVPos)));
                        // THIN band hugging the very edge (top-down camera spreads
                        // silh across the outer faces, so the band must be tight).
                        float band = pow(smoothstep(0.62, 0.98, silh), 1.8);

                        float theta = atan(nlp.z, nlp.x);   // used for the flare position

                        // ── Corona: SEPARATED flame tongues, not a solid band ──
                        // High-contrast turbulence carves gaps between tongues; the
                        // domain slowly rotates so the fire crawls around the limb.
                        float ra = uTime * 0.25;
                        vec3 rp = vec3(nlp.x*cos(ra) - nlp.z*sin(ra),
                                       nlp.y,
                                       nlp.x*sin(ra) + nlp.z*cos(ra));
                        float n = fbm(rp * 3.4 + vec3(0.0, uTime * 0.5, 0.0));
                        float tongues = smoothstep(0.38, 0.72, n);    // gaps between licks
                        float breath = 0.9 + 0.1 * sin(uTime * 0.8);
                        float corona = band * (0.12 + 0.88 * tongues) * breath;

                        // ── Solar prominence: an eruption on the limb every ~7s ──
                        float cycle = floor(uTime / 7.0);
                        float ph = fract(uTime / 7.0);
                        float flareAng = hash(vec3(cycle, 3.7, 9.1)) * 6.2831;
                        float dAng = abs(atan(sin(theta - flareAng), cos(theta - flareAng)));
                        float env = sin(3.1416 * clamp((ph - 0.08) / 0.42, 0.0, 1.0));
                        float flare = smoothstep(0.9, 0.0, dAng) * env
                                    * pow(smoothstep(0.3, 0.95, silh), 2.0);
                        corona = clamp(corona + flare * 1.2, 0.0, 1.0);

                        // ── Ember granulation: faint convection cells in the black ──
                        float gran = fbm(nlp * 3.2 + vec3(0.0, uTime * 0.06, 0.0));
                        float ember = smoothstep(0.60, 0.78, gran)
                                    * (0.5 + 0.5 * sin(uTime * 1.1 + gran * 20.0));

                        // ── Colour ramp: stays in FIRE hues; white only in slivers ──
                        vec3 cLow = uAccent * vec3(1.0, 0.32, 0.08);  // ember red-orange
                        vec3 cMid = uAccent;                           // solar gold
                        vec3 cHot = mix(uAccent, vec3(1.0), 0.55);    // incandescent sliver
                        vec3 fire = mix(cLow, cMid, smoothstep(0.2, 0.75, corona));
                        fire = mix(fire, cHot, smoothstep(0.93, 1.0, corona));

                        // Hot-black obsidian body: near black with the faintest warm
                        // modelling so the sphere still reads as a volume.
                        col = uDeep * 0.22 + cLow * ember * 0.05;

                        // Moderate emissive so tone-mapping never bleaches the ring.
                        emissiveAccum += fire * corona * 1.15;
                        emissiveAccum += cLow * ember * 0.08;
                    } else if (uStyle < 10.5) {
                        // ── SIGNATURE: STORM (living thundercloud) ──
                        // Churning dark storm clouds. Every couple of seconds a
                        // branching lightning bolt rips across the faces — a fresh
                        // random pattern each strike, double-flash envelope — and
                        // the cloud mass lights up from inside around it. Designed
                        // for the top-down roll camera: everything lives on the
                        // faces. Emissive-only so nothing ever washes out.
                        vec3 nlp = normalize(vLocalPos);
                        float silh = 1.0 - abs(dot(normalize(vVSphereN), normalize(-vVPos)));

                        // ── Storm clouds: slow double-warped churn ──
                        vec3 cp = p * 1.5 + vec3(uTime*0.06, -uTime*0.045, 0.0);
                        float clouds = fbm(cp + fbm(cp * 0.7) * 1.4);

                        // ── Strikes: envelopes come from the CPU (uFlash1/2 +
                        // per-strike uSeed1/2). The SAME scheduler triggers the
                        // thunder sound, so audio and visuals are perfectly synced.
                        vec3 boltCore = mix(uAccent, vec3(1.0), 0.7);   // near-white
                        float flash = 0.0;
                        for (int ch = 0; ch < 2; ch++) {
                            float env = (ch == 0) ? uFlash1 : uFlash2;
                            float sd  = (ch == 0) ? uSeed1  : uSeed2;
                            if (env > 0.004) {
                                // bolt geometry: fresh random filament per strike
                                vec3 bp = nlp * 2.8 + vec3(sd * 23.0, sd * 17.0, sd * 9.0);
                                float f1 = fbm(bp + fbm(bp * 1.8) * 1.6);
                                float bolt = smoothstep(0.035, 0.0, abs(f1 - 0.5)); // hot core
                                float glow = smoothstep(0.13, 0.0, abs(f1 - 0.5));  // halo
                                emissiveAccum += uAccent * glow * env * 1.5;
                                emissiveAccum += boltCore * bolt * env * 2.6;
                                flash = max(flash, env);
                            }
                        }

                        // ── Distant sheet-lightning shimmer between strikes ──
                        float distant = pow(fbm(cp * 0.8 + vec3(0.0, uTime * 0.3, 0.0)), 3.0);

                        // ── Compose (all emissive; diffuse stays black/unlit) ──
                        vec3 cloudCol = uDeep * (0.3 + 0.7 * clouds);
                        col = vec3(0.0);
                        // clouds: dimly visible at rest, blazing from inside on strike
                        emissiveAccum += cloudCol * (0.35 + flash * 1.1 * (0.4 + 0.6 * clouds));
                        emissiveAccum += uAccent * distant * 0.25;               // far flicker
                        // faint electric rim, charged up during a strike
                        emissiveAccum += uAccent * pow(silh, 3.0) * (0.12 + flash * 0.45);
                    } else if (uStyle < 11.5) {
                        // ── SIGNATURE: MAGMA (living lava under a cracked crust) ──
                        // Rich at rest AND animated: a dark basalt crust shattered
                        // by a bold branching network of molten cracks. The magma
                        // visibly flows inside the cracks, a heat-wave heartbeat
                        // sweeps across the die, and irregular surges set the whole
                        // network ablaze. Cracks are emissive (never wash out); the
                        // crust stays diffuse so scene light gives it rocky volume.
                        vec3 nlp = normalize(vLocalPos);

                        // ── Crack network: domain-warped ridged noise (organic
                        //    branching, same quality approach as the marble veins
                        //    but bolder) ──
                        vec3 q = vec3(fbm(p*1.1), fbm(p*1.1 + vec3(5.2,1.3,2.7)), fbm(p*1.1 + vec3(1.7,9.2,4.4)));
                        float v = abs(fbm(p*1.7 + q*2.4) - 0.5) * 2.0;
                        float crackCore = smoothstep(0.09, 0.0, v);    // white-hot filament
                        float crackGlow = smoothstep(0.30, 0.02, v);   // wide molten glow

                        // rocky crust variation (diffuse)
                        float rock = fbm(p * 3.0);

                        // ── Magma flow: brightness streams along inside the cracks ──
                        float flow = fbm(p*2.6 + vec3(0.0, -uTime*0.45, 0.0) + q*1.5);
                        float flowMod = 0.65 + 0.35*sin(flow*9.0 + uTime*1.6);

                        // ── Heartbeat: a heat wave sweeping across the die ──
                        float wave = 0.75 + 0.25*sin(dot(nlp, normalize(vec3(0.7,0.5,0.5)))*4.0 - uTime*1.8);

                        // ── Irregular surge: envelope comes from the CPU (uSurge),
                        // which also fires the synced rumble sound. ──
                        float surge = uSurge;

                        float heat = crackGlow * flowMod * wave * (1.0 + surge * 0.9);

                        // ── Colour ramp: deep red -> magma orange -> white-hot core ──
                        vec3 cLow = uAccent * vec3(1.0, 0.30, 0.08);
                        vec3 cMid = uAccent;
                        vec3 cHot = mix(uAccent, vec3(1.0), 0.5);
                        vec3 magma = mix(cLow, cMid, smoothstep(0.15, 0.7, heat));
                        magma = mix(magma, cHot, crackCore * flowMod * smoothstep(0.5, 1.0, heat));

                        // dark rocky crust (diffuse, warmed slightly near the cracks)
                        col = uDeep * (0.35 + 0.4 * rock);
                        col += cLow * crackGlow * 0.15;

                        emissiveAccum += magma * heat * 1.5;
                    } else if (uStyle < 12.5) {
                        // ── SIGNATURE: PRISM (holographic pearl opal) ──
                        // The first LIGHT signature die. A pearlescent body whose
                        // iridescent colour play depends on the VIEW ANGLE (thin-film
                        // style): as the die rolls, rainbows physically flow across
                        // the faces — the animation comes from optics, not a script.
                        // Plus twinkling opal glitter and an occasional holo glare
                        // band sweeping across, like a trading card tilted in light.
                        vec3 nlp = normalize(vLocalPos);
                        float facing = abs(dot(normalize(vVSphereN), normalize(-vVPos))); // 1 centre -> 0 limb

                        // opal patch structure, drifting very slowly
                        // (variable named "opal" because patch is a GLSL reserved word)
                        vec3 op = p * 1.6;
                        float opal = fbm(op + fbm(op * 0.8) * 1.5 + vec3(uTime * 0.05));

                        // view-dependent thin-film hue: shifts with angle AND patch
                        float hue = fract(facing * 1.6 + opal * 0.55 + uTime * 0.015);
                        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.33, 0.67)));

                        // colour play: strongest at glancing angles + in opal veins
                        float play = smoothstep(0.15, 0.85, opal) * (0.35 + 0.65 * (1.0 - facing));

                        // twinkling glitter flecks (re-seeded 8x/s for sparkle)
                        float g = noise(nlp * 40.0 + vec3(0.0, 0.0, floor(uTime * 8.0) * 0.37));
                        float glitter = pow(g, 10.0) * 3.0;   // denser + brighter sparkle

                        // ── Holo glare band sweeping across (irregular schedule) ──
                        float P = 4.3;
                        float cyc = floor(uTime / P);
                        float lc = fract(uTime / P) * P;
                        float h1 = hash(vec3(cyc, 6.1, 3.3));
                        float h2 = hash(vec3(cyc, 12.7, 9.9));
                        float fires = step(0.3, h1);                  // 70% of cycles sweep
                        float ts = (0.1 + 0.4 * h2) * P;
                        float dts = lc - ts;
                        // ("sweepOn": active is a GLSL reserved word)
                        float sweepOn = step(0.0, dts) * (1.0 - step(0.9, dts)) * fires;
                        float sweepPos = mix(-1.2, 1.2, clamp(dts / 0.9, 0.0, 1.0));
                        vec3 sweepDir = normalize(vec3(0.6, 0.75, 0.3));
                        float band = exp(-pow((dot(nlp, sweepDir) - sweepPos) * 4.5, 2.0)) * sweepOn;

                        // ── Compose: lit pearl body + emissive colour play ──
                        col = base;                                    // pearl, lit by the scene
                        col = mix(col, col * 0.9, opal * 0.35);        // soft opal shading
                        emissiveAccum += rainbow * play * 0.5;         // iridescence
                        emissiveAccum += rainbow * band * 0.85;        // holo glare sweep
                        emissiveAccum += vec3(1.0) * glitter * (0.35 + 0.65 * play); // sparkle
                    } else {
                        // ── SIGNATURE: ASTRAL (a fragment of universe) ──
                        // Deep-space black holding a slowly swirling two-hue nebula,
                        // two twinkling star layers, an occasional shooting star with
                        // a fading tail (irregular scheduler), and a view-dependent
                        // auroral veil on the limb. Fully emissive: space stays black.
                        vec3 nlp = normalize(vLocalPos);
                        float facing = abs(dot(normalize(vVSphereN), normalize(-vVPos)));

                        // ── Nebula: domain-warped clouds, slowly rotating ──
                        float raA = uTime * 0.06;
                        vec3 rpA = vec3(p.x*cos(raA) - p.z*sin(raA), p.y,
                                        p.x*sin(raA) + p.z*cos(raA));
                        vec3 q = vec3(fbm(rpA*1.3), fbm(rpA*1.3 + vec3(4.1,2.2,7.3)), fbm(rpA*1.3 + vec3(2.7,8.1,3.9)));
                        float neb1 = fbm(rpA*1.8 + q*2.5);
                        float neb2 = fbm(rpA*2.6 - q*1.8 + vec3(3.3));
                        // dark dust lanes carving the clouds
                        float dust = smoothstep(0.5, 0.75, fbm(rpA*3.2 + q));
                        float nebV = smoothstep(0.45, 0.85, neb1) * (1.0 - 0.65*dust); // violet mass
                        float nebC = smoothstep(0.50, 0.90, neb2) * (1.0 - 0.5*dust);  // cyan wisps

                        // ── Stars: two twinkling parallax layers ──
                        float s1 = pow(noise(nlp*55.0 + vec3(0.0, 0.0, floor(uTime*6.0)*0.31)), 16.0) * 2.2;
                        float s2 = pow(noise(nlp*24.0 + vec3(7.0)), 18.0)
                                 * (0.6 + 0.4*sin(uTime*3.0 + nlp.x*40.0)) * 1.6;

                        // ── Shooting star: irregular schedule, head + fading tail ──
                        float P = 6.1;
                        float cyc = floor(uTime / P);
                        float lc = fract(uTime / P) * P;
                        float h1 = hash(vec3(cyc, 4.9, 12.3));
                        float h2 = hash(vec3(cyc, 9.7, 2.1));
                        float h3 = hash(vec3(cyc, 5.5, 17.2));
                        float fires = step(0.35, h1);                 // 65% of cycles
                        float ts = (0.1 + 0.5*h2) * P;
                        float dts = lc - ts;
                        float go = step(0.0, dts) * (1.0 - step(0.6, dts)) * fires;
                        float aDir = h3 * 6.2831;
                        vec3 sDir = normalize(vec3(cos(aDir), 0.35*(h2 - 0.5), sin(aDir)));
                        vec3 pDir = normalize(cross(sDir, vec3(0.0, 1.0, 0.0)));
                        float along = dot(nlp, sDir) - mix(-1.3, 1.3, clamp(dts/0.6, 0.0, 1.0));
                        float lat = dot(nlp, pDir);
                        float head = exp(-pow(along*10.0, 2.0));
                        float tail = exp(-max(along, 0.0)*4.5) * step(0.0, along) * 0.35;
                        float streak = (head + tail) * exp(-pow(lat*4.0, 2.0)) * go;

                        // ── Auroral veil on the limb, hue drifting violet<->cyan ──
                        float rim = pow(1.0 - facing, 2.6);
                        vec3 cCyan = vec3(0.25, 0.72, 1.0);
                        vec3 rimCol = mix(uAccent, cCyan, 0.5 + 0.5*sin(uTime*0.5));

                        // ── Compose (space stays black; everything glows) ──
                        col = uDeep * 0.12;
                        emissiveAccum += uAccent * nebV * 0.6;         // violet nebula
                        emissiveAccum += cCyan * nebC * 0.45;          // cyan wisps
                        emissiveAccum += vec3(1.0, 0.98, 0.9) * s1;    // fine stars
                        emissiveAccum += vec3(0.95, 0.9, 1.0) * s2;    // bright stars
                        emissiveAccum += mix(vec3(1.0), cCyan, 0.35) * streak * 2.4; // comet
                        emissiveAccum += rimCol * rim * 0.5;           // auroral limb
                    }
                    diffuseColor.rgb = col;
                    diffuseColor.a *= procAlpha;
                }
            `)
            // Add our extra emissive contribution so glows actually emit light.
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += emissiveAccum;`);
    }, [uniforms]);

    // CPU-side event schedulers for storm strikes & magma surges: they drive
    // the shader envelopes (uFlash*/uSurge) with an unpredictable random rhythm.
    const sched = useRef({
        strikes: [
            { t0: -9, seed: 0, next: 0.8 + Math.random() * 1.5 },
            { t0: -9, seed: 0, next: 1.8 + Math.random() * 2.2 },
        ],
        surge: { t0: -9, next: 0.8 + Math.random() * 2.5 },
    });

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        uniforms.uTime.value = t;

        const style = uniforms.uStyle.value;
        if (style === 10) {
            // storm: two independent channels, random gaps -> unpredictable
            const s = sched.current.strikes;
            for (let ch = 0; ch < 2; ch++) {
                const c = s[ch];
                if (t >= c.next) {
                    c.t0 = t;
                    c.seed = Math.random();
                    c.next = t + 0.9 + Math.random() * 2.6;
                }
                // sharp attack, fast decay + weaker restrike
                const dts = t - c.t0;
                const env = dts < 0 ? 0 :
                    Math.exp(-dts * 15) + (dts > 0.13 ? Math.exp(-(dts - 0.13) * 20) * 0.6 : 0);
                if (ch === 0) { uniforms.uFlash1.value = env; uniforms.uSeed1.value = c.seed; }
                else { uniforms.uFlash2.value = env; uniforms.uSeed2.value = c.seed; }
            }
        } else if (style === 11) {
            // magma: slow swelling surges
            const c = sched.current.surge;
            if (t >= c.next) {
                c.t0 = t;
                c.next = t + 3.5 + Math.random() * 4;
            }
            const dts = t - c.t0;
            uniforms.uSurge.value = dts < 0 ? 0 : Math.exp(-dts * 2.5);
        }
    });

    const needsPhysical = skin.effectType === 'glass' || skin.effectType === 'gem';
    // "Void" signature styles render an emissive-only look (souls/mist in the
    // dark). Scene lights + envMap would wash the dark void to a pale colour, so
    // we make them effectively unlit: no reflections, fully matte, no base
    // emissive — only our procedural emissiveAccum lights them.
    const isVoid = skin.procStyle === 'spectre' || skin.procStyle === 'poison' || skin.procStyle === 'storm' || skin.procStyle === 'astral';
    // Eclipse: hot-black polished body — keep a whisper of reflection for the
    // obsidian sheen, but low enough that the emissive corona always dominates.
    const isEclipse = skin.procStyle === 'eclipse';
    const common = {
        ref: matRef as any,
        color: skin.bodyColor,
        metalness: isVoid ? 0 : isEclipse ? 0.15 : skin.metalness,
        // Higher floors kill the face-wide specular sheen that flat facets catch
        // from scene spotlights (the "one face blown out" effect).
        roughness: isVoid ? 1 : isEclipse ? Math.max(skin.roughness, 0.5) : Math.max(skin.roughness, 0.25),
        envMapIntensity: isVoid ? 0 : isEclipse ? 0.2 : Math.min(skin.envMapIntensity, 0.9),
        emissive: (isVoid || isEclipse) ? '#000000' : skin.emissive,
        emissiveIntensity: (isVoid || isEclipse) ? 1 : skin.emissiveIntensity,
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
