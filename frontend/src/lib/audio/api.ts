/**
 * Appels REST du service audio (docs/api-audio.md), par la gateway. Les types
 * viennent du contrat partagé (`@vtt/contracts`, types seulement : rien de zod
 * n'est embarqué dans le front).
 */
import type {
  Asset,
  AssetKind,
  CatalogCategory,
  CatalogEntry,
  ChannelCommand,
  ChannelName,
  ChannelState,
  MixerPreferences,
  PlaybackAsset,
  Playlist,
  UploadTicket,
} from '@vtt/contracts';
import { api } from '../api';

const base = (campaignId: string) => `/v1/audio/campaigns/${encodeURIComponent(campaignId)}`;
const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const audioApi = {
  clock: () => api<{ serverTime: number }>('/v1/audio/clock', { cache: 'no-store' }),
  catalog: (library: string | null, kind?: AssetKind) => {
    const q = new URLSearchParams();
    if (library) q.set('library', library);
    if (kind) q.set('kind', kind);
    return api<{ categories: CatalogCategory[]; items: CatalogEntry[] }>(
      `/v1/audio/catalog${q.size ? `?${q}` : ''}`,
    );
  },
  channels: (campaignId: string) =>
    api<{ serverTime: number; channels: Record<ChannelName, ChannelState> }>(
      `${base(campaignId)}/channels`,
      { cache: 'no-store' },
    ),
  command: (campaignId: string, channel: ChannelName, command: ChannelCommand) =>
    api<ChannelState>(`${base(campaignId)}/channels/${channel}/commands`, json(command)),
  assets: async (campaignId: string, kind?: AssetKind) => {
    const items: Asset[] = [];
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams();
      if (kind) q.set('kind', kind);
      if (cursor) q.set('cursor', cursor);
      const page: { items: Asset[]; nextCursor: string | null } = await api(
        `${base(campaignId)}/assets${q.size ? `?${q}` : ''}`,
      );
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  },
  resolve: (campaignId: string, ids: string[]) =>
    api<{ items: PlaybackAsset[] }>(
      `${base(campaignId)}/assets/resolve?ids=${ids.map(encodeURIComponent).join(',')}`,
    ),
  requestUpload: (
    campaignId: string,
    body: { fileName: string; contentType: string; size: number; kind: AssetKind },
  ) => api<UploadTicket>(`${base(campaignId)}/assets/uploads`, json(body)),
  createAsset: (campaignId: string, body: Record<string, unknown>) =>
    api<Asset>(`${base(campaignId)}/assets`, json(body)),
  updateAsset: (campaignId: string, assetId: string, patch: Record<string, unknown>) =>
    api<Asset>(`${base(campaignId)}/assets/${assetId}`, json(patch, 'PATCH')),
  deleteAsset: (campaignId: string, assetId: string) =>
    api<void>(`${base(campaignId)}/assets/${assetId}`, { method: 'DELETE' }),
  playlists: (campaignId: string) => api<{ items: Playlist[] }>(`${base(campaignId)}/playlists`),
  createPlaylist: (campaignId: string, body: { name: string; assetIds?: string[] }) =>
    api<Playlist>(`${base(campaignId)}/playlists`, json(body)),
  updatePlaylist: (
    campaignId: string,
    id: string,
    patch: { name?: string; assetIds?: string[]; version?: number },
  ) => api<Playlist>(`${base(campaignId)}/playlists/${id}`, json(patch, 'PATCH')),
  deletePlaylist: (campaignId: string, id: string) =>
    api<void>(`${base(campaignId)}/playlists/${id}`, { method: 'DELETE' }),
  playCue: (campaignId: string, body: { cueId: string; assetId: string; volume?: number }) =>
    api<{ cueId: string; startAt: string }>(`${base(campaignId)}/cues`, json(body)),
  stopCue: (campaignId: string, cueId: string) =>
    api<void>(`${base(campaignId)}/cues/${cueId}/stop`, { method: 'POST' }),
  stopAllCues: (campaignId: string) =>
    api<void>(`${base(campaignId)}/cues/stop`, { method: 'POST' }),
  mixer: () => api<MixerPreferences>('/v1/audio/me/mixer'),
  saveMixer: (body: {
    volumes: Partial<MixerPreferences['volumes']>;
    muted?: Partial<MixerPreferences['muted']>;
    version?: number;
  }) => api<MixerPreferences>('/v1/audio/me/mixer', json(body, 'PUT')),
};
