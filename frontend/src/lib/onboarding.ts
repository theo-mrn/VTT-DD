/**
 * Onboarding : réponses gardées dans les préférences du profil
 * (`settings.onboarding`), donc suivies d'un appareil à l'autre.
 */
import type { Profil } from './profil';

export type RoleJeu = 'joueur' | 'mj';
export type Experience = 'decouverte' | 'initie' | 'veteran';

export interface Onboarding {
  version: 1;
  termineLe: string;
  roles: RoleJeu[];
  experience: Experience;
  systemes: string[];
}

export function lireOnboarding(profil: Profil): Onboarding | null {
  const o = profil.settings.onboarding as Partial<Onboarding> | undefined;
  return o && typeof o.termineLe === 'string' ? (o as Onboarding) : null;
}

export function onboardingTermine(profil: Profil): boolean {
  return lireOnboarding(profil) !== null;
}
