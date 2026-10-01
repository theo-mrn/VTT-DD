/**
 * Corbeille (docs/nettoyage.md) : mes personnages supprimés depuis moins de `TRASH_DAYS` jours,
 * restaurables. Les modèles (PNJ, objets) n'en ont pas : seul le MJ les supprime.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { TrashItem } from '@vtt/contracts';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { clesPersonnages } from '@/lib/personnages';

export type { TrashItem };

export const trashApi = {
  characters: () => api<TrashItem[]>('/v1/characters/trash'),
  restore: (id: string) =>
    api<unknown>(`/v1/characters/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
};

export const trashKeys = {
  /** Sous la racine des personnages : rechargée avec leurs listes (suppression comprise). */
  characters: [...clesPersonnages.racine, 'corbeille'] as const,
};

/** Mes personnages à la corbeille. */
export function useCharacterTrash() {
  return useQuery({ queryKey: trashKeys.characters, queryFn: trashApi.characters });
}

/** Restaure un personnage, puis recharge la corbeille et les listes où il revient. */
export async function restoreItem(client: QueryClient, id: string) {
  await trashApi.restore(id);
  void client.invalidateQueries({
    queryKey: clesPersonnages.racine,
    predicate: (q) => q.queryKey[1] !== 'un',
  });
}

export function useRestore() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (id: string) => restoreItem(client, id) });
}

/**
 * Action « Annuler » du toast de suppression : restaure aussitôt. Appelée hors de tout composant
 * (celui qui a supprimé peut avoir disparu), d'où le client passé en paramètre.
 */
export function undoAction(client: QueryClient, item: Pick<TrashItem, 'id' | 'name'>) {
  return {
    label: 'Annuler',
    onClick: () =>
      void restoreItem(client, item.id).catch(() => {
        toast.error(`« ${item.name} » n’a pas pu être restauré`);
      }),
  };
}
