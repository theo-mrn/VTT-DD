import {
  CreditCard,
  Dices,
  Home,
  KeyRound,
  Library,
  Shield,
  Swords,
  User,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PAIEMENTS } from '@/lib/soutien';

export interface LienNav {
  href: string;
  label: string;
  icone: LucideIcon;
  /** Actif seulement sur ce chemin exact (sinon aussi sur ses sous-pages). */
  exact?: boolean;
  /** Raccourci affiché dans la palette de commandes. */
  raccourci?: string;
}

/** Espaces principaux de l'app, dans l'ordre de la barre latérale. */
export const NAV_PRINCIPALE: LienNav[] = [
  { href: '/accueil', label: 'Accueil', icone: Home },
  { href: '/campagnes', label: 'Campagnes', icone: Swords },
  { href: '/personnages', label: 'Personnages', icone: UserRound },
  { href: '/resources', label: 'Ressources', icone: Library },
  { href: '/des', label: 'Dés', icone: Dices },
];

export const NAV_SOCIALE: LienNav[] = [{ href: '/amis', label: 'Amis', icone: Users }];

/** Pages de compte (menu utilisateur, landing page). */
export const LIENS_COMPTE: LienNav[] = [
  { href: '/profil', label: 'Profil', icone: User, exact: true },
  { href: '/profil/securite', label: 'Sécurité', icone: Shield },
  { href: '/profil/cles-api', label: "Clés d'API", icone: KeyRound },
  ...(PAIEMENTS ? [{ href: '/profil/abonnement', label: 'Abonnement', icone: CreditCard }] : []),
];

export function estActif(lien: LienNav, chemin: string) {
  return lien.exact
    ? chemin === lien.href
    : chemin === lien.href || chemin.startsWith(`${lien.href}/`);
}

/** Libellés des segments d'URL pour le fil d'Ariane. */
export const LIBELLES_SEGMENTS: Record<string, string> = {
  accueil: 'Accueil',
  campagnes: 'Campagnes',
  nouvelle: 'Nouvelle campagne',
  personnages: 'Personnages',
  nouveau: 'Nouveau personnage',
  des: 'Dés',
  resources: 'Ressources',
  notes: 'Notes',
  amis: 'Amis',
  profil: 'Profil',
  securite: 'Sécurité',
  'cles-api': "Clés d'API",
  abonnement: 'Abonnement',
  paiement: 'Paiement',
  succes: 'Confirmé',
  annule: 'Annulé',
  joueurs: 'Joueurs',
};
