/**
 * Client HTTP de l'API : tous les appels passent par la gateway (/v1/*), qui route vers les services.
 *
 * - Jeton d'accès gardé en mémoire uniquement (jamais localStorage).
 * - Refresh token dans un cookie httpOnly posé par identity : invisible ici.
 * - Sur un 401, un seul renouvellement à la fois, partagé entre les onglets
 *   (Web Locks) : deux renouvellements parallèles seraient pris pour un vol.
 */

export interface ProblemDetail {
  status: number;
  title: string;
  detail?: string;
  code?: string;
}

export class ApiError extends Error {
  constructor(readonly problem: ProblemDetail) {
    super(problem.detail ?? problem.title);
  }

  get status() {
    return this.problem.status;
  }
}

/** Message lisible pour l'utilisateur : le `detail` du problème, sinon un message générique. */
export function messageErreur(
  err: unknown,
  parDefaut = 'Serveur injoignable, réessayez dans un instant.',
): string {
  if (err instanceof ApiError) return err.message || err.problem.title || parDefaut;
  return parDefaut;
}

/** En-tête exigé par les routes qui lisent le cookie de refresh (protection CSRF). */
export const ENTETE_CSRF = { 'x-vtt-csrf': '1' } as const;

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  user: { id: string };
}

let jetonAcces: string | null = null;
let renouvellementEnCours: Promise<string | null> | null = null;

export function setAccessToken(jeton: string | null) {
  jetonAcces = jeton;
}

async function lireErreur(res: Response): Promise<ApiError> {
  try {
    return new ApiError((await res.json()) as ProblemDetail);
  } catch {
    return new ApiError({ status: res.status, title: res.statusText });
  }
}

async function renouveler(): Promise<string | null> {
  const res = await fetch('/v1/auth/refresh', {
    method: 'POST',
    headers: ENTETE_CSRF,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    jetonAcces = null;
    return null;
  }
  const corps = (await res.json()) as TokenResponse;
  jetonAcces = corps.accessToken;
  return jetonAcces;
}

/** Renouvelle la session ; un seul appel à la fois, y compris entre onglets. */
export function refreshSession(): Promise<string | null> {
  if (!renouvellementEnCours) {
    const verrouille: Promise<string | null> =
      typeof navigator !== 'undefined' && navigator.locks
        ? // Le verrou résout avec la valeur de la promesse du rappel (types DOM imprécis)
          (navigator.locks.request('vtt-refresh', renouveler) as unknown as Promise<string | null>)
        : renouveler();
    renouvellementEnCours = verrouille.finally(() => {
      renouvellementEnCours = null;
    });
  }
  return renouvellementEnCours;
}

export async function api<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const appel = (jeton: string | null) =>
    fetch(chemin, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
        ...init.headers,
      },
    });

  let res = await appel(jetonAcces);
  if (res.status === 401 && jetonAcces !== null) {
    res = await appel(await refreshSession());
  }
  if (!res.ok) throw await lireErreur(res);
  if (res.status === 204) return undefined as T;
  // Certaines réponses (202) n'ont pas de corps
  const texte = await res.text();
  return (texte ? JSON.parse(texte) : undefined) as T;
}

export async function connexion(email: string, password: string) {
  const r = await api<TokenResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  jetonAcces = r.accessToken;
  return r.user;
}

export async function inscription(email: string, password: string, name: string) {
  const r = await api<TokenResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
  jetonAcces = r.accessToken;
  return r.user;
}

export async function deconnexion() {
  try {
    await fetch('/v1/auth/logout', {
      method: 'POST',
      headers: ENTETE_CSRF,
      credentials: 'same-origin',
    });
  } finally {
    jetonAcces = null;
  }
}
