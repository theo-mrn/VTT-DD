/**
 * Modèles de notes : une structure de départ par usage courant à la table,
 * pour ne jamais partir d'une page blanche.
 */
import type { Messages } from '@/i18n/types';
import { formatter, translate } from '@/i18n/runtime';
import type { ModificationNote, TypeNote } from '@/lib/notes';

/** Un modèle ; nom et description : `notes.templates.<id>.label|description`. */
export interface ModeleNote {
  id: 'session' | 'pnj' | 'lieu' | 'quete' | 'objet';
  kind: TypeNote;
  icone: string;
  /** Titre proposé (calculé à la création : la date du jour, par exemple). */
  titre: () => string;
  /** Structure de départ, dans la langue de l'utilisateur au moment de la création. */
  contenu: () => string;
}

const vide = '<p></p>';
const puces = '<ul><li><p></p></li></ul>';
type Section = keyof Messages['notes']['templates']['sections'];
const section = (titre: Section, corps = vide) =>
  `<h2>${translate(`notes.templates.sections.${titre}`)}</h2>${corps}`;

export const MODELES_NOTE: ModeleNote[] = [
  {
    id: 'session',
    kind: 'journal',
    icone: '📖',
    titre: () =>
      translate('notes.templates.sessionTitle', {
        date: formatter().dateTime(new Date(), { day: 'numeric', month: 'long' }),
      }),
    contenu: () =>
      section('summary') +
      section('highlights', puces) +
      section('loot', puces) +
      section('leads', puces),
  },
  {
    id: 'pnj',
    kind: 'personnage',
    icone: '🧙',
    titre: () => '',
    contenu: () =>
      section('appearance') +
      section('personality') +
      section('motivations') +
      section('secrets', '<blockquote><p></p></blockquote>'),
  },
  {
    id: 'lieu',
    kind: 'lieu',
    icone: '🏰',
    titre: () => '',
    contenu: () =>
      section('description') +
      section('mood') +
      section('inhabitants', puces) +
      section('pointsOfInterest', puces),
  },
  {
    id: 'quete',
    kind: 'quete',
    icone: '🧭',
    titre: () => '',
    contenu: () =>
      section('goal') +
      section('patron') +
      section('steps', '<ol><li><p></p></li></ol>') +
      section('reward'),
  },
  {
    id: 'objet',
    kind: 'objet',
    icone: '🗝️',
    titre: () => '',
    contenu: () => section('description') + section('properties', puces) + section('origin'),
  },
];

/** Champs d'une nouvelle note tirée d'un modèle. */
export function depuisModele(m: ModeleNote): ModificationNote {
  return { kind: m.kind, icon: m.icone, title: m.titre(), content: m.contenu() };
}
