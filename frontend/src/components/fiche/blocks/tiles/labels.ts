/** Libellés des tuiles d'attributs pour le popover de disposition (abrégé, nom complet). */
import type { ContexteFiche } from '../../widgets';
import type { Tile } from './model';

export function attributeTiles(ctx: ContexteFiche, keys: readonly string[]): Tile[] {
  return keys.map((key) => {
    const a = ctx.fiche.entite.attributs.get(key);
    const nom = a?.nom ?? key;
    const court = a?.abrege;
    return court && court !== nom ? { key, label: nom, hint: court } : { key, label: nom };
  });
}
