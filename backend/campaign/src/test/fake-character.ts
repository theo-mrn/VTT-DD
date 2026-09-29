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
  /** Instance de PNJ : campagne de création et modèle copié. */
  campaignId?: string;
  templateId?: string | null;
  /** Supprimé (introuvable ensuite). */
  deleted?: boolean;
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

/** Réglages des routes des PNJ et du butin (pannes simulées). */
export interface FakeCharacterBehaviour {
  /** Réponse d'erreur de POST /internal/npcs (status, code). */
  failNpcs?: { status: number; code: string };
  /** Réponse d'erreur de POST /internal/characters/:id/possessions/receive. */
  failReceive?: { status: number; code: string };
  /** Identifiants imposés aux instances créées (un personnage existant est gardé tel quel). */
  npcIds?: string[];
}

export async function fakeCharacter(secret: string) {
  const characters = new Map<string, FakeCharacter>();
  const calls: Call[] = [];
  const behaviour: FakeCharacterBehaviour = {};
  /** Objets reçus par personnage (butin). */
  const loot = new Map<string, Record<string, unknown>[]>();

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

    // Instances de PNJ : de vrais personnages du faux service, numérotés comme character
    if (req.method === 'POST' && path === '/internal/npcs') {
      if (behaviour.failNpcs)
        return reply(behaviour.failNpcs.status, {
          title: 'Refusé',
          code: behaviour.failNpcs.code,
          detail: 'Refus simulé',
        });
      const source = body.source as Record<string, Record<string, string>>;
      const copied = source.characterId
        ? characters.get(source.characterId as unknown as string)
        : undefined;
      const name = source.quick?.name ?? copied?.name?.replace(/ \d+$/, '') ?? 'PNJ';
      const taken = [...characters.values()].filter(
        (c) => c.campaignId === body.campaignId && c.name?.startsWith(name),
      ).length;
      const items = Array.from({ length: body.count as number }, (_, i) => {
        const id = behaviour.npcIds?.[i] ?? crypto.randomUUID();
        const k = taken + i + 1;
        const c: FakeCharacter = {
          ownerId: body.ownerId as string,
          name: k === 1 ? name : `${name} ${k}`,
          systemId: body.systemId as string,
          kind: 'npc',
          campaignId: body.campaignId as string,
          templateId: (source.templateId as unknown as string) ?? copied?.templateId ?? null,
        };
        if (!characters.has(id)) characters.set(id, c);
        return {
          id,
          nom: c.name,
          avatarUrl: null,
          tokenUrl: source.quick?.imageUrl ?? null,
          templateId: c.templateId ?? null,
        };
      });
      return reply(201, { items });
    }
    if (req.method === 'POST' && path === '/internal/npcs/delete') {
      const deleted = (body.ids as string[]).filter((id) => {
        const c = characters.get(id);
        if (!c || c.kind !== 'npc' || c.deleted) return false;
        c.deleted = true;
        return true;
      });
      return reply(200, { deleted });
    }

    const m = /^\/internal\/characters\/([^/]+)(\/.*)?$/.exec(path);
    const c = m ? characters.get(m[1]!) : undefined;
    if (!m || !c || c.deleted)
      return reply(404, { title: 'Ressource introuvable', code: 'not_found' });
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
    if (req.method === 'POST' && rest === '/possessions/receive') {
      if (behaviour.failReceive)
        return reply(behaviour.failReceive.status, {
          title: 'Refusé',
          code: behaviour.failReceive.code,
          detail: 'Refus simulé',
        });
      const item = body.item as Record<string, unknown>;
      loot.set(id, [...(loot.get(id) ?? []), { ...item, playerId: body.playerId }]);
      return reply(200, { version: 2, entree: (item.ref as string) ?? 'objet-libre' });
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
    behaviour,
    loot,
    /** Ajoute un personnage et renvoie son identifiant. */
    add(c: FakeCharacter): string {
      const id = crypto.randomUUID();
      characters.set(id, c);
      return id;
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
