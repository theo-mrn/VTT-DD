/**
 * Sélection de la carte : simple, multiple (⇧), lasso. Des identifiants d'entités, dans l'ordre
 * où ils ont été choisis. Observable par React avec un instantané stable : `ids` est le même
 * tableau tant que la sélection ne change pas (`useSyncExternalStore` sans boucle).
 */

const NONE: readonly string[] = Object.freeze([]);

export class Selection {
  private set = new Set<string>();
  private snapshot: readonly string[] = NONE;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /** Identifiants sélectionnés (tableau stable entre deux changements). */
  getSnapshot = (): readonly string[] => this.snapshot;

  get ids(): readonly string[] {
    return this.snapshot;
  }

  get size(): number {
    return this.set.size;
  }

  has(id: string): boolean {
    return this.set.has(id);
  }

  private commit(next: Set<string>) {
    if (next.size === this.set.size && [...next].every((id) => this.set.has(id))) {
      // Même contenu : l'ordre peut avoir changé, on garde l'ancien (stable)
      return;
    }
    this.set = next;
    this.snapshot = next.size ? Object.freeze([...next]) : NONE;
    for (const l of this.listeners) l();
  }

  /** Remplace la sélection. */
  replace(ids: Iterable<string>) {
    this.commit(new Set(ids));
  }

  /** Ajoute (⇧ + lasso). */
  add(ids: Iterable<string>) {
    const next = new Set(this.set);
    for (const id of ids) next.add(id);
    this.commit(next);
  }

  /** Ajoute ou retire (⇧ + clic). */
  toggle(id: string) {
    const next = new Set(this.set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.commit(next);
  }

  remove(ids: Iterable<string>) {
    const next = new Set(this.set);
    let changed = false;
    for (const id of ids) changed = next.delete(id) || changed;
    if (changed) this.commit(next);
  }

  clear() {
    this.commit(new Set());
  }

  /** Renomme un identifiant (élément recréé ou créé : identifiant provisoire → serveur). */
  rename(from: string, to: string) {
    if (!this.set.has(from)) return;
    const next = new Set([...this.set].map((id) => (id === from ? to : id)));
    this.set = new Set();
    this.commit(next);
  }
}
