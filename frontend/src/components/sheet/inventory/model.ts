/**
 * Lecture de l'inventaire, sans rendu : sortes d'équipement, bourse, résumé
 * des champs, cibles possibles d'un bonus d'objet et vérification locale des
 * effets. Tout vient du système : aucune clé de jeu n'est écrite ici.
 */
import {
  calculer,
  chemins,
  compilerEffets,
  copier,
  detailSolde,
  estExemplaire,
  nouvellePossession,
  prefixeExemplaire,
  sourceExemplaire,
  typeAttribut,
  variablesSource,
  type Achat,
  type Attribut,
  type Champ,
  type Effet,
  type Entree,
  type EtatEntite,
  type Fiche,
  type Noeud,
  type Possession,
  type SoldeMonnaie,
  type Sorte,
  type SystemeCharge,
} from '@vtt/rules';
import { fieldValue } from '../possessions';

export { fieldValue };

export type FieldValue = number | string | boolean | string[] | undefined;

// ─── Sortes d'équipement ─────────────────────────────────────────────────────

/**
 * Sortes affichées dans l'inventaire : entrées activables (équipables), sans
 * rangs, qui portent des caractéristiques. Les capacités à activer ont des
 * rangs, les états n'ont pas de champs : ils restent dans leurs propres blocs.
 */
export function equipmentKinds(system: SystemeCharge, type: string): Sorte[] {
  return [...system.sortes.values()].filter(
    (s) => s.activable && !s.rangs && s.champs.length > 0 && s.pour.includes(type),
  );
}

/** Variables `entree.<champ>` lues par une formule (prix lu par le coût d'un achat). */
function entryVariables(n: Noeud | undefined, out = new Set<string>()): Set<string> {
  if (!n) return out;
  switch (n.t) {
    case 'variable':
      if (n.nom.startsWith('entree.')) out.add(n.nom.slice('entree.'.length));
      break;
    case 'appel':
      n.args.forEach((a) => entryVariables(a, out));
      break;
    case 'unaire':
      entryVariables(n.arg, out);
      break;
    case 'binaire':
      entryVariables(n.g, out);
      entryVariables(n.d, out);
      break;
    case 'si':
      entryVariables(n.condition, out);
      entryVariables(n.alors, out);
      entryVariables(n.sinon, out);
      break;
    case 'des':
      entryVariables(n.nombre, out);
      entryVariables(n.faces, out);
      break;
  }
  return out;
}

/** Achats qui donnent une entrée de cette sorte. */
export function entryPurchases(system: SystemeCharge, kind: string): Achat[] {
  return [...system.achats.values()].filter(
    (a) => a.obtient.type === 'entree' && a.obtient.sorte === kind,
  );
}

/** Champs de la sorte lus comme prix par le coût d'un achat (`entree.prix`). */
export function priceFields(system: SystemeCharge, kind: string): Set<string> {
  const out = new Set<string>();
  for (const a of entryPurchases(system, kind))
    entryVariables(system.formules.get(chemins.achat(a.id, 'cout'))?.noeud, out);
  return out;
}

// ─── Bourse ──────────────────────────────────────────────────────────────────

export interface PurseLine {
  balance: SoldeMonnaie;
  /** Attribut de base qui fait le total, s'il est seul : saisissable pendant la création. */
  attribute?: Attribut & { nature: 'base' };
}

/**
 * Monnaies de la bourse : celles que dépensent les achats d'équipement ou
 * dont le coût lit un champ de l'entrée (`entree.prix`), et celles dont le
 * total est un attribut de base seul (`@bourse`). L'expérience et les points
 * de création, calculés autrement, n'en font pas partie.
 */
export function purseLines(sheet: Fiche, kinds: Sorte[]): PurseLine[] {
  const { systeme: system, entite } = sheet;
  const kindIds = new Set(kinds.map((k) => k.id));
  const lines: PurseLine[] = [];
  for (const m of system.monnaies.values()) {
    if (!m.pour.includes(sheet.etat.type)) continue;
    const total = system.formules.get(chemins.monnaie(m.id));
    const node = total?.noeud;
    const single =
      node?.t === 'attribut' && !node.entite ? entite.attributs.get(node.cle) : undefined;
    const attribute = single?.nature === 'base' ? single : undefined;
    const spentOnGear = [...system.achats.values()].some(
      (a) =>
        a.monnaie === m.id &&
        ((a.obtient.type === 'entree' && kindIds.has(a.obtient.sorte)) ||
          entryVariables(system.formules.get(chemins.achat(a.id, 'cout'))?.noeud).size > 0),
    );
    if (!spentOnGear && !attribute) continue;
    lines.push({ balance: detailSolde(sheet, m.id), ...(attribute ? { attribute } : {}) });
  }
  return lines;
}

// ─── Champs ──────────────────────────────────────────────────────────────────

/** Valeur lisible d'un champ (noms d'attribut ou d'entrée résolus). */
export function readableField(
  system: SystemeCharge,
  type: string,
  field: Champ,
  v: FieldValue,
): string {
  if (v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.map((id) => system.entrees.get(id)?.nom ?? id).join(', ') || '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (field.type === 'attribut')
    return system.entites.get(type)?.attributs.get(String(v))?.nom ?? String(v);
  if (field.type === 'entree') return system.entrees.get(String(v))?.nom ?? String(v);
  if (typeof v === 'number') return v.toLocaleString('fr-FR');
  return v;
}

/** Nom court d'un champ : sans la précision entre parenthèses (« Prix (pa) » → « Prix »). */
export const shortName = (field: Champ) => field.nom.replace(/\s*\([^)]*\)\s*$/, '') || field.nom;

/**
 * Résumé d'un exemplaire (ou de l'entrée du catalogue, sans `own`), à la
 * manière de « Dégâts 7 · Crit 3 · Fixation 2 » : les premiers champs
 * renseignés de la sorte, hors prix et listes. Un booléen vrai n'affiche que
 * le nom du champ.
 */
export function fieldSummary(
  system: SystemeCharge,
  type: string,
  entry: Entree,
  kind: Sorte,
  own?: Possession,
  max = 3,
): string[] {
  const prices = priceFields(system, kind.id);
  const parts: string[] = [];
  for (const c of kind.champs) {
    if (parts.length >= max) break;
    if (prices.has(c.id) || c.type === 'entrees') continue;
    const v = fieldValue(entry, c, own);
    if (v === undefined || v === '' || v === 0 || v === '0' || v === false) continue;
    if (v === true) parts.push(shortName(c));
    else parts.push(`${shortName(c)} ${readableField(system, type, c, v)}`);
  }
  return parts;
}

/** Prix d'une entrée (premier champ lu par le coût d'un achat), s'il est renseigné. */
export function entryPrice(system: SystemeCharge, entry: Entree, kind: Sorte) {
  for (const id of priceFields(system, kind.id)) {
    const v = entry.champs[id];
    if (typeof v === 'number') return v;
  }
  return undefined;
}

// ─── Cibles d'un bonus d'objet ───────────────────────────────────────────────

export interface Option {
  value: string;
  label: string;
  group?: string;
}

/** Attributs numériques de l'entité, rangés par groupe déclaré. */
export function numericAttributes(system: SystemeCharge, type: string): Option[] {
  const e = system.entites.get(type);
  if (!e) return [];
  const groups = new Map(e.type.groupes.map((g) => [g.id, g.nom]));
  return e.type.attributs
    .filter((a) => typeAttribut(a) === 'nombre')
    .map((a) => ({
      value: a.cle,
      label: a.nom,
      ...(a.groupe ? { group: groups.get(a.groupe) ?? a.groupe } : {}),
    }));
}

/**
 * Entrées qu'un jet peut impliquer : celles des sortes désignées par un
 * paramètre d'action, et celles vers lesquelles pointe un de leurs champs
 * (compétence d'une arme).
 */
export function rollEntries(system: SystemeCharge, type: string): Option[] {
  const kinds = new Set<string>();
  for (const a of system.actions.values())
    for (const p of a.parametres) if (p.type === 'entree') kinds.add(p.sorte);
  for (const k of [...kinds])
    for (const c of system.sortes.get(k)?.champs ?? [])
      if (c.type === 'entree' || c.type === 'entrees') kinds.add(c.sorte);
  return [...system.entrees.values()]
    .filter((e) => kinds.has(e.sorte) && system.sortes.get(e.sorte)?.pour.includes(type))
    .map((e) => {
      const s = system.sortes.get(e.sorte)!;
      return { value: e.id, label: e.nom, group: s.nomPluriel ?? s.nom };
    })
    .sort((a, b) => a.group.localeCompare(b.group, 'fr') || a.label.localeCompare(b.label, 'fr'));
}

/** Sortes de dés à symboles, s'il y en a. */
export function diceKinds(system: SystemeCharge): Option[] {
  return (system.source.des?.sortes ?? []).map((d) => ({ value: d.id, label: d.nom }));
}

/** Une action au moins fait un jet numérique (bonus au total utile). */
export function hasNumericRolls(system: SystemeCharge): boolean {
  return [...system.actions.values()].some((a) => a.jet.type === 'numerique');
}

export function damageTypes(system: SystemeCharge): Option[] {
  return system.source.typesDegats.map((t) => ({ value: t.id, label: t.nom }));
}

// ─── Description d'un effet ──────────────────────────────────────────────────

const ATTRIBUTE_OPERATIONS: Record<string, string> = {
  ajouter: '+',
  multiplier: '×',
  fixer: '=',
  minimum: '≥',
  maximum: '≤',
};

const signed = (v: string) => (/^-/.test(v) ? `−${v.slice(1)}` : `+${v}`);

/** Effet en une ligne de français, avec les noms du système. */
export function describeEffect(system: SystemeCharge, type: string, f: Effet): string {
  const attribute = (k: string) => system.entites.get(type)?.attributs.get(k)?.nom ?? k;
  const entry = (id: string) => system.entrees.get(id)?.nom ?? id;
  const die = (id: string) => system.source.des?.sortes.find((d) => d.id === id)?.nom ?? id;
  switch (f.sur) {
    case 'attribut':
      return f.operation === 'ajouter'
        ? `${attribute(f.attribut)} ${signed(f.valeur)}`
        : `${attribute(f.attribut)} ${ATTRIBUTE_OPERATIONS[f.operation]} ${f.valeur}`;
    case 'rang':
      return `${entry(f.entree)} : ${signed(f.valeur)} rang`;
    case 'marque':
      return `Marque « ${f.marque} » : ${f.entrees.map(entry).join(', ')}`;
    case 'degats': {
      const types = f.types?.length
        ? f.types.map((t) => system.source.typesDegats.find((x) => x.id === t)?.nom ?? t).join(', ')
        : 'tous types';
      const what =
        f.operation === 'annuler'
          ? 'annulés'
          : f.operation === 'multiplier'
            ? `× ${f.valeur}`
            : `réduits de ${f.valeur}`;
      return `Dégâts (${types}) ${what}`;
    }
    case 'jet': {
      const scope = f.implique?.entree
        ? `Jets avec ${entry(f.implique.entree)}`
        : f.implique?.attribut
          ? `Jets avec ${attribute(f.implique.attribut)}`
          : 'Jets';
      const side = f.cote === 'cible' ? ' contre le porteur' : '';
      const a = f.ajout;
      let what = '';
      if (!a) what = '';
      else if ('de' in a) what = `+${a.nombre} ${die(a.de)}`;
      else if ('ameliorer' in a) what = `${a.nombre} ${die(a.ameliorer)} → ${die(a.vers)}`;
      else if ('retrograder' in a) what = `${a.nombre} ${die(a.retrograder)} → ${die(a.vers)}`;
      else if ('retirer' in a) what = `−${a.nombre} ${die(a.retirer)}`;
      else if ('variable' in a) what = `${a.variable} ${signed(a.ajouter)}`;
      else what = signed(a.bonus);
      return `${scope}${side} : ${what}`;
    }
  }
}

// ─── Vérification locale ─────────────────────────────────────────────────────

export interface EffectError {
  /** Index de l'effet concerné, s'il est connu. */
  index?: number;
  message: string;
}

/**
 * Vérifie les effets propres d'un exemplaire comme le fera le service :
 * `compilerEffets` (cible, formules, variables de la sorte), puis un calcul
 * de la fiche avec ces effets, qui refuse ceux qui lisent un attribut
 * calculé après leur cible.
 */
export function checkItemEffects(
  system: SystemeCharge,
  state: EtatEntite,
  entry: string,
  copy: string | undefined,
  effects: readonly Effet[],
): EffectError[] {
  const kind = system.sortes.get(system.entrees.get(entry)?.sorte ?? '');
  const target = { entree: entry, ...(copy !== undefined ? { exemplaire: copy } : {}) };
  const prefix = prefixeExemplaire(target);
  const r = compilerEffets(
    system,
    state.type,
    effects,
    (i, x) => `${prefix}/effets/${i}/${x}`,
    variablesSource(kind),
  );
  const indexOf = (path: string) => {
    const m = /\/effets\/(\d+)\//.exec(`${path}/`);
    return m ? Number(m[1]) : undefined;
  };
  if (r.erreurs.length)
    return r.erreurs.map((e) => {
      const index = indexOf(e.chemin);
      return { ...(index !== undefined ? { index } : {}), message: e.message };
    });

  try {
    const next = copier(state);
    let p = next.possessions.find((x) => estExemplaire(x, entry, copy));
    if (!p) next.possessions.push((p = nouvellePossession(entry, 0, target)));
    // Équipé le temps de la vérification : un effet d'objet rangé n'est pas calculé
    p.actif = true;
    p.effets = [...effects];
    const source = sourceExemplaire(target);
    return calculer(system, next)
      .erreurs.filter((e) => e.ou === source || e.ou.startsWith(`${prefix}/`))
      .map((e) => {
        const index = indexOf(e.ou);
        return { ...(index !== undefined ? { index } : {}), message: e.message };
      });
  } catch (e) {
    return [{ message: e instanceof Error ? e.message : 'Calcul impossible avec ces effets' }];
  }
}

/**
 * Erreurs de la fiche calculée qui portent sur un objet (effet ignoré…) :
 * celles de l'entrée du catalogue, et celles des effets propres de cet
 * exemplaire (sans `own` : celles de tous ses exemplaires).
 */
export function itemErrors(
  sheet: Fiche,
  entry: string,
  own?: Pick<Possession, 'entree' | 'exemplaire'>,
): string[] {
  const mine = (ou: string) => {
    if (!own)
      return (
        ou.startsWith(`possessions/${entry}/`) ||
        ou.startsWith(`possessions/${entry}#`) ||
        ou.startsWith(`${entry}#`)
      );
    const prefix = prefixeExemplaire(own);
    return ou === sourceExemplaire(own) || ou.startsWith(`${prefix}/`);
  };
  return sheet.erreurs
    .filter((e) => e.ou === entry || e.ou.startsWith(`catalogue/${entry}/`) || mine(e.ou))
    .map((e) => e.message);
}
