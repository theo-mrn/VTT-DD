import type { Db } from '../../db/client.js';

/**
 * Débloque les titres dont la condition de temps de jeu est atteinte.
 * Appelé par le module profil après chaque ajout de temps de jeu.
 * Renvoie les slugs nouvellement débloqués. (Contrat figé : implémenté par le module titres.)
 */
export async function debloquerTitresParTemps(
  _db: Db,
  _userId: string,
  _totalMinutes: number,
): Promise<string[]> {
  return [];
}
