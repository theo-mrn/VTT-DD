/**
 * Masquage des entités non vues (docs/carte.md § 9) : masque `vision` du moteur, avec un fondu
 * de 150 ms quand une entité déjà affichée apparaît ou disparaît. Une entité qui arrive non vue
 * est masquée tout de suite (jamais un éclair d'un PNJ caché).
 *
 * Le fondu passe par l'alpha du conteneur, appliqué à chaque image avant le dessin (au-dessus
 * de l'opacité commune du moteur : masqué aux joueurs 50 %, fantôme 85 %).
 */
import type { MapEntity } from '../../engine/entities/entity';
import type { MapEngine } from '../../engine/map-engine';

export const FADE_MS = 150;
export const VISION_MASK = 'vision';

interface Fade {
  entity: MapEntity;
  from: number;
  to: number;
  start: number;
}

export class Fades {
  private readonly fades = new Map<string, Fade>();
  /** Entités déjà décidées (une nouvelle venue est masquée sans fondu). */
  private readonly known = new Set<string>();

  constructor(private readonly engine: MapEngine) {}

  /** Opacité commune du moteur (pixi-view : masqué aux joueurs, fantôme d'un autre). */
  private base(e: MapEntity) {
    const side = e.state.sidelined ? 0.3 : 1;
    if (e.state.hiddenForPlayers && this.engine.viewer.role === 'gm') return 0.5 * side;
    return (e.state.remote ? 0.85 : 1) * side;
  }

  private factor(e: MapEntity, now: number) {
    const f = this.fades.get(e.id);
    if (!f) return e.masks.has(VISION_MASK) ? 0 : 1;
    const t = Math.min(1, (now - f.start) / FADE_MS);
    return f.from + (f.to - f.from) * t;
  }

  /** Montre ou masque une entité (fondu si elle était déjà décidée). */
  set(e: MapEntity, masked: boolean, now: number) {
    const first = !this.known.has(e.id);
    this.known.add(e.id);
    const fade = this.fades.get(e.id);
    const target = masked ? 0 : 1;
    if (fade ? fade.to === target : e.masks.has(VISION_MASK) === masked) return;
    if (first || !e.display) {
      this.fades.delete(e.id);
      this.engine.setMask(e, VISION_MASK, masked);
      return;
    }
    const from = this.factor(e, now);
    if (!masked) this.engine.setMask(e, VISION_MASK, false);
    this.fades.set(e.id, { entity: e, from, to: target, start: now });
    this.engine.invalidate();
  }

  /** Avance les fondus ; renvoie vrai tant qu'il en reste. */
  step(now: number): boolean {
    for (const [id, f] of this.fades) {
      const e = f.entity;
      if (this.engine.entity(id) !== e) {
        this.fades.delete(id);
        continue;
      }
      const t = Math.min(1, (now - f.start) / FADE_MS);
      const k = f.from + (f.to - f.from) * t;
      if (e.display) e.display.alpha = this.base(e) * k;
      if (t >= 1) {
        this.fades.delete(id);
        if (e.display) e.display.alpha = this.base(e);
        if (f.to === 0) this.engine.setMask(e, VISION_MASK, true);
      }
    }
    return this.fades.size > 0;
  }

  /** Oublie les entités parties. */
  prune(alive: ReadonlySet<string>) {
    for (const id of this.known) if (!alive.has(id)) this.known.delete(id);
  }

  /** Tout remontrer (MJ en vue du MJ, module retiré). */
  reset() {
    for (const f of this.fades.values())
      if (f.entity.display) f.entity.display.alpha = this.base(f.entity);
    this.fades.clear();
    for (const e of this.engine.entities())
      if (e.masks.has(VISION_MASK)) this.engine.setMask(e, VISION_MASK, false);
  }
}
