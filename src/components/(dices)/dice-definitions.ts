import { getAssetUrl } from '@/lib/asset-loader';

export type SkinEffectType = 'metallic' | 'gem' | 'glass' | 'stone' | 'magic' | 'dark' | 'cyber' | 'organic' | 'celestial' | 'cursed' | 'orb';
export type CoreType = 'glow' | 'eye' | 'model';
export type ParticleType = 'none' | 'fire' | 'ice' | 'sparkle' | 'smoke' | 'gold_dust' | 'silver_dust' | 'magic' | 'electric' | 'void' | 'nebula' | 'blood';
export type CriticalType = 'success' | 'fail' | null;

export interface DiceSkin {
    id: string;
    name: string;
    bodyColor: string;
    edgeColor: string;
    borderColor: string;
    textColor: string;
    shadowColor: string;
    metalness: number;
    roughness: number;
    envMapIntensity: number;
    effectType: SkinEffectType;
    emissive: string;
    emissiveIntensity: number;
    opacity: number;
    innerGlow: boolean;
    innerGlowColor: string;
    innerGlowIntensity: number;
    rimLight: boolean;
    rimLightColor: string;
    particleType: ParticleType;
    particleColor: string;
    particleColor2?: string;
    // Textures (optional)
    textureMap?: string;
    tintTexture?: boolean;        // multiply the texture by bodyColor (e.g. tint a white marble green/amber)
    // Signature procedural look, overrides the default style from effectType.
    procStyle?: 'metallic' | 'stone' | 'magic' | 'gem' | 'dark' | 'cyber' | 'spectre' | 'poison' | 'eclipse' | 'storm' | 'magma' | 'prism' | 'astral' | 'ocean' | 'scale' | 'bismuth'
        | 'kyber' | 'deathstar' | 'sith' | 'hyperspace' | 'lightside' | 'forcespirit';
    // ── ORB SKINS ──────────────────────────────────────────────
    // Only used when effectType === 'orb'. The outer shell stays transparent/glassy
    // and rolls with the physics body, while a "core" element is rendered at the
    // center and billboarded (always facing the camera, never rotating with the die).
    coreType?: CoreType;          // 'glow' = procedural glowing element, 'model' = loaded .glb/.gltf
    coreColor?: string;           // tint of the procedural glow core / emissive
    coreColor2?: string;          // secondary accent color for the core
    coreScale?: number;           // size multiplier for the core element (default 1)
    coreModelUrl?: string;        // model URL when coreType === 'model'
    coreRotation?: [number, number, number]; // presentation rotation (radians) for the model, applied after billboard
    coreSpin?: number;            // idle spin speed (rad/s) around the model's own up axis; 0 = steady
    shellColor?: string;          // outer glass shell tint (defaults to bodyColor)
    shellOpacity?: number;        // outer glass shell opacity (default 0.25)
    shellTintDistance?: number;   // attenuationDistance: higher = less tint, clearer core (default 2.5)
    shellThickness?: number;      // glass thickness: lower = less tint (default 1.8)
    price: number;
    description?: string;
    rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

export const DICE_SKINS: Record<string, DiceSkin> = {
    // ── STAR WARS (dedicated signature shaders) ─────────────────
    kyber_bleu: {
        id: 'kyber_bleu',
        name: 'Cristal Kyber — Bleu',
        bodyColor: '#0a1c3a',   // deep cool crystal glass
        edgeColor: '#3aa8ff',   // Jedi blade blue (drives the plasma)
        borderColor: '#bfe4ff',
        textColor: '#eaf5ff',   // pale blue numbers
        shadowColor: '#02060f',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'gem',
        procStyle: 'kyber',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#3aa8ff',   // blue light cast onto the table
        innerGlowIntensity: 0.7,
        rimLight: true,
        rimLightColor: '#7ac8ff',
        particleType: 'none',
        particleColor: '#3aa8ff',
        particleColor2: '#eaf5ff',
        price: 2000,
        description: "Le cœur d'un sabre Jedi. La lame bourdonne encore, prisonnière du cristal.",
        rarity: 'epic'
    },
    kyber_vert: {
        id: 'kyber_vert',
        name: 'Cristal Kyber — Vert',
        bodyColor: '#0a2a16',   // deep forest crystal glass
        edgeColor: '#3dff8a',   // green blade (drives the plasma)
        borderColor: '#b8ffd4',
        textColor: '#eafff2',
        shadowColor: '#020a05',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'gem',
        procStyle: 'kyber',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#3dff8a',
        innerGlowIntensity: 0.7,
        rimLight: true,
        rimLightColor: '#8affc0',
        particleType: 'none',
        particleColor: '#3dff8a',
        particleColor2: '#eafff2',
        price: 2000,
        description: "Taillé sur une lune oubliée. La sérénité du gardien, forgée en lame.",
        rarity: 'epic'
    },
    kyber_violet: {
        id: 'kyber_violet',
        name: 'Cristal Kyber — Améthyste',
        bodyColor: '#1a0a2e',   // deep violet crystal glass
        edgeColor: '#b45cff',   // rare purple blade
        borderColor: '#e0c0ff',
        textColor: '#f4eaff',
        shadowColor: '#08030f',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'gem',
        procStyle: 'kyber',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#b45cff',
        innerGlowIntensity: 0.7,
        rimLight: true,
        rimLightColor: '#d19aff',
        particleType: 'none',
        particleColor: '#b45cff',
        particleColor2: '#f4eaff',
        price: 2500,
        description: "Une couleur qu'un seul maître osa porter. Ni tout à fait lumière, ni tout à fait ombre.",
        rarity: 'epic'
    },
    kyber_rouge: {
        id: 'kyber_rouge',
        name: 'Cristal Kyber — Saigné',
        bodyColor: '#2a0606',   // dark blood-crystal glass
        edgeColor: '#ff2a1a',   // Sith synthetic-red blade
        borderColor: '#ff9a8a',
        textColor: '#ffe0da',
        shadowColor: '#0a0000',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'gem',
        procStyle: 'kyber',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ff2a1a',
        innerGlowIntensity: 0.75,
        rimLight: true,
        rimLightColor: '#ff6a55',
        particleType: 'none',
        particleColor: '#ff2a1a',
        particleColor2: '#ffe0da',
        price: 2500,
        description: "Un cristal brisé par la haine jusqu'à saigner. Sa lumière est une plaie.",
        rarity: 'epic'
    },
    kyber_or: {
        id: 'kyber_or',
        name: 'Cristal Kyber — Or',
        bodyColor: '#2a1e04',   // deep amber crystal glass
        edgeColor: '#ffcf2e',   // radiant golden-yellow blade (drives the plasma)
        borderColor: '#fff0b0',
        textColor: '#fff8e0',
        shadowColor: '#0f0a00',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'gem',
        procStyle: 'kyber',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ffcf2e',   // golden light cast onto the table
        innerGlowIntensity: 0.75,
        rimLight: true,
        rimLightColor: '#ffe27a',
        particleType: 'none',
        particleColor: '#ffcf2e',
        particleColor2: '#fff8e0',
        price: 2500,
        description: "Le cristal des maîtres. Sa lame d'or ne tremble jamais — la marque du triomphe.",
        rarity: 'epic'
    },
    etoile_mort: {
        id: 'etoile_mort',
        name: 'Étoile de la Mort',
        bodyColor: '#7d848c',   // cold imperial hull grey
        edgeColor: '#5aff8f',   // superlaser green
        borderColor: '#aeb6bf',
        textColor: '#0a0f14',   // dark numbers on the light steel
        shadowColor: '#e8edf2', // light outline so numbers pop on grey hull
        metalness: 0.85,
        roughness: 0.45,        // brushed battle-station steel
        envMapIntensity: 1.0,
        effectType: 'metallic',
        procStyle: 'deathstar',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#5aff8f',   // green light flares when the superlaser charges
        innerGlowIntensity: 0.4,
        rimLight: true,
        rimLightColor: '#c8d0d8',
        particleType: 'none',
        particleColor: '#5aff8f',
        particleColor2: '#aeb6bf',
        price: 2500,
        description: "Cette station de combat est votre arme ultime. Le superlaser se charge à chaque lancer.",
        rarity: 'rare'
    },
    cote_obscur: {
        id: 'cote_obscur',
        name: 'Côté Obscur',
        bodyColor: '#1a0608',   // corrupted black obsidian, faint crimson base
        edgeColor: '#ff1a2a',   // dark-side crimson (Force lightning)
        borderColor: '#ff5a4a',
        textColor: '#ffd0cc',
        shadowColor: '#000000',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'dark',
        procStyle: 'sith',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ff1a2a',   // red light crawls out onto the table on each strike
        innerGlowIntensity: 0.7,
        rimLight: true,
        rimLightColor: '#ff4433',
        particleType: 'none',
        particleColor: '#ff1a2a',
        particleColor2: '#3a0000',
        price: 2500,
        description: "La Force en colère. Les éclairs rampent sous la surface, cherchant une proie.",
        rarity: 'legendary'
    },
    cote_lumineux: {
        id: 'cote_lumineux',
        name: 'Côté Lumineux',
        bodyColor: '#061626',   // serene deep-blue crystal glass
        edgeColor: '#4ac8ff',   // luminous side azure (Force energy)
        borderColor: '#a8e6ff',
        textColor: '#eaf6ff',
        shadowColor: '#00060f',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'dark',       // emissive-on-black path (unlit body, glowing currents)
        procStyle: 'lightside',   // dedicated serene shader: drifting Force currents, no lightning
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#4ac8ff',   // azure light breathes out onto the table
        innerGlowIntensity: 0.7,
        rimLight: true,
        rimLightColor: '#7cd6ff',
        particleType: 'none',
        particleColor: '#4ac8ff',
        particleColor2: '#04213a',
        price: 2500,
        description: "La Force en paix. Une énergie sereine circule sous la surface, veillant sur son porteur.",
        rarity: 'legendary'
    },
    esprit_force: {
        id: 'esprit_force',
        name: 'Esprit de la Force',
        bodyColor: '#0a0a14',   // near-black energy body (currents glow over it)
        edgeColor: '#ffe9b0',   // white-gold light current (drives the luminous side)
        borderColor: '#fff4d8',
        textColor: '#fff8ea',   // warm white numbers on the dark energy body
        shadowColor: '#050508', // dark outline so the white numbers pop
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'dark',       // emissive-on-black path (unlit body, glowing currents)
        procStyle: 'forcespirit', // dedicated shader: light & dark currents braided in balance
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#fff4d8',   // warm white light breathes onto the table
        innerGlowIntensity: 0.6,
        rimLight: true,
        rimLightColor: '#fff4d8',
        particleType: 'none',
        particleColor: '#ffe9b0',
        particleColor2: '#1a1a22',
        price: 2500,
        description: "La Force elle-même : lumière et ténèbres enlacées, éternellement en équilibre.",
        rarity: 'legendary'
    },
    hyperespace: {
        id: 'hyperespace',
        name: 'Saut Hyperespace',
        bodyColor: '#050a1a',   // near-black space
        edgeColor: '#78b4ff',   // blue-white lightspeed tunnel
        borderColor: '#cfe6ff',
        textColor: '#eaf3ff',
        shadowColor: '#01030a',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'celestial',
        procStyle: 'hyperspace',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#78b4ff',
        innerGlowIntensity: 0.5,
        rimLight: true,
        rimLightColor: '#aed2ff',
        particleType: 'none',
        particleColor: '#78b4ff',
        particleColor2: '#ffffff',
        price: 2000,
        description: "Accroche-toi. Les étoiles s'étirent et l'univers file — c'est parti pour la vitesse-lumière.",
        rarity: 'epic'
    },
    // ── ORB SKINS (transparent shell + billboarded core) ────────
    aqua_orb: {
        id: 'aqua_orb',
        name: 'Orbe Aquatique',
        bodyColor: '#1565c0',
        edgeColor: '#7ec8ff',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#021a3a',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#7ec8ff',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#7ec8ff',
        particleColor2: '#ffffff',
        // Orb-specific config: deep blue glass shell + dense luminous core
        coreType: 'glow',
        coreColor: '#2b9bff',
        coreColor2: '#0a2a6a',
        coreScale: 1,
        shellColor: '#0d63d6',
        shellOpacity: 0.22,
        price: 500,
        description: "Une coque de verre vivante avec un cœur de lumière flottant.",
        rarity: 'epic'
    },
    eye_orb: {
        id: 'eye_orb',
        name: 'Œil du Gardien',
        bodyColor: '#5b2d8a',
        edgeColor: '#c9a0ff',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#180531',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#c9a0ff',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#c9a0ff',
        particleColor2: '#ffffff',
        // A living procedural eye that watches you, behind light violet glass.
        // Amber iris on cool violet glass = strong warm/cool contrast so it pops.
        coreType: 'eye',
        coreColor: '#ffae1f',   // amber/gold iris
        coreColor2: '#fff4e0',  // warm ivory sclera
        coreScale: 1.05,
        shellColor: '#9b6fd4',  // lighter violet
        shellOpacity: 0.22,
        shellTintDistance: 6,   // much clearer glass so the eye reads through
        shellThickness: 1.0,
        price: 750,
        description: "Un œil ancien scellé dans le verre. Il vous observe.",
        rarity: 'legendary'
    },
    shield_orb: {
        id: 'shield_orb',
        name: 'Gardien',
        bodyColor: '#2a3a5a',
        edgeColor: '#9cc4ff',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#0a1424',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#9cc4ff',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#9cc4ff',
        particleColor2: '#ffffff',
        // A real 3D shield model floating inside clear steel-blue glass.
        // Flat like the ring — keep it facing the camera (no spin) so we see
        // the face, not the edge.
        coreType: 'model',
        coreModelUrl: getAssetUrl('/3d/shield.glb'),
        coreColor: '#aed2ff',   // inner light tint
        coreScale: 1.0,
        shellColor: '#9cbce0',  // very light steel glass
        shellOpacity: 0.03,
        shellTintDistance: 1000, // essentially clear glass
        shellThickness: 0.05,
        price: 1500,
        description: "Aucune lame n'a jamais franchi cette protection.",
        rarity: 'legendary'
    },
    book_orb: {
        id: 'book_orb',
        name: 'Grimoire Ancien',
        bodyColor: '#3a2a5a',
        edgeColor: '#c9a0ff',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#120a24',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#c9a0ff',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#c9a0ff',
        particleColor2: '#ffffff',
        // A real 3D book model floating inside clear violet glass
        coreType: 'model',
        coreModelUrl: getAssetUrl('/3d/book.glb'),
        coreColor: '#d4b0ff',   // inner light tint
        coreScale: 1.0,
        coreSpin: 0.8,          // slow idle spin
        shellColor: '#b89cdc',  // very light violet glass
        shellOpacity: 0.03,
        shellTintDistance: 1000, // essentially clear glass
        shellThickness: 0.05,
        price: 1500,
        description: "Un savoir interdit, scellé pour le bien de tous.",
        rarity: 'legendary'
    },
    potion_orb: {
        id: 'potion_orb',
        name: 'Élixir Mystique',
        bodyColor: '#1f5a3a',
        edgeColor: '#7affc0',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#05140d',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#7affc0',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#7affc0',
        particleColor2: '#ffffff',
        // A real 3D potion model floating inside clear green glass
        coreType: 'model',
        coreModelUrl: getAssetUrl('/3d/potion.glb'),
        coreColor: '#8affc8',   // inner light tint
        coreScale: 1.0,
        coreSpin: 0.8,          // slow idle spin
        shellColor: '#8fe0b4',  // very light green glass
        shellOpacity: 0.03,
        shellTintDistance: 1000, // essentially clear glass
        shellThickness: 0.05,
        price: 1500,
        description: "Un breuvage chatoyant dont nul ne connaît l'effet.",
        rarity: 'legendary'
    },
    mug_orb: {
        id: 'mug_orb',
        name: 'Chope du Tavernier',
        bodyColor: '#6b4a1f',
        edgeColor: '#ffcf6e',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#1f1405',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffcf6e',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#ffcf6e',
        particleColor2: '#ffffff',
        // A real 3D mug model floating inside clear amber glass
        coreType: 'model',
        coreModelUrl: getAssetUrl('/3d/mug.glb'),
        coreColor: '#ffd98a',   // inner light tint
        coreScale: 1.0,
        coreSpin: 0.8,          // slow idle spin
        shellColor: '#e0b48f',  // very light warm glass
        shellOpacity: 0.03,
        shellTintDistance: 1000, // essentially clear glass
        shellThickness: 0.05,
        price: 1500,
        description: "Toujours pleine, jamais vide. Le rêve de tout aventurier.",
        rarity: 'legendary'
    },
    mimique_orb: {
        id: 'mimique_orb',
        name: 'Mimique Captive',
        bodyColor: '#5a2f1a',
        edgeColor: '#ff8a5c',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#1a0d05',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ff8a5c',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#ff8a5c',
        particleColor2: '#ffffff',
        // A real 3D mimic model floating inside warm glass
        coreType: 'model',
        coreModelUrl: getAssetUrl('/3d/mimique.glb'),
        coreColor: '#ffb27a',   // inner light tint
        coreScale: 1.0,         // slightly smaller
        coreSpin: 0.8,          // slow idle spin like the ring
        shellColor: '#e0b48f',  // very light warm glass
        shellOpacity: 0.03,
        shellTintDistance: 1000, // essentially clear glass
        shellThickness: 0.05,
        price: 1500,
        description: "Un coffre qui mord, prisonnier de sa propre cupidité.",
        rarity: 'legendary'
    },
    ring_orb: {
        id: 'ring_orb',
        name: 'Anneau Scellé',
        bodyColor: '#3a2a10',
        edgeColor: '#ffd97a',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#1a1205',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffd97a',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#ffd97a',
        particleColor2: '#ffffff',
        // A real 3D ring model floating inside warm amber glass
        coreType: 'model',
        coreModelUrl: getAssetUrl('/3d/ring.glb'),
        coreColor: '#ffcf66',   // inner light tint
        coreScale: 1,
        coreRotation: [1.2, 0, 0.3], // tilt the ring so we see the circle, not the edge
        coreSpin: 0.8,               // slow idle spin around its own axis

        shellColor: '#c9962f',  // amber glass
        shellOpacity: 0.12,
        shellTintDistance: 40,
        shellThickness: 0.4,
        price: 1500,
        description: "Un anneau de pouvoir scellé dans le verre. Un seul l'enchaîne.",
        rarity: 'legendary'
    },
    beholder_orb: {
        id: 'beholder_orb',
        name: 'Œil Tyrannique',
        bodyColor: '#1f3d2e',
        edgeColor: '#7affc0',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#05140d',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#7affc0',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#7affc0',
        particleColor2: '#ffffff',
        // A real 3D beholder model floating inside clear teal glass
        coreType: 'model',
        coreModelUrl: getAssetUrl('/3d/beholder.glb'),
        coreColor: '#6affc0',   // inner light tint
        coreScale: 1,
        shellColor: '#3fae82',  // light teal glass
        shellOpacity: 0.12,
        shellTintDistance: 40,  // nearly clear glass so the model reads through
        shellThickness: 0.4,
        price: 1500,
        description: "Un beholder miniature scellé dans une sphère de verre.",
        rarity: 'legendary'
    },
    butterfly_orb: {
        id: 'butterfly_orb',
        name: 'Papillon Éphémère',
        bodyColor: '#4a1f5a',
        edgeColor: '#ff8ad4',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#180524',
        metalness: 0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'orb',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ff8ad4',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#ff8ad4',
        particleColor2: '#ffffff',
        // A real 3D butterfly model floating inside clear violet-pink glass
        coreType: 'model',
        coreModelUrl: getAssetUrl('/3d/butterfly.glb'),
        coreColor: '#ffb2ea',   // inner light tint
        coreScale: 0.8,
        coreRotation: [1.5708, 0, 0], // tilt so we see the wings from above, not edge-on
        coreSpin: 0.8,          // slow idle spin like the ring
        shellColor: '#d48fe0',  // very light violet-pink glass
        shellOpacity: 0.03,
        shellTintDistance: 1000, // essentially clear glass
        shellThickness: 0.05,
        price: 1500,
        description: "Une âme légère, figée en plein envol dans le verre.",
        rarity: 'legendary'
    },
    // ── SIGNATURE DICE (dedicated shaders) ──────────────────────
    singularite: {
        id: 'singularite',
        name: 'Singularité',
        bodyColor: '#0d0a1e',   // deep space black-violet
        edgeColor: '#8a5cff',   // violet nebula (drives the astral palette)
        borderColor: '#5c7cff',
        textColor: '#e8e2ff',   // starlight numbers
        shadowColor: '#050310',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'celestial',
        procStyle: 'astral',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#7a5cff',   // cold violet light around the die
        innerGlowIntensity: 0.6,
        rimLight: true,
        rimLightColor: '#5c7cff',
        particleType: 'none',
        particleColor: '#8a5cff',
        particleColor2: '#25b8ff',
        price: 2500,
        description: "Un fragment d'univers, volé au ciel d'une nuit qui n'existe plus.",
        rarity: 'legendary'
    },
    prism: {
        id: 'prism',
        name: 'Opale Prismatique',
        bodyColor: '#efeef5',   // pearl white body (lit by the scene)
        edgeColor: '#cdbcff',   // soft lavender accent
        borderColor: '#b8a6f0',
        textColor: '#3a2f55',   // dark plum numbers on the pearl
        shadowColor: '#f7f4ff', // LIGHT outline so numbers pop on a light body
        metalness: 0.25,
        roughness: 0.3,
        envMapIntensity: 0.9,
        effectType: 'gem',
        procStyle: 'prism',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#e6d8ff',
        particleType: 'none',
        particleColor: '#cdbcff',
        particleColor2: '#ffffff',
        price: 2000,
        description: "Chaque angle révèle une couleur que personne d'autre ne verra.",
        rarity: 'legendary'
    },
    magma: {
        id: 'magma',
        name: 'Cœur de Magma',
        bodyColor: '#241a14',   // dark basalt crust
        edgeColor: '#ff9526',   // molten orange — drives the whole magma ramp
        borderColor: '#ff6a1a',
        textColor: '#ffd9a0',   // warm cream numbers
        shadowColor: '#1a0d05',
        metalness: 0,
        roughness: 0.85,        // rough volcanic rock, no face-wide specular
        envMapIntensity: 0.5,
        effectType: 'magic',
        procStyle: 'magma',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ff6a1a',   // warm glow cast onto the table
        innerGlowIntensity: 0.8,
        rimLight: true,
        rimLightColor: '#ff7a20',
        particleType: 'none',
        particleColor: '#ff9526',
        particleColor2: '#ff3a0a',
        price: 2000,
        description: "Le sang de la terre coule encore sous sa croûte brisée.",
        rarity: 'legendary'
    },
    storm: {
        id: 'storm',
        name: "Cœur de l'Orage",
        bodyColor: '#2a3650',   // storm blue-grey (drives the cloud tint)
        edgeColor: '#8fb4ff',   // electric blue — bolts and rim
        borderColor: '#6a8fff',
        textColor: '#dce8ff',   // pale ice-blue numbers
        shadowColor: '#050a14',
        metalness: 0,
        roughness: 1,
        envMapIntensity: 0,
        effectType: 'magic',
        procStyle: 'storm',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#7a9cff',   // cold light cast around it on each strike
        innerGlowIntensity: 0.7,
        rimLight: true,
        rimLightColor: '#8fb4ff',
        particleType: 'none',
        particleColor: '#8fb4ff',
        particleColor2: '#dce8ff',
        price: 2000,
        description: "L'orage vit à l'intérieur. Chaque lancer réveille la foudre.",
        rarity: 'legendary'
    },
    eclipse: {
        id: 'eclipse',
        name: 'Éclipse',
        bodyColor: '#171008',   // hot black obsidian (a warm near-black)
        edgeColor: '#ffb428',   // solar gold — drives the whole corona ramp
        borderColor: '#ff8c00',
        textColor: '#ffd98a',   // warm gold numbers
        shadowColor: '#000000',
        metalness: 0.25,
        roughness: 0.3,
        envMapIntensity: 1.0,   // capped to 0.35 by the eclipse material path
        effectType: 'dark',
        procStyle: 'eclipse',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ff7a00',   // warm light cast onto the table around it
        innerGlowIntensity: 0.9,
        rimLight: true,
        rimLightColor: '#ff6a00',    // faint orange halo hugging the silhouette
        particleType: 'none',
        particleColor: '#ffb428',
        particleColor2: '#ff5a00',
        price: 2000,
        description: "Un soleil mort, couronné d'un feu qui refuse de s'éteindre.",
        rarity: 'legendary'
    },
    spectre: {
        id: 'spectre',
        name: 'Âme Errante',
        bodyColor: '#10262e',   // dark spectral void body
        edgeColor: '#1fb86a',   // saturated spectral green (soul color, not whitish)
        borderColor: '#aaffee',
        textColor: '#eafffb',
        shadowColor: '#021015',
        metalness: 0,
        roughness: 0.4,
        envMapIntensity: 0.8,
        effectType: 'magic',
        procStyle: 'spectre',
        emissive: '#06201c',
        emissiveIntensity: 0.15,
        opacity: 1,             // opaque: misty look comes from veils + glow, not see-through
        innerGlow: true,
        innerGlowColor: '#7dffe0',
        innerGlowIntensity: 0.6,
        rimLight: true,
        rimLightColor: '#aaffee',
        particleType: 'none',
        particleColor: '#7dffe0',
        particleColor2: '#16323a',
        price: 1500,
        description: "Une âme prisonnière, à jamais à la dérive entre deux mondes.",
        rarity: 'legendary'
    },
    ocean_heart: {
        id: 'ocean_heart',
        name: "Cœur de l'Océan",
        bodyColor: '#0d2f6b',   // deep ocean blue water body (not teal/green)
        edgeColor: '#2f7fd6',   // bright azure blue (drives the caustics/foam accents)
        borderColor: '#6fb0ff',
        textColor: '#eaf3ff',   // pale sea-foam numbers
        shadowColor: '#020e2e',
        metalness: 0.15,
        roughness: 0.1,         // wet, glassy surface
        envMapIntensity: 1.4,
        effectType: 'magic',
        procStyle: 'ocean',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#2a5fc0',   // deep blue light cast onto the table
        innerGlowIntensity: 0.6,
        rimLight: true,
        rimLightColor: '#6fb0ff',
        particleType: 'none',
        particleColor: '#2f7fd6',
        particleColor2: '#eaf3ff',
        price: 2000,
        description: "Un océan entier, scellé dans le verre. Les vagues n'ont jamais cessé de rouler.",
        rarity: 'legendary'
    },
    ecailles_ancestrales: {
        id: 'ecailles_ancestrales',
        name: 'Écailles Ancestrales',
        bodyColor: '#0e3a24',   // deep forest emerald body
        edgeColor: '#2f8a52',   // brighter emerald accent (drives the scale sheen)
        borderColor: '#4fae6e',
        textColor: '#eafff0',   // pale mint numbers
        shadowColor: '#04170d',
        metalness: 0.25,
        roughness: 0.35,        // organic hide, not a mirror polish
        envMapIntensity: 0.9,
        effectType: 'organic',
        procStyle: 'scale',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#1f6a3f',   // deep forest light cast onto the table
        innerGlowIntensity: 0.35,
        rimLight: true,
        rimLightColor: '#4fae6e',
        particleType: 'none',
        particleColor: '#2f8a52',
        particleColor2: '#eafff0',
        price: 500,
        description: "Une mue de dragon ancien, chaque écaille encore chaude du souvenir de son porteur.",
        rarity: 'rare'
    },
    bismuth: {
        id: 'bismuth',
        name: 'Ziggourat de Bismuth',
        bodyColor: '#7d8a94',   // near-neutral polished metal base
        edgeColor: '#c9a0ff',   // used as a hue anchor for the iridescent film
        borderColor: '#ffffff',
        textColor: '#0a0a12',
        shadowColor: '#e8e8f0', // light outline so numbers pop on the bright metal
        metalness: 0.9,
        roughness: 0.12,
        envMapIntensity: 2.2,
        effectType: 'metallic',
        procStyle: 'bismuth',
        emissive: '#000000',
        emissiveIntensity: 1,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#ff6b6b',
        particleColor2: '#6bd0ff',
        price: 500,
        description: "Un cristal minéral en escalier, où chaque marche vole une couleur différente à la lumière.",
        rarity: 'rare'
    },
    poison: {
        id: 'poison',
        name: 'Fiel Corrosif',
        bodyColor: '#1e3a12',   // dark sludge green body
        edgeColor: '#9bff2e',   // toxic acid green glow
        borderColor: '#c8ff66',
        textColor: '#eaffd0',
        shadowColor: '#0a1505',
        metalness: 0.1,
        roughness: 0.35,
        envMapIntensity: 1.0,
        effectType: 'magic',
        procStyle: 'poison',
        emissive: '#2a4a08',
        emissiveIntensity: 0.5,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#9bff2e',
        innerGlowIntensity: 0.5,
        rimLight: true,
        rimLightColor: '#c8ff66',
        particleType: 'none',
        particleColor: '#9bff2e',
        particleColor2: '#1e3a12',
        price: 1500,
        description: "Un poison si virulent qu'il ronge la réalité elle-même.",
        rarity: 'legendary'
    },
    // ── NEW PROCEDURAL DICE ─────────────────────────────────────
    onyx_dore: {
        id: 'onyx_dore',
        name: 'Onyx Doré',
        bodyColor: '#141118',   // deep black body
        edgeColor: '#e8b54a',   // metallic gold veins (uAccent)
        borderColor: '#ffd700',
        textColor: '#ffe9b0',
        shadowColor: '#000000',
        metalness: 0.9,
        roughness: 0.08,
        envMapIntensity: 2.0,
        effectType: 'dark',
        emissive: '#3a2a00',
        emissiveIntensity: 0.15,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#e8b54a',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffd700',
        particleType: 'none',
        particleColor: '#ffd700',
        particleColor2: '#000000',
        price: 750,
        description: "Ténèbres polies, veinées d'or pur. La richesse dans l'ombre.",
        rarity: 'epic'
    },
    sang_ancien: {
        id: 'sang_ancien',
        name: 'Sang Ancien',
        bodyColor: '#6e0d12',   // dark blood red body
        edgeColor: '#ff2a1a',   // incandescent blood-fire accent
        borderColor: '#ff4433',
        textColor: '#ffd8d0',
        shadowColor: '#1a0000',
        metalness: 0.3,
        roughness: 0.3,
        envMapIntensity: 1.2,
        effectType: 'magic',
        emissive: '#5a0000',
        emissiveIntensity: 0.6,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ff2a1a',
        innerGlowIntensity: 0.5,
        rimLight: true,
        rimLightColor: '#ff5544',
        particleType: 'none',
        particleColor: '#ff2a1a',
        particleColor2: '#5a0000',
        price: 750,
        description: "Le sang d'un dieu déchu coule encore dans ses veines.",
        rarity: 'epic'
    },
    marbre_saphir: {
        id: 'marbre_saphir',
        name: 'Marbre Saphir',
        bodyColor: '#16306e',   // deep midnight-blue marble body
        edgeColor: '#dfe9ff',   // silvery-white veins
        borderColor: '#6aa0ff',
        textColor: '#ffffff',
        shadowColor: '#04122e',
        metalness: 0.2,
        roughness: 0.15,
        envMapIntensity: 1.2,
        effectType: 'stone',
        emissive: '#020a1a',
        emissiveIntensity: 0.05,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#bcd4ff',
        particleType: 'none',
        particleColor: '#ffffff',
        price: 500,
        description: "Bleu nuit profond, strié de veines d'argent lunaire.",
        rarity: 'rare'
    },
    gold: {
        id: 'gold',
        name: 'Or Royal',
        bodyColor: '#c9a227',
        edgeColor: '#ffe066',
        borderColor: '#ffd700',
        textColor: '#1a1000',
        shadowColor: '#000000',
        metalness: 0.95,
        roughness: 0.12,
        envMapIntensity: 2.0,
        effectType: 'metallic',
        emissive: '#ff9500',
        emissiveIntensity: 0.15,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffe066',
        particleType: 'gold_dust',
        particleColor: '#ffd700',
        particleColor2: '#ffaa00',
        price: 0,
        description: "L'élégance intemporelle pour les aventuriers fortunés.",
        rarity: 'common'
    },
    silver: {
        id: 'silver',
        name: 'Argent',
        bodyColor: '#c0c0c0',
        edgeColor: '#ffffff',
        borderColor: '#e8e8e8',
        textColor: '#1a1a2e',
        shadowColor: '#000000',
        metalness: 1.0,
        roughness: 0.05,
        envMapIntensity: 2.5,
        effectType: 'metallic',
        emissive: '#ffffff',
        emissiveIntensity: 0.1,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'silver_dust',
        particleColor: '#ffffff',
        particleColor2: '#c0c0c0',
        price: 0,
        description: "Brillant et pur, efficace contre les lycanthropes.",
        rarity: 'common'
    },
    ruby: {
        id: 'ruby',
        name: 'Rubis',
        bodyColor: '#cc0033',
        edgeColor: '#ff3366',
        borderColor: '#ff6699',
        textColor: '#ffffff',
        shadowColor: '#330011',
        metalness: 0.3,
        roughness: 0.1,
        envMapIntensity: 2.0,
        effectType: 'gem',
        emissive: '#ff0033',
        emissiveIntensity: 0.4,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ff3366',
        innerGlowIntensity: 0.8,
        rimLight: true,
        rimLightColor: '#ff6699',
        particleType: 'none',
        particleColor: '#ff3366',
        particleColor2: '#ffffff',
        textureMap: getAssetUrl('/textures/rubis_diffuse.jpg'),
        price: 250,
        description: "Une gemme ardente pulsant d'énergie magique.",
        rarity: 'rare'
    },
    obsidian: {
        id: 'obsidian',
        name: 'Obsidienne',
        bodyColor: '#15101f',   // very dark with a faint violet base (not pure black)
        edgeColor: '#7c4dff',   // vivid violet accent so veins read in the shader
        borderColor: '#6633ff',
        textColor: '#c9b3ff',
        shadowColor: '#000000',
        metalness: 0.9,
        roughness: 0.05,
        envMapIntensity: 2.0,
        effectType: 'dark',
        emissive: '#3a0a8a',
        emissiveIntensity: 0.3,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#6633ff',
        innerGlowIntensity: 0.5,
        rimLight: true,
        rimLightColor: '#8855ff',
        particleType: 'none',
        particleColor: '#6633ff',
        particleColor2: '#220044',
        price: 500,
        description: "Forgé dans les ténèbres, pour ceux qui embrassent l'ombre.",
        rarity: 'epic'
    },
    jade: {
        id: 'jade',
        name: 'Jade',
        bodyColor: '#00b377',
        edgeColor: '#33ffaa',
        borderColor: '#66ffcc',
        textColor: '#003322',
        shadowColor: '#001a11',
        metalness: 0.2,
        roughness: 0.4,
        envMapIntensity: 1.2,
        effectType: 'stone',
        emissive: '#00ff88',
        emissiveIntensity: 0.1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#33ff99',
        innerGlowIntensity: 0.3,
        rimLight: false,
        rimLightColor: '#00ff88',
        particleType: 'none',
        particleColor: '#33ff99',
        particleColor2: '#00ff88',
        textureMap: getAssetUrl('/textures/jade.jpg'),
        price: 125,
        description: "Symbole de sérénité et de chance.",
        rarity: 'uncommon'
    },
    crystal: {
        id: 'crystal',
        name: 'Cristal',
        bodyColor: '#eeeeff',
        edgeColor: '#ffffff',
        borderColor: '#aaccff',
        textColor: '#0044aa',
        shadowColor: '#6688cc',
        metalness: 0.1,
        roughness: 0.02,
        envMapIntensity: 3.5,
        effectType: 'glass',
        emissive: '#aaccff',
        emissiveIntensity: 0.2,
        opacity: 0.7,
        innerGlow: true,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 1.0,
        rimLight: true,
        rimLightColor: '#aaccff',
        particleType: 'none',
        particleColor: '#ffffff',
        particleColor2: '#aaccff',
        price: 250,
        description: "Transparent comme vos intentions... ou pas.",
        rarity: 'rare'
    },
    sapphire: {
        id: 'sapphire',
        name: 'Saphir',
        bodyColor: '#0044cc',
        edgeColor: '#3377ff',
        borderColor: '#66aaff',
        textColor: '#ffffff',
        shadowColor: '#001144',
        metalness: 0.35,
        roughness: 0.08,
        envMapIntensity: 2.2,
        effectType: 'gem',
        emissive: '#0066ff',
        emissiveIntensity: 0.35,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#3399ff',
        innerGlowIntensity: 0.7,
        rimLight: true,
        rimLightColor: '#66ccff',
        particleType: 'none',
        particleColor: '#3399ff',
        particleColor2: '#ffffff',
        textureMap: getAssetUrl('/textures/saphire_diffuse.jpg'),
        price: 250,
        description: "Aussi profond que l'océan, aussi dur que l'acier.",
        rarity: 'rare'
    },
    amethyst: {
        id: 'amethyst',
        name: 'Améthyste',
        bodyColor: '#7722aa',
        edgeColor: '#aa44dd',
        borderColor: '#cc77ff',
        textColor: '#ffffff',
        shadowColor: '#220044',
        metalness: 0.3,
        roughness: 0.12,
        envMapIntensity: 2.0,
        effectType: 'gem',
        emissive: '#9933ff',
        emissiveIntensity: 0.35,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#bb66ff',
        innerGlowIntensity: 0.6,
        rimLight: true,
        rimLightColor: '#dd99ff',
        particleType: 'none',
        particleColor: '#bb66ff',
        particleColor2: '#ffffff',
        textureMap: getAssetUrl('/textures/amethyst_diffuse.jpg'),
        price: 250,
        description: "Mystique et royale, favorisée par les mages.",
        rarity: 'rare'
    },
    inferno: {
        id: 'inferno',
        name: 'Inferno',
        bodyColor: '#ff3300',
        edgeColor: '#ff6600',
        borderColor: '#ffaa00',
        textColor: '#ffffff',
        shadowColor: '#330000',
        metalness: 0.4,
        roughness: 0.3,
        envMapIntensity: 1.5,
        effectType: 'magic',
        emissive: '#ff4400',
        emissiveIntensity: 0.8,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ffaa00',
        innerGlowIntensity: 1.2,
        rimLight: true,
        rimLightColor: '#ff6600',
        particleType: 'none', // Removed fire
        particleColor: '#ff6600',
        particleColor2: '#ffaa00',
        price: 500,
        description: "Brûle d'une flamme éternelle qui ne consume que vos ennemis.",
        rarity: 'epic'
    },
    frost: {
        id: 'frost',
        name: 'Givre',
        bodyColor: '#88ccff',
        edgeColor: '#aaeeff',
        borderColor: '#ffffff',
        textColor: '#003366',
        shadowColor: '#004488',
        metalness: 0.2,
        roughness: 0.15,
        envMapIntensity: 2.5,
        effectType: 'magic',
        emissive: '#66ddff',
        emissiveIntensity: 0.5,
        opacity: 0.8,
        innerGlow: true,
        innerGlowColor: '#aaeeff',
        innerGlowIntensity: 0.9,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none', // Removed ice
        particleColor: '#aaeeff',
        particleColor2: '#ffffff',
        price: 250,
        description: "Froid comme la mort, tranchant comme un blizzard.",
        rarity: 'rare'
    },
    // NEW SKINS
    cyber_neon: {
        id: 'cyber_neon',
        name: 'Cyber Neon',
        bodyColor: '#050510',
        edgeColor: '#00ffcc',
        borderColor: '#00ffcc',
        textColor: '#ff00aa',
        shadowColor: '#001111',
        metalness: 0.9,
        roughness: 0.1,
        envMapIntensity: 1.5,
        effectType: 'cyber',
        emissive: '#004433',
        emissiveIntensity: 0.3,
        opacity: 0.95,
        innerGlow: true,
        innerGlowColor: '#00ffcc',
        innerGlowIntensity: 0.8,
        rimLight: true,
        rimLightColor: '#ff00aa',
        particleType: 'none',
        particleColor: '#00ffcc',
        particleColor2: '#ff00aa',
        price: 1250,
        description: "Une technologie perdue d'une autre dimension.",
        rarity: 'legendary'
    },
    bleu_marble: {
        id: 'bleu_marble',
        name: 'Marbre Bleu',
        bodyColor: '#004488',
        edgeColor: '#ffd700',
        borderColor: '#ffd700',
        textColor: '#ffffff',
        shadowColor: '#000033',
        metalness: 0.1,
        roughness: 0.1,
        envMapIntensity: 2.0,
        effectType: 'stone',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#ffd700',
        particleColor2: '#ffffff',
        textureMap: getAssetUrl('/textures/marblebleu_diffuse.jpg'),
        price: 125,
        description: "Élégance classique avec une touche royale.",
        rarity: 'epic'
    },
    cosmos: {
        id: 'cosmos',
        name: 'Cosmos',
        bodyColor: '#1a0033',
        edgeColor: '#9933ff',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#000000',
        metalness: 0.5,
        roughness: 0.2,
        envMapIntensity: 2.0,
        effectType: 'celestial',
        emissive: '#4b0082',
        emissiveIntensity: 0.3,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#9933ff',
        innerGlowIntensity: 0.5,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#9933ff',
        particleColor2: '#ffffff',
        textureMap: getAssetUrl('/textures/cosmos_diffuse.jpeg'),
        price: 1250,
        description: "Contient des galaxies entières dans chaque face.",
        rarity: 'epic'
    },
    space: {
        id: 'space',
        name: 'Espace',
        bodyColor: '#1a0033',
        edgeColor: '#9933ff',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#000000',
        metalness: 0.3,
        roughness: 0.2,
        envMapIntensity: 2.0,
        effectType: 'celestial',
        emissive: '#000033',
        emissiveIntensity: 0.3,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#00ffff',
        innerGlowIntensity: 0.4,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#00ffff',
        particleColor2: '#ffffff',
        textureMap: getAssetUrl('/textures/space_diifuse.avif'),
        price: 500,
        description: "Le vide infini entre les étoiles.",
        rarity: 'epic'
    },
    ocean: {
        id: 'ocean',
        name: 'Océan',
        bodyColor: '#006994', // Ocean blue
        edgeColor: '#00bfff', // Deep sky blue
        borderColor: '#ffffff', // White foam
        textColor: '#ffffff',
        shadowColor: '#000033',
        metalness: 0.4,
        roughness: 0.1, // Wet look
        envMapIntensity: 2.5,
        effectType: 'organic', // or magic/glass
        emissive: '#004466',
        emissiveIntensity: 0.2,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#00ffff', // Cyan glow
        innerGlowIntensity: 0.3,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#00bfff',
        particleColor2: '#ffffff',
        textureMap: getAssetUrl('/textures/ocean_diffuse.webp'),
        price: 250,
        description: "Pour ceux qui entendent l'appel du large.",
        rarity: 'rare'
    },
    metal_lourd: {
        id: 'metal_lourd',
        name: 'Métal Lourd',
        bodyColor: '#2b2b2b',
        edgeColor: '#4f4f4f',
        borderColor: '#1a1a1a',
        textColor: '#494949', // Light grey text
        shadowColor: '#000000',
        metalness: 0.9,
        roughness: 0.6, // Scratched/rough metal
        envMapIntensity: 1.0,
        effectType: 'stone',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#4f4f4f',
        particleColor2: '#2b2b2b',
        price: 125,
        description: "Un alliage robuste, forgé pour durer.",
        rarity: 'rare'
    },
    merveille: {
        id: 'merveille',
        name: 'Merveille',
        bodyColor: '#004488',
        edgeColor: '#ffd700',
        borderColor: '#ffffff',
        textColor: '#ffffff',
        shadowColor: '#000033',
        metalness: 0.1,
        roughness: 0.1,
        envMapIntensity: 2.0,
        effectType: 'stone',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#ffd700',
        particleColor2: '#ffffff',
        textureMap: getAssetUrl('/textures/merveille_diffuse.png'),
        price: 1250,
        description: "Une merveille d'artisanat magique.",
        rarity: 'rare'
    },
    ancient_bone: {
        id: 'ancient_bone',
        name: 'Os Ancien',
        bodyColor: '#e3dac9',
        edgeColor: '#d4c5a9',
        borderColor: '#8a7e68',
        textColor: '#3b2f21',
        shadowColor: '#2b2216',
        metalness: 0.1,
        roughness: 0.8, // Matte bone
        envMapIntensity: 0.5,
        effectType: 'organic',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: false,
        rimLightColor: '#000000',
        particleType: 'none',
        particleColor: '#d4c5a9',
        particleColor2: '#e3dac9',
        price: 125,
        description: "Sculpté dans les os d'une créature oubliée.",
        rarity: 'uncommon'
    },
    void_walker: {
        id: 'void_walker',
        name: 'Marcheur du Vide',
        bodyColor: '#0a0618',   // near-black with a cold indigo undertone
        edgeColor: '#6a3bd6',   // indigo accent so the void veins read
        borderColor: '#4b0082', // Indigo
        textColor: '#e6e6fa', // Lavender
        shadowColor: '#000000',
        metalness: 0.8,
        roughness: 0.15,
        envMapIntensity: 1.2,
        effectType: 'dark',
        emissive: '#2a0a55',
        emissiveIntensity: 0.45,
        opacity: 0.95,
        innerGlow: true,
        innerGlowColor: '#4b0082',
        innerGlowIntensity: 0.6,
        rimLight: true,
        rimLightColor: '#8a2be2',
        particleType: 'none',
        particleColor: '#4b0082',
        particleColor2: '#000000',
        price: 500,
        description: "Il n'y a rien ici... absolument rien.",
        rarity: 'epic'
    },
    celestial_starlight: {
        id: 'celestial_starlight',
        name: 'Lumière Stellaire',
        bodyColor: '#0d1b2a',
        edgeColor: '#415a77',
        borderColor: '#e0e1dd',
        textColor: '#ffdd00',
        shadowColor: '#000000',
        metalness: 0.6,
        roughness: 0.2,
        envMapIntensity: 3.0,
        effectType: 'celestial',
        emissive: '#1b263b',
        emissiveIntensity: 0.3,
        opacity: 0.9,
        innerGlow: true,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0.4,
        rimLight: true,
        rimLightColor: '#778da9',
        particleType: 'none',
        particleColor: '#ffffff',
        particleColor2: '#ffdd00',
        price: 1250,
        description: "Guide les voyageurs perdus dans la nuit.",
        rarity: 'epic'
    },
    blood_pact: {
        id: 'blood_pact',
        name: 'Pacte de Sang',
        bodyColor: '#3a0404',
        edgeColor: '#610b0b',
        borderColor: '#8a1c1c',
        textColor: '#ffcccc',
        shadowColor: '#1a0000',
        metalness: 0.4,
        roughness: 0.4,
        envMapIntensity: 1.0,
        effectType: 'organic',
        emissive: '#520000',
        emissiveIntensity: 0.3,
        opacity: 0.98,
        innerGlow: true,
        innerGlowColor: '#ff0000',
        innerGlowIntensity: 0.3,
        rimLight: true,
        rimLightColor: '#ff3333',
        particleType: 'none',
        particleColor: '#8a1c1c',
        particleColor2: '#3a0404',
        price: 500,
        description: "Un serment qui ne peut être brisé.",
        rarity: 'epic'
    },
    steampunk_copper: {
        id: 'steampunk_copper',
        name: 'Steampunk Cuivre',
        bodyColor: '#b87333',
        edgeColor: '#cd7f32',
        borderColor: '#d4af37', // Brass details
        textColor: '#2a1a0a',
        shadowColor: '#1a0f05',
        metalness: 0.9,
        roughness: 0.3, // Brushed metal
        envMapIntensity: 1.8,
        effectType: 'metallic',
        emissive: '#b87333',
        emissiveIntensity: 0.1,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#d4af37',
        particleType: 'none',
        particleColor: '#d4af37',
        particleColor2: '#b87333',
        price: 250,
        description: "Rouages et vapeur, pour l'ingénieur moderne.",
        rarity: 'rare'
    },
    royal_marble: {
        id: 'royal_marble',
        name: 'Marbre Royal',
        bodyColor: '#f5f5f5',
        edgeColor: '#ffffff',
        borderColor: '#e0c090', // Soft Gold
        textColor: '#d4af37', // Gold
        shadowColor: '#cccccc',
        metalness: 0.1,
        roughness: 0.1, // Polished stone
        envMapIntensity: 2.0,
        effectType: 'stone',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#d4af37',
        particleColor2: '#ffffff',
        price: 250,
        description: "Digne d'un trône.",
        rarity: 'rare'
    },
    galactic_nebula: {
        id: 'galactic_nebula',
        name: 'Nébuleuse',
        bodyColor: '#1a0033', // Deep purple
        edgeColor: '#4b0082',
        borderColor: '#00ffff', // Cyan accents
        textColor: '#ffffff',
        shadowColor: '#000000',
        metalness: 0.7,
        roughness: 0.2,
        envMapIntensity: 2.5,
        effectType: 'celestial',
        emissive: '#2a0044',
        emissiveIntensity: 0.2,
        opacity: 0.95,
        innerGlow: true,
        innerGlowColor: '#cc00ff', // Magenta glow
        innerGlowIntensity: 0.4,
        rimLight: true,
        rimLightColor: '#00ffff',
        particleType: 'none', // Uses texture effect mostly
        particleColor: '#00ffff',
        particleColor2: '#ff00ff',
        price: 1250,
        description: "Là où naissent les étoiles.",
        rarity: 'epic'
    },
    dragon_scale: {
        id: 'dragon_scale',
        name: 'Écaille de Dragon',
        bodyColor: '#004d40', // Deep Teal
        edgeColor: '#00695c',
        borderColor: '#ffd700', // Gold borders
        textColor: '#ffd700',
        shadowColor: '#002222',
        metalness: 0.8, // Metallic scales
        roughness: 0.15,
        envMapIntensity: 1.5,
        effectType: 'organic',
        emissive: '#004d40',
        emissiveIntensity: 0.1,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#00ffaa',
        innerGlowIntensity: 0.2,
        rimLight: true,
        rimLightColor: '#bf9b30', // Gold rim
        particleType: 'none',
        particleColor: '#ffd700',
        particleColor2: '#004d40',
        price: 1250,
        description: "Dur, brillant et extrêmement précieux.",
        rarity: 'epic'
    },
    moonstone: {
        id: 'moonstone',
        name: 'Pierre de Lune',
        bodyColor: '#f0f8ff', // Alice Blue
        edgeColor: '#ffffff',
        borderColor: '#b0c4de', // Light Steel Blue
        textColor: '#5f9ea0', // Cadet Blue
        shadowColor: '#8899aa',
        metalness: 0.1,
        roughness: 0.05, // Very smooth
        envMapIntensity: 3.0,
        effectType: 'gem',
        emissive: '#e6e6fa', // Lavender
        emissiveIntensity: 0.3,
        opacity: 0.85, // Slightly translucent
        innerGlow: true,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0.8,
        rimLight: true,
        rimLightColor: '#afeeee', // Pale Turquoise
        particleType: 'none',
        particleColor: '#ffffff',
        particleColor2: '#b0c4de',
        price: 1250,
        description: "Baignée dans la lumière de séluné.",
        rarity: 'rare'
    },
    bois_noble: {
        id: 'bois_noble',
        name: 'Bois Noble',
        bodyColor: '#5c4033', // Warm walnut brown (fallback)
        edgeColor: '#8b6914', // Golden oak highlights
        borderColor: '#d4a76a', // Light wood grain accent
        textColor: '#f5e6c8', // Cream/ivory inlay
        shadowColor: '#2a1a0a',
        metalness: 0, // Wood is not metallic
        roughness: 0.75, // More matte wood texture
        envMapIntensity: 0.3, // Low reflection
        effectType: 'organic',
        emissive: '#3d2817', // Subtle warm glow from within
        emissiveIntensity: 0.05,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#d4a76a', // Warm golden undertone
        innerGlowIntensity: 0.1,
        rimLight: true,
        rimLightColor: '#c9a66b', // Honey colored rim
        particleType: 'none',
        particleColor: '#d4a76a',
        particleColor2: '#5c4033',
        // Wood texture
        textureMap: getAssetUrl('/textures/wood_diffuse.png'),
        price: 50,
        description: "Simple, robuste et fiable. Comme un bon nain.",
        rarity: 'common'
    },
    marbre_blanc: {
        id: 'marbre_blanc',
        name: 'Marbre Blanc',
        bodyColor: '#eceae6', // bright marble white body
        edgeColor: '#b8902f',   // refined gold veins on white
        borderColor: '#d4af37', // Gold accent
        textColor: '#2c2c2c', // Dark grey text
        shadowColor: '#aaaaaa',
        metalness: 0.2,
        roughness: 0.15, // Polished marble
        envMapIntensity: 1.2,
        effectType: 'stone',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#ffffff',
        particleColor2: '#e0e0e0',
        price: 125,
        description: "Poli à la perfection, veiné d'or, pour les temples sacrés.",
        rarity: 'uncommon'
    },
    cuir_ancien: {
        id: 'cuir_ancien',
        name: 'Cuir Ancien',
        bodyColor: '#3d2b1f', // Fallback dark brown
        edgeColor: '#5c4033',
        borderColor: '#8b7355', // Lighter brown accent
        textColor: '#d4a76a', // Gold/tan text
        shadowColor: '#1a120b',
        metalness: 0,
        roughness: 0.85, // Matte leather
        envMapIntensity: 0.3,
        effectType: 'organic',
        emissive: '#1a0f0a',
        emissiveIntensity: 0.05,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#8b7355',
        particleType: 'none',
        particleColor: '#8b7355',
        particleColor2: '#3d2b1f',
        textureMap: getAssetUrl('/textures/leather_diffuse.png'),
        price: 50,
        description: "Sent le vieux livre et l'aventure.",
        rarity: 'common'
    },
    pierre_donjon: {
        id: 'pierre_donjon',
        name: 'Pierre de Donjon',
        bodyColor: '#5a5a5a', // Fallback grey
        edgeColor: '#4a4a4a',
        borderColor: '#3d5c3d', // Moss green accent
        textColor: '#494949', // Light grey text
        shadowColor: '#2a2a2a',
        metalness: 0,
        roughness: 0.95, // Very rough stone
        envMapIntensity: 0.2,
        effectType: 'stone',
        emissive: '#000000',
        emissiveIntensity: 0,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#6b8e6b', // Moss green rim
        particleType: 'none',
        particleColor: '#6b8e6b',
        particleColor2: '#5a5a5a',
        textureMap: getAssetUrl('/textures/stone_diffuse.png'),
        price: 0,
        description: "Aussi froid que le sol d'un cachot.",
        rarity: 'common'
    },
    fer_rouille: {
        id: 'fer_rouille',
        name: 'Fer Rouillé',
        bodyColor: '#5a4a3a', // Fallback rusty brown
        edgeColor: '#8b4513',
        borderColor: '#cd853f', // Peru/rust
        textColor: '#ffd700', // Gold text for contrast
        shadowColor: '#2a1a0a',
        metalness: 0.6,
        roughness: 0.8, // Rough oxidized surface
        envMapIntensity: 0.5,
        effectType: 'metallic',
        emissive: '#ff4500',
        emissiveIntensity: 0.1,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#cd853f',
        particleType: 'none',
        particleColor: '#cd853f',
        particleColor2: '#5a4a3a',
        textureMap: getAssetUrl('/textures/rust_diffuse.png'),
        price: 25,
        description: "Oublié depuis longtemps, mais toujours solide.",
        rarity: 'common'
    },
    roche_volcanique: {
        id: 'roche_volcanique',
        name: 'Roche Volcanique',
        bodyColor: '#1a1a1a', // Fallback black
        edgeColor: '#ff4500', // Orange lava
        borderColor: '#ff6600',
        textColor: '#ffcc00', // Bright gold
        shadowColor: '#000000',
        metalness: 0.2,
        roughness: 0.9, // Very rough basalt
        envMapIntensity: 0.3,
        effectType: 'magic',
        emissive: '#ff4500',
        emissiveIntensity: 0.6, // Glowing lava
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ff4500',
        innerGlowIntensity: 0.5,
        rimLight: true,
        rimLightColor: '#ff6600',
        particleType: 'none',
        particleColor: '#ff4500',
        particleColor2: '#ff6600',
        textureMap: getAssetUrl('/textures/lava_diffuse.png'),
        price: 250,
        description: "Attention, c'est chaud !",
        rarity: 'rare'
    },
    glace_eternelle: {
        id: 'glace_eternelle',
        name: 'Glace Éternelle',
        bodyColor: '#b0e0e6', // Fallback pale blue
        edgeColor: '#e0ffff',
        borderColor: '#ffffff',
        textColor: '#003366', // Dark blue text
        shadowColor: '#4682b4',
        metalness: 0.1,
        roughness: 0.1, // Smooth ice
        envMapIntensity: 2.5, // High reflectivity
        effectType: 'glass',
        emissive: '#add8e6',
        emissiveIntensity: 0.2,
        opacity: 0.85, // Slightly transparent
        innerGlow: true,
        innerGlowColor: '#e0ffff',
        innerGlowIntensity: 0.5,
        rimLight: true,
        rimLightColor: '#ffffff',
        particleType: 'none',
        particleColor: '#e0ffff',
        particleColor2: '#ffffff',
        textureMap: getAssetUrl('/textures/ice_diffuse.png'),
        price: 250,
        description: "Ne fond jamais, même dans un volcan.",
        rarity: 'rare'
    },
    ecorce_ancienne: {
        id: 'ecorce_ancienne',
        name: 'Écorce Ancienne',
        bodyColor: '#3d3d2d', // Fallback dark bark
        edgeColor: '#4a4a3a',
        borderColor: '#6b8e23', // Olive green lichen
        textColor: '#c0c0a0', // Light tan
        shadowColor: '#1a1a10',
        metalness: 0,
        roughness: 0.95, // Very rough bark
        envMapIntensity: 0.2,
        effectType: 'organic',
        emissive: '#2d2d1d',
        emissiveIntensity: 0.05,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#6b8e23',
        particleType: 'none',
        particleColor: '#6b8e23',
        particleColor2: '#3d3d2d',
        textureMap: getAssetUrl('/textures/bark_diffuse.png'),
        price: 125,
        description: "La nature reprend toujours ses droits.",
        rarity: 'uncommon'
    },
    parchemin_ancien: {
        id: 'parchemin_ancien',
        name: 'Parchemin Ancien',
        bodyColor: '#f5deb3', // Fallback wheat
        edgeColor: '#d2b48c', // Tan edges
        borderColor: '#8b4513', // Sienna ink
        textColor: '#4a3728', // Dark brown ink
        shadowColor: '#8b7355',
        metalness: 0,
        roughness: 0.7, // Paper texture
        envMapIntensity: 0.3,
        effectType: 'organic',
        emissive: '#d2b48c',
        emissiveIntensity: 0.05,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#000000',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#d2b48c',
        particleType: 'none',
        particleColor: '#d2b48c',
        particleColor2: '#f5deb3',
        textureMap: getAssetUrl('/textures/parchment_diffuse.png'),
        price: 50,
        description: "Les mots ont un pouvoir.",
        rarity: 'common'
    },
    meteore_sang: {
        id: 'meteore_sang',
        name: 'Météore',
        bodyColor: '#1a1a1a',
        edgeColor: '#4a0000',
        borderColor: '#ff0000',
        textColor: '#ffffff',
        shadowColor: '#000000',
        metalness: 0.4,
        roughness: 0.9,
        envMapIntensity: 0.8,
        effectType: 'stone',
        emissive: '#660000',
        emissiveIntensity: 1.2,
        opacity: 1,
        innerGlow: true,
        innerGlowColor: '#ff0000',
        innerGlowIntensity: 0.6,
        rimLight: true,
        rimLightColor: '#ff0000',
        particleType: 'none',
        particleColor: '#ff0000',
        textureMap: getAssetUrl('/textures/lava_diffuse.png'),
        price: 1500,
        description: "Tombé du ciel pendant une éclips de sang.",
        rarity: 'epic'
    },
    marbre_emeraude: {
        id: 'marbre_emeraude',
        name: 'Marbre Émeraude',
        bodyColor: '#0f7a44',   // deep emerald body
        edgeColor: '#e8b54a',   // saturated metallic gold veins
        borderColor: '#32cd32',
        textColor: '#ffffff',
        shadowColor: '#003322',
        metalness: 0.2,
        roughness: 0.15,
        envMapIntensity: 1.2,
        effectType: 'stone',
        emissive: '#00150c',
        emissiveIntensity: 0.08,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#aaffcc',
        particleType: 'none',
        particleColor: '#ffffff',
        price: 500,
        description: "Un mélange élégant de vagues émeraudes et de veines dorées.",
        rarity: 'rare'
    },
    marbre_ambre: {
        id: 'marbre_ambre',
        name: 'Marbre Ambré',
        bodyColor: '#8a4a18',   // deep amber/caramel body
        edgeColor: '#fff3df',   // creamy white veins (reads better than gold on amber)
        borderColor: '#d2691e',
        textColor: '#ffffff',
        shadowColor: '#3a1f08',
        metalness: 0.2,
        roughness: 0.15,
        envMapIntensity: 1.2,
        effectType: 'stone',
        emissive: '#1a0d03',
        emissiveIntensity: 0.08,
        opacity: 1,
        innerGlow: false,
        innerGlowColor: '#ffffff',
        innerGlowIntensity: 0,
        rimLight: true,
        rimLightColor: '#ffd9a0',
        particleType: 'none',
        particleColor: '#ffffff',
        price: 500,
        description: "Un mélange élégant de vagues ambrées et de veines dorées.",
        rarity: 'rare'
    }
};

// Default skin
export const DEFAULT_SKIN = DICE_SKINS.gold;

// Helper to get skin by ID or return default
export const getSkinById = (skinId: string): DiceSkin => {
    return DICE_SKINS[skinId] || DEFAULT_SKIN;
};
