/**
 * Erreurs de traduction : signalées, jamais fatales au rendu (docs/i18n.md § 4). Le repli sur
 * le français est fait au chargement des catalogues (`messages/index.ts`) ; ce qui reste
 * (argument manquant, message mal formé) affiche la clé et part à la télémétrie.
 */
import { IntlErrorCode, type IntlError } from 'next-intl';
import { reportClientError } from '@/lib/telemetry/errors';

export function onIntlError(error: IntlError) {
  // Fuseau absent pendant le rendu serveur d'un composant client : attendu (§ 5)
  if (error.code === IntlErrorCode.ENVIRONMENT_FALLBACK) return;
  if (process.env.NODE_ENV !== 'production') console.error(error);
  // Sans effet côté serveur : seul le navigateur signale
  reportClientError(error, 'i18n');
}

/** Texte affiché à la place d'un message introuvable ou mal formé : sa clé. */
export function getMessageFallback({ namespace, key }: { namespace?: string; key: string }) {
  return namespace ? `${namespace}.${key}` : key;
}
