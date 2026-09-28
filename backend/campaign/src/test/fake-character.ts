/**
 * Faux service character pour les tests : vrai serveur HTTP local qui répond
 * aux routes internes utilisées par campaign (le vrai client HTTP de campaign
 * est donc exercé), avec des personnages et des clés d'initiative imposés.
 * Les réponses suivent le contrat de character (champs en français).
 */
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeCharacter {
  ownerId: string;
  name?: string;
  systemId: string;
  /** Clés d'initiative renvoyées (ou calculées depuis les paramètres reçus). */
  sortKeys?: number[] | ((params: Record<string, unknown>) => number[]);
  /** Refus des règles (422) à l'initiative, avec ce message. */
  rejection?: string;
  /** États temporaires : rounds restants par entrée. */
  durations?: Record<string, number>;
  /** Création en cours (fiche pas encore terminée). */
  inCreation?: boolean;
  type?: string;
  /** Joueur ou PNJ ; absent : ancienne version de character, sans ce champ. */
  kind?: 'pc' | 'npc';
  avatarUrl?: string | null;
  /** Résumé des listes renvoyé par character. */
  summary?: { tagline: string; highlights: { label: string; value: string }[] };
}

export interface Call {
  method: string;
  path: string;
  secret: string | undefined;
  body: Record<string, unknown>;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export async function fakeCharacter(secret: string) {
  const characters = new Map<string, FakeCharacter>();
  const calls: Call[] = [];

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const path = new URL(req.url ?? '/', 'http://fake').pathname;
    const received = req.headers['x-internal-secret'];
    calls.push({
      method: req.method ?? '',
      path,
      secret: typeof received === 'string' ? received : undefined,
      body,
    });
    const reply = (status: number, json: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (received !== secret) return reply(401, { title: 'Authentification requise' });

    const m = /^\/internal\/characters\/([^/]+)(\/.*)?$/.exec(path);
    const c = m ? characters.get(m[1]!) : undefined;
    if (!m || !c) return reply(404, { title: 'Ressource introuvable', code: 'not_found' });
    const id = m[1]!;
    const rest = m[2] ?? '';

    if (req.method === 'GET' && rest === '') {
      return reply(200, {
        id,
        ownerId: c.ownerId,
        nom: c.name ?? 'Héros',
        avatarUrl: c.avatarUrl ?? null,
        systeme: { id: c.systemId, version: '1.0.0' },
        type: c.type ?? 'personnage',
        ...(c.kind ? { kind: c.kind } : {}),
        creation: c.inCreation ?? false,
        ...(c.summary ? { summary: c.summary } : {}),
      });
    }
    if (req.method === 'POST' && rest.startsWith('/actions/')) {
      if (c.rejection)
        return reply(422, { title: 'Refusé', code: 'action_refusee', detail: c.rejection });
      const params = (body.parametres ?? {}) as Record<string, unknown>;
      const cles = typeof c.sortKeys === 'function' ? c.sortKeys(params) : (c.sortKeys ?? [0]);
      return reply(200, { resultat: { action: rest.slice(9), parametres: params }, cles });
    }
    if (req.method === 'POST' && rest === '/durees/decompter') {
      const durations = c.durations ?? {};
      const retirees: string[] = [];
      for (const [entry, n] of Object.entries(durations)) {
        if (n - 1 <= 0) {
          retirees.push(entry);
          delete durations[entry];
        } else durations[entry] = n - 1;
      }
      return reply(200, { modifie: retirees.length > 0, retirees, version: 2 });
    }
    return reply(404, { title: 'Route introuvable' });
  });

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    characters,
    calls,
    /** Ajoute un personnage et renvoie son identifiant. */
    add(c: FakeCharacter): string {
      const id = crypto.randomUUID();
      characters.set(id, c);
      return id;
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
