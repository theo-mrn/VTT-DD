/**
 * Corbeille (docs/nettoyage.md) : un personnage supprimé est marqué, restaurable `TRASH_DAYS`
 * jours, puis purgé définitivement. Les modèles (PNJ, objets) n'ont pas de corbeille : ils
 * disparaissent seulement quand le MJ les supprime, et rien d'automatique n'y touche.
 */
import { z } from 'zod';

export const TRASH_DAYS = 7;

/** Date de purge d'un élément supprimé à `deletedAt` (ISO 8601). */
export function purgeDate(deletedAt: string | Date): Date {
  const d = typeof deletedAt === 'string' ? new Date(deletedAt) : deletedAt;
  return new Date(d.getTime() + TRASH_DAYS * 86_400_000);
}

/** Élément de la corbeille : un personnage. */
export const TrashItem = z.object({
  id: z.string(),
  kind: z.literal('character'),
  name: z.string(),
  imageUrl: z.string().nullable(),
  deletedAt: z.string(),
  /** Purge définitive (deletedAt + TRASH_DAYS). */
  purgeAt: z.string(),
});
export type TrashItem = z.infer<typeof TrashItem>;
