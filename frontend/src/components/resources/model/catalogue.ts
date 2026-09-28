/**
 * Catalogue du système lu comme une référence (onglets Capacités et Marché des ressources),
 * sans React et sans clé de jeu : sections déclarées par la présentation (`references`),
 * champs lisibles, effets en clair, entrées liées (champs, rangs accordés, marques, choix).
 * Tout se calcule sur une fiche vierge du type d'entité de la sorte : les libellés
 * d'attributs, de dés et de conditions sont ceux du système.
 */
import {
  apercuFormule,
  calculer,
  chemins,
  champsActifs,
  formuleChamp,
  formuleLisible,
  variablesObjet,
  type Champ,
  type Effet,
  type EffetListe,
  type Entree,
  type Fiche,
  type Presentation,
  type SectionCapacites,
  type Sorte,
  type SystemeCharge,
} from '@vtt/rules';
import { etatInitial } from '@/lib/creation';
import { libelleEffet, precisionEffet } from '@/components/fiche/blocks/effects/model';
import { texteCondition } from '@/components/fiche/blocks/effects/condition-text';
import { rollEffectText } from '@/components/fiche/blocks/skills/model';
import { normaliser } from '@/components/fiche/blocks/inventory/model';

export { normaliser };

// ─── Fiches de référence ─────────────────────────────────────────────────────

const fiches = new WeakMap<SystemeCharge, Map<string, Fiche>>();

/**
 * Fiche vierge d'un type d'entité : contexte des libellés (attributs, dés, conditions) et
 * des formules lisibles. Une par système (réglé avec ses options) et par type.
 */
export function referenceSheet(systeme: SystemeCharge, entite: string): Fiche {
  let parType = fiches.get(systeme);
  if (!parType) fiches.set(systeme, (parType = new Map()));
  let f = parType.get(entite);
  if (!f) parType.set(entite, (f = calculer(systeme, etatInitial(systeme, entite))));
  return f;
}

/** Fiche de référence d'une entrée : celle du premier type d'entité qui possède sa sorte. */
export function sheetFor(systeme: SystemeCharge, entry: Entree): Fiche | null {
  const entite = systeme.sortes.get(entry.sorte)?.pour[0];
  return entite && systeme.entites.has(entite) ? referenceSheet(systeme, entite) : null;
}

// ─── Sections ────────────────────────────────────────────────────────────────

export interface EntryGroup {
  /** Nom du groupe ; null : sans groupe (section non groupée, ou valeur absente). */
  name: string | null;
  entries: Entree[];
}

/** Entrées d'une section : sa sorte, son étiquette, sans les entrées libres (hors catalogue). */
export function sectionEntries(systeme: SystemeCharge, section: SectionCapacites): Entree[] {
  return [...systeme.entrees.values()].filter(
    (e) =>
      e.sorte === section.sorte &&
      !e.libre &&
      (section.etiquette === undefined || e.etiquettes.includes(section.etiquette)),
  );
}

/** Identifiant lisible faute de mieux : `pirate-informatique` → « Pirate informatique ». */
export function humanize(id: string): string {
  const t = id.replace(/[-_]+/g, ' ').trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : id;
}

/** Nom lisible d'une valeur de champ (option d'un choix, attribut, entrée). */
export function valueName(systeme: SystemeCharge, champ: Champ, v: string): string {
  switch (champ.type) {
    case 'choix':
      return champ.options.find((o) => o.valeur === v)?.nom ?? v;
    case 'entree':
      return systeme.entrees.get(v)?.nom ?? v;
    case 'attribut':
      return systeme.entites.get(champ.entite)?.attributs.get(v)?.nom ?? v;
    default:
      return v;
  }
}

/** Groupe d'une entrée dans sa section (voir `groupePar`). */
export function groupOf(
  systeme: SystemeCharge,
  section: SectionCapacites,
  entry: Entree,
): string | null {
  const g = section.groupePar;
  if (!g) return null;
  if (g === 'etiquette') {
    const tag = entry.etiquettes.find((t) => t !== section.etiquette);
    return tag ? (systeme.entrees.get(tag)?.nom ?? humanize(tag)) : null;
  }
  const champ = systeme.sortes.get(entry.sorte)?.champs.find((c) => c.id === g.champ);
  const v = entry.champs[g.champ];
  if (!champ || v === undefined || Array.isArray(v) || v === '') return null;
  return valueName(systeme, champ, String(v));
}

/** Entrées rangées par groupe (ordre alphabétique des groupes, « sans groupe » en dernier). */
export function groupEntries(
  systeme: SystemeCharge,
  section: SectionCapacites,
  entries: readonly Entree[],
): EntryGroup[] {
  const parNom = new Map<string | null, Entree[]>();
  for (const e of entries) {
    const g = groupOf(systeme, section, e);
    parNom.set(g, [...(parNom.get(g) ?? []), e]);
  }
  return [...parNom.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, 'fr')))
    .map(([name, list]) => ({
      name,
      entries: [...list].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    }));
}

// ─── Champs lisibles ─────────────────────────────────────────────────────────

/** Champs d'identité d'un exemplaire (nom et description propres) : jamais affichés ici. */
function identityField(sorte: Sorte, champ: Champ): boolean {
  return champ.id === sorte.nomExemplaire || champ.id === sorte.descriptionExemplaire;
}

/**
 * Valeur lisible d'un champ : formule réécrite (`1d8`, `vigueur+1`), nom d'une option, d'un
 * attribut ou d'une entrée, « oui » pour un booléen vrai. `withDefault` : le défaut de la
 * sorte quand l'entrée ne renseigne pas le champ (colonnes du marché). null : rien à montrer.
 */
export function fieldText(
  fiche: Fiche,
  entry: Entree,
  champ: Champ,
  withDefault = false,
): string | null {
  const { systeme } = fiche;
  const sorte = systeme.sortes.get(entry.sorte);
  if (!sorte) return null;
  if (champ.type === 'formule') {
    const f = formuleChamp(systeme, entry, champ, undefined, fiche.entite.type.id);
    if (!f) return null;
    const vars = variablesObjet(entry, sorte, { rang: 0, actif: true, quantite: 1 });
    return formuleLisible(systeme, fiche.entite.type.id, f.noeud, vars);
  }
  const brut = entry.champs[champ.id];
  const v =
    brut !== undefined
      ? brut
      : withDefault && 'defaut' in champ && champ.defaut !== undefined
        ? champ.defaut
        : undefined;
  if (v === undefined || v === '') return null;
  if (Array.isArray(v)) return v.map((id) => systeme.entrees.get(id)?.nom ?? id).join(', ') || null;
  if (typeof v === 'boolean') return v ? 'oui' : null;
  if (typeof v === 'number') return v.toLocaleString('fr-FR');
  return valueName(systeme, champ, v);
}

export interface FieldLine {
  id: string;
  name: string;
  value: string;
}

/**
 * Champs d'une entrée à montrer dans son détail : ceux qu'elle renseigne (et ses formules),
 * sans ses références (montrées en entrées liées), ni les champs d'une option éteinte.
 */
export function fieldLines(fiche: Fiche, entry: Entree): FieldLine[] {
  const sorte = fiche.systeme.sortes.get(entry.sorte);
  if (!sorte) return [];
  const r: FieldLine[] = [];
  for (const c of champsActifs(sorte, fiche.options)) {
    if (c.type === 'entree' || c.type === 'entrees' || identityField(sorte, c)) continue;
    const propre = entry.champs[c.id] !== undefined;
    if (c.type !== 'formule' && !propre) continue;
    const value = fieldText(fiche, entry, c);
    if (value === null) continue;
    // Formule par défaut de la sorte : montrée seulement si elle dépend de l'entrée (dés de
    // l'arme lus dans ses champs), pas quand elle vaut la même chose partout
    if (c.type === 'formule' && !propre && value === String(c.defaut ?? '').replace(/\s+/g, ''))
      continue;
    r.push({ id: c.id, name: c.nom, value });
  }
  return r;
}

// ─── Effets en clair ─────────────────────────────────────────────────────────

export interface EffectLine {
  label: string;
  detail: string | null;
}

/** Formule d'un effet du catalogue, réécrite lisiblement (`mod(FOR)`), ou son texte. */
function readableValue(fiche: Fiche, entry: Entree, index: number, texte: string): string {
  if (Number.isFinite(Number(texte))) return texte;
  const f = fiche.systeme.formules.get(chemins.effet(entry.id, index, 'valeur'));
  return f ? formuleLisible(fiche.systeme, fiche.entite.type.id, f.noeud) : texte;
}

/** Les rangs accordés et les marques sont des liens (voir `linkGroups`), pas des bonus. */
function isLink(e: Effet): boolean {
  return e.sur === 'rang' || e.sur === 'marque';
}

/**
 * Effets de l'entrée tels que le catalogue les décrit (« FOR +2 », « PV max + mod(CON) »,
 * « +1 dé de Fortune au jet de Pilotage »), avec leurs conditions en clair.
 */
export function effectLines(fiche: Fiche, entry: Entree): EffectLine[] {
  return entry.effets.flatMap((effet, i): EffectLine[] => {
    if (isLink(effet)) return [];
    const lisible =
      effet.sur === 'attribut' || effet.sur === 'degats'
        ? { ...effet, valeur: readableValue(fiche, entry, i, effet.valeur) }
        : effet;
    const label =
      (effet.sur === 'jet' ? rollEffectText(fiche, effet, 1) : null) ??
      libelleEffet(fiche, { effet: lisible, valeur: undefined });
    // Précision : conditions en clair, famille non cumulable, description (hors jets)
    const detail = precisionEffet(fiche, { effet } as EffetListe);
    return [{ label, detail: detail === label ? null : detail }];
  });
}

// ─── Entrées liées ───────────────────────────────────────────────────────────

export interface Link {
  entry: Entree;
  /** Précision (« Rang 3 », condition en clair). */
  note: string | null;
}

export interface LinkGroup {
  key: string;
  title: string;
  /** Phrase sous le titre (« 4 au choix »). */
  caption: string | null;
  links: Link[];
}

function seuilRang(fiche: Fiche, condition: string | undefined): string | null {
  if (!condition) return null;
  const seuil = /^\s*rang\s*>=\s*(\d+)\s*$/.exec(condition)?.[1];
  return seuil ? `Rang ${seuil}` : texteCondition(fiche, condition);
}

/**
 * Entrées liées à une entrée, par provenance : ses champs de référence (voies d'un profil,
 * carrière d'origine), les rangs qu'elle accorde (capacités d'une voie, au rang voulu), les
 * marques qu'elle pose (compétences de carrière) et les choix qu'elle ouvre.
 */
export function linkGroups(
  fiche: Fiche,
  entry: Entree,
  presentation: Presentation | null,
): LinkGroup[] {
  const { systeme } = fiche;
  const sorte = systeme.sortes.get(entry.sorte);
  const groups: LinkGroup[] = [];
  const get = (id: string) => systeme.entrees.get(id);

  for (const c of sorte ? champsActifs(sorte, fiche.options) : []) {
    if (c.type !== 'entree' && c.type !== 'entrees') continue;
    const v = entry.champs[c.id];
    const ids = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
    const links = ids.flatMap((id) => {
      const e = get(id);
      return e ? [{ entry: e, note: null }] : [];
    });
    if (links.length) groups.push({ key: `champ:${c.id}`, title: c.nom, caption: null, links });
  }

  const accordes = entry.effets.flatMap((e) => {
    if (e.sur !== 'rang') return [];
    const cible = get(e.entree);
    return cible ? [{ entry: cible, note: seuilRang(fiche, e.condition) }] : [];
  });
  if (accordes.length)
    groups.push({ key: 'rangs', title: 'Accorde', caption: null, links: accordes });

  entry.effets.forEach((e, i) => {
    if (e.sur !== 'marque') return;
    const nom = presentation?.marques[e.marque]?.nom ?? humanize(e.marque);
    const links = e.entrees.flatMap((id) => {
      const x = get(id);
      return x ? [{ entry: x, note: null }] : [];
    });
    if (links.length)
      groups.push({ key: `marque:${i}`, title: `Marque « ${nom} »`, caption: null, links });
  });

  for (const ch of entry.choix) {
    // Nombre pour un personnage de base (4 compétences, même si une espèce en ajoute)
    const f = systeme.formules.get(chemins.choixNombre(entry.id, ch.id));
    const nombre = f ? apercuFormule(fiche, f) : String(ch.parmi.entrees?.length ?? '');
    const parmi = ch.parmi.entrees?.flatMap((id) => {
      const x = get(id);
      return x ? [{ entry: x, note: null }] : [];
    });
    const sorteChoisie = systeme.sortes.get(ch.parmi.sorte);
    groups.push({
      key: `choix:${ch.id}`,
      title: ch.nom,
      caption: parmi?.length
        ? `${nombre} au choix parmi :`
        : `${nombre} au choix : ${(sorteChoisie?.nomPluriel ?? sorteChoisie?.nom ?? ch.parmi.sorte).toLowerCase()}`,
      links: parmi ?? [],
    });
  }
  return groups;
}

/** L'entrée accorde des rangs (une voie) : dépliée avec ce qu'elle accorde. */
export function grantsRanks(entry: Entree): boolean {
  return entry.effets.some((e) => e.sur === 'rang');
}

// ─── Recherche ───────────────────────────────────────────────────────────────

/** Entrées atteintes depuis une entrée (champs de référence et rangs accordés), sur 2 niveaux. */
function descendants(systeme: SystemeCharge, entry: Entree, depth = 2): Entree[] {
  const r: Entree[] = [];
  const vus = new Set([entry.id]);
  let niveau = [entry];
  for (let d = 0; d < depth; d++) {
    const suivant: Entree[] = [];
    for (const e of niveau) {
      const ids = [
        ...Object.values(e.champs).flatMap((v) =>
          Array.isArray(v) ? v : typeof v === 'string' ? [v] : [],
        ),
        ...e.effets.flatMap((x) => (x.sur === 'rang' ? [x.entree] : [])),
      ];
      for (const id of ids) {
        const x = systeme.entrees.get(id);
        if (!x || vus.has(id)) continue;
        vus.add(id);
        suivant.push(x);
      }
    }
    r.push(...suivant);
    niveau = suivant;
  }
  return r;
}

const texteDe = (e: Entree) => normaliser(`${e.nom} ${e.description ?? ''}`);

export interface SearchHit {
  entry: Entree;
  /** Entrées liées qui correspondent, quand l'entrée elle-même ne correspond pas. */
  via: Entree[];
}

/**
 * Recherche plein texte (nom et description, sans accents) dans l'entrée, puis dans ce
 * qu'elle accorde : une voie est trouvée par le texte d'une de ses capacités.
 */
export function searchEntry(
  systeme: SystemeCharge,
  entry: Entree,
  query: string,
): SearchHit | null {
  const q = normaliser(query);
  if (!q) return { entry, via: [] };
  if (texteDe(entry).includes(q)) return { entry, via: [] };
  const via = descendants(systeme, entry).filter((d) => texteDe(d).includes(q));
  return via.length ? { entry, via } : null;
}
