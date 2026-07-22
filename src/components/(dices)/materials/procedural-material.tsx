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
    ocean: 14,   // signature: living deep sea — caustics, foam, bioluminescent flash
    scale: 15,   // signature: overlapping dragon scales with organic sheen
    bismuth: 16, // signature: stepped crystal terraces with full-spectrum iridescence
    // ── STAR WARS signature styles ──────────────────────────────
    kyber: 17,      // living kyber crystal: white-hot core + humming plasma blade on the edges
    deathstar: 18,  // imperial battle-station steel: panel greebles, equatorial trench, charging superlaser
    sith: 19,       // dark-side obsidian: crawling red Force lightning + corrupted energy veins
    hyperspace: 20, // jump to lightspeed: streaking starlines through a blue-white tunnel
    lightside: 21,  // light-side serenity: slow drifting Force currents + a gentle passing glow wave
    forcespirit: 22,// the Force die: white pearl holding light & dark currents in balance
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

// ============================================================================
// PER-STYLE GLSL — one SMALL shader program per style, shared by every skin.
// ----------------------------------------------------------------------------
// This used to be a single mega-shader holding all 16 styles behind runtime
// `if (uStyle < …)` branches, with `customProgramCacheKey` set per SKIN — so
// every one of ~50 procedural skins compiled its own copy of the full ~600
// line branching monster. On Mac/Metal that's merely wasteful; on Windows,
// Chrome's ANGLE layer translates GLSL to HLSL and feeds it to the D3D
// compiler, which is notoriously pathological on huge branchy shaders — a
// single compile can stall for seconds, Windows' driver watchdog (TDR) kicks
// in, and the whole Chrome GPU process dies with no JS error. That was the
// "any procedural die = whole-browser crash" bug.
//
// Now each style's pattern code is injected ALONE (16 small programs max),
// and `customProgramCacheKey` is keyed per STYLE so all skins of a style
// share one compiled program — per-skin looks (colours, seed) already flow
// through uniforms, so nothing changes visually.
// ============================================================================

const STYLE_GLSL: Record<number, string> = {
    1: /* metallic: fine brushed swirl */ `
        float b = fbm(p * vec3(8.0, 1.0, 8.0));
        col = mix(uDeep, base, 0.5 + 0.5*b);
        col += uAccent * pow(b, 4.0) * 0.4;
    `,
    2: /* ── LUXURY MARBLE ── */ `
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
    `,
    3: /* magic/lava: cracked glow that pulses */ `
        float n = fbm(p * 2.0 + uTime * 0.15);
        float crack = smoothstep(0.45, 0.5, n) - smoothstep(0.5, 0.55, n);
        col = mix(uDeep, base, n);
        float glow = crack * (0.7 + 0.3*sin(uTime*3.0));
        col += uAccent * glow * 2.5;
    `,
    4: /* gem: internal faceted depth */ `
        float f = fbm(p * 3.0);
        float facet = abs(fract(f * 4.0) - 0.5);
        col = mix(uDeep, base, 0.4 + f*0.6);
        col += uAccent * smoothstep(0.1, 0.0, facet) * 0.5;
    `,
    5: /* dark: obsidian — smoky black base + glassy violet veins */ `
        float n = fbm(p * 2.5);
        col = mix(uDeep, base, n*n);
        // marbled veins of accent colour swirling through the glass
        float vein = abs(fbm(p * 3.2 + n * 1.5) - 0.5) * 2.0;
        vein = smoothstep(0.22, 0.0, vein);
        col = mix(col, uAccent, vein * 0.85);
        // soft inner glow highlights
        col += uAccent * pow(n, 5.0) * 0.9;
    `,
    6: /* cyber: grid lines */ `
        vec3 g = abs(fract(p * 2.0) - 0.5);
        float line = smoothstep(0.46, 0.5, max(max(g.x,g.y),g.z));
        col = mix(base, uAccent, line * (0.4 + 0.3*sin(uTime*2.0)));
    `,
    7: /* ── SIGNATURE: SPECTRE (dark living mist) ── */ `
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
    `,
    8: /* ── SIGNATURE: POISON (bubbling toxic acid) ── */ `
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
    `,
    9: /* ── SIGNATURE: ECLIPSE (black sun, living fire corona) ── */ `
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
    `,
    10: /* ── SIGNATURE: STORM (living thundercloud) ── */ `
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
    `,
    11: /* ── SIGNATURE: MAGMA (living lava under a cracked crust) ── */ `
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
    `,
    12: /* ── SIGNATURE: PRISM (holographic pearl opal) ── */ `
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
    `,
    13: /* ── SIGNATURE: ASTRAL (a fragment of universe) ── */ `
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
    `,
    14: /* ── SIGNATURE: OCEAN (a living deep sea, sealed in the die) ── */ `
        // Reads as WATER first: a clean blue gradient from deep body
        // colour up to sunlit azure, built the same way the marble
        // style builds its base (soft fbm patches, no dark multiply
        // stacking). On top: slow drifting caustic light patches,
        // rising bubbles, and an occasional soft bioluminescent
        // pulse. Every layer ADDS light in blue/cyan hues only —
        // nothing pushes toward grey/white/black.
        vec3 nlp = normalize(vLocalPos);
        float facing = abs(dot(normalize(vVSphereN), normalize(-vVPos)));

        // ── Base water gradient: deep body colour -> sunlit azure,
        // driven by a single soft fbm patch field (marble-style). ──
        vec3 wp = p * 1.1 + vec3(0.0, -uTime * 0.04, 0.0);
        float body = fbm(wp);
        vec3 sunlit = mix(base, vec3(0.45, 0.75, 1.0), 0.55);
        col = mix(base * 0.55, sunlit, smoothstep(0.3, 0.85, body));

        // ── Caustics: soft overlapping light patches that drift and
        // scroll — real sunlight-through-waves colour (bright blue
        // -> pale cyan), never neutral grey/white. ──
        vec3 cp1 = nlp * 2.6 + vec3(uTime * 0.18, uTime * 0.11, 0.0);
        vec3 cp2 = nlp * 2.6 + vec3(-uTime * 0.13, uTime * 0.16, 1.7);
        float n1 = fbm(cp1);
        float n2 = fbm(cp2 + vec3(4.1, 0.0, 2.3));
        float caustics = smoothstep(0.35, 0.9, n1) * smoothstep(0.35, 0.9, n2);

        // ── Rising bubbles: small bright cellular glints drifting up
        // in Y, popping (fading) near the top of their cycle. ──
        vec3 bp = nlp * 9.0 + vec3(0.0, -uTime * 0.9, 0.0);
        float bc = fbm(bp);
        float bubble = pow(clamp(1.0 - abs(fbm(bp * 1.3 + bc) - 0.5) * 2.0, 0.0, 1.0), 10.0);
        float rise = fract(uTime * 0.15 + bc);       // per-bubble life 0..1
        float pop = smoothstep(0.0, 0.15, rise) * smoothstep(1.0, 0.75, rise);
        bubble *= pop * 2.5;

        // ── Bioluminescent pulse: TWO incommensurate channels so the
        // bloom rhythm never feels scripted (same technique as the
        // storm strikes), each blooming from its own random point and
        // expanding/fading as a soft sphere of cyan-blue light. ──
        vec3 bioCol = vec3(0.35, 0.8, 1.0);
        float bio = 0.0;
        {
            float P1 = 4.7;
            float cyc1 = floor(uTime / P1);
            float lc1 = fract(uTime / P1) * P1;
            float ha = hash(vec3(cyc1, 2.3, 8.8));
            float hb = hash(vec3(cyc1, 5.1, 1.4));
            float hc = hash(vec3(cyc1, 9.6, 3.7));
            vec3 origin1 = normalize(vec3(ha - 0.5, hb - 0.5, hc - 0.5) + 0.001);
            float dts1 = lc1 - (0.2 + 0.5 * ha) * P1;
            float env1 = exp(-abs(dts1) * 3.2) * step(0.2, ha + 0.001);
            bio += smoothstep(0.55, 1.0, dot(nlp, origin1)) * env1;
        }
        {
            float P2 = 7.3;
            float cyc2 = floor(uTime / P2);
            float lc2 = fract(uTime / P2) * P2;
            float ha = hash(vec3(cyc2, 6.6, 4.2));
            float hb = hash(vec3(cyc2, 1.9, 7.7));
            float hc = hash(vec3(cyc2, 3.3, 9.1));
            vec3 origin2 = normalize(vec3(ha - 0.5, hb - 0.5, hc - 0.5) + 0.001);
            float dts2 = lc2 - (0.15 + 0.6 * hb) * P2;
            float env2 = exp(-abs(dts2) * 2.8) * step(0.25, hb + 0.001);
            bio += smoothstep(0.5, 1.0, dot(nlp, origin2)) * env2;
        }
        bio = clamp(bio, 0.0, 1.4);

        // ── Fresnel sheen: wet, glassy rim like a light film of
        // water clinging to the surface, tinted azure (not white). ──
        float fres = pow(1.0 - facing, 2.2);

        // ── Compose: everything ADDS blue/cyan light onto the lit
        // water gradient — no grey, no white, no dark multiply. ──
        emissiveAccum += mix(uAccent, vec3(0.6, 0.95, 1.0), 0.5) * caustics * 0.5; // caustic light
        emissiveAccum += mix(uAccent, vec3(1.0), 0.3) * bubble * 0.5;               // bubble glints
        emissiveAccum += bioCol * bio * 0.6;                                        // bioluminescent bloom
        emissiveAccum += uAccent * fres * 0.35;                                     // wet rim sheen
    `,
    15: /* ── SIGNATURE: SCALE (overlapping dragon scales) ── */ `
        // Real scutes are BIG (a handful per face, not dozens),
        // wide ovals with a rounded point at the bottom, laid out
        // in staggered horizontal rows that overlap downward — like
        // roof shingles. Built explicitly as rows (not an isotropic
        // Voronoi field, which reads as cracked tile at any scale)
        // so the "shingle" structure is unmistakable.
        vec3 nlp = normalize(vLocalPos);
        float facing = abs(dot(normalize(vVSphereN), normalize(-vVPos)));

        // Use vLocalPos directly (NOT the shared 'p' variable,
        // which is randomly rotated per-skin — fine for isotropic
        // noise but wrong for an oriented row pattern like
        // shingles) at an explicit scale tuned so MANY small
        // scales cover a facet (a real hide, not a few big scutes).
        vec2 sp = vLocalPos.xy * 9.0 + vLocalPos.zy * 2.0;

        // Row height sets how many scale-rows fit a face; scales
        // are noticeably wider than tall (real scute proportions).
        float rowH = 1.0;
        float colW = 1.35;

        float rowF = sp.y / rowH;
        float row = floor(rowF);
        // Stagger every other row by half a scale width — the
        // shingle offset that makes neighbouring rows interlock.
        float stagger = mod(row, 2.0) * 0.5;
        float colF = sp.x / colW + stagger;
        float col_ = floor(colF);

        // Local coords within this scale's cell, centered 0..1.
        vec2 localUv = vec2(fract(colF) - 0.5, fract(rowF) - 0.5);
        vec2 cellId = vec2(col_, row);
        float jrand = hash(vec3(cellId, 3.7));

        // Scale SHAPE: wide oval body tapering to a rounded point
        // at the bottom (like a real scute), built from an
        // anisotropic distance field biased downward. Kept as a
        // SHARP-edged shape (tight smoothstep band) so individual
        // scales are clearly legible, not a soft blur.
        vec2 d2 = localUv;
        d2.y += 0.18; // pull the "point" reference down
        float taper = mix(1.5, 0.6, clamp(d2.y + 0.5, 0.0, 1.0)); // narrower near the bottom point
        float dist = length(vec2(d2.x * taper, d2.y));

        float border = smoothstep(0.5, 0.42, dist);         // 1 deep inside the scale -> 0 at its rim (tight seam)
        float highlight = smoothstep(0.28, 0.0, dist);      // fake bump, brightest at the scale's own center
        // The row ABOVE overlaps down onto the top of this row
        // (a real shingle look): darken/shadow the upper part of
        // each scale where the row above would cast over it.
        float overlapShadow = smoothstep(-0.05, 0.3, -d2.y) * border;

        // Per-scale colour variation: deep emerald <-> darker olive.
        vec3 scaleDeep = mix(uDeep, uDeep * 1.3, jrand);
        vec3 scaleLit = mix(base, mix(base, uAccent, 0.22), jrand);
        col = mix(scaleDeep * 0.7, scaleLit, border);
        col = mix(col, mix(scaleLit, vec3(1.0), 0.18), highlight * border * 0.6); // raised sheen bump
        col *= 1.0 - overlapShadow * 0.4;    // shadow from the overlapping row above
        col *= 0.35 + 0.65 * border;          // sunken dark seam between scales

        // Slow organic sheen ripple: a very soft moving band of
        // extra brightness, like light catching a hide as it
        // breathes — subtle, never a flash or glow.
        float ripple = sin(dot(nlp, normalize(vec3(0.4, 1.0, 0.3))) * 3.0 - uTime * 0.4);
        float sheen = smoothstep(0.7, 1.0, ripple) * border;

        float fres = pow(1.0 - facing, 2.4);

        emissiveAccum += mix(uAccent, vec3(0.9, 1.0, 0.85), 0.4) * sheen * 0.35; // sheen ripple
        emissiveAccum += uAccent * fres * 0.12;                                   // faint rim, no fire glow
    `,
    16: /* ── SIGNATURE: BISMUTH (full-spectrum thin-film sheen) ── */ `
        // No hard geometric pattern (that read as noisy/aliased at
        // any scale tried) — just a smooth, fluid rainbow gradient
        // over a polished metal, exactly like Prism's proven
        // technique but pushed to FULL saturation across the whole
        // spectrum rather than a soft pastel play. The colour drifts
        // slowly with a low-frequency fbm patch plus view angle, so
        // it reads as a real oxide-film sheen rolling across the
        // die, never a busy or grainy texture.
        vec3 nlp = normalize(vLocalPos);
        float facing = abs(dot(normalize(vVSphereN), normalize(-vVPos)));

        // ("swirl" instead of "patch" — patch is a GLSL reserved word)
        vec3 op = p * 0.9;
        float swirl = fbm(op + fbm(op * 0.6) * 1.2 + vec3(uTime * 0.04));

        // Hue driven by view angle (thin-film optics) + the slow
        // swirl drift — smooth and continuous, no bands/steps.
        float hue = fract(facing * 1.3 + swirl * 0.8 + uTime * 0.02);
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (hue + vec3(0.0, 0.333, 0.667)));
        float lum = dot(rainbow, vec3(0.299, 0.587, 0.114));
        vec3 vividRainbow = mix(vec3(lum), rainbow, 1.7); // push to full saturation

        // ── Base metal: near-neutral silver so the rainbow film
        // reads as sitting ON TOP of a polished metal. ──
        vec3 metal = mix(vec3(0.55, 0.56, 0.6), base, 0.25);
        col = metal;

        // Fresnel-boosted iridescence: strongest at grazing
        // angles (thin-film physics), present but softer straight-on.
        float filmStrength = 0.5 + 0.5 * pow(1.0 - facing, 1.4);
        col = mix(col, col * vividRainbow * 1.4, filmStrength);
    `,
    17: /* ── SIGNATURE: KYBER (living lightsaber crystal) ── */ `
        // A kyber crystal fused with an ignited plasma blade. The body
        // is a faceted crystal with a white-hot core throbbing at its
        // centre; the SILHOUETTE burns with a humming energy blade in
        // the saber's colour (uAccent), a razor-thin incandescent line
        // wrapped in a soft plasma glow — exactly the look of a blade
        // edge-on. The hum modulates brightness; every few seconds the
        // blade surges (a "kling" ignite/clash flare). All emissive so
        // the plasma never washes out under scene light.
        vec3 nlp = normalize(vLocalPos);
        // Smooth sphere silhouette (0 facing camera -> 1 on the limb):
        // varies across flat facets so the blade wraps the whole rim.
        float silh = 1.0 - abs(dot(normalize(vVSphereN), normalize(-vVPos)));
        float facing = 1.0 - silh;

        // ── Crystalline body: faceted internal depth (gem-style) with
        // fibrous kyber striations running through it. ──
        float f = fbm(p * 3.2);
        float facet = abs(fract(f * 4.0) - 0.5);
        // long fibrous strands along one axis (the crystal's grain)
        float fiber = fbm(vec3(vLocalPos.x * 2.0, vLocalPos.y * 14.0, vLocalPos.z * 2.0) + f);
        vec3 crystal = mix(uDeep, base, 0.35 + f * 0.65);
        crystal += uAccent * smoothstep(0.09, 0.0, facet) * 0.4;      // inner facet flashes
        crystal += uAccent * smoothstep(0.62, 0.85, fiber) * 0.25;    // crystal fibres

        // ── White-hot core: a bright pulsing heart at crystal centre. ──
        float coreDist = length(vLocalPos);
        float heart = 0.85 + 0.15 * sin(uTime * 4.0);
        float core = smoothstep(0.55, 0.0, coreDist) * heart;

        // ── Plasma blade on the limb: a thin white-hot line inside a
        // wider coloured glow that hugs the silhouette. ──
        float bladeCore = pow(smoothstep(0.72, 1.0, silh), 2.2);   // hot inner line
        float bladeGlow = pow(smoothstep(0.30, 1.0, silh), 1.6);   // soft plasma halo
        // Audible hum: fast shimmer riding a slow breath.
        float hum = 0.82 + 0.10 * sin(uTime * 22.0) + 0.08 * sin(uTime * 5.0);

        // ── Ignite / clash surge: CPU envelope (uSurge) fires a blade
        // flare AND the synced saber sound. ──
        float surge = uSurge;

        vec3 bladeCol = uAccent;
        vec3 hotCol = mix(uAccent, vec3(1.0), 0.75);   // near-white plasma spine

        col = crystal;
        emissiveAccum += mix(uAccent, vec3(1.0), 0.6) * core * 0.9;              // white-hot heart
        emissiveAccum += bladeCol * bladeGlow * hum * (0.55 + surge * 0.9);      // coloured plasma glow
        emissiveAccum += hotCol * bladeCore * hum * (1.6 + surge * 1.4);         // incandescent blade spine
        emissiveAccum += uAccent * facing * 0.06;                                // faint body self-glow
    `,
    18: /* ── SIGNATURE: DEATH STAR (imperial battle station) ── */ `
        // A moon-sized battle station in cold imperial grey. Each face
        // is covered in recessed panel greebles (a rectangular tech
        // grid with darker seams), a dark equatorial trench cuts around
        // the middle, and the concave superlaser dish charges every few
        // seconds — a green energy well spiralling inward, then a beam
        // flash. Body is LIT metal (scene reflections read as "steel");
        // only the superlaser is emissive.
        vec3 nlp = normalize(vLocalPos);
        float facing = abs(dot(normalize(vVSphereN), normalize(-vVPos)));

        // ── Panel greebles: nested rectangular grid, coarse blocks
        // subdivided into finer plating, with dark recessed seams. ──
        vec2 gp = vLocalPos.xy * 5.0 + vLocalPos.zy * 1.3;
        vec2 g1 = abs(fract(gp) - 0.5);
        float seam1 = smoothstep(0.5, 0.44, max(g1.x, g1.y));        // 1 inside panel -> 0 on seam
        vec2 g2 = abs(fract(gp * 3.0) - 0.5);
        float seam2 = smoothstep(0.5, 0.40, max(g2.x, g2.y));        // finer plating
        // per-panel brightness jitter so plating reads as many parts
        float panelId = hash(vec3(floor(gp), 1.0));
        float plating = (0.78 + 0.22 * panelId) * (0.55 + 0.45 * seam1) * (0.75 + 0.25 * seam2);
        // scattered tiny hull spec lights
        float lights = step(0.985, hash(vec3(floor(gp * 6.0), 2.0)));

        // grey hull, modelled by the plating grid
        col = base * plating;
        col = mix(col, uDeep, (1.0 - seam1) * 0.5);                  // dark recessed seams

        // ── Equatorial trench: a dark band around the station. ──
        float trench = smoothstep(0.05, 0.02, abs(nlp.y));
        col = mix(col, uDeep * 0.5, trench * 0.85);

        // ── Superlaser dish: a concave well on one hemisphere. Its
        // charge cycle (green spiral -> beam flash) is driven by the
        // CPU envelope uSurge so the sound stays synced. ──
        vec3 dishDir = normalize(vec3(0.55, 0.62, 0.55));
        float d = dot(nlp, dishDir);
        float dish = smoothstep(0.80, 0.995, d);                    // the round dish area
        float dishRim = smoothstep(0.80, 0.86, d) * (1.0 - smoothstep(0.90, 0.995, d));
        col = mix(col, uDeep * 0.35, dish * 0.7);                   // dark recessed dish
        col = mix(col, base * 1.2, dishRim * 0.5);                  // bright dish rim

        // charge: eight focusing emitters glow, energy spirals to centre
        float charge = uSurge;
        float ang = atan(dot(nlp, normalize(cross(dishDir, vec3(0.0,1.0,0.0)))),
                         dot(nlp, normalize(cross(cross(dishDir, vec3(0.0,1.0,0.0)), dishDir))));
        float emitters = smoothstep(0.86, 0.90, d) * (0.5 + 0.5 * cos(ang * 8.0));
        float spiral = dish * (0.5 + 0.5 * sin(ang * 3.0 - (1.0 - d) * 40.0 - uTime * 6.0));
        vec3 laserCol = uAccent;                                    // superlaser green
        emissiveAccum += laserCol * emitters * charge * 1.4;        // focusing emitters
        emissiveAccum += laserCol * spiral * dish * charge * 0.8;   // inward energy spiral
        emissiveAccum += mix(laserCol, vec3(1.0), 0.5) * smoothstep(0.90, 0.6, 1.0 - d) * dish * pow(charge, 3.0) * 2.5; // core beam flash
    `,
    19: /* ── SIGNATURE: SITH (dark side of the Force) ── */ `
        // Corrupted obsidian bleeding dark-side energy. A near-black
        // volcanic-glass body veined with dull crimson; every couple of
        // seconds a jagged branch of Force lightning crawls across the
        // faces (fresh random filament per strike, CPU-scheduled +
        // synced to the crackle sound), lighting the veins from within.
        // A slow malevolent pulse breathes red light through the body.
        // Emissive-only lightning so the crimson never washes out.
        vec3 nlp = normalize(vLocalPos);
        float silh = 1.0 - abs(dot(normalize(vVSphereN), normalize(-vVPos)));

        // ── Obsidian body with crawling corrupted veins ──
        float n = fbm(p * 2.6);
        col = mix(uDeep * 0.5, base * 0.5, n * n);                  // dark glass
        // branching crimson veins (ridged, slowly writhing)
        float v = abs(fbm(p * 3.0 + n * 1.5 + vec3(0.0, uTime * 0.08, 0.0)) - 0.5) * 2.0;
        float vein = smoothstep(0.14, 0.0, v);
        float veinGlow = smoothstep(0.34, 0.02, v);
        // malevolent breathing pulse
        float pulse = 0.55 + 0.45 * sin(uTime * 1.3);
        emissiveAccum += uAccent * veinGlow * (0.18 + 0.22 * pulse);   // veins smolder + breathe
        emissiveAccum += uAccent * vein * (0.5 + 0.5 * pulse);         // bright vein cores

        // ── Force lightning: two independent CPU-scheduled channels
        // (uFlash1/2 + uSeed1/2), same tech as the storm bolts. Each
        // strike is a fresh jagged crimson filament that also lights up
        // the surrounding glass. ──
        vec3 boltHot = mix(uAccent, vec3(1.0), 0.55);   // white-hot crimson core
        float flash = 0.0;
        for (int ch = 0; ch < 2; ch++) {
            float env = (ch == 0) ? uFlash1 : uFlash2;
            float sd  = (ch == 0) ? uSeed1  : uSeed2;
            if (env > 0.004) {
                vec3 bp = nlp * 3.0 + vec3(sd * 23.0, sd * 17.0, sd * 9.0);
                float f1 = fbm(bp + fbm(bp * 1.8) * 1.7);
                float bolt = smoothstep(0.03, 0.0, abs(f1 - 0.5));   // hot arc core
                float glow = smoothstep(0.14, 0.0, abs(f1 - 0.5));   // arc halo
                emissiveAccum += uAccent * glow * env * 1.4;
                emissiveAccum += boltHot * bolt * env * 2.8;
                flash = max(flash, env);
            }
        }
        // whole body flares faintly with each strike + dark rim halo
        emissiveAccum += uAccent * veinGlow * flash * 1.2;
        emissiveAccum += uAccent * pow(silh, 2.5) * (0.15 + 0.5 * flash + 0.15 * pulse);
    `,
    20: /* ── SIGNATURE: HYPERSPACE (jump to lightspeed) ── */ `
        // The view out a cockpit at lightspeed: stars stretched into
        // long blue-white streaks radiating outward, rushing through a
        // dark tunnel that brightens toward its centre. Between jumps
        // the starlines flow steadily; the CPU fires an occasional
        // "jump" flash (uSurge) where everything blooms white and the
        // streaks stretch. Fully emissive over near-black space.
        vec3 nlp = normalize(vLocalPos);
        float facing = abs(dot(normalize(vVSphereN), normalize(-vVPos)));

        // Radial coordinate from the local pole (the tunnel axis is Y):
        // r = distance from axis, so streaks run along it and converge
        // toward the poles like a real lightspeed tunnel.
        float r = length(nlp.xz);
        float ang = atan(nlp.z, nlp.x);

        // ── Starlines: many angular streaks scrolling outward. Each
        // angular bucket is a star; its brightness is a sharp ridge in
        // the radial direction that scrolls, so stars appear to rush. ──
        float speed = 1.6;
        float jump = uSurge;                       // 0 normally, ->1 on a jump
        float stretch = 1.0 + jump * 3.0;          // streaks lengthen on jump
        // hash per angular star lane
        float lane = floor(ang * 24.0);
        float laneRand = hash(vec3(lane, 3.1, 7.7));
        float laneRand2 = hash(vec3(lane, 9.3, 1.5));
        // scrolling position of this star along the radius
        float phase = fract(r * (2.2 / stretch) - uTime * speed * (0.6 + laneRand) - laneRand2);
        float streak = pow(phase, 6.0 * stretch);           // sharp comet head, long tail toward centre
        // fade streaks near the pole cores + taper at the outer rim
        streak *= smoothstep(0.05, 0.25, r) * smoothstep(1.0, 0.6, r);
        // fine angular thinness so lanes read as separate lines
        float lineW = 0.5 + 0.5 * cos(ang * 24.0 * 2.0);
        streak *= pow(lineW, 3.0);

        // ── Tunnel glow: bright core at the poles fading out. ──
        float tunnel = smoothstep(0.6, 0.0, r);
        float centreBloom = pow(tunnel, 2.0) * (0.6 + 0.4 * sin(uTime * 3.0));

        // ── Colour: cool blue tunnel -> white-hot streaks. ──
        vec3 blue = uAccent;                                // saber/tunnel blue
        vec3 white = mix(uAccent, vec3(1.0), 0.85);

        col = uDeep * 0.1;                                   // near-black space
        emissiveAccum += blue * tunnel * (0.35 + jump * 0.8);              // tunnel wash
        emissiveAccum += white * centreBloom * (0.7 + jump * 1.5);         // bright vanishing point
        emissiveAccum += mix(blue, white, 0.6) * streak * (1.6 + jump * 2.5); // rushing starlines
        emissiveAccum += white * jump * pow(facing, 2.0) * 1.2;            // whole-view flash on jump
    `,
    21: /* ── SIGNATURE: LIGHT SIDE (serene living Force) ── */ `
        // The calm counterpart to the Sith die: NO lightning, no jolts.
        // Luminous Force currents drift slowly and fold through a clear
        // blue crystal, a soft aura breathes at a resting pace, and
        // every so often a gentle wave of light glides across the die
        // (a slow swell driven by uSurge, never a flash). Everything
        // moves slowly and additively — pure serenity. Emissive over a
        // dark body so the currents glow softly.
        vec3 nlp = normalize(vLocalPos);
        float facing = abs(dot(normalize(vVSphereN), normalize(-vVPos)));

        // ── Drifting Force currents: a slow double domain-warp so the
        // light visibly flows and folds, but calmly (low speeds). ──
        float t = uTime * 0.16;                       // slow, meditative
        vec3 lp = vLocalPos * 1.4;
        vec3 q = vec3(
            fbm(lp + vec3(t, t * 0.5, -t * 0.3)),
            fbm(lp + vec3(2.1 - t * 0.3, 1.4, t * 0.25)),
            fbm(lp + vec3(-t * 0.2, 3.7, t * 0.35))
        );
        vec3 r = vec3(
            fbm(lp * 1.7 + q * 2.0 + t * 0.4),
            fbm(lp * 1.7 + q * 2.0 + 3.1 - t * 0.3),
            fbm(lp * 1.7 + q * 2.0 + 5.7 + t * 0.2)
        );
        float flow = fbm(lp * 1.6 + r * 2.2);         // soft flowing field [0..1]

        // Gentle luminous filaments where the currents fold — soft and
        // wide (not sharp arcs), so they read as ribbons of light.
        float ribbon = smoothstep(0.30, 0.02, abs(flow - 0.55));
        float glow = smoothstep(0.45, 0.9, flow);     // broad soft luminous mass

        // ── Resting breath: the whole aura swells slowly in and out. ──
        float breath = 0.7 + 0.3 * sin(uTime * 0.9);

        // ── Passing light wave: a soft band of extra brightness that
        // glides across the die on the uSurge swell — a slow caress,
        // not a strike. ──
        float wave = uSurge;
        vec3 waveDir = normalize(vec3(0.4, 0.9, 0.3));
        float band = smoothstep(0.75, 1.0, sin(dot(nlp, waveDir) * 2.2 - uTime * 0.8) * 0.5 + 0.5);
        float sweep = band * wave;

        // ── Colour: serene azure with a soft white heart to the light. ──
        vec3 soft = mix(uAccent, vec3(1.0), 0.35);    // gentle near-white light
        vec3 halo = pow(1.0 - facing, 2.0) * uAccent; // calm rim aura

        col = uDeep * 0.5;                             // deep-blue crystal body, dim
        emissiveAccum += uAccent * glow * (0.30 + 0.20 * breath);   // broad soft mass
        emissiveAccum += soft * ribbon * (0.45 + 0.25 * breath);    // luminous ribbons
        emissiveAccum += halo * (0.35 + 0.20 * breath);             // breathing rim aura
        emissiveAccum += soft * sweep * 0.7;                        // gentle passing wave
    `,
    22: /* ── SIGNATURE: FORCE SPIRIT (balance of light & dark) ── */ `
        // The Force die: NOT a flat white ball. A dark energy core over
        // which two luminous currents — radiant light and living shadow
        // — VISIBLY spiral around a slowly-turning axis, braiding past
        // each other like a double helix of Force energy. Bright, sharp,
        // constantly moving: thin white-gold filaments coil one way, ink
        // shadow bands coil the other, they cross at a glowing seam, and
        // a bright heart pulses at the centre. Emissive over a near-black
        // body so the light CLASHES against the dark instead of washing
        // everything to milky white.
        vec3 nlp = normalize(vLocalPos);
        float facing = abs(dot(normalize(vVSphereN), normalize(-vVPos)));

        // ── Rotating helix frame. Pick a spin axis that precesses so the
        // whole braid slowly tumbles; measure each point's angle around
        // it and its height along it. ──
        float t = uTime;
        vec3 axis = normalize(vec3(sin(t * 0.25) * 0.5, 1.0, cos(t * 0.25) * 0.5));
        vec3 up = abs(axis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 e1 = normalize(cross(axis, up));
        vec3 e2 = cross(axis, e1);
        float ang = atan(dot(nlp, e2), dot(nlp, e1));   // -PI..PI around the axis
        float h = dot(nlp, axis);                        // -1..1 along the axis

        // ── The helix: phase winds with BOTH angle and height, and
        // scrolls in time so the currents visibly travel around the die.
        // A little fbm warp keeps it organic (energy, not a barber pole). ──
        float warp = fbm(nlp * 3.0 + vec3(0.0, t * 0.4, 0.0)) - 0.5;
        float helix = ang * 2.0 + h * 6.0 + t * 1.6 + warp * 3.0;
        float sLight = sin(helix);            // light current wave
        float sDark  = sin(helix + 3.14159);  // dark current, half-turn opposite

        // Sharp thin strands: narrow bright bands at the wave crests.
        float lightStrand = pow(max(sLight, 0.0), 6.0);
        float darkStrand  = pow(max(sDark,  0.0), 5.0);

        // Fine secondary filaments riding on the strands for detail.
        float fil = pow(max(sin(helix * 3.0 - t * 2.0), 0.0), 12.0) * lightStrand;

        // ── Balance breathing: which current is brighter slowly trades
        // back and forth, but they never fully vanish (equilibrium). ──
        float tide = 0.5 + 0.5 * sin(t * 0.5);
        float lightAmt = mix(0.45, 1.0, tide);
        float darkAmt  = mix(0.45, 1.0, 1.0 - tide);

        // ── Glowing seam where the two currents cross (|sLight| small),
        // a bright ribbon that snakes around the die. ──
        float seam = smoothstep(0.12, 0.0, abs(sLight)) * smoothstep(0.12, 0.0, abs(sDark));

        // ── Pulsing heart at the centre + a uSurge balance flare. ──
        float coreDist = length(vLocalPos);
        float heart = smoothstep(0.5, 0.0, coreDist) * (0.6 + 0.4 * sin(t * 2.2));
        float pulse = uSurge;

        // ── Colours: radiant white-gold vs. deep ink shadow. ──
        vec3 lightCol = mix(uAccent, vec3(1.0), 0.6);   // white-gold
        vec3 darkCol  = vec3(0.35, 0.30, 0.55);         // cold violet-ink (still visible, not pure black)
        float fres = pow(1.0 - facing, 2.2);

        // Near-black energy body so the currents pop.
        col = vec3(0.015, 0.015, 0.03);

        emissiveAccum += lightCol * lightStrand * lightAmt * 1.7;        // bright light helix
        emissiveAccum += lightCol * fil * lightAmt * 2.2;               // sparkling fine filaments
        emissiveAccum += darkCol  * darkStrand  * darkAmt  * 0.9;        // shadow helix (dim, cold)
        emissiveAccum += vec3(1.0) * seam * (0.8 + 0.6 * sin(t * 3.0));  // glowing crossing seam
        emissiveAccum += mix(lightCol, vec3(1.0), 0.5) * heart * 0.9;    // pulsing heart
        emissiveAccum += lightCol * fres * (0.3 + 0.3 * tide);          // luminous rim
        emissiveAccum += vec3(1.0) * pulse * (0.5 + 0.5 * lightStrand) * 1.6; // balance flare
    `,
};

// Shared helpers + varyings + uniforms, identical for every style.
const COMMON_FRAGMENT_HEADER = `
    varying vec3 vLocalPos;
    varying vec3 vVNormal;
    varying vec3 vVPos;
    varying vec3 vVSphereN;
    uniform float uTime;
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
    // 4 octaves (was 5): the 5th sits at ~3% amplitude and sub-pixel
    // frequency at die scale — invisible, but ~20% of every fbm call's cost,
    // and the heavy styles evaluate fbm dozens of times per pixel.
    float fbm(vec3 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.0; a*=0.5;} return v; }
    // Extra emissive accumulated by signature styles (consumed later).
    vec3 emissiveAccum;
`;

// Procedural material for solid-color dice (no textureMap). Extends
// meshStandardMaterial (keeps full PBR + envMap) and injects per-effect
// procedural matter so flat colors gain veins, brushing, lava, etc.
export const ProceduralMaterial = ({ skin }: { skin: DiceSkin }) => {
    const matRef = useRef<THREE.MeshStandardMaterial>(null);
    const styleId = resolveStyleId(skin);
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
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
            .replace('#include <common>', `#include <common>${COMMON_FRAGMENT_HEADER}`)
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
                    ${STYLE_GLSL[styleId] ?? STYLE_GLSL[2]}
                    diffuseColor.rgb = col;
                    diffuseColor.a *= procAlpha;
                }
            `)
            // Add our extra emissive contribution so glows actually emit light.
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += emissiveAccum;`);
    }, [uniforms, styleId]);

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

        // STORM (10) and SITH (19) both use the two-channel strike scheduler
        // for their branching lightning. Sith strikes are a touch rarer so
        // each crackle lands with weight. (The Light-side die is style 21 and
        // deliberately has NO lightning — it uses the gentle surge below.)
        if (styleId === 10 || styleId === 19) {
            const s = sched.current.strikes;
            const isSith = styleId === 19;
            for (let ch = 0; ch < 2; ch++) {
                const c = s[ch];
                if (t >= c.next) {
                    c.t0 = t;
                    c.seed = Math.random();
                    c.next = t + (isSith ? 1.4 : 0.9) + Math.random() * (isSith ? 3.2 : 2.6);
                }
                // sharp attack, fast decay + weaker restrike
                const dts = t - c.t0;
                const env = dts < 0 ? 0 :
                    Math.exp(-dts * 15) + (dts > 0.13 ? Math.exp(-(dts - 0.13) * 20) * 0.6 : 0);
                if (ch === 0) { uniforms.uFlash1.value = env; uniforms.uSeed1.value = c.seed; }
                else { uniforms.uFlash2.value = env; uniforms.uSeed2.value = c.seed; }
            }
        } else if (styleId === 11) {
            // magma: slow swelling surges
            const c = sched.current.surge;
            if (t >= c.next) {
                c.t0 = t;
                c.next = t + 3.5 + Math.random() * 4;
            }
            const dts = t - c.t0;
            uniforms.uSurge.value = dts < 0 ? 0 : Math.exp(-dts * 2.5);
        } else if (styleId === 17) {
            // kyber: quick saber ignite/clash flare — sharp rise, fast decay.
            const c = sched.current.surge;
            if (t >= c.next) {
                c.t0 = t;
                c.next = t + 2.5 + Math.random() * 3.5;
            }
            const dts = t - c.t0;
            uniforms.uSurge.value = dts < 0 ? 0 : Math.exp(-dts * 6.0);
        } else if (styleId === 18) {
            // death star: long superlaser charge, then a fast beam
            // discharge. Envelope swells over ~1.6s then snaps to a
            // bright peak at fire time before collapsing.
            const c = sched.current.surge;
            if (t >= c.next) {
                c.t0 = t;
                c.next = t + 4.5 + Math.random() * 4;
            }
            const dts = t - c.t0;
            // rise 0->1 over 1.6s (charge), hold the peak briefly (fire),
            // then decay back to dark.
            const charge = Math.min(Math.max(dts, 0) / 1.6, 1);
            const fire = dts > 1.6 ? Math.exp(-(dts - 1.6) * 3.0) : 0;
            uniforms.uSurge.value = Math.max(charge * charge * 0.7, fire);
        } else if (styleId === 20) {
            // hyperspace: mostly steady flow, with an occasional bright
            // "jump" bloom that stretches the starlines.
            const c = sched.current.surge;
            if (t >= c.next) {
                c.t0 = t;
                c.next = t + 3.0 + Math.random() * 4;
            }
            const dts = t - c.t0;
            uniforms.uSurge.value = dts < 0 ? 0 : Math.exp(-dts * 3.5);
        } else if (styleId === 21 || styleId === 22) {
            // Light-side serenity (21) and the Force-spirit balance pulse (22)
            // share the same gentle rhythm: a slow symmetric swell (ease in AND
            // out) spaced generously, so it reads as a calm breath — never a jolt.
            const c = sched.current.surge;
            if (t >= c.next) {
                c.t0 = t;
                c.next = t + 5.0 + Math.random() * 5.0;
            }
            const dts = t - c.t0;
            // bell-shaped envelope centred ~1.1s after onset: rises softly,
            // peaks, falls softly — never a spike.
            uniforms.uSurge.value = dts < 0 ? 0 : Math.exp(-Math.pow((dts - 1.1) * 1.3, 2.0));
        }
    });

    const needsPhysical = skin.effectType === 'glass' || skin.effectType === 'gem' || skin.procStyle === 'ocean';
    // "Void" signature styles render an emissive-only look (souls/mist in the
    // dark). Scene lights + envMap would wash the dark void to a pale colour, so
    // we make them effectively unlit: no reflections, fully matte, no base
    // emissive — only our procedural emissiveAccum lights them.
    // Star Wars emissive-on-black styles join the "void" family: their
    // plasma/lightning/starlines must glow against a dark unlit body,
    // never be washed out by scene lights or envMap reflections.
    // (Death Star is deliberately NOT here — it's lit imperial steel.)
    const isVoid = skin.procStyle === 'spectre' || skin.procStyle === 'poison' || skin.procStyle === 'storm' || skin.procStyle === 'astral'
        || skin.procStyle === 'kyber' || skin.procStyle === 'sith' || skin.procStyle === 'hyperspace' || skin.procStyle === 'lightside'
        || skin.procStyle === 'forcespirit';
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
        // Shared per STYLE (not per skin): every skin of a style reuses the
        // same small compiled program; per-skin looks are pure uniforms.
        // (three.js's parameter hash already separates standard vs physical,
        // transparent, lights, etc. — this key only adds the style dimension.)
        customProgramCacheKey: () => 'proc-style-' + styleId,
    };

    if (needsPhysical) {
        return <meshPhysicalMaterial {...common} clearcoat={0.8} clearcoatRoughness={0.15} />;
    }
    return <meshStandardMaterial {...common} />;
};
