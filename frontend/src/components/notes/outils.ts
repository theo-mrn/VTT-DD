/**
 * Outils purs de l'espace Notes : recherche tolérante aux accents, extraits,
 * regroupement par date et formats de date relatifs.
 */
import { texteNote, TYPES_NOTE, type Note, type TypeNote } from '@/lib/notes';

// ─── Recherche ───────────────────────────────────────────────────────────────

/** Minuscules sans accents : « Épée » et « epee » se trouvent l'un l'autre. */
export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Note accompagnée de son texte brut, calculé une fois par version du cache. */
export interface NoteIndexee {
  note: Note;
  /** Texte intégral (recherche, extraits autour d'un terme trouvé). */
  texte: string;
  /** Texte d'aperçu, sans les intertitres des modèles (« Résumé », « Secrets »…). */
  apercu: string;
  /** Titre, texte et étiquettes normalisés : la botte de foin de la recherche. */
  cle: string;
}

export function indexer(notes: Note[]): NoteIndexee[] {
  return notes.map((note) => {
    const texte = texteNote(note.content);
    const corps = texteNote(note.content.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, ' '));
    return {
      note,
      texte,
      apercu: corps || texte,
      cle: normaliser(`${note.title}\n${texte}\n${note.tags.map((t) => `#${t}`).join(' ')}`),
    };
  });
}

/** Termes de la requête : tous doivent apparaître (ordre libre). */
export function termes(requete: string): string[] {
  return normaliser(requete).split(/\s+/).filter(Boolean);
}

export function correspond(n: NoteIndexee, mots: string[]): boolean {
  return mots.every((m) => n.cle.includes(m));
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

/**
 * Extrait centré sur la première occurrence cherchée dans le texte ; sans
 * occurrence (terme trouvé dans le titre ou une étiquette), l'aperçu habituel.
 */
export function extrait(n: NoteIndexee, mots: string[], longueur = 150): string {
  const plat = normaliser(n.texte);
  const positions = mots.map((m) => plat.indexOf(m)).filter((i) => i >= 0);
  if (!positions.length) return n.apercu.slice(0, longueur);
  const debut = Math.max(0, Math.min(...positions) - 36);
  // Coupe sur un espace pour ne pas commencer au milieu d'un mot
  const coupe = debut === 0 ? 0 : n.texte.indexOf(' ', debut) + 1 || debut;
  return (coupe > 0 ? '… ' : '') + n.texte.slice(coupe, coupe + longueur);
}

// ─── Regroupement ────────────────────────────────────────────────────────────

export type IdGroupe = 'epinglees' | 'aujourdhui' | 'semaine' | 'ancien';

export interface Groupe {
  id: IdGroupe;
  titre: string;
  notes: NoteIndexee[];
}

const TITRES_GROUPES: Record<IdGroupe, string> = {
  epinglees: 'Épinglées',
  aujourdhui: "Aujourd'hui",
  semaine: 'Cette semaine',
  ancien: 'Plus ancien',
};

function debutDuJour(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Épinglées d'abord, puis par récence (les plus récentes en haut de chaque groupe). */
export function grouper(notes: NoteIndexee[], maintenant: number): Groupe[] {
  const jour = debutDuJour(maintenant);
  const semaine = jour - 6 * 86_400_000;
  const tries = [...notes].sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));
  const seaux: Record<IdGroupe, NoteIndexee[]> = {
    epinglees: [],
    aujourdhui: [],
    semaine: [],
    ancien: [],
  };
  for (const n of tries) {
    const t = new Date(n.note.updatedAt).getTime();
    if (n.note.pinned) seaux.epinglees.push(n);
    else if (t >= jour) seaux.aujourdhui.push(n);
    else if (t >= semaine) seaux.semaine.push(n);
    else seaux.ancien.push(n);
  }
  return (Object.keys(seaux) as IdGroupe[])
    .filter((id) => seaux[id].length)
    .map((id) => ({ id, titre: TITRES_GROUPES[id], notes: seaux[id] }));
}

// ─── Dates ───────────────────────────────────────────────────────────────────

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
