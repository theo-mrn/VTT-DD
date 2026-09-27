/**
 * Onboarding : réponses gardées dans les préférences du profil
 * (`settings.onboarding`), donc suivies d'un appareil à l'autre.
 */
import type { Profil } from './profil';

/**
 * Version 2 : l'onboarding ne demande plus ni rôle, ni expérience, ni systèmes
 * préférés (le système vient toujours de la campagne). Un profil en version 1 est
 * lu comme terminé, ses anciennes réponses sont ignorées.
 */
export interface Onboarding {
  version: 1 | 2;
  termineLe: string;
}

export function lireOnboarding(profil: Profil): Onboarding | null {
  const o = profil.settings.onboarding as Partial<Onboarding> | undefined;
  return o && typeof o.termineLe === 'string' ? (o as Onboarding) : null;
}

export function onboardingTermine(profil: Profil): boolean {
  return lireOnboarding(profil) !== null;
}
