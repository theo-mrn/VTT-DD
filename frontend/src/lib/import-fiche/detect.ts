/**
 * Détection d'une fiche importée (docs/import-fiche.md § 3) : la lecture brute (PDF ou lien) est
 * rapprochée du système de la campagne. Aucun nom de jeu ici : attributs, sortes et entrées sont
 * cherchés par leurs noms dans le système chargé (clé, nom, abréviation), les voies aussi par
 * les noms de leurs rangs. Ce qui ne trouve pas sa place est rendu tel quel, pour l'écran de
 * vérification.
 */
import type { SheetEntry, SheetReading } from '@vtt/contracts';
import type { Attribut, Entree, Sorte, SystemeCharge } from '@vtt/rules';

/** Texte comparable : minuscules, sans accents ni ponctuation, marques de fiche retirées. */
export function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ressemblance de deux textes comparables, de 0 à 1 (distance d'édition). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return 1 - prev[b.length]! / Math.max(a.length, b.length);
}

/** En dessous, un nom approché ne se rapproche pas (docs/import-fiche.md § 3.3). */
export const MIN_SIMILARITY = 0.85;

export type Confidence = 'sure' | 'probable';

export interface DetectedValue {
  key: string;
  value: number | string | boolean;
  /** D'où vient la valeur sur la fiche. */
  from: string;
  confidence: Confidence;
}

export interface DetectedEntry {
  entry: string;
  sorte: string;
  rank?: number;
  quantity?: number;
  /** Champs propres de l'exemplaire (objet hors catalogue : son nom, sa description). */
  fields?: Record<string, string>;
  from: string;
  confidence: Confidence;
}

export interface SheetDetection {
  name: string;
  /** Attributs saisissables. */
  values: DetectedValue[];
  /** Valeurs calculées lues sur la fiche, comparées au calcul (écarts, bases déduites). */
  read: Record<string, number>;
  entries: DetectedEntry[];
  /** Éléments à rangs absents du catalogue (voies) : à poser en entrées libres. */
  free: { item: SheetEntry; sorte: string }[];
  /** Champs, éléments et textes restés sans place. */
  unmatched: string[];
  appearance: string;
  backstory: string;
  portraitUrl?: string;
}

/** Noms sous lesquels un attribut se reconnaît. */
const attributeNames = (a: Attribut) =>
  [a.cle, a.cle.replace(/_/g, ' '), a.nom, 'abrege' in a ? a.abrege : undefined]
    .filter((x): x is string => !!x)
    .map(plain);

const sorteNames = (s: Sorte) =>
  [s.id, s.nom, s.nomPluriel].filter((x): x is string => !!x).map(plain);

/** Premier nombre d'un texte (« 14 », « +3 », « 1d6 » → 1), sinon undefined. */
function numberIn(text: string): number | undefined {
  const m = /[-+]?\d+/.exec(text.replace(/\s+/g, ''));
  return m ? Number(m[0]) : undefined;
}

/** Noms des entrées qu'une entrée accorde par ses rangs (capacités d'une voie). */
function grantedNames(systeme: SystemeCharge, e: Entree): string[] {
  return e.effets.flatMap((f) =>
    f.sur === 'rang' && 'entree' in f && typeof f.entree === 'string'
      ? [plain(systeme.entrees.get(f.entree)?.nom ?? '')]
      : [],
  );
}

/** Sortes que l'indice de la fiche désigne (« voie » → sorte « voie »), sinon toutes celles du type. */
function sortesFor(systeme: SystemeCharge, type: string, kind: string | undefined): Sorte[] {
  const all = [...systeme.sortes.values()].filter((s) => s.pour.includes(type));
  if (!kind) return all;
  const k = plain(kind);
  const hit = all.filter((s) => sorteNames(s).some((n) => n === k || n.startsWith(`${k} `)));
  return hit.length ? hit : all;
}

/** Entrée du catalogue pour un élément de la fiche : nom exact, approché, ou par ses rangs. */
function matchEntry(
  systeme: SystemeCharge,
  sortes: Sorte[],
  item: SheetEntry,
): { entry: Entree; confidence: Confidence } | undefined {
  const ids = new Set(sortes.map((s) => s.id));
  const candidates = [...systeme.entrees.values()].filter((e) => ids.has(e.sorte) && !e.libre);
  const name = plain(item.name);
  const exact = candidates.find((e) => plain(e.nom) === name);
  if (exact) return { entry: exact, confidence: 'sure' };
  let best: { entry: Entree; score: number } | undefined;
  for (const e of candidates) {
    const score = similarity(plain(e.nom), name);
    if (score >= MIN_SIMILARITY && (!best || score > best.score)) best = { entry: e, score };
  }
  if (best) return { entry: best.entry, confidence: 'probable' };
  // Une voie au nom différent se reconnaît à ses capacités (comme le faisait le legacy)
  const ranks = (item.ranks ?? []).map(plain).filter(Boolean);
  if (ranks.length < 2) return undefined;
  let byRanks: { entry: Entree; score: number } | undefined;
  for (const e of candidates) {
    const granted = grantedNames(systeme, e);
    const score = ranks.filter((r) =>
      granted.some((g) => similarity(g, r) >= MIN_SIMILARITY),
    ).length;
    if (score > ranks.length / 2 && (!byRanks || score > byRanks.score))
      byRanks = { entry: e, score };
  }
  return byRanks && { entry: byRanks.entry, confidence: 'probable' };
}

/** Rapproche la lecture brute d'une fiche du système, pour un type d'entité. */
export function detectSheet(
  systeme: SystemeCharge,
  type: string,
  reading: SheetReading,
): SheetDetection {
  const entity = systeme.entites.get(type);
  const attributes = [...(entity?.attributs.values() ?? [])];
  const byName = new Map<string, Attribut>();
  for (const a of attributes)
    for (const n of attributeNames(a)) if (!byName.has(n)) byName.set(n, a);

  const values: DetectedValue[] = [];
  const read: Record<string, number> = {};
  const unmatched: string[] = [];
  const leftovers: string[] = [];
  for (const f of reading.fields) {
    const a = byName.get(plain(f.label));
    const n = numberIn(f.value);
    if (!a || values.some((v) => v.key === a.cle) || a.cle in read) {
      leftovers.push(`${f.label} : ${f.value}`);
      continue;
    }
    const from = `${f.label} : ${f.value}`;
    switch (a.nature) {
      case 'derivee':
        if (n !== undefined) read[a.cle] = n;
        else leftovers.push(from);
        break;
      case 'base':
      case 'ressource':
        if (n !== undefined) values.push({ key: a.cle, value: n, from, confidence: 'sure' });
        else leftovers.push(from);
        break;
      case 'texte':
        values.push({ key: a.cle, value: f.value, from, confidence: 'sure' });
        break;
      case 'choix': {
        const o = a.options.find(
          (x) => plain(x.nom) === plain(f.value) || plain(x.valeur) === plain(f.value),
        );
        if (o) values.push({ key: a.cle, value: o.valeur, from, confidence: 'sure' });
        else leftovers.push(from);
        break;
      }
      case 'booleen':
        values.push({
          key: a.cle,
          value: /^(1|oui|yes|true|x)$/i.test(f.value.trim()),
          from,
          confidence: 'sure',
        });
        break;
    }
  }

  const entries: DetectedEntry[] = [];
  const free: SheetDetection['free'] = [];
  for (const item of reading.entries) {
    const sortes = sortesFor(systeme, type, item.kind);
    const m = matchEntry(systeme, sortes, item);
    const from = [item.kind, item.name].filter(Boolean).join(' : ');
    if (m) {
      entries.push({
        entry: m.entry.id,
        sorte: m.entry.sorte,
        ...(item.rank !== undefined ? { rank: item.rank } : {}),
        ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
        from,
        confidence: m.confidence,
      });
      continue;
    }
    // Élément à rangs absent du catalogue : entrée libre d'une sorte personnalisable
    const libre = item.ranks?.length ? sortes.find((s) => s.personnalisable && s.rangs) : undefined;
    if (libre) {
      free.push({ item, sorte: libre.id });
      continue;
    }
    // Objet absent du catalogue : l'entrée générique de sa sorte, à son nom
    const generic = [...systeme.entrees.values()].find(
      (e) => e.libre && sortes.some((s) => s.id === e.sorte),
    );
    const sorte = generic && systeme.sortes.get(generic.sorte);
    if (generic && sorte?.nomExemplaire) {
      entries.push({
        entry: generic.id,
        sorte: generic.sorte,
        ...(item.quantity !== undefined ? { quantity: item.quantity } : {}),
        fields: {
          [sorte.nomExemplaire]: item.name,
          ...(item.details && sorte.descriptionExemplaire
            ? { [sorte.descriptionExemplaire]: item.details }
            : {}),
        },
        from,
        confidence: 'probable',
      });
      continue;
    }
    unmatched.push(from);
  }

  return {
    name: reading.name ?? '',
    values,
    read,
    entries,
    free,
    unmatched: [...unmatched, ...leftovers],
    appearance: leftovers.join(' · '),
    backstory: reading.texts.map((t) => (t.label ? `${t.label} : ${t.text}` : t.text)).join('\n\n'),
    ...(reading.portraitUrl ? { portraitUrl: reading.portraitUrl } : {}),
  };
}
