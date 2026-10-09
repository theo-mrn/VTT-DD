/**
 * Lecture des sources d'un système : `systemes/<id>/` contient un
 * `systeme.yaml` (tout sauf le catalogue) et des fichiers optionnels qui
 * complètent ses listes :
 *
 *   catalogue/*.yaml   listes d'entrées   → catalogue
 *   arbres/*.yaml      listes d'arbres    → arbres
 *   tables/*.yaml      listes de tables   → tables
 *   textes/*.md        un texte par fichier (titre = premier titre « # »)
 *   presentation.yaml  présentation (skins, couleurs, fiche) : document séparé
 *   bestiaire/*.yaml   créatures de référence (docs/ressources.md) : document séparé
 *
 * `herite` (dans `systeme.yaml`) part d'un autre système et n'y déclare que ses différences :
 *
 *   herite:
 *     de: dnd-classic
 *     sansFichiers: [dnd-classic/catalogue/races.yaml]   # listes du parent écartées
 *     sans: { catalogue: [samourai] }                     # éléments du parent écartés
 *
 * Les listes à identifiant (`id`, `cle`, `entite`) se fusionnent élément par élément (un
 * attribut redéfini ne change que ce qu'il redéclare) ; une entrée du catalogue redéfinie
 * remplace celle du parent en entier ; le reste remplace la valeur du parent. Une correction
 * du parent vaut pour les deux systèmes.
 *
 * Découper en fichiers ne sert qu'à la lisibilité : le résultat est un seul
 * document, validé par `charger()` de @vtt/rules.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'yaml';

export const RACINE = new URL('../systemes/', import.meta.url).pathname;

function lireListe(fichier: string): unknown[] {
  const v = parse(readFileSync(fichier, 'utf8')) as unknown;
  if (!Array.isArray(v)) throw new Error(`${fichier} : une liste YAML est attendue`);
  return v;
}

function lireListes(dossier: string): unknown[] {
  if (!existsSync(dossier)) return [];
  return readdirSync(dossier)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .flatMap((f) => lireListe(join(dossier, f)));
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

type Objet = Record<string, unknown>;
const estObjet = (v: unknown): v is Objet =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Clé d'un élément de liste : `id`, `cle` (attribut) ou `entite` (création). */
function cleDe(v: unknown): string | undefined {
  if (!estObjet(v)) return undefined;
  for (const k of ['id', 'cle', 'entite']) if (typeof v[k] === 'string') return v[k];
  return undefined;
}

/** Fusion d'un système enfant sur son parent (voir `herite`). */
function fusionner(parent: unknown, enfant: unknown, chemin: string): unknown {
  if (Array.isArray(parent) && Array.isArray(enfant)) {
    if (!enfant.every((x) => cleDe(x) !== undefined) || !parent.every((x) => cleDe(x)))
      return enfant;
    const parCle = new Map(enfant.map((x) => [cleDe(x)!, x]));
    // Une entrée du catalogue redéfinie remplace celle du parent en entier
    const remplace = chemin === 'catalogue';
    const r = parent.map((x) => {
      const e = parCle.get(cleDe(x)!);
      if (e === undefined) return x;
      return remplace ? e : fusionner(x, e, `${chemin}/*`);
    });
    const connues = new Set(parent.map((x) => cleDe(x)));
    return [...r, ...enfant.filter((x) => !connues.has(cleDe(x)))];
  }
  if (estObjet(parent) && estObjet(enfant)) {
    const r: Objet = { ...parent };
    for (const [k, v] of Object.entries(enfant))
      r[k] = k in parent ? fusionner(parent[k], v, chemin ? `${chemin}/${k}` : k) : v;
    return r;
  }
  return enfant;
}

interface Heritage {
  de: string;
  sansFichiers?: string[];
  sans?: Record<string, string[]>;
}

/** Assemble le document brut d'un système (non validé). */
export function lireSysteme(id: string, racine = RACINE): Record<string, unknown> {
  const dossier = join(racine, id);
  const base = parse(readFileSync(join(dossier, 'systeme.yaml'), 'utf8')) as Objet;
  const concat = (cle: string, ajout: unknown[]) => {
    if (!ajout.length) return;
    base[cle] = [...((base[cle] as unknown[] | undefined) ?? []), ...ajout];
  };
  concat('catalogue', lireListes(join(dossier, 'catalogue')));
  concat('arbres', lireListes(join(dossier, 'arbres')));
  concat('tables', lireListes(join(dossier, 'tables')));
  concat('textes', lireTextes(join(dossier, 'textes')));

  const heritage = base.herite as Heritage | undefined;
  if (!heritage) return base;
  delete base.herite;
  const parent = lireSysteme(heritage.de, racine);
  // Listes et éléments du parent écartés avant la fusion
  const ecartes = new Set(
    (heritage.sansFichiers ?? []).flatMap((f) => lireListe(join(racine, f)).map(cleDe)),
  );
  for (const [cle, ids] of Object.entries(heritage.sans ?? {})) for (const x of ids) ecartes.add(x);
  for (const [cle, v] of Object.entries(parent))
    if (Array.isArray(v)) parent[cle] = v.filter((x) => !ecartes.has(cleDe(x)));
  return fusionner(parent, base, '') as Objet;
}

/** Présentation du système (`presentation.yaml`), si elle existe (non validée). */
export function lirePresentation(id: string, racine = RACINE): unknown {
  const f = join(racine, id, 'presentation.yaml');
  const propre = existsSync(f) ? (parse(readFileSync(f, 'utf8')) as unknown) : undefined;
  // Système hérité : la présentation du parent, complétée de la sienne
  const parent = parentDe(id, racine);
  const herite = parent === undefined ? undefined : lirePresentation(parent, racine);
  if (!estObjet(herite)) return propre;
  return { ...(fusionner(herite, propre ?? {}, '') as Objet), systeme: id };
}

/** Système dont `id` hérite (`herite.de`), s'il y en a un. */
export function parentDe(id: string, racine = RACINE): string | undefined {
  const base = parse(readFileSync(join(racine, id, 'systeme.yaml'), 'utf8')) as Objet;
  return (base.herite as Heritage | undefined)?.de;
}

/**
 * Dossier d'un fichier propre au système (police) : le sien, sinon celui du système dont il
 * hérite.
 */
export function dossierDe(id: string, fichier: string, racine = RACINE): string | undefined {
  for (let s: string | undefined = id; s !== undefined; s = parentDe(s, racine))
    if (existsSync(join(racine, s, fichier))) return join(racine, s);
  return undefined;
}

/**
 * Bestiaire de référence (`bestiaire/*.yaml`, listes de créatures), s'il y en a un (non
 * validé) : document séparé, chargé seulement par l'onglet Bestiaire des ressources.
 */
export function lireBestiaire(id: string, racine = RACINE): unknown {
  // Système hérité : les créatures du parent, puis les siennes
  const parent = parentDe(id, racine);
  const heritees = parent === undefined ? [] : lireListes(join(racine, parent, 'bestiaire'));
  const creatures = [...heritees, ...lireListes(join(racine, id, 'bestiaire'))];
  return creatures.length ? { format: 1, systeme: id, creatures } : undefined;
}

export function idsSystemes(racine = RACINE): string[] {
  return readdirSync(racine, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(racine, d.name, 'systeme.yaml')))
    .map((d) => d.name)
    .sort();
}
