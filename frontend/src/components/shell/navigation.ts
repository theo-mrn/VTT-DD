import {
  CreditCard,
  Dices,
  Home,
  Keyboard,
  KeyRound,
  Library,
  Shield,
  Swords,
  User,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Messages } from '@/i18n/types';

/** Libellé d'un espace : clé de `shell.nav` (docs/i18n.md § 6). */
export type NavLabel = keyof Messages['shell']['nav'];

export interface LienNav {
  href: string;
  label: NavLabel;
  icone: LucideIcon;
  /** Actif seulement sur ce chemin exact (sinon aussi sur ses sous-pages). */
  exact?: boolean;
  /** Raccourci affiché dans la palette de commandes. */
  raccourci?: string;
}

/** Espaces principaux de l'app, dans l'ordre de la barre latérale. */
export const NAV_PRINCIPALE: LienNav[] = [
  { href: '/accueil', label: 'home', icone: Home },
  { href: '/campagnes', label: 'campaigns', icone: Swords },
  { href: '/personnages', label: 'characters', icone: UserRound },
  { href: '/resources', label: 'resources', icone: Library },
  { href: '/des', label: 'dice', icone: Dices },
];

export const NAV_SOCIALE: LienNav[] = [{ href: '/amis', label: 'friends', icone: Users }];

/** Pages de compte (menu utilisateur, landing page). */
export const LIENS_COMPTE: LienNav[] = [
  { href: '/profil', label: 'profile', icone: User, exact: true },
  { href: '/profil/securite', label: 'security', icone: Shield },
  { href: '/profil/raccourcis', label: 'shortcuts', icone: Keyboard },
  { href: '/profil/cles-api', label: 'apiKeys', icone: KeyRound },
  { href: '/profil/abonnement', label: 'subscription', icone: CreditCard },
];

export function estActif(lien: LienNav, chemin: string) {
  return lien.exact
    ? chemin === lien.href
    : chemin === lien.href || chemin.startsWith(`${lien.href}/`);
}

/** Libellés des segments d'URL pour le fil d'Ariane (clés de `shell.nav`). */
export const LIBELLES_SEGMENTS: Partial<Record<string, NavLabel>> = {
  accueil: 'home',
  campagnes: 'campaigns',
  nouvelle: 'newCampaign',
  personnages: 'characters',
  nouveau: 'newCharacter',
  des: 'dice',
  resources: 'resources',
  notes: 'notes',
  amis: 'friends',
  profil: 'profile',
  securite: 'security',
  raccourcis: 'shortcuts',
  'cles-api': 'apiKeys',
  abonnement: 'subscription',
  paiement: 'payment',
  succes: 'paymentSuccess',
  annule: 'paymentCancelled',
  joueurs: 'players',
};
