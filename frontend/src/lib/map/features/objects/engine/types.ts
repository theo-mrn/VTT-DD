/**
 * Données du module « objets » (docs/carte.md § 10, Objets) : la forme d'un objet de carte dans
 * le magasin, ses deux sortes d'entités et les constantes partagées par la sorte, l'outil de
 * pose, l'inspecteur et la fouille.
 */
import type { MapObject, MapObjectItem, MapObjectKind } from '@vtt/contracts';
import type { MapDto } from '@/lib/map/store/map-store';

/** Un objet de carte tel que le magasin le garde (réponse du serveur, ou brouillon optimiste). */
export type ObjectData = MapObject & MapDto;

/** Couche du magasin (`MapSnapshot.objects`, `/objects`). */
export const OBJECTS_COLLECTION = 'objects';

/** Sorte des objets (coffres, armes, butin…) : masqués par la vision derrière les murs. */
export const OBJECT_KIND_ID = 'object';
/**
 * Sorte des décors (`kind: 'decor'` du contrat) : jamais filtrés par la vision (§ 9),
 * l'obscurité les couvre comme le fond.
 */
export const DECOR_KIND_ID = 'decor';

/** Outil « Objets » (I) : bibliothèque du MJ, pose au clic ou au glisser. */
export const OBJECTS_TOOL_ID = 'objects';

/** Portée de fouille par défaut, en unités de jeu (celle du serveur). */
export const DEFAULT_SEARCH_RADIUS = 1.5;
/** Portée de fouille maximale acceptée par le contrat (unités). */
export const MAX_SEARCH_RADIUS = 10_000;

export const isDecor = (o: { kind?: unknown }) => o.kind === 'decor';

/** Contenu d'un objet : un joueur ne le reçoit qu'à la fouille (absent, il est vide ici). */
export const itemsOf = (o: { items?: unknown }): readonly MapObjectItem[] =>
  Array.isArray(o.items) ? (o.items as MapObjectItem[]) : [];

export const OBJECT_KIND_LABELS: Record<MapObjectKind, string> = {
  item: 'Objet',
  weapon: 'Arme',
  decor: 'Décor',
};
