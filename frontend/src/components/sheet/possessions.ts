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
  type Sorte,
  type SystemeCharge,
} from '@vtt/rules';

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

/** Valeur d'un champ pour une possession : celle de l'exemplaire, de l'entrée, sinon le défaut. */
export function fieldValue(
  state: EtatEntite,
  entry: Entree,
  field: Champ,
): number | string | boolean | string[] | undefined {
  const p = state.possessions.find((x) => x.entree === entry.id);
  const v = p?.champs[field.id] ?? entry.champs[field.id];
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
