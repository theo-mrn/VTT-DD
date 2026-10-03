/**
 * Catalogue des titres, repris de l'ancienne app (legacy/src/lib/titles.ts,
 * INITIAL_TITLES, et récompenses de legacy/src/lib/challenges.ts).
 *
 * Les slugs de l'ancienne app utilisaient des « _ » (generateSlug) ; la table
 * identity.titles n'accepte que [a-z0-9-] : les « _ » deviennent des « - ».
 * L'ordre du tableau donne sort_order, comme `order` dans Firestore.
 */
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { titles } from '../../db/schema.js';

export type ConditionTitre =
  { type: 'time'; minutes: number } | { type: 'event'; description: string } | { type: 'premium' };

export interface DefinitionTitre {
  label: string;
  defaultUnlocked: boolean;
  condition?: ConditionTitre;
}

export interface TitreCatalogue {
  slug: string;
  label: string;
  description: string | null;
  condition: ConditionTitre | null;
  defaultUnlocked: boolean;
  sortOrder: number;
}

/**
 * Slug d'un libellé ou d'un ancien slug : minuscules, sans accents, tout ce qui
 * n'est ni lettre ni chiffre devient « - ».
 * « Béni des Dieux » -> « beni-des-dieux », « rat_de_taverne » -> « rat-de-taverne ».
 */
export function slugDe(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Anciens slugs retirés par l'ancienne app, ramenés vers leur remplaçant. */
export const ALIAS_SLUGS: Readonly<Record<string, string>> = {
  'maudit-par-les-des': 'maudit-des-des',
};

const temps = (minutes: number): ConditionTitre => ({ type: 'time', minutes });
const evenement = (description: string): ConditionTitre => ({ type: 'event', description });

export const DEFINITIONS_TITRES: readonly DefinitionTitre[] = [
  // Rangs de progression
  { label: 'Vagabond', defaultUnlocked: true },
  { label: 'Rat de taverne', defaultUnlocked: true },
  { label: 'Aventurier', defaultUnlocked: true },
  { label: 'Mercenaire', defaultUnlocked: false, condition: temps(5) },
  { label: 'Explorateur', defaultUnlocked: false, condition: temps(15) },
  { label: 'Vétéran', defaultUnlocked: false, condition: temps(30) },
  { label: 'Héros', defaultUnlocked: false, condition: temps(60) },
  { label: 'Champion', defaultUnlocked: false, condition: temps(120) },
  { label: 'Légende', defaultUnlocked: false, condition: temps(300) },
  { label: 'Demi-Dieu', defaultUnlocked: false, condition: temps(600) },
  { label: 'Divinité', defaultUnlocked: false, condition: temps(1000) },

  // Spéciaux (attribués à la main)
  { label: 'Maître du Jeu', defaultUnlocked: false },
  { label: 'Gardien du Savoir', defaultUnlocked: false },
  { label: 'Architecte de Mondes', defaultUnlocked: false },
  { label: 'Tueur de Dragons', defaultUnlocked: false },
  { label: 'Collectionneur de Dés', defaultUnlocked: false },
  { label: 'Optimisateur', defaultUnlocked: false },
  { label: 'Roleplayer', defaultUnlocked: false },
  { label: 'Stratège', defaultUnlocked: false },
  { label: 'Survivant', defaultUnlocked: false },
  {
    label: 'Maudit des dés',
    defaultUnlocked: false,
    condition: evenement('Faire un échec critique (1 naturel)'),
  },
  {
    label: 'Béni des Dieux',
    defaultUnlocked: false,
    condition: evenement('Faire une réussite critique (20 naturel)'),
  },
  { label: 'Toujours en Retard', defaultUnlocked: false },
  { label: 'Le Barbare', defaultUnlocked: false },
  { label: "L'Érudit", defaultUnlocked: false },

  // Défis : dés
  {
    label: 'Apprenti Lanceur',
    defaultUnlocked: false,
    condition: evenement('Lancer votre premier dé'),
  },
  { label: 'Lanceur Enthousiaste', defaultUnlocked: false, condition: evenement('Lancer 50 dés') },
  { label: 'Chanceux', defaultUnlocked: false, condition: evenement('Obtenir un 20 naturel') },
  {
    label: 'Éternel Malchanceux',
    defaultUnlocked: false,
    condition: evenement('Obtenir 10 échecs critiques'),
  },

  // Défis : social
  {
    label: 'Orateur Novice',
    defaultUnlocked: false,
    condition: evenement('Envoyer votre premier message'),
  },
  { label: 'Conteur Bavard', defaultUnlocked: false, condition: evenement('Envoyer 100 messages') },
  {
    label: 'Barde Légendaire',
    defaultUnlocked: false,
    condition: evenement('Envoyer 500 messages'),
  },

  // Défis : progression
  {
    label: 'Aventurier Confirmé',
    defaultUnlocked: false,
    condition: evenement('Atteindre le niveau 5'),
  },
  {
    label: 'Héros Accompli',
    defaultUnlocked: false,
    condition: evenement('Atteindre le niveau 10'),
  },
  {
    label: 'Légende Vivante',
    defaultUnlocked: false,
    condition: evenement('Atteindre le niveau 20'),
  },

  // Défis : collection
  {
    label: 'Collectionneur Débutant',
    defaultUnlocked: false,
    condition: evenement('Obtenir votre premier objet'),
  },
  {
    label: 'Accumulateur Compulsif',
    defaultUnlocked: false,
    condition: evenement('Posséder 50 objets'),
  },
  {
    label: "Maître d'Armes",
    defaultUnlocked: false,
    condition: evenement('Posséder 10 armes différentes'),
  },

  // Défis : exploration. Le défi « first_session » l'accordait après 5 minutes
  // de jeu : c'est une condition de temps, débloquée comme les rangs.
  { label: 'Novice Aventurier', defaultUnlocked: false, condition: temps(5) },

  // Défis : maîtrise
  { label: 'Étudiant', defaultUnlocked: false, condition: evenement('Apprendre 5 compétences') },

  // Défis : combat
  {
    label: 'Combattant Novice',
    defaultUnlocked: false,
    condition: evenement('Remporter votre premier combat'),
  },
  {
    label: 'Vétéran de Guerre',
    defaultUnlocked: false,
    condition: evenement('Remporter 25 combats'),
  },
  {
    label: 'Fléau des Dragons',
    defaultUnlocked: false,
    condition: evenement('Terrasser un dragon'),
  },

  // Premium
  { label: 'Mécène', defaultUnlocked: false, condition: { type: 'premium' } },
];

/** Texte affiché sous le titre, déduit de sa condition. */
export function descriptionDe(condition: ConditionTitre | null | undefined): string | null {
  if (!condition) return null;
  switch (condition.type) {
    case 'time':
      return `Jouer ${condition.minutes} minutes`;
    case 'event':
      return condition.description;
    case 'premium':
      return 'Réservé aux membres premium';
  }
}

/** Catalogue prêt à écrire en base (slug, description et ordre calculés). */
export function catalogue(
  definitions: readonly DefinitionTitre[] = DEFINITIONS_TITRES,
): TitreCatalogue[] {
  const vus = new Set<string>();
  return definitions.map((d, i) => {
    const slug = slugDe(d.label);
    if (vus.has(slug)) throw new Error(`Slug de titre en double : ${slug}`);
    vus.add(slug);
    return {
      slug,
      label: d.label,
      description: descriptionDe(d.condition),
      condition: d.condition ?? null,
      defaultUnlocked: d.defaultUnlocked,
      sortOrder: i,
    };
  });
}

/**
 * Écrit le catalogue du code en base (au démarrage du service). Idempotent :
 * les lignes déjà à jour ne sont pas réécrites ; les titres absents du code
 * (importés de Firestore) ne sont pas touchés.
 */
export async function amorcerCatalogue(db: Db): Promise<number> {
  const lignes = catalogue();
  const res = await db
    .insert(titles)
    .values(lignes)
    .onConflictDoUpdate({
      target: titles.slug,
      set: {
        label: sql`excluded.label`,
        description: sql`excluded.description`,
        condition: sql`excluded.condition`,
        defaultUnlocked: sql`excluded.default_unlocked`,
        sortOrder: sql`excluded.sort_order`,
      },
      setWhere: sql`(${titles.label}, ${titles.description}, ${titles.condition}, ${titles.defaultUnlocked}, ${titles.sortOrder})
        is distinct from (excluded.label, excluded.description, excluded.condition, excluded.default_unlocked, excluded.sort_order)`,
    })
    .returning({ slug: titles.slug });
  return res.length;
}
