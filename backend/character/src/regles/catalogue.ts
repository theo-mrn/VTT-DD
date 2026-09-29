/**
 * Catalogue des systèmes de jeu : pour l'instant, les systèmes de référence
 * de @vtt/systemes (assemblés et validés au build de ce paquet, un fichier
 * `dist/systemes/<id>.json` chacun). Les systèmes créés par les MJ arriveront
 * plus tard, sur la même forme.
 *
 * Chaque système n'est lu et chargé (compilation des formules) qu'une fois,
 * puis gardé en mémoire : le calcul d'une fiche ne relit jamais le disque.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Bestiary, type SystemeCharge, type SystemeSaisi } from '@vtt/rules';
import { documentPresentation, documentSysteme, systeme } from '@vtt/systemes';

export interface ResumeSysteme {
  id: string;
  version: string;
  nom: string;
  description: string | null;
}

export interface Catalogue {
  /** Systèmes disponibles, triés par identifiant. */
  lister(): ResumeSysteme[];
  /** Vrai si l'identifiant désigne un système connu. */
  existe(id: string): boolean;
  /** Documents bruts du système, `undefined` s'il est inconnu. */
  documents(id: string): { systeme: SystemeSaisi; presentation: unknown } | undefined;
  /** Système chargé, prêt à calculer ; `undefined` s'il est inconnu. */
  charge(id: string): SystemeCharge | undefined;
  /**
   * Bestiaire de référence du système (`dist/systemes/bestiaires/<id>.json` de
   * @vtt/systemes, validé au build) ; `undefined` s'il n'en a pas.
   */
  bestiaire?(id: string): Bestiary | undefined;
}

/** Dossier des systèmes assemblés de @vtt/systemes (dist/systemes/). */
const dossierSystemes = () =>
  join(dirname(createRequire(import.meta.url).resolve('@vtt/systemes')), 'systemes');

/** Identifiants des systèmes de référence : fichiers `<id>.json` à côté de @vtt/systemes. */
export function idsReference(): string[] {
  // Point d'entrée du paquet (dist/index.js) : les systèmes sont dans dist/systemes/
  return readdirSync(dossierSystemes())
    .filter((f) => f.endsWith('.json') && !f.endsWith('.presentation.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

/** Catalogue des systèmes de référence, avec cache en mémoire. */
export function catalogueReference(ids: string[] = idsReference()): Catalogue {
  // Seuls ces identifiants sont lus : un identifiant reçu par l'API ne sert
  // jamais à construire un chemin de fichier sans être dans cette liste.
  const connus = new Set(ids);
  const documents = new Map<string, { systeme: SystemeSaisi; presentation: unknown }>();
  const charges = new Map<string, SystemeCharge>();
  const bestiaires = new Map<string, Bestiary | undefined>();

  const lireDocuments = (id: string) => {
    if (!connus.has(id)) return undefined;
    let d = documents.get(id);
    if (!d) {
      d = {
        systeme: documentSysteme(id) as SystemeSaisi,
        presentation: documentPresentation(id) ?? null,
      };
      documents.set(id, d);
    }
    return d;
  };

  return {
    lister: () =>
      [...connus].sort().map((id) => {
        const s = lireDocuments(id)!.systeme;
        return { id: s.id, version: s.version, nom: s.nom, description: s.description ?? null };
      }),
    existe: (id) => connus.has(id),
    documents: lireDocuments,
    charge(id) {
      if (!connus.has(id)) return undefined;
      let s = charges.get(id);
      if (!s) {
        s = systeme(id);
        charges.set(id, s);
      }
      return s;
    },
    bestiaire(id) {
      if (!connus.has(id)) return undefined;
      if (!bestiaires.has(id)) {
        const fichier = join(dossierSystemes(), 'bestiaires', `${id}.json`);
        bestiaires.set(
          id,
          existsSync(fichier)
            ? Bestiary.parse(JSON.parse(readFileSync(fichier, 'utf8')))
            : undefined,
        );
      }
      return bestiaires.get(id);
    },
  };
}
