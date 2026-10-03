/**
 * Raccourcis HTTP des tests d'intégration : requêtes authentifiées, création
 * de personnages prêts à jouer.
 */
import type { appDeTest } from './app-de-test.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;
export type Utilisateur = Awaited<ReturnType<Contexte['utilisateur']>>;
type Methode = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface PersonnageApi {
  id: string;
  ownerId: string;
  nom: string;
  version: number;
  etat: {
    valeurs: Record<string, unknown>;
    possessions: { entree: string; duree?: number }[];
  };
  fiche: { valeurs: Record<string, { valeur: unknown }> };
}

export function outils(t: Contexte) {
  const requete = (u: Utilisateur, method: Methode, url: string, payload?: unknown) =>
    t.app.inject({
      method,
      url,
      headers: u.auth,
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });

  async function ok(u: Utilisateur, method: Methode, url: string, payload?: unknown) {
    const res = await requete(u, method, url, payload);
    if (res.statusCode >= 300) throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
    return res.json() as PersonnageApi;
  }

  async function etapes(u: Utilisateur, p: PersonnageApi, suite: [string, object][]) {
    let courant = p;
    for (const [etape, corps] of suite) {
      courant = await ok(u, 'POST', `/v1/characters/${p.id}/creation/${etape}`, {
        version: courant.version,
        ...corps,
      });
    }
    return courant;
  }

  /** Guerrier nain D&D terminé, armé d'une épée longue. */
  async function nainGuerrier(u: Utilisateur, nom: string) {
    let p = await ok(u, 'POST', '/v1/characters', {
      systemeId: 'dnd-classic',
      type: 'personnage',
      nom,
    });
    p = await etapes(u, p, [
      ['race', { entrees: [{ entree: 'nain' }] }],
      ['profil', { entrees: [{ entree: 'guerrier' }] }],
      ['voies', { entrees: [{ entree: 'guerrier-resistance' }] }],
      ['caracteristiques', {}],
      ['de-de-vie', {}],
    ]);
    p = await ok(u, 'POST', `/v1/characters/${p.id}/creation/terminer`, { version: p.version });
    return ok(u, 'POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'epee-longue',
    });
  }

  /** Chasseur de primes bothan (Star Wars), avec un rang de Vigilance. */
  async function chasseurBothan(u: Utilisateur, nom: string) {
    const p = await ok(u, 'POST', '/v1/characters', {
      systemeId: 'star-wars-eote',
      type: 'personnage',
      nom,
    });
    return etapes(u, p, [
      ['espece', { entrees: [{ entree: 'bothan' }] }],
      [
        'carriere',
        {
          entrees: [
            {
              entree: 'chasseur-de-primes',
              choix: {
                'rangs-de-depart': ['athletisme', 'perception', 'distance-lourde', 'vigilance'],
              },
            },
          ],
        },
      ],
    ]);
  }

  return { requete, ok, etapes, nainGuerrier, chasseurBothan };
}
