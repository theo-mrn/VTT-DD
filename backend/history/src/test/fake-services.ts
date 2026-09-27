/**
 * Faux service campaign pour les tests : vrai serveur HTTP local qui répond à
 * la route interne des droits (le vrai client HTTP de history est donc exercé).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CampaignRole } from '../clients/campaign.js';

export async function fakeServices(secret: string) {
  /** campagne → utilisateur → rôle */
  const members = new Map<string, Map<string, CampaignRole>>();
  const calls: string[] = [];
  let down = false;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    calls.push(`${req.method} ${url.pathname}`);
    const reply = (status: number, json: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (down) return reply(500, { title: 'Erreur interne' });
    if (req.headers['x-internal-secret'] !== secret)
      return reply(401, { title: 'Authentification requise' });

    const m = /^\/internal\/campaigns\/([^/]+)\/rights$/.exec(url.pathname);
    if (m) {
      const role = members.get(m[1]!)?.get(url.searchParams.get('userId') ?? '') ?? null;
      return reply(200, { member: !!role, role });
    }
    return reply(404, { title: 'Route introuvable' });
  });

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    /** Nouvelle campagne (identifiant imposé ou aléatoire) avec ses membres ; renvoie son identifiant. */
    campaign(roles: Record<string, CampaignRole>, id: string = crypto.randomUUID()): string {
      members.set(id, new Map(Object.entries(roles)));
      return id;
    },
    /** Panne de campaign (500). */
    setDown(value: boolean) {
      down = value;
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
