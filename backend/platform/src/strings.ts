/**
 * Retire les « / » de fin d'une adresse. Sans expression régulière : `/\/+$/` repart de chaque
 * barre d'une longue suite (temps quadratique), cette boucle reste linéaire.
 */
export function withoutTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end--;
  return s.slice(0, end);
}
