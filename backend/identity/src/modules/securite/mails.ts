/**
 * E-mails de sécurité. Leur texte est dans les templates Kourrier
 * (infra/mails/templates/yner/<modele>/fr/) : ici, seulement le choix du template
 * et ses données. Le lien est à usage unique : il n'apparaît que dans le message,
 * jamais dans les logs.
 */
import type { Mail } from '../../mail/mailer.js';

export function mailReinitialisation(to: string, lien: string): Mail {
  return { to, modele: 'reinitialisation', donnees: { lien } };
}

export function mailVerification(to: string, lien: string): Mail {
  return { to, modele: 'verification', donnees: { lien } };
}

/** Échéance en clair pour les e-mails : « 12 octobre 2026 ». */
export function dateMail(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

/** Suppression demandée : date de la purge, lien pour se reconnecter et l'annuler. */
export function mailSuppressionProgrammee(to: string, lienConnexion: string, purge: Date): Mail {
  return {
    to,
    modele: 'suppression-programmee',
    donnees: { lien: lienConnexion, date: dateMail(purge) },
  };
}

/** Compte inactif : sans visite avant cette date, la suppression sera demandée. */
export function mailInactivite(to: string, lienConnexion: string, echeance: Date): Mail {
  return { to, modele: 'inactivite', donnees: { lien: lienConnexion, date: dateMail(echeance) } };
}
