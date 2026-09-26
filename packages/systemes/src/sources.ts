/**
 * Lecture des sources d'un système : `systemes/<id>/` contient un
 * `systeme.yaml` (tout sauf le catalogue) et des fichiers optionnels qui
 * complètent ses listes :
 *
 *   catalogue/*.yaml   listes d'entrées   → catalogue
 *   arbres/*.yaml      listes d'arbres    → arbres
 *   tables/*.yaml      listes de tables   → tables
 *   textes/*.md        un texte par fichier (titre = premier titre « # »)
 *
 * Découper en fichiers ne sert qu'à la lisibilité : le résultat est un seul
 * document, validé par `charger()` de @vtt/rules.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';

export const RACINE = new URL('../systemes/', import.meta.url).pathname;

function lireListes(dossier: string): unknown[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .flatMap((f) => {
      const v = parse(readFileSync(join(dossier, f), 'utf8')) as unknown;
      if (!Array.isArray(v)) throw new Error(`${join(dossier, f)} : une liste YAML est attendue`);
      return v;
    });
}

function lireTextes(dossier: string): { id: string; titre: string; contenu: string }[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const contenu = readFileSync(join(dossier, f), 'utf8');
      const titre = /^#\s+(.+)$/m.exec(contenu)?.[1]?.trim() ?? basename(f, '.md');
      return { id: basename(f, '.md'), titre, contenu };
    });
}

/** Assemble le document brut d'un système (non validé). */
export function lireSysteme(id: string, racine = RACINE): Record<string, unknown> {
  const dossier = join(racine, id);
  const base = parse(readFileSync(join(dossier, 'systeme.yaml'), 'utf8')) as Record<
    string,
    unknown
  >;
  const concat = (cle: string, ajout: unknown[]) => {
    if (!ajout.length) return;
    base[cle] = [...((base[cle] as unknown[] | undefined) ?? []), ...ajout];
  };
  concat('catalogue', lireListes(join(dossier, 'catalogue')));
  concat('arbres', lireListes(join(dossier, 'arbres')));
  concat('tables', lireListes(join(dossier, 'tables')));
  concat('textes', lireTextes(join(dossier, 'textes')));
  return base;
}

export function idsSystemes(racine = RACINE): string[] {
  return readdirSync(racine, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(racine, d.name, 'systeme.yaml')))
    .map((d) => d.name)
    .sort();
}
