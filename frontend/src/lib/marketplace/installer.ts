/**
 * Installation d'un pack dans une campagne (docs/marketplace.md § 4.3) : le navigateur applique
 * le contenu par les routes existantes de character (modèles) et de campaign (scènes), avec les
 * droits du MJ, la validation et les événements de chaque service.
 *
 * Chaque écriture porte un `Idempotency-Key` tiré de l'installation et de son rang : relancer
 * une installation interrompue rejoue les écritures déjà faites (le service rend la réponse
 * d'origine) au lieu de les doubler.
 *
 * `planInstall` est pur (testé) ; `runInstall` exécute le plan avec un client injecté.
 */
import {
  MAP_BATCH_MAX,
  type CreateMapScene,
  type InstallCreated,
  type PackContent,
} from '@vtt/contracts';
import { api } from '../api';

type LayerPath = 'obstacles' | 'lights' | 'rooms' | 'objects';

export type InstallStep =
  | {
      kind: 'object-template';
      body: { name: string; imageUrl: string | null; category: string | null };
    }
  | { kind: 'npc-category'; name: string }
  | {
      kind: 'npc-template';
      body: {
        name: string;
        imageUrl: string | null;
        tokenUrl: string | null;
        actions: PackContent['npcTemplates'][number]['actions'];
        etat: Record<string, unknown>;
      };
    }
  | { kind: 'scene'; scene: number; body: CreateMapScene }
  | { kind: 'layer'; scene: number; path: LayerPath; items: Record<string, unknown>[] };

export interface InstallPlan {
  steps: InstallStep[];
  /** Éléments écartés (modèles de PNJ d'un autre système). */
  skipped: number;
  counts: Omit<InstallCreated, 'skipped'>;
}

/** Catégorie des modèles de PNJ d'un pack : le titre, borné à la taille d'un nom. */
export const categoryName = (title: string) => title.trim().slice(0, 100) || 'Pack';

export function planInstall(
  content: PackContent,
  opts: { campaignSystemId: string | null; title: string },
): InstallPlan {
  const steps: InstallStep[] = [];
  for (const t of content.objectTemplates)
    steps.push({
      kind: 'object-template',
      body: { name: t.name, imageUrl: t.imageUrl, category: t.category },
    });

  // Un modèle de PNJ ne vaut que dans son système : ailleurs, il est écarté
  const npcsFit = content.systemId !== null && content.systemId === opts.campaignSystemId;
  const npcs = npcsFit ? content.npcTemplates : [];
  if (npcs.length) steps.push({ kind: 'npc-category', name: categoryName(opts.title) });
  for (const t of npcs)
    steps.push({
      kind: 'npc-template',
      body: {
        name: t.name,
        imageUrl: t.imageUrl,
        tokenUrl: t.tokenUrl,
        actions: t.actions,
        etat: t.etat,
      },
    });

  content.scenes.forEach((s, scene) => {
    steps.push({
      kind: 'scene',
      scene,
      body: { ...s.scene, isDefault: false, visibleToPlayers: false },
    });
    const layers: [LayerPath, Record<string, unknown>[]][] = [
      ['obstacles', s.obstacles],
      ['lights', s.lights],
      ['rooms', s.rooms],
      ['objects', s.objects],
    ];
    for (const [path, items] of layers)
      for (let i = 0; i < items.length; i += MAP_BATCH_MAX)
        steps.push({ kind: 'layer', scene, path, items: items.slice(i, i + MAP_BATCH_MAX) });
  });

  return {
    steps,
    skipped: content.npcTemplates.length - npcs.length,
    counts: {
      scenes: content.scenes.length,
      npcTemplates: npcs.length,
      objectTemplates: content.objectTemplates.length,
    },
  };
}

/** Écritures de l'installation ; `key` : clé d'idempotence de l'étape. */
export interface InstallClient {
  createObjectTemplate(body: InstallStep & { kind: 'object-template' }, key: string): Promise<void>;
  createNpcCategory(name: string, key: string): Promise<{ id: string }>;
  createNpcTemplate(
    body: (InstallStep & { kind: 'npc-template' })['body'] & { categoryId: string },
    key: string,
  ): Promise<void>;
  createScene(body: CreateMapScene, key: string): Promise<{ id: string }>;
  batch(
    mapId: string,
    path: LayerPath,
    items: Record<string, unknown>[],
    key: string,
  ): Promise<void>;
}

/** Clé d'idempotence d'une étape : stable pour une installation donnée. */
export const stepKey = (installId: string, index: number) => `mkt-${installId}-${index}`;

/** Exécute le plan dans l'ordre ; `onProgress(fait, total)` après chaque étape. */
export async function runInstall(
  plan: InstallPlan,
  client: InstallClient,
  installId: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<InstallCreated> {
  let categoryId: string | null = null;
  const maps = new Map<number, string>();
  const total = plan.steps.length;
  for (const [i, step] of plan.steps.entries()) {
    signal?.throwIfAborted();
    const key = stepKey(installId, i);
    switch (step.kind) {
      case 'object-template':
        await client.createObjectTemplate(step, key);
        break;
      case 'npc-category':
        categoryId = (await client.createNpcCategory(step.name, key)).id;
        break;
      case 'npc-template':
        await client.createNpcTemplate({ ...step.body, categoryId: categoryId! }, key);
        break;
      case 'scene':
        maps.set(step.scene, (await client.createScene(step.body, key)).id);
        break;
      case 'layer':
        await client.batch(maps.get(step.scene)!, step.path, step.items, key);
        break;
    }
    onProgress?.(i + 1, total);
  }
  return { ...plan.counts, skipped: plan.skipped };
}

/** Client réel : routes de character (modèles) et de campaign (scènes) de la campagne. */
export function campaignInstallClient(campaignId: string): InstallClient {
  const base = `/v1/campaigns/${encodeURIComponent(campaignId)}`;
  const post = <T>(path: string, body: unknown, key: string) =>
    api<T>(`${base}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'idempotency-key': key },
    });
  return {
    async createObjectTemplate(step, key) {
      await post('/object-templates', step.body, key);
    },
    createNpcCategory: (name, key) =>
      post<{ id: string }>('/npc-template-categories', { name }, key),
    async createNpcTemplate(body, key) {
      await post('/npc-templates', body, key);
    },
    createScene: (body, key) => post<{ id: string }>('/maps', body, key),
    async batch(mapId, path, items, key) {
      await post(`/maps/${encodeURIComponent(mapId)}/${path}/batch`, { create: items }, key);
    },
  };
}
