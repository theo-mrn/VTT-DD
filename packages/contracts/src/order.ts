/**
 * Ordre brut de deux chaînes (unités UTF-16), le même partout et indépendant de la langue :
 * clés, identifiants, listes triées pour comparer ou dédoublonner. Pour un tri affiché à
 * l'utilisateur, `localeCompare`.
 */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
