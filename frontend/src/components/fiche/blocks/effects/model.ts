/**
 * Modèle du bloc Bonus : tous les effets du personnage (`listerEffets` de @vtt/rules),
 * rangés par famille de source et libellés lisiblement (« DEF +2 », « +1 dé de Fortune au
 * jet de Pilotage »). Rien n'est propre à un jeu : les familles se déduisent de la forme
 * des sortes (exemplaires ou quantités : objets ; unique : profil ; le reste : capacités),
 * les libellés des attributs, dés, entrées et actions déclarés par le système.
 */
import {
  basculerEffets,
  listerEffets,
  type EffetListe,
  type EtatEntite,
  type Effet,
  type Fiche,
  type Sorte,
  type Valeur,
} from '@vtt/rules';

export type FamilleEffet = 'objets' | 'capacites' | 'profil' | 'libres';

export const ORDRE_FAMILLES: FamilleEffet[] = ['objets', 'capacites', 'profil', 'libres'];

/** Famille d'une source, d'après sa sorte (jamais d'identifiant de jeu). */
export function familleDe(e: EffetListe): FamilleEffet {
  if (e.genre === 'bonus') return 'libres';
  if (e.genre === 'exemplaire' || !e.possession) return 'objets';
  return familleSorte(e.possession.sorte);
}

/** Libellé d'une famille ; celle du profil nomme ses sortes (« Espèce et carrière »). */
export function libelleFamille(f: FamilleEffet, sortes: readonly Sorte[] = []): string {
  switch (f) {
    case 'objets':
      return 'Objets';
    case 'capacites':
      return 'Compétences et capacités';
    case 'libres':
      return 'Bonus libres';
    case 'profil': {
      const noms = [...new Set(sortes.map((s) => s.nom))];
      if (!noms.length) return 'Profil';
      const texte =
        noms.length === 1 ? noms[0]! : `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)!}`;
      return texte.charAt(0).toUpperCase() + texte.slice(1).toLowerCase();
    }
  }
}

/** Famille des entrées d'une sorte (mêmes règles que `familleDe`). */
function familleSorte(sorte: Sorte): Exclude<FamilleEffet, 'libres'> {
  if (sorte.exemplaires || sorte.quantites) return 'objets';
  if (sorte.maximum === 1) return 'profil';
  return 'capacites';
}

/**
 * Familles que le système peut remplir pour ce type d'entité : une sorte possédable dont des
 * entrées portent des bonus, ou qui a des exemplaires (bonus saisis sur un objet). Les bonus
 * libres existent partout. Dans l'ordre d'affichage, avec les sortes du profil.
 */
export function famillesDuSysteme(fiche: Fiche): { familles: FamilleEffet[]; profil: Sorte[] } {
  const { systeme, etat } = fiche;
  const avecBonus = new Set<string>();
  for (const e of systeme.entrees.values())
    if (e.effets.some(effetEstBonus)) avecBonus.add(e.sorte);
  const presentes = new Set<FamilleEffet>(['libres']);
  const profil: Sorte[] = [];
  for (const s of systeme.sortes.values()) {
    if (!s.pour.includes(etat.type)) continue;
    if (!avecBonus.has(s.id) && !s.exemplaires) continue;
    const f = familleSorte(s);
    presentes.add(f);
    if (f === 'profil' && avecBonus.has(s.id)) profil.push(s);
  }
  return { familles: ORDRE_FAMILLES.filter((f) => presentes.has(f)), profil };
}

/** Libellé court d'une famille, pour un onglet (« Objets », « Capacités », « Espèce »). */
export function ongletFamille(f: FamilleEffet, profil: readonly Sorte[]): string {
  switch (f) {
    case 'objets':
      return 'Objets';
    case 'capacites':
      return 'Capacités';
    case 'libres':
      return 'Libres';
    case 'profil':
      return profil[0]?.nom ?? 'Profil';
  }
}

/**
 * Vrai bonus : il modifie un attribut, un jet ou des dégâts. Les rangs offerts (« +1 rang en
 * X ») et les marques d'entrées structurent le personnage : ce ne sont pas des bonus.
 */
export function effetEstBonus(effet: Effet): boolean {
  return effet.sur !== 'marque' && effet.sur !== 'rang';
}

export function estBonus(e: EffetListe): boolean {
  return effetEstBonus(e.effet);
}

/** Effets affichés : bonus des sources possédées (une entrée à rangs sans rang est ignorée). */
export function effetsDuPersonnage(fiche: Fiche): EffetListe[] {
  return listerEffets(fiche).filter((e) => estBonus(e) && e.raison !== 'non-effective');
}

/** Pourquoi un effet ne s'applique pas, sans être coupé (grisé dans la liste). */
export function raisonInactif(e: EffetListe): string | null {
  switch (e.raison) {
    case 'inactive':
      return familleDe(e) === 'objets' ? 'objet rangé' : 'inactif';
    case 'non-effective':
      return 'aucun rang';
    case 'bonus-inactif':
      return 'bonus désactivé';
    default:
      return null;
  }
}

function nombre(v: Valeur | undefined, texte: string): number | string {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  const n = Number(texte);
  return Number.isFinite(n) ? n : texte;
}

function signe(v: number | string): string {
  if (typeof v !== 'number') return `+ ${v}`;
  return v >= 0 ? `+${v}` : `−${Math.abs(v)}`;
}

function attribut(fiche: Fiche, cle: string): string {
  const a = fiche.entite.attributs.get(cle);
  return a?.abrege ?? a?.nom ?? cle;
}

function de(fiche: Fiche, id: string, n: number | string): string {
  const d = fiche.systeme.source.des?.sortes.find((x) => x.id === id);
  const nom = d?.nom ?? id;
  return n === 1 ? `dé ${nom}` : `dés ${nom}`;
}

/** Ce que vise un effet de jet : « au jet de Pilotage », « en défense », actions nommées. */
function cibleJet(fiche: Fiche, e: Extract<Effet, { sur: 'jet' }>): string {
  const morceaux: string[] = [];
  if (e.implique?.entree) {
    const nom = fiche.systeme.entrees.get(e.implique.entree)?.nom ?? e.implique.entree;
    morceaux.push(`au jet de ${nom}`);
  } else if (e.implique?.attribut) {
    const a = fiche.entite.attributs.get(e.implique.attribut);
    morceaux.push(`aux jets de ${a?.nom ?? e.implique.attribut}`);
  }
  if (e.actions?.length) {
    const noms = e.actions.map((id) => fiche.systeme.actions.get(id)?.nom ?? id);
    morceaux.push(`(${noms.join(', ')})`);
  }
  if (e.cote === 'cible') morceaux.push('en défense');
  return morceaux.join(' ');
}

/** Libellé principal d'un effet : sa cible et sa valeur évaluée. */
export function libelleEffet(fiche: Fiche, x: Pick<EffetListe, 'effet' | 'valeur'>): string {
  const e = x.effet;
  switch (e.sur) {
    case 'attribut': {
      const nom = attribut(fiche, e.attribut);
      const v = nombre(x.valeur, e.valeur);
      switch (e.operation) {
        case 'ajouter':
          return `${nom} ${signe(v)}`;
        case 'multiplier':
          return `${nom} ×${v}`;
        case 'fixer':
          return `${nom} = ${v}`;
        case 'minimum':
          return `${nom} au moins ${v}`;
        case 'maximum':
          return `${nom} au plus ${v}`;
      }
      return nom;
    }
    case 'rang': {
      const cible = fiche.systeme.entrees.get(e.entree)?.nom ?? e.entree;
      const v = nombre(x.valeur, e.valeur);
      return v === 1 ? `+1 rang en ${cible}` : `${signe(v)} rangs en ${cible}`;
    }
    case 'jet': {
      const a = e.ajout;
      const cible = cibleJet(fiche, e);
      const avec = (base: string) => (cible ? `${base} ${cible}` : base);
      if (!a) return e.description ?? avec('Modifie le jet');
      if ('de' in a) {
        const n = nombre(x.valeur, a.nombre);
        return avec(`${signe(n)} ${de(fiche, a.de, n)}`);
      }
      if ('ameliorer' in a) {
        const n = nombre(x.valeur, a.nombre);
        return avec(`Améliore ${n} ${de(fiche, a.ameliorer, n)} en ${de(fiche, a.vers, 1)}`);
      }
      if ('retrograder' in a) {
        const n = nombre(x.valeur, a.nombre);
        return avec(`Rétrograde ${n} ${de(fiche, a.retrograder, n)} en ${de(fiche, a.vers, 1)}`);
      }
      if ('retirer' in a) {
        const n = nombre(x.valeur, a.nombre);
        return avec(`−${n} ${de(fiche, a.retirer, n)}`);
      }
      if ('variable' in a) return avec(`${a.variable} ${signe(nombre(x.valeur, a.ajouter))}`);
      const bonus = signe(nombre(x.valeur, a.bonus));
      return cible.startsWith('au') ? `${bonus} ${cible}` : avec(`${bonus} au jet`);
    }
    case 'degats': {
      const types = e.types?.length ? ` (${e.types.join(', ')})` : '';
      const v = nombre(x.valeur, e.valeur);
      if (e.operation === 'annuler') return `Immunité aux dégâts${types}`;
      if (e.operation === 'multiplier') return `Dégâts reçus ×${v}${types}`;
      return `Dégâts reçus −${v}${types}`;
    }
    case 'marque':
      return e.entrees.map((id) => fiche.systeme.entrees.get(id)?.nom ?? id).join(', ');
  }
}

/** Précision sous le libellé : condition, famille non cumulable, description de l'auteur. */
export function precisionEffet(e: EffetListe): string | null {
  const morceaux: string[] = [];
  if (e.effet.description && e.effet.sur !== 'jet') morceaux.push(e.effet.description);
  if (e.effet.condition !== undefined) morceaux.push('sous condition');
  if (e.effet.sur === 'jet' && e.effet.si !== undefined) morceaux.push('sous condition');
  if (e.effet.famille) morceaux.push('non cumulable');
  return morceaux.length ? [...new Set(morceaux)].join(' · ') : null;
}

/** Nom affiché de la sorte d'une source (« Armure », « Talent »), s'il y en a une. */
export function sorteDe(e: EffetListe): string | null {
  return e.possession?.sorte.nom ?? null;
}

/** Aperçu local d'une bascule d'effets (le service confirme ou corrige). */
export function apercuBascule(
  fiche: Fiche,
  cles: readonly string[],
  actif: boolean,
): EtatEntite | null {
  const r = basculerEffets(fiche, cles, actif);
  return r.ok ? r.etat : null;
}

/**
 * Active ou coupe des effets par l'opération de la fiche, avec l'aperçu local : la même
 * écriture pour le bloc Bonus et le détail d'une compétence (le service confirme ou corrige).
 */
export function envoyerBascule(
  fiche: Fiche,
  effet: ((cles: string[], actif: boolean, apercu: EtatEntite) => void) | undefined,
  cles: string[],
  actif: boolean,
): void {
  if (!effet || !cles.length) return;
  const apercu = apercuBascule(fiche, cles, actif);
  if (apercu) effet(cles, actif, apercu);
}

/** Effets d'une entrée possédée : ceux de son catalogue et de ses exemplaires. */
export function effetsDeLEntree(fiche: Fiche, entree: string): EffetListe[] {
  return effetsDuPersonnage(fiche).filter(
    (e) => e.genre !== 'bonus' && e.possession?.entree.id === entree,
  );
}

/** Ancre du bloc Bonus d'un personnage, pour y renvoyer depuis une autre fenêtre. */
export const ancreBonus = (personnage: string) => `bloc-bonus-${personnage}`;

/** Amène le bloc Bonus à l'écran et lui donne le focus ; faux s'il n'est pas sur la fiche. */
export function allerAuBlocBonus(personnage: string): boolean {
  const el =
    typeof document !== 'undefined' ? document.getElementById(ancreBonus(personnage)) : null;
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
  return true;
}
