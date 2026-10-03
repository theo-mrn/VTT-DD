/**
 * Modèles de notes : une structure de départ par usage courant à la table,
 * pour ne jamais partir d'une page blanche.
 */
import type { ModificationNote, TypeNote } from '@/lib/notes';

export interface ModeleNote {
  id: string;
  kind: TypeNote;
  icone: string;
  label: string;
  description: string;
  /** Titre proposé (calculé à la création : la date du jour, par exemple). */
  titre: () => string;
  contenu: string;
}

const vide = '<p></p>';
const puces = '<ul><li><p></p></li></ul>';
const section = (titre: string, corps = vide) => `<h2>${titre}</h2>${corps}`;

const JOUR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

export const MODELES_NOTE: ModeleNote[] = [
  {
    id: 'session',
    kind: 'journal',
    icone: '📖',
    label: 'Journal de session',
    description: 'Résumé, moments forts, butin',
    titre: () => `Session du ${JOUR.format(new Date())}`,
    contenu:
      section('Résumé') +
      section('Moments marquants', puces) +
      section('Butin et récompenses', puces) +
      section('Pistes à suivre', puces),
  },
  {
    id: 'pnj',
    kind: 'personnage',
    icone: '🧙',
    label: 'Personnage non joueur',
    description: 'Apparence, motivations, secrets',
    titre: () => '',
    contenu:
      section('Apparence') +
      section('Personnalité') +
      section('Motivations') +
      section('Secrets', '<blockquote><p></p></blockquote>'),
  },
  {
    id: 'lieu',
    kind: 'lieu',
    icone: '🏰',
    label: 'Lieu',
    description: 'Ambiance, habitants, points d’intérêt',
    titre: () => '',
    contenu:
      section('Description') +
      section('Ambiance') +
      section('Habitants', puces) +
      section('Points d’intérêt', puces),
  },
  {
    id: 'quete',
    kind: 'quete',
    icone: '🧭',
    label: 'Quête',
    description: 'Objectif, commanditaire, étapes',
    titre: () => '',
    contenu:
      section('Objectif') +
      section('Commanditaire') +
      section('Étapes', '<ol><li><p></p></li></ol>') +
      section('Récompense'),
  },
  {
    id: 'objet',
    kind: 'objet',
    icone: '🗝️',
    label: 'Objet',
    description: 'Propriétés, origine, légende',
    titre: () => '',
    contenu: section('Description') + section('Propriétés', puces) + section('Origine et légende'),
  },
];

/** Champs d'une nouvelle note tirée d'un modèle. */
export function depuisModele(m: ModeleNote): ModificationNote {
  return { kind: m.kind, icon: m.icone, title: m.titre(), content: m.contenu };
}
