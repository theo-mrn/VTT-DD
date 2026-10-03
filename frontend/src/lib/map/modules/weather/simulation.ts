/**
 * Simulation de la météo, sans Pixi ni DOM (docs/carte.md § 10, Météo), testée à blanc.
 *
 * - Les particules sont des `WeatherParticle` : les champs que Pixi lit (`IParticle` : x, y,
 *   échelles, ancre, rotation, couleur, texture) et ceux de la simulation, dans le même objet.
 *   Le `ParticleContainer` du rendu les lit tels quels : aucune copie.
 * - Tout est en pixels d'écran (CSS). Une particule qui sort par un bord revient par l'autre ;
 *   `shift` décale tout du déplacement de la carte (ancrage au monde).
 * - Aucune allocation par image : particules, tableaux et valeurs des couches (`frame`) sont
 *   créés par `configure`, au changement de météo, de préférence ou de taille de la vue.
 * - Voile, nappes, éclair, vignette et grain sont des valeurs (`frame`) que le rendu applique.
 */
import type { Texture } from 'pixi.js';
import { ATLAS } from './atlas';
import type { AtlasFrame, EmitterSpec, Range, WeatherEffect } from './effects';
import { baseLevel, overdrive, particleBudget, STILL_ALPHA, type WeatherSettings } from './model';

/** Marge hors de la vue où les particules continuent de vivre (px). */
export const WRAP_MARGIN = 48;
/** Taille du motif de bruit des nappes (px, avant agrandissement). */
export const NOISE_SIZE = 256;
/** Bandes de brouillage des parasites, au plus. */
export const MAX_BANDS = 5;

const TAU = Math.PI * 2;

/** Couleur Pixi d'une particule : teinte BVR et opacité sur l'octet haut (comme `Particle`). */
export const packColor = (bgr: number, alpha: number) => bgr + (((alpha * 255) | 0) << 24);

/** RVB → BVR (ordre des octets de la couleur des particules). */
export const toBgr = (rgb: number) => ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);

const lerp = (r: Range, t: number) => r[0] + (r[1] - r[0]) * t;
function smoothstep(t: number): number {
  if (t <= 0) return 0;
  return t >= 1 ? 1 : t * t * (3 - 2 * t);
}
const mod = (v: number, m: number) => ((v % m) + m) % m;
/** Respiration lente d'une opacité : 1 ± `depth` / 2, période en secondes. */
const breathe = (b: { period: number; depth: number } | undefined, t: number) =>
  b ? 1 - b.depth / 2 + (b.depth / 2) * Math.sin((TAU * t) / b.period) : 1;

/** Enveloppe d'un éclair : montée douce en 90 ms, extinction exponentielle (≈ 0,7 s). */
export function flashEnvelope(t: number): number {
  if (t < 0) return 0;
  if (t < 0.09) return smoothstep(t / 0.09);
  return Math.exp(-(t - 0.09) / 0.22);
}

export class WeatherParticle {
  // ─── Lu par Pixi (`IParticle`) ───
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  anchorX = 0.5;
  anchorY = 0.5;
  rotation = 0;
  color = -1;
  /** Posée par le rendu (frame de l'atlas) ; absente à blanc. */
  texture = null as unknown as Texture;
  // ─── Simulation ───
  frame: AtlasFrame = 'dot';
  bgr = 0xffffff;
  /** Opacité tirée, puis celle de l'intensité (renfort), avant scintillement et vie. */
  a0 = 1;
  alpha = 1;
  sx = 1;
  sy = 1;
  vx = 0;
  vy = 0;
  depth = 1;
  /** Tirages fixes : vitesse de chute et part du vent. */
  r1 = 0;
  r2 = 0;
  phase = 0;
  omega = 0;
  amp = 0;
  spin = 0;
  flipPhase = 0;
  flipOmega = 0;
  flickerPhase = 0;
  flickerOmega = 0;
  age = 0;
  life = 0;
}

/** Un émetteur : ses particules (le tableau que lit le `ParticleContainer`). */
export class EmitterState {
  readonly particles: WeatherParticle[] = [];
  private readonly spare: WeatherParticle[] = [];
  /** Propriétés fixes changées (nombre, texture, rotation…) : le rendu doit tout renvoyer. */
  staticDirty = true;
  /** Direction du balancement (perpendiculaire au mouvement moyen). */
  perpX = 1;
  perpY = 0;

  constructor(readonly spec: EmitterSpec) {}

  /** Ajuste le nombre de particules ; renvoie celles à tirer (nouvelles). */
  resize(count: number): number {
    const list = this.particles;
    const before = list.length;
    if (count < before) {
      for (let i = count; i < before; i++) this.spare.push(list[i]!);
      list.length = count;
    } else {
      for (let i = before; i < count; i++) list.push(this.spare.pop() ?? new WeatherParticle());
    }
    if (count !== before) this.staticDirty = true;
    return count - before;
  }
}

export interface MistState {
  color: number;
  alpha: number;
  scale: number;
  x: number;
  y: number;
}

export interface BandState {
  y: number;
  h: number;
  shift: number;
  alpha: number;
}

/** Valeurs des couches hors particules, mises à jour sur place. */
export interface WeatherFrame {
  veil: { color: number; alpha: number };
  mists: MistState[];
  flash: { color: number; alpha: number };
  vignette: { color: number; alpha: number };
  noise: { alpha: number; x: number; y: number };
  scanlines: { alpha: number; y: number };
  bands: BandState[];
  bandCount: number;
}

export interface SimOptions {
  /** Réglages économes : plafonds bas (Windows, machine modeste). */
  windows?: boolean;
  /** Part du budget de particules gardée (dégradation automatique). */
  scale?: number;
  /** Image fixe : animation coupée ou « mouvement réduit ». */
  still?: boolean;
  /** Éclairs et clignotements permis. */
  flashes?: boolean;
}

export class WeatherSim {
  settings: WeatherSettings | null = null;
  emitters: EmitterState[] = [];
  /** Change quand la liste des émetteurs change (le rendu refait ses conteneurs). */
  structure = 0;
  readonly frame: WeatherFrame = {
    veil: { color: 0, alpha: 0 },
    mists: [],
    flash: { color: 0xffffff, alpha: 0 },
    vignette: { color: 0, alpha: 0 },
    noise: { alpha: 0, x: 0, y: 0 },
    scanlines: { alpha: 0, y: 0 },
    bands: Array.from({ length: MAX_BANDS }, () => ({ y: 0, h: 0, shift: 0, alpha: 0 })),
    bandCount: 0,
  };
  width = 0;
  height = 0;
  still = false;
  flashes = true;
  /** Temps de la météo (s), qui n'avance que pendant l'animation. */
  time = 0;
  private effect: WeatherEffect | null = null;
  private strikeIn = 0;
  private strikeT = -1;
  private strikeDouble = false;
  private noiseIn = 0;
  private bandsIn = 0;
  /** Renfort de l'intensité au-delà de 1 (opacités, vitesses, éclairs), fixé par `configure`. */
  private alphaBoost = 1;
  private speedBoost = 1;
  private boltBoost = 1;

  constructor(private readonly rng: () => number = Math.random) {}

  get active(): boolean {
    return this.settings !== null && this.width > 0 && this.height > 0;
  }

  get particleCount(): number {
    let n = 0;
    for (let k = 0; k < this.emitters.length; k++) n += this.emitters[k]!.particles.length;
    return n;
  }

  /**
   * Nouvelle météo, nouvelles préférences ou nouvelle taille de vue. Un changement d'intensité
   * garde les particules en place (on en ajoute ou on en retire) ; un changement d'effet repart
   * de zéro.
   */
  configure(settings: WeatherSettings | null, width: number, height: number, opts: SimOptions) {
    const effect = settings?.effect ?? null;
    this.settings = settings;
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
    this.still = opts.still === true;
    this.flashes = opts.flashes !== false;
    const strong = effect?.strong;
    const intensity = settings?.intensity ?? 0;
    this.alphaBoost = overdrive(intensity, strong?.alpha);
    this.speedBoost = overdrive(intensity, strong?.speed);
    this.boltBoost = overdrive(intensity, strong?.lightning);
    if (effect !== this.effect) {
      this.effect = effect;
      this.emitters = effect ? effect.emitters.map((spec) => new EmitterState(spec)) : [];
      this.structure += 1;
      this.time = 0;
      this.frame.mists = (effect?.mists ?? []).map((m) => ({
        color: m.color,
        alpha: 0,
        scale: m.scale,
        x: this.rng() * NOISE_SIZE * m.scale,
        y: this.rng() * NOISE_SIZE * m.scale,
      }));
      this.strikeT = -1;
      this.strikeIn = this.nextStrike();
    }
    if (!settings || !this.active) {
      for (const e of this.emitters) e.resize(0);
      this.updateLayers();
      return;
    }
    const counts = particleBudget(settings.effect, {
      width: this.width,
      height: this.height,
      intensity: settings.intensity,
      windows: opts.windows,
      scale: opts.scale,
      still: this.still,
    });
    this.emitters.forEach((e, i) => {
      const before = e.particles.length;
      const added = e.resize(counts[i] ?? 0);
      for (let k = 0; k < added; k++) this.spawn(e, e.particles[before + k]!);
      this.orient(e, settings);
      for (const p of e.particles) {
        this.motion(e.spec, p, settings);
        this.wrap(p);
      }
      e.staticDirty = true;
    });
    this.updateLayers();
  }

  /** Décalage de la carte à l'écran (pan) : tout suit la carte, puis revient par l'autre bord. */
  shift(dx: number, dy: number) {
    if (!this.active || (dx === 0 && dy === 0)) return;
    const m = WRAP_MARGIN;
    const spanX = this.width + 2 * m;
    const spanY = this.height + 2 * m;
    for (let k = 0; k < this.emitters.length; k++) {
      const list = this.emitters[k]!.particles;
      for (let i = 0; i < list.length; i++) {
        const p = list[i]!;
        p.x = mod(p.x + dx + m, spanX) - m;
        p.y = mod(p.y + dy + m, spanY) - m;
      }
    }
    for (let k = 0; k < this.frame.mists.length; k++) {
      const mist = this.frame.mists[k]!;
      const period = NOISE_SIZE * mist.scale;
      mist.x = mod(mist.x + dx, period);
      mist.y = mod(mist.y + dy, period);
    }
    const noise = this.frame.noise;
    noise.x += dx;
    noise.y += dy;
  }

  /** Une image : `dt` en secondes (déjà borné par le pilote). */
  step(dt: number) {
    const s = this.settings;
    if (!s || !this.active || this.still || dt <= 0) return;
    this.time += dt;
    for (let k = 0; k < this.emitters.length; k++) this.stepEmitter(this.emitters[k]!, dt);
    // Nappes : dérive avec le vent (angle propre à chacune), un plancher les garde en mouvement
    const specs = s.effect.mists;
    const mists = this.frame.mists;
    for (let i = 0; specs && i < specs.length && i < mists.length; i++) {
      const spec = specs[i]!;
      const mist = mists[i]!;
      const rad = ((s.wind.direction + (spec.angle ?? 0)) * Math.PI) / 180;
      const speed = spec.speed * Math.max(0.25, s.wind.strength) * this.speedBoost;
      const period = NOISE_SIZE * mist.scale;
      mist.x = mod(mist.x + Math.cos(rad) * speed * dt, period);
      mist.y = mod(mist.y + Math.sin(rad) * speed * dt, period);
    }
    this.stepLightning(dt);
    this.stepStatic(dt);
    this.updateLayers();
  }

  private stepEmitter(e: EmitterState, dt: number) {
    const spec = e.spec;
    const list = e.particles;
    const m = WRAP_MARGIN;
    const w = this.width;
    const h = this.height;
    const perpX = e.perpX;
    const perpY = e.perpY;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      if (spec.life) {
        // Éclaboussure : immobile, grandit et s'efface, puis renaît ailleurs
        p.age += dt;
        if (p.age >= p.life) {
          p.age -= p.life;
          p.x = this.rng() * w;
          p.y = this.rng() * h;
        }
        const t = p.age / p.life;
        const grow = spec.grow ? lerp(spec.grow, t) : 1;
        p.scaleX = p.sx * grow;
        p.scaleY = p.sy * grow;
        const fade = 1 - t;
        p.color = packColor(p.bgr, p.alpha * fade * fade);
        continue;
      }
      let x = p.x + p.vx * dt;
      let y = p.y + p.vy * dt;
      if (p.amp > 0) {
        p.phase += p.omega * dt;
        const d = p.amp * p.omega * Math.cos(p.phase) * dt;
        x += perpX * d;
        y += perpY * d;
      }
      if (p.spin !== 0) p.rotation += p.spin * dt;
      if (p.flipOmega > 0) {
        p.flipPhase += p.flipOmega * dt;
        const c = Math.cos(p.flipPhase);
        p.scaleY = p.sy * (c >= 0 ? Math.max(0.15, c) : Math.min(-0.15, c));
      }
      if (p.flickerOmega > 0) {
        p.flickerPhase += p.flickerOmega * dt;
        p.color = packColor(p.bgr, p.alpha * (0.6 + 0.4 * Math.sin(p.flickerPhase)));
      }
      // Sortie par un bord : retour par l'autre, à une place tirée le long de ce bord
      if (x < -m) {
        x += w + 2 * m;
        y = -m + this.rng() * (h + 2 * m);
      } else if (x > w + m) {
        x -= w + 2 * m;
        y = -m + this.rng() * (h + 2 * m);
      }
      if (y < -m) {
        y += h + 2 * m;
        x = -m + this.rng() * (w + 2 * m);
      } else if (y > h + m) {
        y -= h + 2 * m;
        x = -m + this.rng() * (w + 2 * m);
      }
      p.x = x;
      p.y = y;
    }
  }

  private stepLightning(dt: number) {
    const bolt = this.settings?.effect.lightning;
    const flash = this.frame.flash;
    if (!bolt || !this.flashes) {
      flash.alpha = 0;
      this.strikeT = -1;
      return;
    }
    this.strikeIn -= dt;
    if (this.strikeIn <= 0 && this.strikeT < 0) {
      this.strikeT = 0;
      this.strikeDouble = this.rng() < 0.4;
      this.strikeIn = this.nextStrike();
    } else if (this.strikeT >= 0) {
      this.strikeT += dt;
      if (this.strikeT > 1.4) this.strikeT = -1;
    }
  }

  private stepStatic(dt: number) {
    const spec = this.settings?.effect.static;
    if (!spec) return;
    const noise = this.frame.noise;
    // Grain : saute à 15 i/s (6 i/s sans clignotements)
    this.noiseIn -= dt;
    if (this.noiseIn <= 0) {
      this.noiseIn = this.flashes ? 1 / 15 : 1 / 6;
      noise.x = this.rng() * 512;
      noise.y = this.rng() * 512;
    }
    const lines = this.frame.scanlines;
    lines.y = mod(lines.y + 12 * dt, 3);
    // Bandes de brouillage : nouvelles toutes les 120 ms, seulement avec les clignotements
    this.bandsIn -= dt;
    if (this.bandsIn <= 0) {
      this.bandsIn = 0.12;
      const intensity = baseLevel(this.settings!.intensity);
      const count = this.flashes ? Math.min(MAX_BANDS, Math.round(intensity * MAX_BANDS)) : 0;
      this.frame.bandCount = count;
      for (let i = 0; i < count; i++) {
        const b = this.frame.bands[i]!;
        b.y = this.rng() * this.height;
        b.h = 2 + this.rng() * 14;
        b.shift = (this.rng() - 0.5) * 30 * intensity;
      }
    }
  }

  /** Opacités du voile, des nappes, de l'éclair, de la vignette et du grain au temps courant. */
  private updateLayers() {
    const f = this.frame;
    const s = this.settings;
    const effect = s?.effect;
    // Plages des effets jusqu'à l'ancien maximum, puis le renfort (opacités bornées à 1)
    const i = baseLevel(s?.intensity ?? 0);
    const t = this.time;
    const quiet = (this.still ? 0.8 : 1) * this.alphaBoost;

    const veil = effect?.veil;
    f.veil.color = veil?.color ?? 0;
    f.veil.alpha =
      veil && s ? Math.min(1, lerp(veil.alpha, i) * breathe(veil.breathe, t) * quiet) : 0;

    const specs = effect?.mists;
    for (let k = 0; specs && k < specs.length && k < f.mists.length; k++)
      f.mists[k]!.alpha = Math.min(
        1,
        lerp(specs[k]!.alpha, i) * breathe(specs[k]!.breathe, t) * quiet,
      );

    const bolt = effect?.lightning;
    if (bolt && this.flashes && !this.still && this.strikeT >= 0) {
      const peak = lerp(bolt.peak, i);
      const a =
        flashEnvelope(this.strikeT) +
        (this.strikeDouble ? 0.6 * flashEnvelope(this.strikeT - 0.2) : 0);
      f.flash.color = bolt.color;
      f.flash.alpha = Math.min(peak, peak * a);
    } else f.flash.alpha = 0;

    const vignette = effect?.vignette;
    f.vignette.color = vignette?.color ?? 0;
    let pulse = 0;
    if (vignette)
      pulse =
        this.flashes && !this.still ? breathe(vignette.pulse, t) : 1 - vignette.pulse.depth / 2;
    f.vignette.alpha = vignette ? Math.min(1, lerp(vignette.alpha, i) * pulse * quiet) : 0;

    const noise = effect?.static;
    f.noise.alpha = noise ? Math.min(1, lerp(noise.noise, i) * quiet) : 0;
    f.scanlines.alpha = noise ? Math.min(1, lerp(noise.scanlines, i) * quiet) : 0;
    if (noise) {
      const bandAlpha = Math.min(1, lerp(noise.bands, i) * this.alphaBoost);
      for (let k = 0; k < f.bands.length; k++) f.bands[k]!.alpha = bandAlpha;
    }
    if (!noise || this.still || !this.flashes) f.bandCount = 0;
  }

  private nextStrike(): number {
    const bolt = this.settings?.effect.lightning;
    if (!bolt) return Infinity;
    const i = baseLevel(this.settings!.intensity);
    // Plus l'orage est fort, plus les éclairs sont fréquents : 4 à 12 s à l'intensité 1, deux
    // fois plus souvent à 2 (renfort de l'effet)
    return lerp(bolt.interval, this.rng()) / (0.5 + 0.5 * i) / this.boltBoost;
  }

  /** Direction du balancement : perpendiculaire au mouvement moyen de l'émetteur. */
  private orient(e: EmitterState, s: WeatherSettings) {
    const spec = e.spec;
    const fall = (spec.fall[0] + spec.fall[1]) / 2;
    const vx = s.wind.x * spec.drift;
    const vy = fall + s.wind.y * spec.drift;
    const len = Math.hypot(vx, vy);
    if (len < 1e-3) {
      e.perpX = 1;
      e.perpY = 0;
    } else {
      e.perpX = -vy / len;
      e.perpY = vx / len;
    }
  }

  /** Tire une nouvelle particule : place, apparence, rythmes. */
  private spawn(e: EmitterState, p: WeatherParticle) {
    const spec = e.spec;
    const rng = this.rng;
    const m = WRAP_MARGIN;
    p.x = spec.life ? rng() * this.width : -m + rng() * (this.width + 2 * m);
    p.y = spec.life ? rng() * this.height : -m + rng() * (this.height + 2 * m);
    p.frame = spec.frames[Math.floor(rng() * spec.frames.length)] ?? 'dot';
    p.bgr = toBgr(spec.tints[Math.floor(rng() * spec.tints.length)] ?? 0xffffff);
    p.depth = spec.depth ? lerp(spec.depth, rng()) : 1;
    p.r1 = rng();
    p.r2 = rng();
    const rect = ATLAS[p.frame];
    const size = lerp(spec.size, rng()) * (0.7 + 0.3 * p.depth);
    p.sx = size / rect.nominal;
    p.sy = spec.length
      ? lerp(spec.length, rng()) / (rect.nominalLength ?? rect.h)
      : // Feuilles et points : même échelle sur les deux axes
        p.sx;
    p.scaleX = p.sx;
    p.scaleY = p.sy;
    p.anchorX = 0.5;
    p.anchorY = 0.5;
    p.a0 = lerp(spec.alpha, rng()) * (0.5 + 0.5 * p.depth);
    p.rotation = spec.spin ? rng() * TAU : 0;
    p.spin = spec.spin ? lerp(spec.spin, rng()) * randomSign(rng) : 0;
    p.amp = spec.sway ? lerp(spec.sway.amp, rng()) : 0;
    p.omega = spec.sway ? TAU * lerp(spec.sway.freq, rng()) : 0;
    p.phase = rng() * TAU;
    p.flipOmega = spec.flip ? TAU * lerp(spec.flip, rng()) : 0;
    p.flipPhase = rng() * TAU;
    p.flickerOmega = spec.flicker ? TAU * lerp(spec.flicker, rng()) : 0;
    p.flickerPhase = rng() * TAU;
    p.life = spec.life ? lerp(spec.life, rng()) : 0;
    p.age = spec.life ? rng() * p.life : 0;
  }

  /** Vitesse selon le vent courant, orientation des traînées, couleur de base. */
  private motion(spec: EmitterSpec, p: WeatherParticle, s: WeatherSettings) {
    // Renfort de l'intensité : plus rapides et plus opaques
    const fall = lerp(spec.fall, p.r1) * p.depth * this.speedBoost;
    const drift = spec.drift * (0.75 + 0.5 * p.r2) * p.depth * this.speedBoost;
    p.alpha = Math.min(1, p.a0 * this.alphaBoost);
    p.vx = s.wind.x * drift;
    p.vy = fall + s.wind.y * drift;
    if (spec.length) {
      // Traînée dessinée vers le bas : tournée dans le sens de sa vitesse
      p.rotation = Math.atan2(p.vy, p.vx) - Math.PI / 2;
    }
    const alpha = p.alpha * (this.still ? STILL_ALPHA : 1);
    p.color = packColor(p.bgr, spec.life ? 0 : alpha);
    if (this.still) {
      // Image fixe : ni retournement ni scintillement
      p.scaleY = p.sy;
    }
  }

  /** Ramène une particule dans la vue élargie (après un changement de taille). */
  private wrap(p: WeatherParticle) {
    const m = WRAP_MARGIN;
    p.x = mod(p.x + m, this.width + 2 * m) - m;
    p.y = mod(p.y + m, this.height + 2 * m) - m;
  }
}

/** −1 ou 1, à pile ou face. */
const randomSign = (rng: () => number) => (rng() < 0.5 ? -1 : 1);
