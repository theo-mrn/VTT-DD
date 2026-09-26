/**
 * Systèmes de jeu connus de campaign : les systèmes de référence de
 * @vtt/systemes. campaign n'en lit que l'identité (id, version, nom) et la
 * déclaration d'initiative (action à lancer, clés de tri) : les règles
 * elles-mêmes sont exécutées par character.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { documentSysteme } from '@vtt/systemes';

export interface SystemeSalle {
  id: string;
  version: string;
  nom: string;
  /** Action d'initiative et clés de tri (ordre décroissant), si le système en déclare. */
  initiative?: { action: string; tri: string[] };
}

export interface Catalogue {
  systeme(id: string): SystemeSalle | undefined;
}

/** Identifiants des systèmes de référence : fichiers `<id>.json` à côté de @vtt/systemes. */
export function idsReference(): string[] {
  const entree = createRequire(import.meta.url).resolve('@vtt/systemes');
  const dossier = join(dirname(entree), 'systemes');
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.presentation.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function catalogueReference(ids: string[] = idsReference()): Catalogue {
  // Seuls ces identifiants sont lus : un identifiant reçu par l'API ne sert
  // jamais à construire un chemin de fichier sans être dans cette liste.
  const connus = new Set(ids);
  const lus = new Map<string, SystemeSalle>();
  return {
    systeme(id) {
      if (!connus.has(id)) return undefined;
      let s = lus.get(id);
      if (!s) {
        const doc = documentSysteme(id) as {
          id: string;
          version: string;
          nom: string;
          initiative?: { action: string; tri: string[] };
        };
        s = {
          id: doc.id,
          version: doc.version,
          nom: doc.nom,
          ...(doc.initiative
            ? { initiative: { action: doc.initiative.action, tri: [...doc.initiative.tri] } }
            : {}),
        };
        lus.set(id, s);
      }
      return s;
    },
  };
}
