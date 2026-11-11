/**
 * Appels internes du service archive (secret partagé) : rôle dans une campagne, instantanés et
 * imports de campaign, character et audio (docs/export-campagne.md § 5.5), retrait d'un import
 * manqué.
 */
import {
  ArchiveServiceSnapshot,
  type ArchiveOptions,
  type ArchiveService,
  type ArchiveServiceImport,
} from '@vtt/contracts';
import { campaignRoleLookup, INTERNAL_SECRET_HEADER, type CampaignRole } from '@vtt/platform';
import { z } from 'zod';

export class ServiceError extends Error {
  constructor(
    readonly service: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(`${service} : ${status} ${code}`);
  }
}

export type CampaignSnapshot = ArchiveServiceSnapshot & { gmIds: string[] };

export interface ArchiveServices {
  role(campaignId: string, userId: string): Promise<CampaignRole | null>;
  campaignSnapshot(campaignId: string, options: ArchiveOptions): Promise<CampaignSnapshot>;
  snapshot(
    service: Exclude<ArchiveService, 'campaign'>,
    campaignId: string,
    options: ArchiveOptions,
    gmIds: string[],
  ): Promise<ArchiveServiceSnapshot>;
  importInto(
    service: ArchiveService,
    campaignId: string,
    body: ArchiveServiceImport,
  ): Promise<void>;
  /** Retire une campagne importée à moitié (rien si elle n'existe pas). */
  removeCampaign(campaignId: string, userId: string): Promise<void>;
}

const CampaignSnapshotResponse = ArchiveServiceSnapshot.extend({ gmIds: z.array(z.uuid()) });

/** Instantané ou import : plusieurs dizaines de Mo de lignes, possiblement. */
const LONG_TIMEOUT_MS = 180_000;

export function archiveServices(o: {
  campaignUrl: string;
  characterUrl: string;
  audioUrl: string;
  secret: string;
  cacheMs: number;
  fetch?: typeof globalThis.fetch;
}): ArchiveServices {
  const doFetch = o.fetch ?? globalThis.fetch;
  const urls: Record<ArchiveService, string> = {
    campaign: o.campaignUrl,
    character: o.characterUrl,
    audio: o.audioUrl,
  };
  async function call(
    service: ArchiveService,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const res = await doFetch(new URL(path, urls[service]), {
      method,
      headers: {
        [INTERNAL_SECRET_HEADER]: o.secret,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(LONG_TIMEOUT_MS),
    });
    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as { code?: string };
      throw new ServiceError(service, res.status, problem.code ?? 'internal');
    }
    return res.status === 204 ? undefined : res.json();
  }
  const path = (id: string, rest = '') =>
    `/internal/campaigns/${encodeURIComponent(id)}/archive${rest}`;

  return {
    role: campaignRoleLookup({ url: o.campaignUrl, secret: o.secret, cacheMs: o.cacheMs }),
    async campaignSnapshot(campaignId, options) {
      const json = await call(
        'campaign',
        'GET',
        path(campaignId, `?keepProgress=${options.keepProgress}`),
      );
      return CampaignSnapshotResponse.parse(json);
    },
    async snapshot(service, campaignId, options, gmIds) {
      const json = await call(service, 'POST', path(campaignId, '/snapshot'), { options, gmIds });
      return ArchiveServiceSnapshot.parse(json);
    },
    async importInto(service, campaignId, body) {
      await call(service, 'POST', path(campaignId), body);
    },
    async removeCampaign(campaignId, userId) {
      await call('campaign', 'DELETE', path(campaignId, `?userId=${encodeURIComponent(userId)}`));
    },
  };
}
