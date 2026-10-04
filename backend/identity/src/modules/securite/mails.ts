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
