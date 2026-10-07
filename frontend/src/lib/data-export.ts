/**
 * Export des données du compte (droit à la portabilité, docs/legal.md) : un seul fichier JSON
 * assemblé dans le navigateur à partir des API de chaque service, avec la session de la
 * personne. Seul ce qui lui appartient : ses notes, ses personnages, ses jets personnels ;
 * les campagnes y figurent par leur résumé. Les images y sont par leur adresse.
 */
import { api } from './api';

/** Une rubrique illisible (service indisponible) n'empêche pas les autres : elle est notée. */
type Section = unknown | { error: string };

const CONCURRENCY = 4;
/** Même page que l'historique des jets (lib/jets.ts). */
const ROLLS_PAGE = 50;

async function section<T>(read: () => Promise<T>): Promise<Section> {
  try {
    return await read();
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'lecture impossible' };
  }
}

/** Lit `ids` avec quelques requêtes en parallèle seulement. */
async function each<T>(ids: string[], read: (id: string) => Promise<T>): Promise<Section[]> {
  const out: Section[] = new Array(ids.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
      while (next < ids.length) {
        const i = next++;
        out[i] = await section(() => read(ids[i]!));
      }
    }),
  );
  return out;
}

async function myNotes(userId: string) {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const page: { items: { id: string; owner: { id: string } }[]; nextCursor: string | null } =
      await api(`/v1/notes?${params}`);
    ids.push(...page.items.filter((n) => n.owner.id === userId).map((n) => n.id));
    cursor = page.nextCursor;
  } while (cursor);
  return each(ids, (id) => api(`/v1/notes/${encodeURIComponent(id)}`));
}

async function myCharacters() {
  const list = await api<{ id: string }[]>('/v1/characters');
  return each(
    list.map((c) => c.id),
    (id) => api(`/v1/characters/${encodeURIComponent(id)}`),
  );
}

async function personalRolls() {
  const rolls: { id: string }[] = [];
  for (let before: string | undefined; ;) {
    const params = new URLSearchParams({ limit: String(ROLLS_PAGE) });
    if (before) params.set('before', before);
    const page = await api<{ id: string }[]>(`/v1/dice/rolls?${params}`);
    rolls.push(...page);
    if (page.length < ROLLS_PAGE) return rolls;
    before = page.at(-1)!.id;
  }
}

/** Assemble l'export ; `userId` : le compte connecté. */
export async function exportMyData(userId: string) {
  const [profile, titles, sessions, friends, friendRequests, apiKeys] = await Promise.all([
    section(() => api('/v1/users/me')),
    section(() => api('/v1/users/me/titles')),
    section(() => api('/v1/auth/sessions')),
    section(() => api('/v1/friends')),
    section(() => api('/v1/friends/requests')),
    section(() => api('/v1/api-keys')),
  ]);
  const [campaigns, characters, notes, rolls, dicePreferences, mixer, mapToolbar, shortcuts] =
    await Promise.all([
      section(() => api('/v1/campaigns')),
      section(myCharacters),
      section(() => myNotes(userId)),
      section(personalRolls),
      section(() => api('/v1/dice/me/preferences')),
      section(() => api('/v1/audio/me/mixer')),
      section(() => api('/v1/users/me/map-toolbar')),
      section(() => api('/v1/users/me/shortcuts')),
    ]);
  // Marketplace (docs/marketplace.md) : profil de créateur, packs acquis, packs publiés
  const [creator, library, listings] = await Promise.all([
    section(() => api('/v1/marketplace/me')),
    section(() => api('/v1/marketplace/library')),
    section(() => api('/v1/marketplace/studio/listings')),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    service: 'Yner',
    account: { profile, titles, sessions, friends, friendRequests, apiKeys },
    game: {
      campaigns,
      characters,
      notes,
      personalRolls: rolls,
      dicePreferences,
      mixer,
      mapToolbar,
      shortcuts,
    },
    marketplace: { creator, library, listings },
  };
}

/** Télécharge l'export sous `yner-donnees-AAAA-MM-JJ.json`. */
export async function downloadMyData(userId: string) {
  const data = await exportMyData(userId);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yner-donnees-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
