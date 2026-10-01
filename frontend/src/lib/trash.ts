/**
 * Corbeille (docs/nettoyage.md) : personnages et modèles supprimés depuis moins de
 * `TRASH_DAYS` jours, restaurables (le propriétaire pour un personnage, le MJ pour un modèle).
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { TrashItem } from '@vtt/contracts';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { npcTemplateKeys } from '@/lib/bestiary';
import { objectTemplateKeys } from '@/lib/map/modules/objects/api';
import { clesPersonnages } from '@/lib/personnages';

export type { TrashItem };

const campaign = (id: string) => `/v1/campaigns/${encodeURIComponent(id)}`;
const restoreUrl: Record<Exclude<TrashItem['kind'], 'character'>, string> = {
  npc_template: 'npc-templates',
  object_template: 'object-templates',
};

export const trashApi = {
  characters: () => api<TrashItem[]>('/v1/characters/trash'),
  templates: (campaignId: string) => api<TrashItem[]>(`${campaign(campaignId)}/template-trash`),
  restore: (item: Pick<TrashItem, 'id' | 'kind'>, campaignId?: string) =>
    api<unknown>(
      item.kind === 'character'
        ? `/v1/characters/${encodeURIComponent(item.id)}/restore`
        : `${campaign(campaignId!)}/${restoreUrl[item.kind]}/${encodeURIComponent(item.id)}/restore`,
      { method: 'POST' },
    ),
};

export const trashKeys = {
  /** Sous la racine des personnages : rechargée avec leurs listes (suppression comprise). */
  characters: [...clesPersonnages.racine, 'corbeille'] as const,
  templates: (campaignId: string) => ['campaign', campaignId, 'template-trash'] as const,
};

/** Mes personnages à la corbeille. */
export function useCharacterTrash() {
  return useQuery({ queryKey: trashKeys.characters, queryFn: trashApi.characters });
}

/** Modèles de la campagne à la corbeille (MJ). */
export function useTemplateTrash(campaignId: string) {
  return useQuery({
    queryKey: trashKeys.templates(campaignId),
    queryFn: () => trashApi.templates(campaignId),
  });
}

/** À appeler après la suppression d'un modèle : la corbeille le montre aussitôt. */
export function refreshTemplateTrash(client: QueryClient, campaignId: string) {
  void client.invalidateQueries({ queryKey: trashKeys.templates(campaignId) });
}

/** Restaure un élément, puis recharge la corbeille et la liste où il revient. */
export async function restoreItem(
  client: QueryClient,
  item: Pick<TrashItem, 'id' | 'kind'>,
  campaignId?: string,
) {
  await trashApi.restore(item, campaignId);
  if (item.kind === 'character') {
    void client.invalidateQueries({
      queryKey: clesPersonnages.racine,
      predicate: (q) => q.queryKey[1] !== 'un',
    });
    return;
  }
  refreshTemplateTrash(client, campaignId!);
  void client.invalidateQueries({
    queryKey:
      item.kind === 'npc_template'
        ? npcTemplateKeys.all(campaignId!)
        : objectTemplateKeys.list(campaignId!),
  });
}

export function useRestore(campaignId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (item: Pick<TrashItem, 'id' | 'kind'>) => restoreItem(client, item, campaignId),
  });
}

/**
 * Action « Annuler » du toast de suppression : restaure aussitôt. Appelée hors de tout composant
 * (celui qui a supprimé peut avoir disparu), d'où le client passé en paramètre.
 */
export function undoAction(
  client: QueryClient,
  item: Pick<TrashItem, 'id' | 'kind' | 'name'>,
  campaignId?: string,
) {
  return {
    label: 'Annuler',
    onClick: () =>
      void restoreItem(client, item, campaignId).catch(() => {
        toast.error(`« ${item.name} » n’a pas pu être restauré`);
      }),
  };
}
