/**
 * Outils purs de l'espace Notes : mise en valeur des termes cherchés (sans
 * tenir compte des accents), regroupement par campagne et formats de date.
 * La recherche elle-même est faite par le service (plein texte).
 */
import { TYPES_NOTE, type ResumeNote, type TypeNote } from '@/lib/notes';

// ─── Recherche ───────────────────────────────────────────────────────────────

/** Minuscules sans accents : « Épée » et « epee » se trouvent l'un l'autre. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Note de la liste, avec son extrait (calculé par le service). */
export interface NoteIndexee {
  note: ResumeNote;
  /** Aperçu, ou extrait centré sur le terme cherché. */
  apercu: string;
}

export function indexer(notes: ResumeNote[]): NoteIndexee[] {
  return notes.map((note) => ({ note, apercu: note.excerpt }));
}

/** Termes de la requête, pour les mettre en valeur dans les résultats. */
export function termes(requete: string): string[] {
  return normaliser(requete)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Découpe `texte` en segments surlignés ou non selon les termes cherchés. La
 * comparaison se fait sur la forme normalisée, caractère par caractère, pour
 * retrouver les positions exactes dans le texte d'origine.
 */
export function segments(texte: string, mots: string[]): { t: string; surligne: boolean }[] {
  if (!mots.length || !texte) return [{ t: texte, surligne: false }];
  let plat = '';
  const origine: number[] = [];
  for (let i = 0; i < texte.length; i++) {
    const n = normaliser(texte[i]);
    for (let k = 0; k < n.length; k++) origine.push(i);
    plat += n;
  }
  const marque = new Array<boolean>(texte.length).fill(false);
  for (const m of mots) {
    let depuis = 0;
    for (;;) {
      const i = plat.indexOf(m, depuis);
      if (i < 0) break;
      for (let k = i; k < i + m.length; k++) marque[origine[k]] = true;
      depuis = i + m.length;
    }
  }
  const res: { t: string; surligne: boolean }[] = [];
  for (let i = 0; i < texte.length; i++) {
    const dernier = res[res.length - 1];
    if (dernier && dernier.surligne === marque[i]) dernier.t += texte[i];
    else res.push({ t: texte[i], surligne: marque[i] });
  }
  return res;
}

// ─── Regroupement ────────────────────────────────────────────────────────────

/** Notes d'une campagne dans la liste. */
export interface Groupe {
  /** Id de la campagne. */
  id: string;
  titre: string;
  notes: NoteIndexee[];
}

/**
 * Par campagne, la plus récemment active d'abord ; dans chacune, les notes
 * épinglées puis les plus récemment modifiées.
 */
export function grouper(notes: NoteIndexee[], nomCampagne: (id: string) => string): Groupe[] {
  const parCampagne = new Map<string, NoteIndexee[]>();
  for (const n of notes) {
    const liste = parCampagne.get(n.note.roomId);
    if (liste) liste.push(n);
    else parCampagne.set(n.note.roomId, [n]);
  }
  const recente = (g: Groupe) =>
    g.notes.reduce((max, n) => (n.note.updatedAt > max ? n.note.updatedAt : max), '');
  return [...parCampagne]
    .map(([id, liste]) => ({
      id,
      titre: nomCampagne(id),
      notes: [...liste].sort(
        (a, b) =>
          Number(b.note.pinned) - Number(a.note.pinned) ||
          b.note.updatedAt.localeCompare(a.note.updatedAt),
      ),
    }))
    .sort((a, b) => recente(b).localeCompare(recente(a)));
}

// ─── Dates ───────────────────────────────────────────────────────────────────

function debutDuJour(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const JOUR_SEMAINE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });
const JOUR_MOIS = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const JOUR_MOIS_AN = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const DATE_LONGUE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const RELATIF = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Date compacte de la liste : « 14:32 », « Hier », « Mardi », « 12 sept. ». */
export function dateCourte(iso: string, maintenant: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const jour = debutDuJour(maintenant);
  if (maintenant - t < 60_000) return "À l'instant";
  if (t >= jour) return HEURE.format(t);
  if (t >= jour - 86_400_000) return 'Hier';
  if (t >= jour - 6 * 86_400_000) return majuscule(JOUR_SEMAINE.format(t));
  const memeAnnee = new Date(t).getFullYear() === new Date(maintenant).getFullYear();
  return (memeAnnee ? JOUR_MOIS : JOUR_MOIS_AN).format(t);
}

/** « à l'instant », « il y a 5 minutes », « hier »… */
export function depuis(iso: string, maintenant: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.round((t - maintenant) / 1000);
  if (Math.abs(s) < 45) return "à l'instant";
  const unites: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unite, duree] of unites)
    if (Math.abs(s) >= duree) return RELATIF.format(Math.round(s / duree), unite);
  return RELATIF.format(s, 'second');
}

export function dateLongue(iso: string): string {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? '' : DATE_LONGUE.format(t);
}

// ─── Divers ──────────────────────────────────────────────────────────────────

export function compterMots(texte: string): number {
  return texte.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

export const LONGUEUR_ETIQUETTE = 32;

/** Étiquette propre : sans « # » initial, espaces réduits, longueur bornée. */
export function nettoyerEtiquette(s: string): string {
  return s
    .replace(/^#+/, '')
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LONGUEUR_ETIQUETTE);
}

export function typeNote(id: TypeNote) {
  return TYPES_NOTE.find((t) => t.id === id) ?? TYPES_NOTE[0];
}

/** Icône affichée : celle choisie, sinon celle du type (partagée avec la palette et l'accueil). */
export { iconeNote } from '@/lib/notes';
