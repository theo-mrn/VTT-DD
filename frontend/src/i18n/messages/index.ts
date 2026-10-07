/**
 * Catalogues par langue (serveur seulement : le client reçoit ceux de sa langue par le
 * fournisseur). Une langue est fusionnée sur le français : une clé absente s'affiche en
 * français, jamais sous forme de clé (docs/i18n.md § 4).
 */
import { DEFAULT_LOCALE, type Locale } from '../config';
import type { Messages, Translation } from '../types';
import en from './en';
import fr from './fr';

export const CATALOGS: Record<Locale, Translation<Messages>> = { fr, en };

type Tree = { readonly [key: string]: string | Tree };

/** Copie de `base` où chaque texte présent dans `over` remplace le sien. */
export function mergeOnto(base: Tree, over: Tree | undefined): Tree {
  if (!over) return base;
  const out: Record<string, string | Tree> = {};
  for (const [key, value] of Object.entries(base)) {
    const replacement = over[key];
    if (typeof value === 'string') {
      out[key] = typeof replacement === 'string' && replacement !== '' ? replacement : value;
    } else {
      out[key] = mergeOnto(value, typeof replacement === 'object' ? replacement : undefined);
    }
  }
  return out;
}

const merged = new Map<Locale, Messages>();

export function loadMessages(locale: Locale): Messages {
  if (locale === DEFAULT_LOCALE) return fr;
  let messages = merged.get(locale);
  if (!messages) {
    messages = mergeOnto(fr, CATALOGS[locale]) as Messages;
    merged.set(locale, messages);
  }
  return messages;
}
