/**
 * Faux service character pour les tests : vrai serveur HTTP local qui répond
 * aux routes internes utilisées par campaign (le vrai client HTTP de campaign
 * est donc exercé), avec des personnages et des clés d'initiative imposés.
 */
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FauxPersonnage {
  ownerId: string;
  nom?: string;
  systemeId: string;
  /** Clés d'initiative renvoyées (ou calculées depuis les paramètres reçus). */
  cles?: number[] | ((parametres: Record<string, unknown>) => number[]);
  /** Refus des règles (422) à l'initiative, avec ce message. */
  refus?: string;
  /** États temporaires : rounds restants par entrée. */
  durees?: Record<string, number>;
}

export interface Appel {
  methode: string;
  chemin: string;
  secret: string | undefined;
  corps: Record<string, unknown>;
}

async function lireCorps(req: IncomingMessage): Promise<Record<string, unknown>> {
  const morceaux: Buffer[] = [];
  for await (const m of req) morceaux.push(m as Buffer);
  const texte = Buffer.concat(morceaux).toString('utf8');
  return texte ? (JSON.parse(texte) as Record<string, unknown>) : {};
}

export async function fauxCharacter(secret: string) {
  const personnages = new Map<string, FauxPersonnage>();
  const appels: Appel[] = [];

  const serveur = createServer(async (req, res) => {
    const corps = await lireCorps(req);
    const chemin = new URL(req.url ?? '/', 'http://faux').pathname;
    const recu = req.headers['x-internal-secret'];
    appels.push({
      methode: req.method ?? '',
      chemin,
      secret: typeof recu === 'string' ? recu : undefined,
      corps,
    });
    const repondre = (status: number, json: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (recu !== secret) return repondre(401, { title: 'Authentification requise' });

    const m = /^\/internal\/characters\/([^/]+)(\/.*)?$/.exec(chemin);
    const p = m ? personnages.get(m[1]!) : undefined;
    if (!m || !p) return repondre(404, { title: 'Ressource introuvable', code: 'not_found' });
    const id = m[1]!;
    const suite = m[2] ?? '';

    if (req.method === 'GET' && suite === '') {
      return repondre(200, {
        id,
        ownerId: p.ownerId,
        nom: p.nom ?? 'Héros',
        avatarUrl: null,
        systeme: { id: p.systemeId, version: '1.0.0' },
        type: 'personnage',
      });
    }
    if (req.method === 'POST' && suite.startsWith('/actions/')) {
      if (p.refus)
        return repondre(422, { title: 'Refusé', code: 'action_refusee', detail: p.refus });
      const parametres = (corps.parametres ?? {}) as Record<string, unknown>;
      const cles = typeof p.cles === 'function' ? p.cles(parametres) : (p.cles ?? [0]);
      return repondre(200, { resultat: { action: suite.slice(9), parametres }, cles });
    }
    if (req.method === 'POST' && suite === '/durees/decompter') {
      const durees = p.durees ?? {};
      const retirees: string[] = [];
      for (const [entree, n] of Object.entries(durees)) {
        if (n - 1 <= 0) {
          retirees.push(entree);
          delete durees[entree];
        } else durees[entree] = n - 1;
      }
      return repondre(200, { modifie: retirees.length > 0, retirees, version: 2 });
    }
    return repondre(404, { title: 'Route introuvable' });
  });

  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
  const { port } = serveur.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    personnages,
    appels,
    /** Ajoute un personnage et renvoie son identifiant. */
    ajouter(p: FauxPersonnage): string {
      const id = crypto.randomUUID();
      personnages.set(id, p);
      return id;
    },
    fermer: () => new Promise<void>((ok) => serveur.close(() => ok())),
  };
}
