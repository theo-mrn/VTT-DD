/**
 * Fiche en ligne de Noobliés Chroniques (nooblieeschroniques.fr) : la page porte la fiche en
 * JSON (`var tmp = {…}`), lue comme le faisait le legacy (legacy/src/utils/noobliesParse.ts).
 * L'adaptateur ne connaît que le format du site, jamais le système de la campagne : il en sort
 * une lecture brute (docs/import-fiche.md § 2.1).
 */
import type { SheetEntry, SheetField, SheetReading, SheetText } from '@vtt/contracts';

/** Hôte des fiches (et ses sous-domaines). */
export const NOOBLIES_HOST = 'nooblieeschroniques.fr';

interface Rang {
  n?: number;
  nom?: string;
  checked?: boolean;
}
interface Objet {
  nom?: string;
  dm?: string;
  mod?: string;
}
interface FicheNooblies {
  cname?: string;
  race?: string;
  profil?: string;
  niveau?: string | number;
  taille?: string;
  poids?: string;
  age?: string;
  sexe?: string;
  raciale?: string;
  illu?: string;
  carac?: Record<string, string | number>;
  bonus?: Record<string, string | number>;
  contact?: string | number;
  distance?: string | number;
  magique?: string | number;
  initiative?: string | number;
  defense?: string | number;
  PV?: { max?: string | number; left?: string | number };
  PC?: { max?: string | number; left?: string | number };
  PR?: { max?: string | number; left?: string | number };
  mana?: { max?: string | number; left?: string | number };
  RD?: string | number;
  notes?: string;
  armes?: Record<string, Objet>;
  armures?: Record<string, Objet>;
  besace?: Record<string, Objet>;
  bourse?: Record<string, string | number>;
  voies?: Record<
    string,
    { nom?: string; prestige?: string | boolean; rangs?: Record<string, Rang> }
  >;
}

/** Objet JSON de `var tmp = {…}` : accolades équilibrées, chaînes comprises. */
function objetTmp(html: string): string | null {
  const debut = html.indexOf('{', html.indexOf('var tmp ='));
  if (html.indexOf('var tmp =') < 0 || debut < 0) return null;
  let profondeur = 0;
  let chaine = false;
  for (let i = debut; i < html.length; i++) {
    const c = html[i];
    if (chaine) {
      if (c === '\\') i++;
      else if (c === '"') chaine = false;
    } else if (c === '"') chaine = true;
    else if (c === '{') profondeur++;
    else if (c === '}' && --profondeur === 0) return html.slice(debut, i + 1);
  }
  return null;
}

const texte = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

/** Lecture brute d'une page de fiche ; null si la page n'en contient pas. */
export function lireNooblies(html: string, url: string): SheetReading | null {
  const brut = objetTmp(html);
  if (!brut) return null;
  let f: FicheNooblies;
  try {
    f = JSON.parse(brut) as FicheNooblies;
  } catch {
    return null;
  }

  const fields: SheetField[] = [];
  const champ = (label: string, v: unknown) => {
    const value = texte(v);
    if (value) fields.push({ label, value });
  };
  for (const [k, v] of Object.entries(f.carac ?? {})) champ(k, v);
  for (const [k, v] of Object.entries(f.bonus ?? {})) champ(`Bonus ${k}`, v);
  champ('Niveau', f.niveau);
  champ('PV', f.PV?.left);
  champ('PV max', f.PV?.max);
  champ('Défense', f.defense);
  champ('Contact', f.contact);
  champ('Distance', f.distance);
  champ('Magie', f.magique);
  champ('Initiative', f.initiative);
  champ('RD', f.RD);
  champ('Points de chance', f.PC?.left);
  champ('Points de récupération', f.PR?.left);
  champ('Mana', f.mana?.left);
  champ('Taille', f.taille);
  champ('Poids', f.poids);
  champ('Âge', f.age);
  champ('Sexe', f.sexe);
  for (const [k, v] of Object.entries(f.bourse ?? {})) if (Number(v)) champ(k, v);

  const entries: SheetEntry[] = [];
  const entree = (e: SheetEntry) => entries.push(e);
  if (texte(f.race)) entree({ name: texte(f.race), kind: 'race' });
  if (texte(f.profil)) entree({ name: texte(f.profil), kind: 'profil' });
  for (const v of Object.values(f.voies ?? {})) {
    const nom = texte(v.nom);
    if (!nom) continue;
    const rangs = Object.values(v.rangs ?? {}).sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
    // Rang atteint : le dernier rang coché
    const rank = rangs.reduce((m, r, i) => (r.checked ? i + 1 : m), 0);
    entree({ name: nom, kind: 'voie', rank, ranks: rangs.map((r) => texte(r.nom)) });
  }
  const objets = (liste: Record<string, Objet> | undefined, kind: string) => {
    for (const o of Object.values(liste ?? {})) {
      const nom = texte(o.nom);
      if (!nom) continue;
      const details = [
        o.dm && `DM ${texte(o.dm)}`,
        texte(o.mod) && texte(o.mod) !== '0' && `Mod ${texte(o.mod)}`,
      ]
        .filter(Boolean)
        .join(', ');
      entree({ name: nom, kind, ...(details ? { details } : {}) });
    }
  };
  objets(f.armes, 'arme');
  objets(f.armures, 'armure');
  objets(f.besace, 'objet');

  const texts: SheetText[] = [];
  if (texte(f.raciale)) texts.push({ label: 'Capacité raciale', text: texte(f.raciale) });
  if (texte(f.notes)) texts.push({ label: 'Notes', text: texte(f.notes) });

  let portraitUrl: string | undefined;
  try {
    if (texte(f.illu)) portraitUrl = new URL(texte(f.illu), url).toString();
  } catch {
    portraitUrl = undefined;
  }

  return {
    source: { kind: 'link', site: NOOBLIES_HOST, url },
    ...(texte(f.cname) ? { name: texte(f.cname) } : {}),
    ...(portraitUrl ? { portraitUrl } : {}),
    fields,
    entries,
    texts,
  };
}
