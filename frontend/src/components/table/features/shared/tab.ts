import { randomId } from '@/lib/random-id';

/**
 * Identifiant de cet onglet : un même compte peut avoir plusieurs onglets à la table (MJ sur
 * deux écrans, test en double). On ignore ses propres envois par onglet, jamais par utilisateur,
 * sinon ses autres onglets ne recevraient rien.
 */
export const TAB_ID = randomId();

/** Message d'état : la valeur et l'onglet qui l'envoie. */
export interface TabMessage<T = unknown> {
  tab: string;
  value: T;
}

export const wrap = <T>(value: T): TabMessage<T> => ({ tab: TAB_ID, value });

/** Valeur d'un message d'un autre onglet ; `undefined` s'il vient de cet onglet ou est illisible. */
export function unwrap(data: unknown): { value: unknown } | undefined {
  if (!data || typeof data !== 'object' || !('tab' in data)) return undefined;
  const m = data as TabMessage;
  return m.tab === TAB_ID ? undefined : { value: m.value };
}
