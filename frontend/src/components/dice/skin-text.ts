'use client';

/**
 * Nom et description d'un skin de dés dans la langue de la page (`diceSkins.<id>`,
 * docs/i18n.md § 6) ; un id inconnu du catalogue s'affiche tel quel.
 */
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { Messages } from '@/i18n/types';

export type SkinTextId = keyof Messages['diceSkins'];

export function useSkinText() {
  const t = useTranslations('diceSkins');
  return useMemo(() => {
    const known = (id: string): id is SkinTextId => t.has(`${id as SkinTextId}.name`);
    return {
      name: (id: string) => (known(id) ? t(`${id}.name`) : id),
      description: (id: string) => (known(id) ? t(`${id}.description`) : null),
    };
  }, [t]);
}
