/**
 * Registre des sortes d'entités. Chaque module y enregistre ses `EntityKind` ; le moteur y
 * trouve la sorte d'un élément du magasin par sa couche (et `accepts` quand plusieurs sortes
 * partagent une couche, comme murs et portes dans `obstacles`).
 */
import type { MapDto } from '../../store/map-store';
import type { EntityKind } from './entity-kind';

export class KindRegistry {
  private readonly byId = new Map<string, EntityKind>();
  private readonly byCollection = new Map<string, EntityKind[]>();

  register<D extends MapDto>(kind: EntityKind<D>): () => void {
    if (this.byId.has(kind.id)) throw new Error(`Sorte d'entité déjà enregistrée : ${kind.id}`);
    const k = kind as unknown as EntityKind;
    this.byId.set(kind.id, k);
    const list = this.byCollection.get(kind.collection) ?? [];
    list.push(k);
    this.byCollection.set(kind.collection, list);
    return () => {
      this.byId.delete(kind.id);
      const rest = (this.byCollection.get(kind.collection) ?? []).filter((x) => x !== k);
      if (rest.length) this.byCollection.set(kind.collection, rest);
      else this.byCollection.delete(kind.collection);
    };
  }

  get(id: string): EntityKind | undefined {
    return this.byId.get(id);
  }

  /** Couches du magasin qui ont au moins une sorte (les autres ne s'affichent pas). */
  collections(): string[] {
    return [...this.byCollection.keys()];
  }

  /** Sorte d'un élément d'une couche, ou undefined si aucune ne le prend. */
  forItem(collection: string, data: MapDto): EntityKind | undefined {
    const list = this.byCollection.get(collection);
    if (!list) return undefined;
    return list.find((k) => !k.accepts || k.accepts(data));
  }

  all(): EntityKind[] {
    return [...this.byId.values()];
  }
}
