/**
 * Préparation des données par l'API (même origine que l'app : `/v1/*` passe par Next vers la
 * gateway). Les parcours testés passent par l'interface ; tout le reste (comptes d'appoint,
 * personnage terminé, carte, tokens) est posé ici, vite et sans dépendre de l'interface.
 *
 * Un compte est créé dans le contexte d'un navigateur (`page.request`) : le cookie de session
 * y reste, l'app reprend la session à la première page.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

export interface Compte {
  id: string;
  nom: string;
  email: string;
  motDePasse: string;
  jeton: string;
  request: APIRequestContext;
}

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Données uniques d'un compte (jamais réutilisées d'un passage à l'autre). */
export function identite(prefixe: string) {
  const id = unique();
  return {
    nom: `${prefixe} ${id}`,
    email: `e2e+${prefixe.toLowerCase()}-${id}@yner.test`,
    motDePasse: `Mot-de-passe-${id}!`,
  };
}

/** Appel authentifié ; échoue avec le corps de la réponse si le service refuse. */
export async function appel<T>(
  compte: Compte,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  chemin: string,
  corps?: unknown,
): Promise<T> {
  const res = await compte.request.fetch(chemin, {
    method,
    headers: { authorization: `Bearer ${compte.jeton}` },
    ...(corps !== undefined ? { data: corps } : {}),
  });
  expect(res.ok(), `${method} ${chemin} : ${res.status()} ${await res.text()}`).toBe(true);
  const texte = await res.text();
  return (texte ? JSON.parse(texte) : undefined) as T;
}

/**
 * Compte neuf, connecté dans ce navigateur, accueil déjà fait (sinon chaque page mènerait à
 * /bienvenue).
 */
export async function creerCompte(page: Page, prefixe: string): Promise<Compte> {
  const i = identite(prefixe);
  const res = await page.request.post('/v1/auth/register', {
    data: { email: i.email, password: i.motDePasse, name: i.nom },
  });
  expect(res.ok(), `inscription : ${res.status()} ${await res.text()}`).toBe(true);
  const { accessToken, user } = (await res.json()) as { accessToken: string; user: { id: string } };
  const compte: Compte = { ...i, id: user.id, jeton: accessToken, request: page.request };
  await appel(compte, 'PATCH', '/v1/users/me', {
    settings: { onboarding: { version: 2, termineLe: new Date().toISOString() } },
  });
  return compte;
}

export interface Campagne {
  id: string;
  code: string;
  name: string;
}

export const creerCampagne = (mj: Compte, nom = `Campagne ${unique()}`) =>
  appel<Campagne>(mj, 'POST', '/v1/campaigns', { name: nom, systemId: 'dnd-classic' });

export const rejoindre = (joueur: Compte, code: string) =>
  appel<Campagne>(joueur, 'POST', '/v1/campaigns/join', { code });

interface Personnage {
  id: string;
  version: number;
  nom: string;
}

/**
 * Nain guerrier D&D classique, création terminée (mêmes étapes que les tests du service
 * character) : prêt à être incarné.
 */
export async function creerHeros(joueur: Compte, nom = `Brom ${unique()}`): Promise<Personnage> {
  let p = await appel<Personnage>(joueur, 'POST', '/v1/characters', {
    systemeId: 'dnd-classic',
    type: 'personnage',
    nom,
  });
  for (const [etape, corps] of [
    ['race', { entrees: [{ entree: 'nain' }] }],
    ['profil', { entrees: [{ entree: 'guerrier' }] }],
    ['voies', { entrees: [{ entree: 'guerrier-resistance' }] }],
    ['caracteristiques', {}],
    ['de-de-vie', {}],
  ] as const)
    p = await appel<Personnage>(joueur, 'POST', `/v1/characters/${p.id}/creation/${etape}`, {
      version: p.version,
      ...corps,
    });
  return appel<Personnage>(joueur, 'POST', `/v1/characters/${p.id}/creation/terminer`, {
    version: p.version,
  });
}

/** Le joueur engage son héros dans la campagne et l'incarne. */
export async function incarner(joueur: Compte, campagneId: string, personnageId: string) {
  await appel(joueur, 'POST', `/v1/campaigns/${campagneId}/characters`, {
    characterId: personnageId,
  });
  await appel(joueur, 'PUT', `/v1/campaigns/${campagneId}/me/character`, {
    characterId: personnageId,
  });
}

export interface Scene {
  id: string;
  version: number;
}

/** Scène de 2000 × 1500, carte du groupe, avec les personnages donnés posés dessus. */
export async function creerScene(
  mj: Compte,
  campagneId: string,
  personnages: readonly string[],
): Promise<Scene> {
  const scene = await appel<Scene>(mj, 'POST', `/v1/campaigns/${campagneId}/maps`, {
    name: 'Crypte',
    width: 2000,
    height: 1500,
    isDefault: true,
    visibleToPlayers: true,
  });
  await appel(mj, 'PATCH', `/v1/campaigns/${campagneId}/map-settings`, { partyMapId: scene.id });
  if (personnages.length)
    await appel(mj, 'POST', `/v1/campaigns/${campagneId}/maps/${scene.id}/travel`, {
      characterIds: personnages,
      pos: { x: 400, y: 400 },
    });
  return scene;
}

/** Couche de la carte : création en un envoi (`/batch`). */
export async function poser<T>(
  mj: Compte,
  campagneId: string,
  sceneId: string,
  couche: string,
  elements: unknown[],
) {
  return (
    await appel<{ created: T[] }>(
      mj,
      'POST',
      `/v1/campaigns/${campagneId}/maps/${sceneId}/${couche}/batch`,
      { create: elements },
    )
  ).created;
}

/** Suppression en fin de test (les comptes restent : identity n'a pas de suppression). */
export async function nettoyer(o: {
  mj?: Compte;
  campagnes?: string[];
  heros?: [Compte, string][];
}) {
  for (const id of o.campagnes ?? [])
    if (o.mj)
      await o.mj.request
        .delete(`/v1/campaigns/${id}`, { headers: { authorization: `Bearer ${o.mj.jeton}` } })
        .catch(() => undefined);
  for (const [compte, id] of o.heros ?? [])
    await compte.request
      .delete(`/v1/characters/${id}`, { headers: { authorization: `Bearer ${compte.jeton}` } })
      .catch(() => undefined);
}
