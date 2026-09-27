/**
 * Systèmes de jeu connus de campaign : les systèmes de référence de
 * @vtt/systemes. campaign n'en lit que l'identité (id, version, nom), la
 * déclaration d'initiative (action à lancer, clés de tri) et les attributs
 * jetables (réglages du lanceur) : les règles elles-mêmes sont exécutées par
 * character.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { documentSysteme } from '@vtt/systemes';

export interface CampaignSystem {
  id: string;
  version: string;
  name: string;
  /** Action d'initiative et clés de tri (ordre décroissant), si le système en déclare. */
  initiative?: { action: string; sortKeys: string[] };
  /**
   * Attributs qui servent aux jets libres (déclarent `jet`), tous types d'entité confondus :
   * les seuls que le MJ peut retirer du lanceur de dés.
   */
  rollAttributes?: string[];
}

export interface Catalog {
  system(id: string): CampaignSystem | undefined;
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
  const loaded = new Map<string, CampaignSystem>();
  return {
    system(id) {
      if (!known.has(id)) return undefined;
      let s = loaded.get(id);
      if (!s) {
        // Document du paquet @vtt/systemes (champs en français)
        const doc = documentSysteme(id) as {
          id: string;
          version: string;
          nom: string;
          initiative?: { action: string; tri: string[] };
          entites?: { attributs?: { cle: string; jet?: unknown }[] }[];
        };
        const rollAttributes = new Set(
          (doc.entites ?? []).flatMap((e) =>
            (e.attributs ?? []).filter((a) => a.jet).map((a) => a.cle),
          ),
        );
        s = {
          id: doc.id,
          version: doc.version,
          name: doc.nom,
          rollAttributes: [...rollAttributes],
          ...(doc.initiative
            ? { initiative: { action: doc.initiative.action, sortKeys: [...doc.initiative.tri] } }
            : {}),
        };
        loaded.set(id, s);
      }
      return s;
    },
  };
}
