/**
 * Annuaire des personnages des tokens (docs/carte.md § 10) : nom, portrait, camp, nature et
 * ressource principale de chaque personnage posé. Le token ne porte que `characterId` ; ce que
 * la table sait de son personnage vient de React (liste de la campagne, fiches calculées par
 * `@vtt/rules`), poussé ici par le composant `TokenCharacterFeed`. Le moteur n'en relit rien
 * tant que rien ne change : seuls les tokens des personnages modifiés sont redessinés.
 */
import type { CharacterInfo, ResourceGauge } from './model';

type Listener = (changed: ReadonlySet<string>) => void;

const sameResource = (a: ResourceGauge | null, b: ResourceGauge | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.key === b.key &&
    a.label === b.label &&
    a.value === b.value &&
    a.max === b.max &&
    a.color === b.color &&
    a.rising === b.rising);

export function sameCharacter(a: CharacterInfo, b: CharacterInfo): boolean {
  return (
    a.name === b.name &&
    a.portraitUrl === b.portraitUrl &&
    a.side === b.side &&
    a.kind === b.kind &&
    a.ownerId === b.ownerId &&
    a.playedBy === b.playedBy &&
    sameResource(a.resource, b.resource)
  );
}

export class CharacterDirectory {
  private entries = new Map<string, CharacterInfo>();
  private readonly listeners = new Set<Listener>();

  get(id: string): CharacterInfo | undefined {
    return this.entries.get(id);
  }

  get size(): number {
    return this.entries.size;
  }

  private snapshot: readonly CharacterInfo[] | null = null;
  /** Tous les personnages connus, dans un tableau stable tant que l'annuaire ne change pas. */
  list(): readonly CharacterInfo[] {
    this.snapshot ??= [...this.entries.values()];
    return this.snapshot;
  }

  /** Remplace tout l'annuaire ; prévient des seuls personnages ajoutés, changés ou retirés. */
  replace(list: Iterable<CharacterInfo>) {
    const next = new Map<string, CharacterInfo>();
    const changed = new Set<string>();
    for (const info of list) {
      const before = this.entries.get(info.id);
      if (before && sameCharacter(before, info)) next.set(info.id, before);
      else {
        next.set(info.id, info);
        changed.add(info.id);
      }
    }
    for (const id of this.entries.keys()) if (!next.has(id)) changed.add(id);
    this.entries = next;
    if (changed.size) {
      this.snapshot = null;
      for (const l of [...this.listeners]) l(changed);
    }
  }

  /** Utilisateurs (propriétaires, incarnateurs) de ces personnages : audience du direct. */
  usersOf(characterIds: readonly string[]): string[] {
    const out = new Set<string>();
    for (const id of characterIds) {
      const c = this.entries.get(id);
      if (c?.ownerId) out.add(c.ownerId);
      if (c?.playedBy) out.add(c.playedBy);
    }
    return [...out];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
}
