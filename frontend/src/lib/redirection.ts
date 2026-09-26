/**
 * Chemin de retour après connexion : uniquement un chemin interne au site
 * (« /… » mais pas « //… » ni « /\… »), pour éviter toute redirection ouverte.
 */
export function cheminInterne(valeur: string | null | undefined, parDefaut = '/profil'): string {
  if (!valeur || !valeur.startsWith('/') || valeur.startsWith('//') || valeur.startsWith('/\\'))
    return parDefaut;
  return valeur;
}

export function urlConnexion(retour: string) {
  return `/connexion?${new URLSearchParams({ redirect: retour })}`;
}
