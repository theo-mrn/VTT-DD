/**
 * Effets animés des gabarits (docs/carte.md § 10, Mesures) : vidéos webm de l'ancienne
 * bibliothèque (`/asset-mappings.json`), dossier `Effect/Fireballs` pour le cercle,
 * `Effect/Cone` pour le cône, vignettes webp du même nom. La valeur enregistrée reste le chemin
 * relatif de l'ancienne app (`Cone/cone1.webm`).
 *
 * `SkinTextures` : une texture vidéo **partagée** par effet (compte de références), cadencée à
 * 30 i/s au plus comme le fond vidéo, en pause dès qu'aucune mesure ne la montre ou quand
 * l'animation est coupée (image fixe). Pixi est pris sur le moteur.
 */
import type * as Pixi from 'pixi.js';
import type { Container, Graphics, Sprite, Texture, VideoSource } from 'pixi.js';
import type { MapEngine } from '../../engine/map-engine';
import { WHITE } from '../../engine/visibility-badge';
import {
  coneHalfAngle,
  coneOptions,
  outline,
  reach,
  type MeasureShape,
  type MeasureSpec,
} from './model';

/** Dossiers des effets, par forme. */
export const SKIN_FOLDERS: Partial<Record<MeasureShape, string>> = {
  circle: 'Effect/Fireballs',
  cone: 'Effect/Cone',
};

/** Formes qui acceptent un effet animé. */
export const skinnable = (shape: MeasureShape) => shape in SKIN_FOLDERS;

export interface SkinAsset {
  name: string;
  path: string;
  localPath: string;
  category: string;
  type: string;
}

export interface SkinOption {
  value: string;
  label: string;
  url: string;
  thumbnail: string | null;
}

/** Chemin relatif d'un effet (`Cone/cone1.webm`), sans `/Effect/`. */
export const skinValueOf = (localPath: string) =>
  localPath.replace(/^\/+/, '').replace(/^Effect\//, '');

const LABELS: Record<string, string> = { cone: 'Cône', explosion: 'Explosion', loop: 'Boucle' };

/** « Cône 3 », « Explosion 2 », « Boucle 5 ». */
export function skinLabel(value: string): string {
  const base = value
    .split('/')
    .pop()!
    .replace(/\.[a-z0-9]+$/i, '');
  const m = /^([a-z]+)(\d+)$/i.exec(base);
  if (!m) return base;
  return `${LABELS[m[1]!.toLowerCase()] ?? m[1]} ${m[2]}`;
}

/** Effets proposés pour une forme, triés (vignette quand elle existe). */
export function skinOptions(assets: readonly SkinAsset[], shape: MeasureShape): SkinOption[] {
  const folder = SKIN_FOLDERS[shape];
  if (!folder) return [];
  const thumbs = new Map(
    assets.filter((a) => a.category === folder && a.type === 'image').map((a) => [a.localPath, a]),
  );
  return assets
    .filter((a) => a.category === folder && a.type === 'video')
    .map((a) => ({
      value: skinValueOf(a.localPath),
      label: skinLabel(a.localPath),
      url: a.path,
      thumbnail: thumbs.get(a.localPath.replace(/\.[a-z0-9]+$/i, '.webp'))?.path ?? null,
    }))
    .sort((a, b) => a.value.localeCompare(b.value, 'fr', { numeric: true }));
}

/** Adresse d'un effet d'après la bibliothèque ; null s'il est inconnu. */
export function skinUrl(value: string, assets: readonly SkinAsset[]): string | null {
  const wanted = skinValueOf(value);
  return (
    assets.find((a) => a.type === 'video' && skinValueOf(a.localPath) === wanted)?.path ?? null
  );
}

// ─── Textures vidéo partagées ────────────────────────────────────────────────

/** Images par seconde des effets, au plus (comme le fond vidéo). */
export const SKIN_FPS = 30;
/** Le cercle déborde un peu : les vidéos ont des marges transparentes (ancienne app). */
export const CIRCLE_SKIN_SCALE = 1.35;

interface Entry {
  refs: number;
  /** Adresse chargée (libérée à la fin). */
  url: string | null;
  texture: Texture | null;
  failed: boolean;
  video: HTMLVideoElement | null;
  stopFrames: (() => void) | null;
}

let catalog: Promise<readonly SkinAsset[]> | null = null;

/** La bibliothèque, lue une fois pour la page. */
function loadCatalog(): Promise<readonly SkinAsset[]> {
  catalog ??= fetch('/asset-mappings.json')
    .then((r) => (r.ok ? (r.json() as Promise<SkinAsset[]>) : []))
    .catch(() => {
      catalog = null;
      return [];
    });
  return catalog;
}

export class SkinTextures {
  private readonly entries = new Map<string, Entry>();
  private readonly readyListeners = new Set<() => void>();
  private animate = true;
  private disposed = false;

  constructor(private readonly engine: MapEngine) {}

  /** Une texture vient d'arriver : les mesures qui l'attendent se redessinent. */
  onReady(listener: () => void): () => void {
    this.readyListeners.add(listener);
    return () => void this.readyListeners.delete(listener);
  }

  /** Prend une référence sur l'effet ; la texture, si elle est prête. */
  acquire(value: string): Texture | null {
    let e = this.entries.get(value);
    if (!e) {
      e = { refs: 0, url: null, texture: null, failed: false, video: null, stopFrames: null };
      this.entries.set(value, e);
      void this.load(value, e);
    }
    e.refs += 1;
    if (e.refs === 1) this.drive(e);
    return e.texture;
  }

  /** Texture prête d'un effet déjà pris (sans prendre de référence). */
  peek(value: string): Texture | null {
    return this.entries.get(value)?.texture ?? null;
  }

  release(value: string) {
    const e = this.entries.get(value);
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    if (!e.refs) this.drive(e);
  }

  /** « Animer les effets » : coupé, les vidéos s'arrêtent sur leur image. */
  setAnimate(on: boolean) {
    if (this.animate === on) return;
    this.animate = on;
    for (const e of this.entries.values()) this.drive(e);
  }

  private async load(value: string, e: Entry) {
    const pixi = this.engine.pixi;
    const url = skinUrl(value, await loadCatalog());
    if (!pixi || !url || this.disposed) {
      e.failed = true;
      return;
    }
    try {
      const texture = await pixi.Assets.load<Texture>({
        src: url,
        parser: 'video',
        data: {
          autoPlay: false,
          loop: true,
          muted: true,
          playsinline: true,
          preload: true,
          crossorigin: true,
        },
      });
      if (this.disposed) {
        void pixi.Assets.unload(url).catch(() => undefined);
        return;
      }
      const source = texture.source as VideoSource;
      source.autoUpdate = false;
      e.video = source.resource as HTMLVideoElement;
      e.video.muted = true;
      e.video.loop = true;
      e.texture = texture;
      e.url = url;
      this.drive(e);
      for (const l of this.readyListeners) l();
      this.engine.invalidate();
    } catch {
      e.failed = true;
    }
  }

  /** Lecture ou pause selon le besoin : montrée et animée, elle joue à 30 i/s au plus. */
  private drive(e: Entry) {
    const video = e.video;
    const source = e.texture?.source as VideoSource | undefined;
    if (!video || !source) return;
    const play = e.refs > 0 && this.animate;
    if (!play) {
      e.stopFrames?.();
      e.stopFrames = null;
      if (!video.paused) video.pause();
      source.update();
      this.engine.invalidate();
      return;
    }
    if (e.stopFrames) return;
    void video.play().catch(() => undefined);
    let last = 0;
    const frame = (now: number) => {
      if (now - last < 1000 / SKIN_FPS - 2) return;
      last = now;
      source.update();
      this.engine.invalidate();
    };
    if (typeof video.requestVideoFrameCallback === 'function') {
      let handle: number | null = null;
      const onFrame = (now: number) => {
        if (this.disposed) return;
        frame(now);
        handle = video.requestVideoFrameCallback(onFrame);
      };
      handle = video.requestVideoFrameCallback(onFrame);
      e.stopFrames = () => {
        if (handle !== null) video.cancelVideoFrameCallback(handle);
      };
    } else {
      e.stopFrames = this.engine.onFrame((now) => {
        if (!video.paused) frame(now);
        return !video.paused;
      });
    }
  }

  dispose() {
    this.disposed = true;
    const pixi = this.engine.pixi;
    for (const e of this.entries.values()) {
      e.stopFrames?.();
      e.video?.pause();
      if (pixi && e.url) void pixi.Assets.unload(e.url).catch(() => undefined);
    }
    this.entries.clear();
    this.readyListeners.clear();
  }
}

/**
 * Effet posé dans un visuel de mesure : un `Sprite` de la texture partagée, placé sur la forme
 * (cercle : 1,35 × le rayon ; cône : de l'origine au bout, découpé par la forme).
 */
export class SkinSlot {
  private value: string | null = null;
  private sprite: Sprite | null = null;
  private mask: Graphics | null = null;
  private placed: MeasureSpec | null = null;

  constructor(
    private readonly pixi: typeof Pixi,
    private readonly slot: Container,
    private readonly textures: SkinTextures,
  ) {}

  /** L'effet voulu pour cette mesure ; renvoie vrai s'il est affiché. */
  set(value: string | null, spec: MeasureSpec, pixelsPerUnit: number): boolean {
    const wanted = value && skinnable(spec.shape) ? value : null;
    if (wanted !== this.value) {
      if (this.value) this.textures.release(this.value);
      this.value = wanted;
      if (wanted) this.textures.acquire(wanted);
      this.placed = null;
    }
    const texture = wanted ? this.textures.peek(wanted) : null;
    if (!texture) {
      if (this.sprite) this.sprite.visible = false;
      return false;
    }
    if (!this.sprite) {
      this.sprite = new this.pixi.Sprite();
      this.mask = new this.pixi.Graphics();
      this.slot.addChild(this.mask, this.sprite);
    }
    const sprite = this.sprite;
    if (sprite.texture !== texture) {
      sprite.texture = texture;
      this.placed = null;
    }
    sprite.visible = true;
    if (this.placed !== spec) {
      this.placed = spec;
      this.place(spec, pixelsPerUnit);
    }
    return true;
  }

  private place(spec: MeasureSpec, pixelsPerUnit: number) {
    const sprite = this.sprite!;
    const mask = this.mask!;
    const { length, angle } = reach(spec);
    mask.clear();
    if (spec.shape === 'circle') {
      sprite.mask = null;
      mask.visible = false;
      sprite.anchor.set(0.5);
      sprite.position.set(spec.start.x, spec.start.y);
      sprite.rotation = 0;
      sprite.width = sprite.height = 2 * length * CIRCLE_SKIN_SCALE;
      return;
    }
    // Cône : la vidéo va de l'origine au bout, aussi large que le cône, découpée par sa forme
    const half = coneHalfAngle(spec, pixelsPerUnit);
    const wide = coneOptions(spec.options).rounded
      ? 2 * length * Math.sin(Math.min(half, Math.PI / 2))
      : 2 * length * Math.tan(half);
    sprite.anchor.set(0, 0.5);
    sprite.position.set(spec.start.x, spec.start.y);
    sprite.rotation = angle;
    sprite.width = length;
    sprite.height = Math.max(length, wide);
    mask.visible = true;
    mask
      .poly(
        outline(spec, pixelsPerUnit).flatMap((p) => [p.x, p.y]),
        true,
      )
      .fill({ color: WHITE });
    sprite.mask = mask;
  }

  /** Rend l'effet (visuel libéré). */
  release() {
    if (this.value) this.textures.release(this.value);
    this.value = null;
  }
}
