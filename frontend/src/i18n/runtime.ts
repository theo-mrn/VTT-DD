/**
 * Traduction hors React (docs/i18n.md § 6) : moteur de la carte, canevas, callbacks, toasts.
 * Initialisé par le fournisseur avec la langue de la page, qui ne change qu'au rechargement.
 * Côté client seulement : sur le serveur, le module est partagé entre les requêtes de toutes
 * les langues, il refuse donc de servir.
 */
import { createFormatter, createTranslator, type Formats } from 'next-intl';
import { DEFAULT_LOCALE, formats, type Locale } from './config';
import { getMessageFallback, onIntlError } from './errors';
import type { Messages } from './types';

function makeTranslator(locale: Locale, messages: Messages) {
  return createTranslator({ locale, messages, onError: onIntlError, getMessageFallback });
}

type Runtime = {
  locale: Locale;
  translate: ReturnType<typeof makeTranslator>;
  format: ReturnType<typeof createFormatter>;
  collator: Intl.Collator;
};

let runtime: Runtime | null = null;
/** Tests (Node, sans `window`) : installé par `src/test/i18n.ts`. */
let outsideBrowser = false;

/** Appelé par le fournisseur, au rendu (avant tout effet des composants enfants). */
export function initI18nRuntime(locale: Locale, messages: Messages, timeZone?: string) {
  if (typeof window === 'undefined' || runtime?.locale === locale) return;
  install(locale, messages, timeZone);
}

/** Tests unitaires : le traducteur sans navigateur, dans la langue voulue. */
export function installI18nRuntimeForTests(locale: Locale, messages: Messages) {
  outsideBrowser = true;
  install(locale, messages, 'UTC');
}

function install(locale: Locale, messages: Messages, timeZone?: string) {
  runtime = {
    locale,
    translate: makeTranslator(locale, messages),
    format: createFormatter({
      locale,
      formats: formats as Formats,
      onError: onIntlError,
      ...(timeZone ? { timeZone } : {}),
    }),
    collator: new Intl.Collator(locale, { sensitivity: 'base', numeric: true }),
  };
}

function current(): Runtime {
  if (typeof window === 'undefined' && !outsideBrowser) {
    throw new Error('i18n/runtime : réservé au navigateur (useTranslations au rendu serveur)');
  }
  if (!runtime) throw new Error('i18n/runtime : fournisseur I18nProvider absent');
  return runtime;
}

/** `translate('errors.status.409')`, mêmes clés et arguments typés que `useTranslations()`. */
export const translate: Runtime['translate'] = Object.assign(
  ((...args: Parameters<Runtime['translate']>) =>
    current().translate(...args)) as Runtime['translate'],
  {
    rich: ((...args) => current().translate.rich(...args)) as Runtime['translate']['rich'],
    markup: ((...args) => current().translate.markup(...args)) as Runtime['translate']['markup'],
    raw: ((...args) => current().translate.raw(...args)) as Runtime['translate']['raw'],
    has: ((...args) => current().translate.has(...args)) as Runtime['translate']['has'],
  },
);

/** Langue de la page (navigateur), ou le français hors navigateur (tests, rendu serveur). */
export function activeLocale(): Locale {
  if (typeof window === 'undefined' && !outsideBrowser) return DEFAULT_LOCALE;
  return runtime?.locale ?? DEFAULT_LOCALE;
}

/** Formateur `Intl` de la langue de la page (dates, nombres, listes, temps relatif). */
export function formatter(): Runtime['format'] {
  return current().format;
}

/** Comparaison de textes pour un tri (accents et casse ignorés, nombres dans l'ordre). */
export function compareText(a: string, b: string): number {
  const collator =
    runtime?.collator ?? new Intl.Collator(DEFAULT_LOCALE, { sensitivity: 'base', numeric: true });
  return collator.compare(a, b);
}
