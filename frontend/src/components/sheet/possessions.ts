/** Outils de lecture des possessions et des achats qui les visent (sans rendu). */
import {
  chemins,
  essayer,
  type AchatDisponible,
  type Champ,
  type Entree,
  type EtatEntite,
  type Fiche,
  type ObjetAchetable,
  type Possession,
  type PossessionEffective,
  type Sorte,
  type SystemeCharge,
} from '@vtt/rules';

// ─── Exemplaires ─────────────────────────────────────────────────────────────

/**
 * Exemplaires affichés d'une possession : un par possession explicite de
 * l'état, sinon un seul, sans possession (entrée obtenue par un effet, un
 * choix ou un nœud d'arbre).
 */
export function copiesOf(p: PossessionEffective): (Possession | undefined)[] {
  return p.exemplaires.length ? p.exemplaires : [undefined];
}

/** Clé d'un exemplaire (`entree` ou `entree#exemplaire`), pour React et les sélections. */
export const copyKey = (entry: string, copy?: string) =>
  copy === undefined ? entry : `${entry}#${copy}`;

/** Cible d'une écriture sur cet exemplaire : `{ entree, exemplaire? }`. */
export const copyTarget = (entry: string, copy?: string) => ({
  entree: entry,
  ...(copy !== undefined ? { exemplaire: copy } : {}),
});

/** Numéro affiché d'un exemplaire quand l'entrée en a plusieurs (« 1 », « 2 »…), sinon rien. */
export function copyNumber(p: PossessionEffective, own?: Possession): string | undefined {
  if (p.exemplaires.length < 2 || !own) return undefined;
  return own.exemplaire ?? '1';
}

/** Nom d'un exemplaire : celui de l'entrée, numéroté s'il y en a plusieurs. */
export function copyName(p: PossessionEffective, own?: Possession): string {
  const n = copyNumber(p, own);
  return n ? `${p.entree.nom} (n° ${n})` : p.entree.nom;
}

/** Exemplaire actif : son propre état pour une sorte activable, sinon celui de l'entrée. */
export function copyActive(p: PossessionEffective, own?: Possession): boolean {
  if (!own) return p.actif;
  return !p.sorte.activable || own.actif;
}

/** Dernier exemplaire d'une entrée : celui que retire l'annulation de son dernier achat. */
export function lastCopy(state: EtatEntite, entry: string): Possession | undefined {
  return state.possessions.filter((x) => x.entree === entry).at(-1);
}

/** Nombre d'exemplaires d'une sorte, tel que le compte son `maximum`. */
export function copiesOfKind(sheet: Fiche, kind: string): number {
  let n = 0;
  for (const p of sheet.possessions.values())
    if (p.sorte.id === kind) n += Math.max(1, p.exemplaires.length);
  return n;
}

/** Un achat du système vise-t-il les entrées de cette sorte (rang ou nouvelle entrée) ? */
export function purchasableKind(system: SystemeCharge, kind: string): boolean {
  for (const a of system.achats.values()) {
    const o = a.obtient;
    if ((o.type === 'rang' || o.type === 'entree') && o.sorte === kind) return true;
  }
  return false;
}

/**
 * Sorte ajoutée librement depuis le catalogue (équipement, états…) : aucun
 * achat ne la vise et ses entrées ne s'obtiennent pas par un nœud d'arbre.
 */
export function freeKind(system: SystemeCharge, kind: string): boolean {
  if (purchasableKind(system, kind)) return false;
  for (const a of system.arbres.values())
    for (const n of a.noeuds) if (system.entrees.get(n.entree)?.sorte === kind) return false;
  return true;
}

/** Objets achetables (rang ou entrée) d'une sorte, avec leur achat. */
export function itemsOfKind(
  system: SystemeCharge,
  purchases: AchatDisponible[],
  kind: string,
): ObjetAchetable[] {
  return purchases.flatMap((a) =>
    a.objets.filter(
      (o) =>
        (o.type === 'rang' || o.type === 'entree') && system.entrees.get(o.objet)?.sorte === kind,
    ),
  );
}

/** Achat du rang suivant d'une entrée, s'il existe. */
export function nextRankPurchase(purchases: AchatDisponible[], entry: string) {
  for (const a of purchases)
    for (const o of a.objets) if (o.type === 'rang' && o.objet === entry) return o;
  return undefined;
}

/** Index de la dernière ligne du journal qui porte sur cet objet (le seul remboursable). */
export function lastLine(state: EtatEntite, item: string): number {
  for (let i = state.journal.length - 1; i >= 0; i--)
    if (state.journal[i]!.objet === item) return i;
  return -1;
}

/** Valeur d'un champ pour un exemplaire : la sienne, celle de l'entrée, sinon le défaut. */
export function fieldValue(
  entry: Entree,
  field: Champ,
  own?: Pick<Possession, 'champs'>,
): number | string | boolean | string[] | undefined {
  const v = own?.champs[field.id] ?? entry.champs[field.id];
  if (v !== undefined) return v;
  return 'defaut' in field ? field.defaut : undefined;
}

/** Valeur d'un champ, lisible (noms d'attribut ou d'entrée résolus). */
export function readableField(
  system: SystemeCharge,
  type: string,
  field: Champ,
  v: number | string | boolean | string[] | undefined,
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

/** Rang maximal d'une sorte à rangs (formule du système), ou undefined. */
export function maxRank(sheet: Fiche, kind: Sorte): number | undefined {
  if (!kind.rangs) return undefined;
  const f = sheet.systeme.formules.get(chemins.rangsMax(kind.id));
  if (!f) return undefined;
  const r = essayer(sheet, f);
  const n = r.ok ? Number(r.valeur) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Prérequis d'une entrée rempli sur la fiche (vrai s'il n'y en a pas). */
export function prerequisitesMet(sheet: Fiche, entry: string): boolean {
  const f = sheet.systeme.formules.get(chemins.exige(entry));
  if (!f) return true;
  const r = essayer(sheet, f);
  return r.ok && r.valeur === true;
}
