/**
 * Déplacement des personnages (docs/carte.md § 10, Trajet des déplacements) : la valeur de
 * l'attribut que la présentation du système déclare (`carte.deplacement.attribut`), lue dans
 * les fiches calculées que ce viewer a déjà (surcouche `ui/speed-feed.tsx`) et poussée ici. Un
 * joueur n'y trouve que ses personnages : jamais la vitesse d'un PNJ.
 */
import type { MapEngine } from '@/lib/map/engine/map-engine';

export class SpeedDirectory {
  private speeds: ReadonlyMap<string, number> = new Map();
  private readonly listeners = new Set<() => void>();

  /** Déplacement du personnage, en unités de la carte ; null s'il n'est pas connu ici. */
  get(characterId: string | null | undefined): number | null {
    return characterId ? (this.speeds.get(characterId) ?? null) : null;
  }

  /** Remplace tout ; prévient seulement si une valeur a changé. */
  replace(next: ReadonlyMap<string, number>) {
    const same =
      next.size === this.speeds.size && [...next].every(([id, v]) => this.speeds.get(id) === v);
    if (same) return;
    this.speeds = new Map(next);
    for (const l of [...this.listeners]) l();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}

const directories = new WeakMap<MapEngine, SpeedDirectory>();

/** Déplacements connus pour ce moteur. */
export function speedDirectory(engine: MapEngine): SpeedDirectory {
  let d = directories.get(engine);
  if (!d) {
    d = new SpeedDirectory();
    directories.set(engine, d);
  }
  return d;
}
