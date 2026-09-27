/**
 * Faux dice et identity pour les tests : vrai serveur HTTP local qui répond
 * aux routes internes appelées par billing (le vrai client HTTP des effets est
 * donc exercé). Garde chaque appel reçu, et peut tomber en panne (500).
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface EffectCall {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

export async function fakeServices(secret: string) {
  const calls: EffectCall[] = [];
  /** Comptes inconnus d'identity (supprimés) : 404 user_not_found. */
  const deleted = new Set<string>();
  let down = false;

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      const reply = (status: number, json: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (down) return reply(500, { title: 'Erreur interne' });
      if (req.headers['x-internal-secret'] !== secret)
        return reply(401, { title: 'Authentification requise' });
      const path = new URL(req.url ?? '/', 'http://fake').pathname;
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const m = /^\/internal\/users\/([^/]+)\/(all-skins|premium|inventory\/[a-z0-9_]+)$/.exec(
        path,
      );
      if (!m || req.method !== 'PUT') return reply(404, { code: 'route_not_found' });
      if (m[2] === 'premium' && deleted.has(m[1]!)) return reply(404, { code: 'user_not_found' });
      calls.push({ method: req.method, path, body });
      return reply(200, {});
    });
  });

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    /** Appels reçus pour un utilisateur, sous la forme « chemin court → corps ». */
    callsFor(userId: string) {
      return calls
        .filter((c) => c.path.startsWith(`/internal/users/${userId}/`))
        .map((c) => ({ [c.path.slice(`/internal/users/${userId}/`.length)]: c.body }));
    },
    deleteAccount(userId: string) {
      deleted.add(userId);
    },
    setDown(value: boolean) {
      down = value;
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
