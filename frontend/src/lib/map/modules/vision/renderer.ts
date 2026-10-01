/**
 * Rendu de la visibilité (docs/carte.md § 9, Rendu), PixiJS v8, dans le plan `vision`.
 *
 * Quatre textures à l'échelle de l'écran, refaites seulement quand un de leurs termes change
 * (caméra, zones, lumières, observateurs) :
 * - `range` (¼ de la résolution, floutée) : où la portée n'est pas coupée, hors observateur :
 *   hors brouillard (zones dans l'ordre, `fog` en `erase`, `clear` en blanc) ∪ zones éclairées ;
 * - `fog` (¼, floutée) : le brouillard lui-même (où dessiner la brume) ;
 * - `glow` (¼) : lueurs additives des lumières (couleur, intensité, dégradé), coupées par leur
 *   ligne de vue (polygone éventail) ;
 * - `mist` (¼) : densité de la brume (bruit fractal ancré au monde, lent, désactivable), refaite
 *   seulement quand elle dérive ou que la caméra bouge : le bruit coûte cher, il est calculé sur
 *   un seizième des pixels puis lissé par le filtrage ;
 * - `vis` (½) : Vu = ⋃ observateurs, chacun dessiné sous masques stencil : sa ligne de vue
 *   (éventail exact, aucun mur soudé percé), sa pièce de confinement, moins les pièces fermées
 *   qui ne le contiennent pas ; dedans, `range` ∪ son disque de vision (bord doux), en `max`.
 *   Derrière un mur translucide, la même chose atténuée de son opacité. Le flou ne touche que
 *   `range` et `fog`, avant le découpage par les murs : les bords de la vue suivent les murs.
 *
 * Puis un seul quadrilatère (le rectangle visible de la carte) et un shader composent :
 * obscurité (`darkness × (1 − vu)`), brume (densité de `mist`) là où il y a du brouillard et
 * pas de vue, lueurs × vu. Sortie en alpha prémultiplié : obscurcit et éclaire en une passe.
 */
import type * as Pixi from 'pixi.js';
import type { FogZone, Polygon, Vec } from '@vtt/vision';
import { destroyDisplay } from '../../engine/destroy-display';
import type { MapTheme } from '../../engine/entities/entity-kind';
import type { LightLayer, ViewerLayer, VisionPicture } from './vision-state';

/** Résolutions des textures, en part de la résolution de la vue. */
export const VIS_RESOLUTION = 0.5;
export const SOFT_RESOLUTION = 0.25;
/** Flou (pixels CSS) des bords de portée et du brouillard. */
export const RANGE_BLUR = 3;
export const FOG_BLUR = 10;
/** Bord doux du disque de vision : part du rayon. */
export const DISC_SOFT_EDGE = 0.12;
/** Période du bruit de la brume, en cases. */
export const FOG_PERIOD_CELLS = 3;
/** Pendant un pan ou un zoom : textures refaites au plus toutes les … ms. */
export const CAMERA_REFRESH_MS = 60;

export interface CameraView {
  x: number;
  y: number;
  zoom: number;
  /** Taille de la vue en pixels CSS. */
  width: number;
  height: number;
}

const VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

/** Lueur d'une lumière : `vUV` = écart au centre en rayons. */
const GLOW_FRAGMENT = `
in vec2 vUV;
out vec4 finalColor;
uniform vec3 uLightColor;
uniform float uIntensity;
uniform float uFalloff;
void main() {
  float d = length(vUV);
  float inner = 1.0 - clamp(uFalloff, 0.0, 1.0);
  float k = d <= inner ? 1.0 : 1.0 - smoothstep(inner, 1.0, d);
  float core = 1.0 - smoothstep(0.0, 0.7, d);
  float a = uIntensity * k * (0.32 + 0.22 * core);
  finalColor = vec4(uLightColor * a, 0.0);
}
`;

/**
 * Densité de la brume (canal rouge), au quart de la résolution : `vUV` couvre la vue, `uWorld`
 * la place dans le monde. Rien hors du brouillard.
 */
const MIST_FRAGMENT = `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uFog;
uniform vec4 uWorld;
uniform float uNoiseScale;
uniform float uPeriodPx;
uniform float uTime;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Bruit fractal, 3 octaves ; une octave plus fine que 2 texels s'efface (pas de scintillement).
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  float total = 0.0;
  float period = uPeriodPx;
  for (int i = 0; i < 3; i++) {
    float w = amp * clamp((period - 2.0) / 4.0, 0.0, 1.0);
    v += w * vnoise(p);
    total += w;
    p = p * 2.03 + vec2(17.0, 9.0);
    amp *= 0.5;
    period *= 0.5;
  }
  return total > 0.0 ? v / total : 0.5;
}

void main() {
  if (texture(uFog, vUV).a <= 0.001) {
    finalColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 p = (uWorld.xy + vUV * uWorld.zw) * uNoiseScale;
  float n = 0.62 * fbm(p + vec2(uTime * 0.021, uTime * 0.013))
    + 0.38 * fbm(p * 1.7 + vec2(-uTime * 0.017, uTime * 0.024) + 31.0);
  finalColor = vec4(smoothstep(0.25, 0.85, n), 0.0, 0.0, 1.0);
}
`;

/** Composition : obscurité, brume, lueurs (alpha prémultiplié). */
const COMPOSITE_FRAGMENT = `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uVis;
uniform sampler2D uFog;
uniform sampler2D uMist;
uniform sampler2D uGlow;
uniform float uDarkness;
uniform float uFogAlpha;
uniform float uFogOn;
uniform float uGlowOn;
uniform float uGlowFloor;
uniform vec3 uShadowColor;
uniform vec3 uFogDark;
uniform vec3 uFogLight;

void main() {
  float vis = texture(uVis, vUV).a;
  float dark = uDarkness * (1.0 - vis);
  vec3 rgb = uShadowColor * dark;
  float a = dark;
  if (uFogOn > 0.5) {
    float fog = texture(uFog, vUV).a * (1.0 - vis);
    if (fog > 0.001) {
      float density = texture(uMist, vUV).r;
      float fa = fog * uFogAlpha * mix(0.72, 1.0, density);
      vec3 fc = mix(uFogDark, uFogLight, density);
      rgb = fc * fa + rgb * (1.0 - fa);
      a = fa + a * (1.0 - fa);
    }
  }
  if (uGlowOn > 0.5) {
    vec3 glow = texture(uGlow, vUV).rgb;
    rgb += glow * mix(uGlowFloor, 1.0, vis);
  }
  finalColor = vec4(rgb, a);
}
`;

const rgb = (color: number): Float32Array =>
  new Float32Array([((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255]);

const mixColor = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

// ─── Éventail : polygone étoilé autour d'une origine, triangulé en O(n) ─────

/**
 * Polygone étoilé (ligne de vue, aire d'une lumière) dessiné en éventail depuis son origine :
 * exact, sans triangulation générale, tampons réutilisés (seul `indexCount` change).
 */
class Fan {
  readonly mesh: Pixi.Mesh<Pixi.MeshGeometry, Pixi.Shader>;
  private readonly geometry: Pixi.MeshGeometry;
  private capacity: number;

  constructor(
    private readonly pixi: typeof Pixi,
    shader: Pixi.Shader | null = null,
  ) {
    this.geometry = new pixi.MeshGeometry({
      positions: new Float32Array(6),
      uvs: new Float32Array(6),
      indices: new Uint32Array([0, 1, 2]),
    });
    this.capacity = 3;
    this.mesh = shader
      ? new pixi.Mesh({ geometry: this.geometry, shader })
      : new pixi.Mesh({ geometry: this.geometry, texture: pixi.Texture.WHITE });
  }

  /** `uv` : centre et rayon pour des coordonnées de texture en rayons (lueurs). */
  set(origin: Vec, polygon: Polygon, uv?: { cx: number; cy: number; r: number }) {
    const n = polygon.length >> 1;
    const g = this.geometry;
    if (n < 2) {
      // Rien à couvrir : un triangle nul (`indexCount = 0` dessinerait tout le tampon)
      const pos = g.positions;
      pos[0] = pos[2] = pos[4] = origin.x;
      pos[1] = pos[3] = pos[5] = origin.y;
      const idx = g.indices;
      idx[0] = 0;
      idx[1] = 1;
      idx[2] = 2;
      g.getBuffer('aPosition').update();
      g.indexBuffer.update();
      g.indexCount = 3;
      return;
    }
    if (n + 1 > this.capacity) {
      this.capacity = Math.ceil((n + 1) * 1.5);
      g.positions = new Float32Array(this.capacity * 2);
      g.uvs = new Float32Array(this.capacity * 2);
      const indices = new Uint32Array(this.capacity * 3);
      g.indices = indices;
    }
    const pos = g.positions;
    const uvs = g.uvs;
    const idx = g.indices;
    pos[0] = origin.x;
    pos[1] = origin.y;
    for (let i = 0; i < n; i++) {
      pos[2 + 2 * i] = polygon[2 * i]!;
      pos[3 + 2 * i] = polygon[2 * i + 1]!;
      idx[3 * i] = 0;
      idx[3 * i + 1] = 1 + i;
      idx[3 * i + 2] = 1 + ((i + 1) % n);
    }
    if (uv) {
      for (let i = 0; i <= n; i++) {
        uvs[2 * i] = (pos[2 * i]! - uv.cx) / uv.r;
        uvs[2 * i + 1] = (pos[2 * i + 1]! - uv.cy) / uv.r;
      }
      g.getBuffer('aUV').update();
    }
    g.getBuffer('aPosition').update();
    g.indexBuffer.update();
    g.indexCount = 3 * n;
  }

  destroy() {
    this.mesh.destroy();
    this.geometry.destroy();
  }
}

// ─── Observateur : ses masques et son contenu ────────────────────────────────

class ViewerNode {
  readonly root: Pixi.Container;
  private readonly los: Fan;
  private readonly clipGfx: Pixi.Graphics;
  private readonly clipBox: Pixi.Container;
  private readonly subGfx: Pixi.Graphics;
  private readonly subBox: Pixi.Container;
  private readonly body: Pixi.Container;
  /** Contenus (portée ∪ disque) : un sans ombre partielle, un par ombre. */
  private contents: Pixi.Container[] = [];
  /** Contours dessinés (mêmes objets que la scène préparée : une scène neuve les refait). */
  private clipRef: Polygon | null = null;
  private subRefs: readonly Polygon[] = [];
  private shadowsRef: ViewerLayer['translucent'] | null = null;

  constructor(
    private readonly pixi: typeof Pixi,
    private readonly makeContent: () => Pixi.Container,
  ) {
    this.root = new pixi.Container({ label: 'vision:viewer' });
    this.los = new Fan(pixi);
    this.root.addChild(this.los.mesh);
    this.root.mask = this.los.mesh;
    this.clipGfx = new pixi.Graphics();
    this.clipBox = new pixi.Container();
    this.clipBox.addChild(this.clipGfx);
    this.subGfx = new pixi.Graphics();
    this.subBox = new pixi.Container();
    this.subBox.addChild(this.subGfx);
    this.body = new pixi.Container();
    this.subBox.addChild(this.body);
    this.clipBox.addChild(this.subBox);
    this.root.addChild(this.clipBox);
  }

  update(layer: ViewerLayer, content: (c: Pixi.Container) => void) {
    const t = layer.terms;
    this.los.set(t.origin, t.los);
    // Pièce de confinement : l'intérieur seulement
    const clip = t.clipRoom?.polygon ?? null;
    if (clip !== this.clipRef) {
      this.clipRef = clip;
      this.clipGfx.clear();
      if (t.clipRoom) {
        this.clipGfx.poly(Array.from(t.clipRoom.polygon), true).fill(0xffffff);
        this.clipBox.mask = this.clipGfx;
      } else this.clipBox.mask = null;
    }
    // Pièces fermées qui ne le contiennent pas : retirées
    const subs = t.subtractRooms.map((r) => r.polygon);
    if (subs.length !== this.subRefs.length || subs.some((p, i) => p !== this.subRefs[i])) {
      this.subRefs = subs;
      this.subGfx.clear();
      for (const r of t.subtractRooms) this.subGfx.poly(Array.from(r.polygon), true).fill(0xffffff);
      if (t.subtractRooms.length) this.subBox.setMask({ mask: this.subGfx, inverse: true });
      else this.subBox.mask = null;
    }
    if (layer.translucent !== this.shadowsRef || !this.body.children.length) {
      this.shadowsRef = layer.translucent;
      this.rebuildBody(layer);
    }
    for (const c of this.contents) content(c);
  }

  /**
   * Contenu : la portée (hors ombres partielles), puis la même atténuée derrière chaque mur
   * translucide (masquée par son ombre).
   */
  private rebuildBody(layer: ViewerLayer) {
    for (const child of this.body.removeChildren()) destroyDisplay(child);
    const shadows = layer.translucent;
    const open = this.makeContent();
    this.contents = [open];
    if (shadows.length) {
      const all = new this.pixi.Graphics();
      for (const s of shadows) all.poly(Array.from(s.polygon), true).fill(0xffffff);
      const box = new this.pixi.Container();
      box.addChild(all);
      box.setMask({ mask: all, inverse: true });
      box.addChild(open);
      this.body.addChild(box);
      for (const s of shadows) {
        const g = new this.pixi.Graphics().poly(Array.from(s.polygon), true).fill(0xffffff);
        const shaded = new this.pixi.Container({ alpha: 1 - s.opacity });
        shaded.addChild(g);
        shaded.mask = g;
        const content = this.makeContent();
        this.contents.push(content);
        shaded.addChild(content);
        this.body.addChild(shaded);
      }
    } else this.body.addChild(open);
  }

  destroy() {
    this.root.mask = null;
    this.los.destroy();
    destroyDisplay(this.root);
  }
}

// ─── Rendu ───────────────────────────────────────────────────────────────────

interface Target {
  rt: Pixi.RenderTexture;
  scale: number;
}

export class VisionRenderer {
  private readonly targets: Record<'range' | 'fog' | 'mist' | 'glow' | 'vis', Target>;
  private readonly rangeRoot: Pixi.Container;
  private readonly rangeBody: Pixi.Container;
  private readonly rangeZones: Pixi.Container;
  private readonly rangeLights: Pixi.Container;
  private readonly fogRoot: Pixi.Container;
  private readonly fogBody: Pixi.Container;
  private readonly glowRoot: Pixi.Container;
  private readonly visRoot: Pixi.Container;
  private readonly mistRoot: Pixi.Container;
  private readonly mistGeometry: Pixi.MeshGeometry;
  private readonly mistUniforms: Pixi.UniformGroup;
  private mistKey = '';
  private readonly lightFans: Fan[] = [];
  private readonly glowFans: { fan: Fan; shader: Pixi.Shader }[] = [];
  private readonly viewerNodes: ViewerNode[] = [];
  private topDownNode: { root: Pixi.Container; key: string; body: Pixi.Container } | null = null;
  private readonly discTexture: Pixi.Texture;
  private readonly composite: Pixi.Mesh<Pixi.MeshGeometry, Pixi.Shader>;
  private readonly compositeGeometry: Pixi.MeshGeometry;
  private readonly uniforms: Pixi.UniformGroup;
  private readonly contentSprites = new Set<Pixi.Sprite>();

  /** Caméra des textures (celle de leur dernier rendu). */
  private cameraKey = '';
  private rtCam: CameraView | null = null;
  private rtAt = -Infinity;
  private rtRes = 0;
  /** Caméra de l'image précédente, et si elle venait de changer (geste en cours). */
  private drawKey = '';
  private wasMoving = false;
  private fogVersion = -1;
  private lightVersion = -1;
  private viewerVersion = -1;
  private shown = false;
  /**
   * Textures redimensionnées ou observateur ajouté à cette image : le premier rendu dans une
   * texture neuve (ou un masque neuf) peut sortir vide, on les refait à l'image suivante.
   */
  private redrawNext = false;
  private hasFog = false;
  private hasGlow = false;
  private destroyed = false;

  constructor(
    private readonly pixi: typeof Pixi,
    private readonly renderer: Pixi.Renderer,
    private readonly plane: Pixi.Container,
    theme: MapTheme,
    /** Durée CPU des rendus dans les textures (compteur de développement). */
    private readonly onRender?: (ms: number) => void,
  ) {
    const make = (scale: number): Target => ({
      rt: pixi.RenderTexture.create({ width: 1, height: 1, resolution: scale }),
      scale,
    });
    this.targets = {
      range: make(SOFT_RESOLUTION),
      fog: make(SOFT_RESOLUTION),
      mist: make(SOFT_RESOLUTION),
      glow: make(SOFT_RESOLUTION),
      vis: make(VIS_RESOLUTION),
    };

    this.rangeRoot = new pixi.Container({ label: 'vision:range' });
    this.rangeBody = new pixi.Container();
    this.rangeBody.filters = [this.blur(RANGE_BLUR)];
    this.rangeZones = new pixi.Container();
    this.rangeLights = new pixi.Container();
    this.rangeBody.addChild(this.rangeZones, this.rangeLights);
    this.rangeRoot.addChild(this.rangeBody);
    this.fogRoot = new pixi.Container({ label: 'vision:fog' });
    this.fogBody = new pixi.Container();
    this.fogBody.filters = [this.blur(FOG_BLUR)];
    this.fogRoot.addChild(this.fogBody);
    this.glowRoot = new pixi.Container({ label: 'vision:glow' });
    this.visRoot = new pixi.Container({ label: 'vision:vis' });
    this.discTexture = this.makeDiscTexture();

    // Composition : un quadrilatère sur le rectangle visible de la carte
    this.uniforms = new pixi.UniformGroup({
      uDarkness: { value: 1, type: 'f32' },
      uFogAlpha: { value: 0.9, type: 'f32' },
      uFogOn: { value: 0, type: 'f32' },
      uGlowOn: { value: 0, type: 'f32' },
      uGlowFloor: { value: 0, type: 'f32' },
      uShadowColor: { value: rgb(mixColor(theme.background, 0x000000, 0.65)), type: 'vec3<f32>' },
      uFogDark: { value: rgb(mixColor(theme.background, theme.muted, 0.35)), type: 'vec3<f32>' },
      uFogLight: { value: rgb(mixColor(theme.muted, theme.foreground, 0.35)), type: 'vec3<f32>' },
    });
    const shader = pixi.Shader.from({
      gl: { vertex: VERTEX, fragment: COMPOSITE_FRAGMENT, name: 'vision-composite' },
      resources: {
        visionUniforms: this.uniforms,
        uVis: this.targets.vis.rt.source,
        uFog: this.targets.fog.rt.source,
        uMist: this.targets.mist.rt.source,
        uGlow: this.targets.glow.rt.source,
      },
    });

    // Brume : un quadrilatère sur toute la vue (pixels CSS), rendu dans `mist`
    this.mistUniforms = new pixi.UniformGroup({
      uWorld: { value: new Float32Array(4), type: 'vec4<f32>' },
      uNoiseScale: { value: 1 / 150, type: 'f32' },
      uPeriodPx: { value: 150, type: 'f32' },
      uTime: { value: 0, type: 'f32' },
    });
    const mistShader = pixi.Shader.from({
      // Coordonnées du monde dans le bruit : pleine précision (sinon des bandes sur mobile)
      gl: {
        vertex: VERTEX,
        fragment: MIST_FRAGMENT,
        name: 'vision-mist',
        preferredFragmentPrecision: 'highp',
      },
      resources: { mistUniforms: this.mistUniforms, uFog: this.targets.fog.rt.source },
    });
    this.mistGeometry = new pixi.MeshGeometry({
      positions: new Float32Array(8),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.mistRoot = new pixi.Container({ label: 'vision:mist' });
    this.mistRoot.addChild(new pixi.Mesh({ geometry: this.mistGeometry, shader: mistShader }));
    this.compositeGeometry = new pixi.MeshGeometry({
      positions: new Float32Array(8),
      uvs: new Float32Array(8),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.composite = new pixi.Mesh({ geometry: this.compositeGeometry, shader });
    this.composite.label = 'vision:composite';
    this.composite.visible = false;
    plane.addChild(this.composite);
  }

  private blur(strength: number) {
    return new this.pixi.BlurFilter({ strength, quality: 2, resolution: 'inherit' });
  }

  /** Disque de vision au bord doux (dégradé radial blanc), dessiné une fois. */
  private makeDiscTexture(): Pixi.Texture {
    const size = 256;
    const canvas = this.pixi.DOMAdapter.get().createCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1 - DISC_SOFT_EDGE, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return this.pixi.Texture.from(canvas);
  }

  /** Sprite de la texture `range` qui couvre la vue (repère du monde). */
  private rangeSprite(): Pixi.Sprite {
    const s = new this.pixi.Sprite(this.targets.range.rt);
    s.blendMode = 'max';
    this.contentSprites.add(s);
    s.on('destroyed', () => this.contentSprites.delete(s));
    return s;
  }

  /** Contenu d'un observateur : la portée ∪ son disque (placés à chaque mise à jour). */
  private makeViewerContent(): Pixi.Container {
    const c = new this.pixi.Container();
    c.addChild(this.rangeSprite());
    const disc = new this.pixi.Sprite(this.discTexture);
    disc.anchor.set(0.5);
    disc.blendMode = 'max';
    disc.label = 'disc';
    c.addChild(disc);
    return c;
  }

  /**
   * Les textures ont perdu leur contenu (contexte WebGL rendu par le GPU puis restauré) : la
   * prochaine image les refait toutes.
   */
  redrawAll() {
    this.shown = false;
    this.mistKey = '';
  }

  /**
   * Dessine l'image ; ne refait que les textures dont un terme a changé. Pendant un pan ou un
   * zoom (caméra changée deux images de suite), les textures ne sont refaites que toutes les
   * `CAMERA_REFRESH_MS` : entre-temps, la composition les relit à leur place dans le monde
   * (même image, déplacée ou mise à l'échelle). Renvoie vrai si une image est due plus tard
   * pour les refaire à la caméra finale.
   */
  draw(picture: VisionPicture | null, cam: CameraView, time: number): boolean {
    if (this.destroyed) return false;
    if (!picture || cam.width < 1 || cam.height < 1) {
      this.composite.visible = false;
      this.shown = false;
      return false;
    }
    const started = performance.now();
    const res = this.renderer.resolution;
    const cameraKey = `${cam.x}:${cam.y}:${cam.zoom}:${cam.width}:${cam.height}:${res}`;
    const fogChanged = picture.versions.fog !== this.fogVersion;
    const lightsChanged = picture.versions.lights !== this.lightVersion;
    const viewersChanged = picture.versions.viewers !== this.viewerVersion;
    // Geste de caméra : déjà changée à l'image précédente, textures récentes, même taille de
    // vue, zoom proche ; rien d'autre n'a changé
    const moving = this.drawKey !== '' && cameraKey !== this.drawKey;
    const rt = this.rtCam;
    const deferred =
      moving &&
      this.wasMoving &&
      this.shown &&
      rt !== null &&
      cameraKey !== this.cameraKey &&
      started - this.rtAt < CAMERA_REFRESH_MS &&
      !fogChanged &&
      !lightsChanged &&
      !viewersChanged &&
      rt.width === cam.width &&
      rt.height === cam.height &&
      res === this.rtRes &&
      cam.zoom / rt.zoom > 0.5 &&
      cam.zoom / rt.zoom < 2;
    this.drawKey = cameraKey;
    this.wasMoving = moving;
    // Geste de caméra en cours : la reprise attend l'image où les textures sont refaites
    const retry = this.redrawNext && !deferred;
    if (retry) this.redrawNext = false;
    const cameraChanged = !deferred && (retry || cameraKey !== this.cameraKey || !this.shown);
    if (cameraChanged) {
      this.cameraKey = cameraKey;
      this.rtCam = { ...cam };
      this.rtAt = started;
      this.rtRes = res;
      for (const t of Object.values(this.targets)) {
        const w = Math.ceil(cam.width);
        const h = Math.ceil(cam.height);
        if (t.rt.width !== w || t.rt.height !== h || t.rt.source.resolution !== res * t.scale) {
          t.rt.resize(w, h, res * t.scale);
          this.redrawNext = true;
        }
      }
      for (const root of [this.rangeRoot, this.fogRoot, this.glowRoot, this.visRoot]) {
        root.scale.set(cam.zoom);
        root.position.set(cam.width / 2 - cam.x * cam.zoom, cam.height / 2 - cam.y * cam.zoom);
      }
    }
    if (fogChanged) this.buildZones(picture);
    if (lightsChanged) this.buildLights(picture.lights);
    if (fogChanged) this.buildFog(picture);
    if (lightsChanged) this.buildGlow(picture.lights);
    if (viewersChanged || fogChanged || retry) {
      const nodes = this.viewerNodes.length;
      this.buildVis(picture);
      if (this.viewerNodes.length > nodes) this.redrawNext = true;
    }

    // Sprites de portée : le rectangle de la vue des textures, dans le repère du monde
    const tc = this.rtCam!;
    const left = tc.x - tc.width / 2 / tc.zoom;
    const top = tc.y - tc.height / 2 / tc.zoom;
    if (cameraChanged || viewersChanged || fogChanged || retry)
      for (const s of this.contentSprites) {
        s.position.set(left, top);
        s.width = tc.width / tc.zoom;
        s.height = tc.height / tc.zoom;
      }

    const renderRange = cameraChanged || fogChanged || lightsChanged;
    const render = (container: Pixi.Container, target: Target, clear = true) =>
      this.renderer.render({ container, target: target.rt, clear, clearColor: [0, 0, 0, 0] });
    if (renderRange) render(this.rangeRoot, this.targets.range);
    const hadFog = this.hasFog;
    this.hasFog =
      picture.showFog && (picture.fogFull || picture.fogZones.some((z) => z.mode === 'fog'));
    // Brouillard remontré (affichage de la scène) : sa texture date d'avant, on la refait
    const fogStale = cameraChanged || fogChanged || !hadFog;
    if (this.hasFog && fogStale) render(this.fogRoot, this.targets.fog);
    this.hasGlow = picture.showGlow && picture.lights.length > 0;
    if (this.hasGlow && (cameraChanged || lightsChanged)) render(this.glowRoot, this.targets.glow);
    if (renderRange || viewersChanged || retry) render(this.visRoot, this.targets.vis);
    this.fogVersion = picture.versions.fog;
    this.lightVersion = picture.versions.lights;
    this.viewerVersion = picture.versions.viewers;

    if (this.hasFog) this.renderMist(tc, time, left, top, fogStale);
    this.updateComposite(picture, cam, tc);
    this.shown = true;
    this.onRender?.(performance.now() - started);
    return deferred || this.redrawNext;
  }

  /** Portée hors observateur : hors brouillard (zones dans l'ordre), refaite avec les zones. */
  private buildZones(p: VisionPicture) {
    const body = this.rangeZones;
    for (const child of body.removeChildren()) child.destroy();
    const { width, height } = p.bounds;
    if (!p.fogFull)
      body.addChild(new this.pixi.Graphics().rect(0, 0, width, height).fill(0xffffff));
    for (const z of p.fogZones) {
      const g = zoneGraphics(this.pixi, z);
      g.blendMode = z.mode === 'fog' ? 'erase' : 'normal';
      body.addChild(g);
    }
  }

  /** Zones éclairées (disque ∩ vue depuis la lumière), en éventail, mises à jour sur place. */
  private buildLights(lights: readonly LightLayer[]) {
    lights.forEach((l, i) => {
      let fan = this.lightFans[i];
      if (!fan) {
        fan = new Fan(this.pixi);
        this.lightFans[i] = fan;
        this.rangeLights.addChild(fan.mesh);
      }
      fan.set(l.area.center, l.area.polygon);
    });
    for (const fan of this.lightFans.splice(lights.length)) {
      fan.mesh.removeFromParent();
      fan.destroy();
    }
  }

  /** Le brouillard lui-même : `fogFull`, puis les zones dans l'ordre. */
  private buildFog(p: VisionPicture) {
    const body = this.fogBody;
    for (const child of body.removeChildren()) child.destroy();
    if (p.fogFull)
      body.addChild(
        new this.pixi.Graphics().rect(0, 0, p.bounds.width, p.bounds.height).fill(0xffffff),
      );
    for (const z of p.fogZones) {
      const g = zoneGraphics(this.pixi, z);
      g.blendMode = z.mode === 'fog' ? 'normal' : 'erase';
      body.addChild(g);
    }
  }

  /** Lueurs : un éventail par lumière, dégradé radial additif. */
  private buildGlow(lights: readonly LightLayer[]) {
    lights.forEach((l, i) => {
      let entry = this.glowFans[i];
      if (!entry) {
        const shader = this.pixi.Shader.from({
          gl: { vertex: VERTEX, fragment: GLOW_FRAGMENT, name: 'vision-glow' },
          resources: {
            glowUniforms: {
              uLightColor: { value: new Float32Array([1, 0.8, 0.5]), type: 'vec3<f32>' },
              uIntensity: { value: 1, type: 'f32' },
              uFalloff: { value: 0.5, type: 'f32' },
            },
          },
        });
        entry = { fan: new Fan(this.pixi, shader), shader };
        entry.fan.mesh.blendMode = 'add';
        this.glowFans[i] = entry;
        this.glowRoot.addChild(entry.fan.mesh);
      }
      const a = l.area;
      entry.fan.set(a.center, a.polygon, { cx: a.center.x, cy: a.center.y, r: a.radius || 1 });
      const u = entry.shader.resources.glowUniforms.uniforms;
      u.uLightColor = rgb(this.colorOf(l.color));
      u.uIntensity = Math.max(0, Math.min(1, l.intensity));
      u.uFalloff = Math.max(0, Math.min(1, a.falloff));
    });
    for (const e of this.glowFans.splice(lights.length)) {
      e.fan.mesh.removeFromParent();
      e.fan.destroy();
      e.shader.destroy();
    }
  }

  private colorOf(css: string): number {
    try {
      return new this.pixi.Color(css || 0xffd08a).toNumber();
    } catch {
      return 0xffd08a;
    }
  }

  /** Vu : un nœud masqué par observateur, ou la vue d'en haut sans observateur. */
  private buildVis(p: VisionPicture) {
    const place = (c: Pixi.Container, layer: ViewerLayer | null) => {
      const disc = c.getChildByLabel('disc') as Pixi.Sprite | null;
      if (!disc) return;
      const r = layer?.terms.visionRadius ?? 0;
      disc.visible = r > 0;
      if (r > 0 && layer) {
        disc.position.set(layer.pos.x, layer.pos.y);
        disc.width = disc.height = 2 * r;
      }
    };
    p.viewers.forEach((layer, i) => {
      let node = this.viewerNodes[i];
      if (!node) {
        node = new ViewerNode(this.pixi, () => this.makeViewerContent());
        this.viewerNodes[i] = node;
        this.visRoot.addChild(node.root);
      }
      node.update(layer, (c) => place(c, layer));
    });
    for (const node of this.viewerNodes.splice(p.viewers.length)) {
      node.root.removeFromParent();
      node.destroy();
    }
    // Sans observateur : la portée, moins les pièces fermées
    const key = p.topDown ? p.topDown.map((r) => r.join(',')).join('|') : null;
    if (key === null) {
      if (this.topDownNode) {
        destroyDisplay(this.topDownNode.root);
        this.topDownNode = null;
      }
    } else if (!this.topDownNode || this.topDownNode.key !== key) {
      if (this.topDownNode) destroyDisplay(this.topDownNode.root);
      const root = new this.pixi.Container({ label: 'vision:top-down' });
      const body = new this.pixi.Container();
      if (p.topDown!.length) {
        const rooms = new this.pixi.Graphics();
        for (const r of p.topDown!) rooms.poly(Array.from(r), true).fill(0xffffff);
        root.addChild(rooms);
        root.setMask({ mask: rooms, inverse: true });
      }
      body.addChild(this.rangeSprite());
      root.addChild(body);
      this.visRoot.addChild(root);
      this.topDownNode = { root, key, body };
    }
  }

  /** Densité de la brume : refaite si elle a dérivé, ou si la vue ou le brouillard ont changé. */
  private renderMist(cam: CameraView, time: number, left: number, top: number, moved: boolean) {
    const res = this.renderer.resolution;
    const key = `${time}:${this.noisePeriod}`;
    if (!moved && key === this.mistKey) return;
    this.mistKey = key;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const pos = this.mistGeometry.positions;
    pos[2] = pos[4] = cam.width;
    pos[5] = pos[7] = cam.height;
    this.mistGeometry.getBuffer('aPosition').update();
    const u = this.mistUniforms.uniforms;
    const world = u.uWorld as Float32Array;
    world[0] = left;
    world[1] = top;
    world[2] = viewW;
    world[3] = viewH;
    u.uTime = time;
    u.uNoiseScale = 1 / this.noisePeriod;
    // Période en texels de `mist` (les octaves trop fines pour elle s'effacent)
    u.uPeriodPx = this.noisePeriod * cam.zoom * res * SOFT_RESOLUTION;
    this.mistUniforms.update();
    this.renderer.render({
      container: this.mistRoot,
      target: this.targets.mist.rt,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
  }

  /**
   * Quadrilatère sur le rectangle visible (caméra `cam`) ; coordonnées de texture dans la vue des
   * textures (`tc`, la même hors d'un geste de caméra).
   */
  private updateComposite(p: VisionPicture, cam: CameraView, tc: CameraView) {
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const left = cam.x - viewW / 2;
    const top = cam.y - viewH / 2;
    const texW = tc.width / tc.zoom;
    const texH = tc.height / tc.zoom;
    const texLeft = tc.x - texW / 2;
    const texTop = tc.y - texH / 2;
    // Rectangle visible ∩ carte : pas d'ombre hors de la carte
    const x0 = Math.max(left, 0);
    const y0 = Math.max(top, 0);
    const x1 = Math.min(left + viewW, p.bounds.width);
    const y1 = Math.min(top + viewH, p.bounds.height);
    if (x1 <= x0 || y1 <= y0) {
      this.composite.visible = false;
      return;
    }
    const g = this.compositeGeometry;
    const pos = g.positions;
    const uv = g.uvs;
    const corners = [x0, y0, x1, y0, x1, y1, x0, y1];
    for (let i = 0; i < 4; i++) {
      pos[2 * i] = corners[2 * i]!;
      pos[2 * i + 1] = corners[2 * i + 1]!;
      uv[2 * i] = (corners[2 * i]! - texLeft) / texW;
      uv[2 * i + 1] = (corners[2 * i + 1]! - texTop) / texH;
    }
    g.getBuffer('aPosition').update();
    g.getBuffer('aUV').update();

    const u = this.uniforms.uniforms;
    u.uDarkness = p.darkness;
    u.uFogAlpha = p.fogAlpha;
    u.uFogOn = this.hasFog ? 1 : 0;
    u.uGlowOn = this.hasGlow ? 1 : 0;
    u.uGlowFloor = p.glowFloor;
    this.uniforms.update();
    this.composite.visible = true;
  }

  /** Période du bruit de la brume, en pixels du monde (quelques cases). */
  noisePeriod = 150;

  /** La brume est-elle à l'écran (animation utile) ? */
  /** Diagnostic (dev) : ce que le rendu a fait à la dernière image. */
  debugState() {
    return {
      shown: this.shown,
      cameraKey: this.cameraKey,
      drawKey: this.drawKey,
      versions: { fog: this.fogVersion, lights: this.lightVersion, viewers: this.viewerVersion },
      compositeVisible: this.composite.visible,
      redrawNext: this.redrawNext,
    };
  }

  get fogVisible() {
    return this.shown && this.hasFog && this.composite.visible;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    // Le shader de composition tient les textures : il part avant elles, avec sa géométrie
    const shader = this.composite.shader;
    this.composite.removeFromParent();
    this.composite.destroy();
    shader?.destroy();
    this.compositeGeometry.destroy();
    const mistMesh = this.mistRoot.children[0] as Pixi.Mesh<Pixi.MeshGeometry, Pixi.Shader>;
    const mistShader = mistMesh.shader;
    mistMesh.destroy();
    mistShader?.destroy();
    this.mistGeometry.destroy();
    this.mistRoot.destroy();
    for (const node of this.viewerNodes.splice(0)) node.destroy();
    for (const fan of this.lightFans.splice(0)) fan.destroy();
    for (const e of this.glowFans.splice(0)) {
      e.fan.destroy();
      e.shader.destroy();
    }
    for (const root of [this.rangeRoot, this.fogRoot, this.glowRoot, this.visRoot])
      destroyDisplay(root);
    for (const t of Object.values(this.targets)) t.rt.destroy(true);
    this.discTexture.destroy(true);
  }
}

/** Forme d'une zone de brouillard (cercle ou polygone), remplie de blanc. */
function zoneGraphics(pixi: typeof Pixi, z: FogZone): Pixi.Graphics {
  const g = new pixi.Graphics();
  if (z.shape === 'circle') g.circle(z.center.x, z.center.y, z.radius).fill(0xffffff);
  else
    g.poly(
      z.points.flatMap((p) => [p.x, p.y]),
      true,
    ).fill(0xffffff);
  return g;
}
