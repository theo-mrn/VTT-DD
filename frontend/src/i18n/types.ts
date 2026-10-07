import type { MessageKeys, NestedKeyOf } from 'next-intl';
import type fr from './messages/fr';

/** Forme des catalogues : celle du français, langue de référence. */
export type Messages = typeof fr;

/** Clé complète d'un message (`'shell.nav.home'`), pour les descriptions statiques (§ 6). */
export type MessageKey = MessageKeys<Messages, NestedKeyOf<Messages>>;

/** Traduction d'un catalogue : mêmes clés, chaque texte libre. */
export type Translation<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : Translation<T[K]>;
};
