'use client';

import { useLocale } from 'next-intl';
import { useCallback, useState } from 'react';
import { modifierMonProfil } from '@/lib/profil';
import { useSession } from '@/lib/session';
import type { Locale } from './config';
import { writeLocaleCookie } from './locale-cookie';

/**
 * Changer de langue (docs/i18n.md § 3) : cookie de ce navigateur, langue du compte si l'on est
 * connecté, puis rechargement complet (les textes calculés hors React repartent tous).
 */
export function useChangeLocale() {
  const locale = useLocale();
  const { statut } = useSession();
  const [pending, setPending] = useState(false);

  const change = useCallback(
    async (next: Locale) => {
      if (next === locale || pending) return;
      setPending(true);
      writeLocaleCookie(next);
      if (statut === 'connecte') {
        // Le compte injoignable n'empêche pas ce navigateur de changer : le cookie suffit ici
        await modifierMonProfil({ locale: next }).catch(() => undefined);
      }
      window.location.reload();
    },
    [locale, pending, statut],
  );

  return { locale, change, pending };
}
