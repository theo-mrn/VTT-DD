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
export function sorteAchetable(systeme: SystemeCharge, sorte: string): boolean {
  for (const a of systeme.achats.values()) {
    const o = a.obtient;
    if ((o.type === 'rang' || o.type === 'entree') && o.sorte === sorte) return true;
  }
  return false;
}

/**
 * Sorte ajoutée librement depuis le catalogue (équipement, états…) : aucun
 * achat ne la vise et ses entrées ne s'obtiennent pas par un nœud d'arbre.
 */
export function sorteLibre(systeme: SystemeCharge, sorte: string): boolean {
  if (sorteAchetable(systeme, sorte)) return false;
  for (const a of systeme.arbres.values())
    for (const n of a.noeuds) if (systeme.entrees.get(n.entree)?.sorte === sorte) return false;
  return true;
}

/** Objets achetables (rang ou entrée) d'une sorte, avec leur achat. */
export function objetsDeSorte(
  systeme: SystemeCharge,
  achats: AchatDisponible[],
  sorte: string,
): ObjetAchetable[] {
  return achats.flatMap((a) =>
    a.objets.filter(
      (o) =>
        (o.type === 'rang' || o.type === 'entree') && systeme.entrees.get(o.objet)?.sorte === sorte,
    ),
  );
}

/** Achat du rang suivant d'une entrée, s'il existe. */
export function achatRangSuivant(achats: AchatDisponible[], entree: string) {
  for (const a of achats)
    for (const o of a.objets) if (o.type === 'rang' && o.objet === entree) return o;
  return undefined;
}

/** Index de la dernière ligne du journal qui porte sur cet objet (le seul remboursable). */
export function derniereLigne(etat: EtatEntite, objet: string): number {
  for (let i = etat.journal.length - 1; i >= 0; i--) if (etat.journal[i]!.objet === objet) return i;
  return -1;
}

/** Valeur d'un champ pour une possession : celle de l'exemplaire, de l'entrée, sinon le défaut. */
export function valeurChamp(
  etat: EtatEntite,
  entree: Entree,
  champ: Champ,
): number | string | boolean | string[] | undefined {
  const p = etat.possessions.find((x) => x.entree === entree.id);
  const v = p?.champs[champ.id] ?? entree.champs[champ.id];
  if (v !== undefined) return v;
  return 'defaut' in champ ? champ.defaut : undefined;
}

/** Valeur d'un champ, lisible (noms d'attribut ou d'entrée résolus). */
export function champLisible(
  systeme: SystemeCharge,
  type: string,
  champ: Champ,
  v: number | string | boolean | string[] | undefined,
): string {
  if (v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.map((id) => systeme.entrees.get(id)?.nom ?? id).join(', ') || '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (champ.type === 'attribut')
    return systeme.entites.get(type)?.attributs.get(String(v))?.nom ?? String(v);
  if (champ.type === 'entree') return systeme.entrees.get(String(v))?.nom ?? String(v);
  if (typeof v === 'number') return v.toLocaleString('fr-FR');
  return v;
}

/** Rang maximal d'une sorte à rangs (formule du système), ou undefined. */
export function rangMax(fiche: Fiche, sorte: Sorte): number | undefined {
  if (!sorte.rangs) return undefined;
  const f = fiche.systeme.formules.get(chemins.rangsMax(sorte.id));
  if (!f) return undefined;
  const r = essayer(fiche, f);
  const n = r.ok ? Number(r.valeur) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Prérequis d'une entrée rempli sur la fiche (vrai s'il n'y en a pas). */
export function prerequisRempli(fiche: Fiche, entree: string): boolean {
  const f = fiche.systeme.formules.get(chemins.exige(entree));
  if (!f) return true;
  const r = essayer(fiche, f);
  return r.ok && r.valeur === true;
}
