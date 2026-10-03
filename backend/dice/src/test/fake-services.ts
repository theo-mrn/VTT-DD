/**
 * Faux services campaign et character pour les tests : vrai serveur HTTP
 * local qui répond aux routes internes utilisées par dice (les vrais clients
 * HTTP de dice sont donc exercés). Les réponses suivent les contrats de ces
 * services (character en français).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CampaignRole } from '../clients/campaign.js';

export interface FakeSheet {
  ownerId: string;
  name?: string;
  avatarUrl?: string;
  systemId?: string;
  /** Valeurs calculées : clé → valeur (et modificateur). */
  values?: Record<string, { valeur: number | boolean | string; modificateur?: number }>;
  /** Utilisateurs (autres que le propriétaire) autorisés à agir avec ce personnage. */
  allowed?: string[];
  /** Utilisateurs qui le voient sans pouvoir agir (403). */
  readers?: string[];
}

export async function fakeServices(secret: string) {
  /** campagne → utilisateur → rôle */
  const members = new Map<string, Map<string, CampaignRole>>();
  const sheets = new Map<string, FakeSheet>();
  /** campagne → système, et utilisateur → personnage incarné */
  const systems = new Map<string, string>();
  const played = new Map<string, Map<string, string>>();
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

    // Route publique de campaign, avec le jeton de l'utilisateur (sujet lu sans vérification)
    const detail = /^\/v1\/campaigns\/([^/]+)$/.exec(url.pathname);
    if (detail) {
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      const payload = token.split('.')[1] ?? '';
      const sub = (
        JSON.parse(Buffer.from(payload, 'base64url').toString() || '{}') as { sub?: string }
      ).sub;
      const id = detail[1]!;
      if (!sub || !members.get(id)?.has(sub)) return reply(404, { title: 'Ressource introuvable' });
      return reply(200, {
        id,
        system: { id: systems.get(id) ?? 'dnd-classic', version: '1.0.0' },
        playedCharacterId: played.get(id)?.get(sub) ?? null,
      });
    }

    if (req.headers['x-internal-secret'] !== secret)
      return reply(401, { title: 'Authentification requise' });
    const userId = url.searchParams.get('userId') ?? '';

    let m = /^\/internal\/campaigns\/([^/]+)\/rights$/.exec(url.pathname);
    if (m) {
      const role = members.get(m[1]!)?.get(userId) ?? null;
      return reply(200, { member: !!role, role });
    }
    m = /^\/internal\/characters\/([^/]+)\/sheet$/.exec(url.pathname);
    if (m) {
      const s = sheets.get(m[1]!);
      const can = s && (s.ownerId === userId || s.allowed?.includes(userId));
      if (!s || (!can && !s.readers?.includes(userId)))
        return reply(404, { title: 'Ressource introuvable', code: 'not_found' });
      if (!can) return reply(403, { title: 'Accès refusé', code: 'forbidden' });
      return reply(200, {
        id: m[1],
        ownerId: s.ownerId,
        nom: s.name ?? 'Héros',
        avatarUrl: s.avatarUrl ?? null,
        systeme: { id: s.systemId ?? 'dnd-classic', version: '1.0.0' },
        valeurs: s.values ?? {},
      });
    }
    return reply(404, { title: 'Route introuvable' });
  });

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    /** Nouvelle campagne avec ses membres ; renvoie son identifiant. */
    campaign(roles: Record<string, CampaignRole>): string {
      const id = crypto.randomUUID();
      members.set(id, new Map(Object.entries(roles)));
      return id;
    },
    setRole(campaignId: string, userId: string, role: CampaignRole | null) {
      const m = members.get(campaignId) ?? new Map<string, CampaignRole>();
      if (role) m.set(userId, role);
      else m.delete(userId);
      members.set(campaignId, m);
    },
    /** Système de la campagne (dnd-classic par défaut). */
    setSystem(campaignId: string, systemId: string) {
      systems.set(campaignId, systemId);
    },
    /** Personnage incarné par un membre. */
    play(campaignId: string, userId: string, characterId: string) {
      const m = played.get(campaignId) ?? new Map<string, string>();
      m.set(userId, characterId);
      played.set(campaignId, m);
    },
    /** Nouveau personnage ; renvoie son identifiant. */
    character(sheet: FakeSheet): string {
      const id = crypto.randomUUID();
      sheets.set(id, sheet);
      return id;
    },
    /** Panne des deux services (500). */
    setDown(value: boolean) {
      down = value;
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
