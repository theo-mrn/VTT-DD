/**
 * Libellé d'une description statique (docs/i18n.md § 6) : une clé du catalogue, un calcul à
 * partir du traducteur (valeurs, libellé composé), ou un texte libre saisi par le joueur.
 */
'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { translate } from './runtime';
import type { MessageKey } from './types';

/** Traducteur sans vérification des arguments : clés venues de données (descriptions). */
export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export type Text = MessageKey | { text: string } | ((t: Translate) => string);

export function textOf(text: Text, t: Translate): string {
  if (typeof text === 'function') return text(t);
  if (typeof text === 'string') return t(text);
  return text.text;
}

/** Traducteur racine, typé pour les clés venues de descriptions. */
export function useTranslate(): Translate {
  return useTranslations() as unknown as Translate;
}

/** Hors React (navigateur, tests). */
export function textNow(text: Text): string {
  return textOf(text, translate as unknown as Translate);
}

/** `(texte) => string` dans la langue de la page. */
export function useText(): (text: Text) => string {
  const t = useTranslate();
  return useCallback((text: Text) => textOf(text, t), [t]);
}
