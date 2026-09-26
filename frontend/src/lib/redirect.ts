/**
 * Chemin de retour après connexion : uniquement un chemin interne au site
 * (« /… » mais pas « //… » ni « /\… »), pour éviter toute redirection ouverte.
 */
export function internalPath(value: string | null | undefined, fallback = '/profile'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return fallback;
  return value;
}

export function loginUrl(returnTo: string) {
  return `/login?${new URLSearchParams({ redirect: returnTo })}`;
}
