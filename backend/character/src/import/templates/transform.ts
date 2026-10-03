/**
 * Conversion des modèles du MJ de l'ancienne app, fonctions pures (aucune
 * base, aucun réseau) :
 *  - `npc_templates/{salle}/categories/{id}` : { name, color, createdAt } ;
 *  - `npc_templates/{salle}/templates/{id}` : mêmes champs qu'un personnage de
 *    salle (Nomperso, niveau, stats du système, skillRanks) plus categoryId,
 *    imageURL (portrait), imageURL2 (jeton) et Actions [{ Nom, Description, Toucher }] ;
 *  - `object_templates/{salle}/templates/{id}` : { name, imageUrl, category?, createdAt }.
 *
 * Les stats passent par `transformerPersonnage`, la migration des
 * personnages, dans le système de la campagne. Seul ajout propre aux modèles :
 * leurs valeurs dérivées (Défense, Contact, seuils…) ont été saisies par le MJ
 * et font foi. Quand le nouveau système les recalcule autrement, l'écart est
 * gardé par un bonus libre « Valeurs du modèle » (voir `keepTemplateValues`).
 *
 * Identifiants stables : UUIDv5 du chemin Firestore, si bien qu'un second
 * import retrouve les mêmes lignes et les ignore.
 */
import { createHash } from 'node:crypto';
import type { EtatEntite, SystemeCharge } from '@vtt/rules';
import { keepDerivedValues } from '../../regles/npc.js';
import * as sw from '../correspondances/star-wars-eote.js';
import { dateIso, nombre, texte, type DocFirestore, type PersonnageLegacy } from '../legacy.js';
import {
  detecterSysteme,
  transformerPersonnage,
  type OptionsTransformation,
} from '../transformer.js';
import type { NpcTemplateAction } from '../../db/schema.js';

/** Espace de noms des UUIDv5 des modèles importés (constante : ne jamais la changer). */
export const TEMPLATES_NAMESPACE = '5f0c2d7e-8a41-4b6f-9e13-c2a7d4b8e901';

/** UUID version 5 (RFC 9562) : SHA-1 de l'espace de noms et du nom. */
export function uuidv5(name: string, namespace: string = TEMPLATES_NAMESPACE): string {
  const ns = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const bytes = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(name, 'utf8')]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Identifiant d'une ligne importée : UUIDv5 de son chemin legacy. */
export const importedId = (path: string) => uuidv5(`firebase:${path}`);

export type LegacyKind = 'npc_category' | 'npc_template' | 'object_template';

const PATHS: [RegExp, LegacyKind][] = [
  [/^npc_templates\/([^/]+)\/categories\/[^/]+$/, 'npc_category'],
  [/^npc_templates\/([^/]+)\/templates\/[^/]+$/, 'npc_template'],
  [/^object_templates\/([^/]+)\/templates\/[^/]+$/, 'object_template'],
];

/** Sorte de document et code de sa salle ; `undefined` pour tout autre chemin. */
export function classify(path: string): { kind: LegacyKind; roomCode: string } | undefined {
  for (const [re, kind] of PATHS) {
    const m = re.exec(path);
    if (m) return { kind, roomCode: m[1]! };
  }
  return undefined;
}

// ─── Formes legacy ───────────────────────────────────────────────────────────

export interface LegacyCategory {
  name?: unknown;
  color?: unknown;
  createdAt?: unknown;
}

export interface LegacyNpcTemplate extends PersonnageLegacy {
  categoryId?: unknown;
  imageURL2?: unknown;
  Actions?: unknown;
}

export interface LegacyObjectTemplate {
  name?: unknown;
  imageUrl?: unknown;
  category?: unknown;
  createdAt?: unknown;
}

// ─── Lignes migrées ──────────────────────────────────────────────────────────

export interface MigratedCategory {
  id: string;
  legacyId: string;
  name: string;
  color: string | null;
  createdAt: Date | null;
  warnings: string[];
}

export interface MigratedNpcTemplate {
  id: string;
  legacyId: string;
  categoryId: string | null;
  name: string;
  /** legacy imageURL : image de base (portrait). */
  imageUrl: string | null;
  /** legacy imageURL2 : jeton affiché sur la carte. */
  tokenUrl: string | null;
  etat: EtatEntite;
  actions: NpcTemplateAction[];
  warnings: string[];
}

export interface MigratedObjectTemplate {
  id: string;
  legacyId: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
  createdAt: Date | null;
  warnings: string[];
}

/** Nom limité à 100 caractères (contrainte des tables), avec un avertissement s'il est coupé. */
function name(value: unknown, fallback: string, warn: (w: string) => void): string {
  const n = texte(value) ?? fallback;
  if (n.length <= 100) return n;
  warn(`Nom de ${n.length} caractères coupé à 100`);
  return n.slice(0, 100);
}

const date = (v: unknown) => {
  const d = dateIso(v);
  return d ? new Date(d) : null;
};

export function transformCategory(doc: DocFirestore<LegacyCategory>): MigratedCategory {
  const warnings: string[] = [];
  const d = doc.data ?? {};
  const color = texte(d.color);
  const valid = color && /^#[0-9A-Fa-f]{3,8}$/.test(color) ? color : null;
  if (color && !valid) warnings.push(`Couleur « ${color} » illisible, retirée`);
  return {
    id: importedId(doc.path),
    legacyId: doc.path,
    name: name(d.name, 'Sans nom', (w) => warnings.push(w)),
    color: valid,
    createdAt: date(d.createdAt),
    warnings,
  };
}

export function transformObjectTemplate(
  doc: DocFirestore<LegacyObjectTemplate>,
): MigratedObjectTemplate {
  const warnings: string[] = [];
  const d = doc.data ?? {};
  const category = texte(d.category);
  return {
    id: importedId(doc.path),
    legacyId: doc.path,
    name: name(d.name, 'Sans nom', (w) => warnings.push(w)),
    imageUrl: texte(d.imageUrl) ?? null,
    category: category ? category.slice(0, 50) : null,
    createdAt: date(d.createdAt),
    warnings,
  };
}

/** Actions legacy [{ Nom, Description, Toucher }] ; les entrées illisibles sont écartées. */
export function transformActions(value: unknown, warn: (w: string) => void): NpcTemplateAction[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warn('Actions illisibles, ignorées');
    return [];
  }
  const actions: NpcTemplateAction[] = [];
  for (const a of value.slice(0, 100)) {
    if (!a || typeof a !== 'object') continue;
    const x = a as { Nom?: unknown; Description?: unknown; Toucher?: unknown };
    actions.push({
      name: (texte(x.Nom) ?? '').slice(0, 200),
      description: (typeof x.Description === 'string' ? x.Description : '').slice(0, 10_000),
      toHit: nombre(x.Toucher) ?? 0,
    });
  }
  if (value.length > 100) warn(`${value.length} actions, 100 gardées`);
  return actions;
}

/**
 * Attributs dérivés du système dont l'ancienne fiche gardait la valeur sous un
 * autre nom (seuils Star Wars). Les autres se retrouvent sous la même clé.
 */
const LEGACY_KEYS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'star-wars-eote': sw.SEUILS,
};

/**
 * Valeurs dérivées saisies par le MJ sur le modèle (Défense, Contact, seuils…)
 * que le nouveau système recalcule autrement : l'écart devient un bonus libre
 * « Valeurs du modèle », pour que la fiche affiche les mêmes valeurs. Générique :
 * parcourt les attributs dérivés du système, aucune clé n'est connue ici.
 * Renvoie aussi les attributs ainsi retrouvés.
 */
export function keepTemplateValues(
  systeme: SystemeCharge,
  etat: EtatEntite,
  legacy: Record<string, unknown>,
  warn: (w: string) => void,
): { etat: EtatEntite; kept: string[] } {
  const renamed = LEGACY_KEYS[systeme.source.id] ?? {};
  const legacyKeyOf = new Map(Object.entries(renamed).map(([from, to]) => [to, from]));
  return keepDerivedValues(
    systeme,
    etat,
    (cle) => nombre(legacy[legacyKeyOf.get(cle) ?? cle]),
    warn,
  );
}

/** Avertissements de la migration des personnages sans objet pour un modèle (jamais de race ni de profil). */
const NOT_FOR_TEMPLATES = /^Aucun(e)? (race|profil|espèce|carrière)$/;

export interface NpcTemplateOptions {
  /** Système de la campagne. */
  systemId: string;
  systemes: OptionsTransformation['systemes'];
  /** Stats du système de la salle (`recoversToZero` des jauges). */
  statsSalle?: OptionsTransformation['statsSalle'];
  /** Chemins des catégories de la même salle présentes dans l'export. */
  categories: ReadonlySet<string>;
}

export function transformNpcTemplate(
  doc: DocFirestore<LegacyNpcTemplate>,
  o: NpcTemplateOptions,
): MigratedNpcTemplate {
  const p = doc.data ?? {};
  const migrated = transformerPersonnage(doc, {
    systemeId: o.systemId,
    systemes: o.systemes,
    ...(o.statsSalle ? { statsSalle: o.statsSalle } : {}),
  });
  const warnings = migrated.avertissements.filter((w) => !NOT_FOR_TEMPLATES.test(w));
  const warn = (w: string) => {
    if (!warnings.includes(w)) warnings.push(w);
  };

  const detected = detecterSysteme(p);
  if (detected.certain && detected.id !== o.systemId)
    warn(`Champs du système ${detected.id} dans une campagne ${o.systemId}`);

  const systeme = o.systemes[o.systemId]!;
  const { etat, kept } = keepTemplateValues(systeme, migrated.etat, p, warn);
  // Écarts signalés par la migration des personnages, désormais gardés par le bonus
  for (const cle of kept) {
    const nom = systeme.entites.get(etat.type)!.attributs.get(cle)!.nom;
    const i = warnings.findIndex((w) => w.startsWith(`${nom} : `));
    if (i >= 0) warnings.splice(i, 1);
  }

  const categoryLegacyId = texte(p.categoryId);
  let categoryId: string | null = null;
  if (categoryLegacyId) {
    const path = doc.path.replace(/\/templates\/[^/]+$/, `/categories/${categoryLegacyId}`);
    if (o.categories.has(path)) categoryId = importedId(path);
    else warn('Catégorie supprimée dans l’ancienne app : modèle rangé sans catégorie');
  }

  return {
    id: importedId(doc.path),
    legacyId: doc.path,
    categoryId,
    name: name(p.Nomperso, 'Sans nom', warn),
    imageUrl: texte(p.imageURL) ?? null,
    tokenUrl: texte(p.imageURL2) ?? null,
    etat,
    actions: transformActions(p.Actions, warn),
    warnings,
  };
}
