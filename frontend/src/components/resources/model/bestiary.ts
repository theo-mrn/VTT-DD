/**
 * Bestiaire des ressources : créatures de référence du système et modèles de PNJ de la
 * campagne, dans une seule forme d'affichage. Les statistiques montrées sont celles que la
 * présentation déclare par type d'entité (`references.bestiaire.statistiques`), ou à défaut
 * les blocs d'attributs de sa fiche : aucune clé de jeu en dur.
 */
import { translate } from '@/i18n/runtime';
import {
  calculer,
  type BestiaryCreature,
  type Fiche,
  type GroupeStatistiques,
  type Presentation,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import type { NpcTemplate, NpcTemplateCategory } from '@/lib/bestiary';
import { normaliser } from './catalogue';

export interface StatItem {
  key: string;
  /** Abréviation (« DEF ») ou nom. */
  label: string;
  name: string;
  value: string;
}

export interface StatGroup {
  title: string;
  items: StatItem[];
}

export interface BestiaryItem {
  key: string;
  source: 'campaign' | 'system';
  name: string;
  category: string | null;
  subtitle: string | null;
  image: string | null;
  description: string | null;
  stats: StatGroup[];
  actions: { name: string; description: string; toHit: number | null }[];
  text: string;
}

/** Groupes de statistiques d'un type d'entité : déclarés, sinon les blocs de sa fiche. */
export function statGroupsFor(
  systeme: SystemeCharge,
  presentation: Presentation | null,
  entite: string,
): GroupeStatistiques[] {
  const declares = presentation?.references.bestiaire?.statistiques[entite];
  if (declares?.length) return declares;
  const e = systeme.entites.get(entite);
  if (!e) return [];
  return (presentation?.fiches[entite]?.widgets ?? []).flatMap((w): GroupeStatistiques[] => {
    if (w.type === 'ressources') return [{ titre: w.titre, attributs: w.attributs }];
    if (w.type !== 'attributs') return [];
    const attributs =
      w.attributs ??
      [...e.attributs.values()].filter((a) => a.groupe === w.groupe).map((a) => a.cle);
    return attributs.length ? [{ titre: w.titre, attributs }] : [];
  });
}

function texteValeur(v: Valeur | undefined): string | null {
  if (v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'number') return (Math.round(v * 100) / 100).toLocaleString('fr-FR');
  return v;
}

function stats(
  systeme: SystemeCharge,
  presentation: Presentation | null,
  entite: string,
  valeur: (cle: string) => Valeur | undefined,
  autres: readonly string[] = [],
): StatGroup[] {
  const attributs = systeme.entites.get(entite)?.attributs;
  const item = (cle: string): StatItem | null => {
    const a = attributs?.get(cle);
    const value = texteValeur(valeur(cle));
    return a && value !== null ? { key: cle, label: a.abrege ?? a.nom, name: a.nom, value } : null;
  };
  const groupes = statGroupsFor(systeme, presentation, entite);
  const montres = new Set(groupes.flatMap((g) => g.attributs));
  const r = groupes
    .map((g) => ({
      title: g.titre,
      items: g.attributs.map(item).filter((x): x is StatItem => x !== null),
    }))
    .filter((g) => g.items.length > 0);
  // Valeurs imprimées hors des groupes déclarés : rien ne se perd
  const reste = autres
    .filter((c) => !montres.has(c))
    .map(item)
    .filter((x): x is StatItem => x !== null);
  if (reste.length) r.push({ title: translate('resources.bestiary.others'), items: reste });
  return r;
}

/** Créature du bestiaire de référence : valeurs imprimées. */
export function creatureItem(
  systeme: SystemeCharge,
  presentation: Presentation | null,
  c: BestiaryCreature,
): BestiaryItem {
  const actions = c.actions.map((a) => ({
    name: a.nom,
    description: a.description,
    toHit: a.toucher ?? null,
  }));
  return {
    key: `system:${c.id}`,
    source: 'system',
    name: c.nom,
    category: c.categorie,
    subtitle: c.type ?? null,
    image: c.image ?? null,
    description: c.description ?? null,
    stats: stats(systeme, presentation, c.entite, (k) => c.valeurs[k], Object.keys(c.valeurs)),
    actions,
    text: normaliser(
      `${c.nom} ${c.categorie} ${c.type ?? ''} ${actions.map((a) => a.name).join(' ')}`,
    ),
  };
}

/** Modèle de PNJ de la campagne : statistiques calculées par les règles de la campagne. */
export function templateItem(
  systeme: SystemeCharge,
  presentation: Presentation | null,
  t: NpcTemplate,
  categories: readonly NpcTemplateCategory[],
): BestiaryItem {
  let fiche: Fiche | null = null;
  try {
    fiche = t.etat && systeme.entites.has(t.etat.type) ? calculer(systeme, t.etat) : null;
  } catch {
    fiche = null;
  }
  const category = categories.find((c) => c.id === t.categoryId)?.name ?? null;
  const type = fiche ? systeme.entites.get(fiche.etat.type)?.type.nom : null;
  const actions = t.actions.map((a) => ({
    name: a.name,
    description: a.description,
    toHit: a.toHit || null,
  }));
  return {
    key: `campaign:${t.id}`,
    source: 'campaign',
    name: t.name,
    category,
    subtitle: type ?? null,
    image: t.imageUrl ?? t.tokenUrl,
    description: null,
    stats: fiche
      ? stats(systeme, presentation, fiche.etat.type, (k) =>
          fiche.attributActif(k) ? fiche.valeurs.get(k)?.valeur : undefined,
        )
      : [],
    actions,
    text: normaliser(`${t.name} ${category ?? ''} ${actions.map((a) => a.name).join(' ')}`),
  };
}
