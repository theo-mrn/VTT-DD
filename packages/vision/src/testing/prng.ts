/** Générateur pseudo-aléatoire à graine fixe (mulberry32) : tests reproductibles, sans dépendance. */
export class Prng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Réel dans [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Réel dans [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entier dans [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}
