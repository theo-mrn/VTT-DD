/**
 * Systèmes de jeu connus de dice : les systèmes de référence de
 * @vtt/systemes. dice n'en utilise que les dés à symboles (sortes, faces,
 * résultats) pour lancer un pool.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { SystemeCharge } from '@vtt/rules';
import { systeme } from '@vtt/systemes';

export interface Catalog {
  /** Système chargé ; `undefined` s'il est inconnu. */
  system(id: string): SystemeCharge | undefined;
}

/** Identifiants des systèmes de référence : fichiers `<id>.json` à côté de @vtt/systemes. */
export function referenceIds(): string[] {
  const entry = createRequire(import.meta.url).resolve('@vtt/systemes');
  const folder = join(dirname(entry), 'systemes');
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.presentation.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function referenceCatalog(ids: string[] = referenceIds()): Catalog {
  // Seuls ces identifiants sont lus : un identifiant reçu par l'API ne sert
  // jamais à construire un chemin de fichier sans être dans cette liste.
  const known = new Set(ids);
  const loaded = new Map<string, SystemeCharge>();
  return {
    system(id) {
      if (!known.has(id)) return undefined;
      let s = loaded.get(id);
      if (!s) {
        s = systeme(id);
        loaded.set(id, s);
      }
      return s;
    },
  };
}
