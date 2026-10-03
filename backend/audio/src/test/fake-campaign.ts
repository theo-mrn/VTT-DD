/**
 * Faux service campaign pour les tests : vrai serveur HTTP local qui répond à
 * la route interne des droits et à la réservation de place (quota de la campagne,
 * docs/stockage.md) : le vrai client HTTP du service est exercé.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CampaignRole } from '../clients/campaign.js';

export async function fakeCampaign(secret: string) {
  const members = new Map<string, Map<string, CampaignRole>>();
  let down = false;
  /** Quota par campagne (octets) ; place déjà réservée. */
  let quota = Infinity;
  const reserved = new Map<string, number>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const reply = (status: number, json: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (down) return reply(500, { title: 'Erreur interne' });
    if (req.headers['x-internal-secret'] !== secret)
      return reply(401, { title: 'Authentification requise' });
    if (url.pathname === '/internal/storage/reserve' && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const { campaignId, size } = JSON.parse(raw) as { campaignId: string; size: number };
      const used = reserved.get(campaignId) ?? 0;
      if (used + size > quota)
        return reply(422, { code: 'storage_quota_exceeded', detail: 'Espace plein' });
      reserved.set(campaignId, used + size);
      res.writeHead(204).end();
      return;
    }
    const m = /^\/internal\/campaigns\/([^/]+)\/rights$/.exec(url.pathname);
    if (!m) return reply(404, { title: 'Route introuvable' });
    const role = members.get(m[1]!)?.get(url.searchParams.get('userId') ?? '') ?? null;
    return reply(200, { member: !!role, role });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    /** Nouvelle campagne avec ses membres ; renvoie son identifiant. */
    campaign(roles: Record<string, CampaignRole>): string {
      const id = crypto.randomUUID();
      members.set(id, new Map(Object.entries(roles)));
      return id;
    },
    setDown(value: boolean) {
      down = value;
    },
    /** Place de chaque campagne pour la suite du test. */
    setQuota(bytes: number) {
      quota = bytes;
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
