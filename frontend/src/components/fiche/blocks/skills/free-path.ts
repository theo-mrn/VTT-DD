/**
 * Voie libre (docs/entrees-libres.md) : une voie maison et ses capacités, entrées libres du
 * personnage. Le brouillon de l'éditeur, sa lecture depuis l'état et sa conversion en entrées.
 * Tout vient des sortes du système : sorte de voie personnalisable à rangs dont les entrées
 * accordent d'autres entrées par rang, sortes de capacités personnalisables.
 */
import {
  PREFIXE_ENTREE_LIBRE,
  type Effet,
  type Entree,
  type Fiche,
  type Sorte,
  type SystemeCharge,
} from '@vtt/rules';
import { grantsOf, maxRank, pathSortes } from '../tree/model';

export type ChampLibre = string | number | boolean;

export interface FreeAbilityDraft {
  /** Identifiant de l'entrée libre (absent : nouvelle capacité). */
  id?: string;
  sorte: string;
  nom: string;
  description: string;
  champs: Record<string, ChampLibre>;
  /** Effets gardés tels quels (les bonus se gèrent sur la fiche). */
  effets: Effet[];
  /** Champs de formule en cours de saisie et invalides : l'enregistrement attend. */
  invalides?: string[];
}

export interface FreePathDraft {
  /** Identifiant de la voie (absent : nouvelle voie). */
  id?: string;
  sorte: string;
  nom: string;
  description: string;
  /** Une capacité par rang (index 0 : rang 1) ; null : rang sans capacité. */
  ranks: (FreeAbilityDraft | null)[];
}

export interface FreePathKinds {
  /** Sortes de voie personnalisables (rangs, accordent des entrées par rang). */
  paths: Sorte[];
  /** Sortes de capacité personnalisables, proposées pour chaque rang. */
  abilities: Sorte[];
}

/** Sortes du système qui permettent une voie libre ; vide : pas de voie libre ici. */
export function freePathKinds(systeme: SystemeCharge, type: string): FreePathKinds {
  const paths = pathSortes(systeme, type).filter((s) => s.personnalisable);
  const ids = new Set(paths.map((s) => s.id));
  const abilities = [...systeme.sortes.values()].filter(
    (s) => s.personnalisable && !ids.has(s.id) && s.pour.includes(type),
  );
  return abilities.length ? { paths, abilities } : { paths: [], abilities };
}

/** Nombre de rangs d'une voie de cette sorte (au moins 1). */
export function rankCount(fiche: Fiche, sorte: Sorte): number {
  return Math.max(1, maxRank(fiche, sorte) ?? 1);
}

export const estLibre = (id: string) => id.startsWith(PREFIXE_ENTREE_LIBRE);

/** Brouillon vide d'une voie de cette sorte. */
export function emptyDraft(fiche: Fiche, sorte: Sorte): FreePathDraft {
  return {
    sorte: sorte.id,
    nom: '',
    description: '',
    ranks: Array.from({ length: rankCount(fiche, sorte) }, () => null),
  };
}

/** Brouillon d'une voie libre existante, ses capacités placées à leur rang. */
export function draftOf(fiche: Fiche, path: Entree): FreePathDraft {
  const sorte = fiche.systeme.sortes.get(path.sorte)!;
  const draft = emptyDraft(fiche, sorte);
  for (const g of grantsOf(fiche, path, draft.ranks.length)) {
    if (!estLibre(g.entry.id) || draft.ranks[g.rank - 1]) continue;
    draft.ranks[g.rank - 1] = {
      id: g.entry.id,
      sorte: g.entry.sorte,
      nom: g.entry.nom,
      description: g.entry.description ?? '',
      champs: Object.fromEntries(
        Object.entries(g.entry.champs).filter(
          (kv): kv is [string, ChampLibre] => !Array.isArray(kv[1]),
        ),
      ),
      effets: g.entry.effets,
    };
  }
  return {
    ...draft,
    id: path.id,
    nom: path.nom,
    description: path.description ?? '',
  };
}

/** Identifiant libre et lisible : `perso-<nom>-<4 caractères>`, absent de `pris`. */
export function freeId(nom: string, pris: ReadonlySet<string>): string {
  const base =
    nom
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'entree';
  for (;;) {
    const id = `${PREFIXE_ENTREE_LIBRE}${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!pris.has(id)) return id;
  }
}

/** Le brouillon peut s'enregistrer : un nom de voie, et un nom à chaque capacité saisie. */
export function draftValid(d: FreePathDraft): boolean {
  return (
    d.nom.trim() !== '' && d.ranks.every((r) => !r || (r.nom.trim() !== '' && !r.invalides?.length))
  );
}

/**
 * Entrées libres du brouillon : la voie (une capacité accordée par rang, `rang >= N`) puis
 * ses capacités. Un champ d'entrée d'une capacité qui désigne une voie de cette sorte reçoit
 * la voie. Rend aussi les capacités libres que la voie n'accorde plus (à retirer).
 */
export function entriesOf(
  systeme: SystemeCharge,
  d: FreePathDraft,
  avant: FreePathDraft | null,
  pris: ReadonlySet<string>,
): { entries: Entree[]; removed: string[] } {
  const ids = new Set(pris);
  const take = (nom: string) => {
    const id = freeId(nom, ids);
    ids.add(id);
    return id;
  };
  const pathId = d.id ?? take(d.nom);
  const abilities: Entree[] = [];
  const effets: Effet[] = [];
  d.ranks.forEach((r, i) => {
    if (!r) return;
    const id = r.id ?? take(r.nom);
    const sorte = systeme.sortes.get(r.sorte);
    const champs: Record<string, ChampLibre> = { ...r.champs };
    for (const c of sorte?.champs ?? [])
      if (c.type === 'entree' && c.sorte === d.sorte) champs[c.id] = pathId;
    abilities.push({
      id,
      sorte: r.sorte,
      nom: r.nom.trim(),
      ...(r.description.trim() ? { description: r.description.trim() } : {}),
      etiquettes: [],
      libre: false,
      champs,
      effets: r.effets,
      choix: [],
      choixAttributs: [],
    });
    effets.push({ sur: 'rang', entree: id, valeur: '1', condition: `rang >= ${i + 1}` } as Effet);
  });
  const path: Entree = {
    id: pathId,
    sorte: d.sorte,
    nom: d.nom.trim(),
    ...(d.description.trim() ? { description: d.description.trim() } : {}),
    etiquettes: [],
    libre: false,
    champs: {},
    effets,
    choix: [],
    choixAttributs: [],
  };
  const gardes = new Set(abilities.map((a) => a.id));
  const removed = (avant?.ranks ?? []).flatMap((r) => (r?.id && !gardes.has(r.id) ? [r.id] : []));
  return { entries: [path, ...abilities], removed };
}
