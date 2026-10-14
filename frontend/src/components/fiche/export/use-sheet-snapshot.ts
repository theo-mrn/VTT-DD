'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { ContexteFiche } from '../widgets';
import { buildSheetSnapshot } from './snapshot';

/** Instantané d'export d'une fiche, avec les libellés de la langue de la page. */
export function useSheetSnapshot() {
  const t = useTranslations('sheet.export');
  return useCallback(
    (ctx: ContexteFiche, system: string, concept?: string | null) =>
      buildSheetSnapshot(ctx, {
        system,
        concept: concept ?? null,
        rank: (n) => t('rank', { n: String(n) }),
        currency: t('currency'),
      }),
    [t],
  );
}
