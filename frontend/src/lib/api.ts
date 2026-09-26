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
export function errorMessage(
  err: unknown,
  fallback = 'Serveur injoignable, réessayez dans un instant.',
): string {
  if (err instanceof ApiError) return err.message || err.problem.title || fallback;
  return fallback;
}

/** En-tête exigé par les routes qui lisent le cookie de refresh (protection CSRF). */
export const CSRF_HEADER = { 'x-vtt-csrf': '1' } as const;

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  user: { id: string };
}

let accessToken: string | null = null;
let pendingRefresh: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function readError(res: Response): Promise<ApiError> {
  try {
    return new ApiError((await res.json()) as ProblemDetail);
  } catch {
    return new ApiError({ status: res.status, title: res.statusText });
  }
}

async function renewSession(): Promise<string | null> {
  const res = await fetch('/v1/auth/refresh', {
    method: 'POST',
    headers: CSRF_HEADER,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    accessToken = null;
    return null;
  }
  const body = (await res.json()) as TokenResponse;
  accessToken = body.accessToken;
  return accessToken;
}

/** Renouvelle la session ; un seul appel à la fois, y compris entre onglets. */
export function refreshSession(): Promise<string | null> {
  if (!pendingRefresh) {
    const locked: Promise<string | null> =
      typeof navigator !== 'undefined' && navigator.locks
        ? // Le verrou résout avec la valeur de la promesse du rappel (types DOM imprécis)
          (navigator.locks.request('vtt-refresh', renewSession) as unknown as Promise<
            string | null
          >)
        : renewSession();
    pendingRefresh = locked.finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = (token: string | null) =>
    fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

  let res = await send(accessToken);
  if (res.status === 401 && accessToken !== null) {
    res = await send(await refreshSession());
  }
  if (!res.ok) throw await readError(res);
  if (res.status === 204) return undefined as T;
  // Certaines réponses (202) n'ont pas de corps
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function login(email: string, password: string) {
  const r = await api<TokenResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  accessToken = r.accessToken;
  return r.user;
}

export async function register(email: string, password: string, name: string) {
  const r = await api<TokenResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
  accessToken = r.accessToken;
  return r.user;
}

export async function logout() {
  try {
    await fetch('/v1/auth/logout', {
      method: 'POST',
      headers: CSRF_HEADER,
      credentials: 'same-origin',
    });
  } finally {
    accessToken = null;
  }
}
