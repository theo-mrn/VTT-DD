/**
 * Accès serveur à des URL fournies par le client (/api/proxy-image, /api/file-size).
 *
 * Sans contrôle, ces routes sont des SSRF : sur le cluster k3s elles atteindraient
 * les Services internes (gateway, Postgres…) et les métadonnées du nœud. On
 * n'accepte donc qu'une liste fermée d'hôtes publics d'images, en HTTPS sur le
 * port par défaut, et l'URL appelée est reconstruite à partir de l'hôte autorisé.
 */

/** Hôtes de next.config.ts (images.remotePatterns) + CDN Discord. */
const HOTES_AUTORISES = new Set([
    'assets.yner.fr',
    'www.dnd5eapi.co',
    'firebasestorage.googleapis.com', // tant que Firebase Storage existe
    'media.anakinworld.com',
    'cdn-www.swtor.com',
    'lumiere-a.akamaihd.net',
    'cdn.discordapp.com',
]);

/** Hôte exact du bucket R2 public (pas de joker *.r2.dev : tout le monde peut en créer un). */
function hoteR2(): string | null {
    const brute = process.env.R2_PUBLIC_URL;
    if (!brute) return null;
    try {
        return new URL(brute).hostname;
    } catch {
        return null;
    }
}

export function isAllowedRemoteHost(hostname: string): boolean {
    const hote = hostname.toLowerCase();
    return HOTES_AUTORISES.has(hote) || hote === hoteR2();
}

/**
 * Valide une URL fournie par le client et la reconstruit à partir de ses
 * composants autorisés. Renvoie null si elle doit être refusée.
 */
export function parseAllowedRemoteUrl(brute: string | null): URL | null {
    if (!brute) return null;

    let url: URL;
    try {
        url = new URL(brute);
    } catch {
        return null;
    }

    if (url.protocol !== 'https:') return null;
    // Port explicite (même 443) ou identifiants dans l'URL : refusés
    if (url.port !== '' || url.username !== '' || url.password !== '') return null;
    if (!isAllowedRemoteHost(url.hostname)) return null;

    return new URL(`https://${url.hostname.toLowerCase()}${url.pathname}${url.search}`);
}

/** Délai maximum d'un appel sortant. */
export const REMOTE_FETCH_TIMEOUT_MS = 10_000;

/**
 * fetch vers une URL déjà validée : sans suivre les redirections (une
 * redirection vers un hôte interne contournerait la liste blanche) et avec un
 * délai maximum.
 */
export function fetchAllowedRemote(url: URL, init: RequestInit = {}): Promise<Response> {
    return fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
    });
}
