/** Faux campaign, character et audio : instantanés donnés, imports enregistrés. */
import type { ArchiveService, ArchiveServiceImport, ArchiveServiceSnapshot } from '@vtt/contracts';
import type { ArchiveServices, CampaignSnapshot } from '../clients/services.js';

export function fakeServices(o: {
  campaign: CampaignSnapshot;
  character?: ArchiveServiceSnapshot;
  audio?: ArchiveServiceSnapshot;
  roles?: Record<string, 'gm' | 'player'>;
  failOn?: ArchiveService;
}) {
  const empty = (v: string): ArchiveServiceSnapshot => ({
    schemaVersion: v,
    tables: {},
    files: [],
  });
  const imports: { service: ArchiveService; campaignId: string; body: ArchiveServiceImport }[] = [];
  const removed: string[] = [];
  const services: ArchiveServices = {
    role: async (_campaignId, userId) => o.roles?.[userId] ?? null,
    campaignSnapshot: async () => structuredClone(o.campaign),
    snapshot: async (service) =>
      structuredClone((service === 'character' ? o.character : o.audio) ?? empty('1')),
    importInto: async (service, campaignId, body) => {
      if (o.failOn === service) throw new Error(`${service} en panne`);
      imports.push({ service, campaignId, body });
    },
    removeCampaign: async (campaignId) => {
      removed.push(campaignId);
    },
  };
  return { services, imports, removed };
}
