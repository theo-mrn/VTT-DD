'use client';

import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';
import { writeLocaleCookie } from './locale-cookie';

const ATTEMPT_KEY = 'yner:locale-sync';

/**
 * La langue du compte suit l'utilisateur sur ses appareils (docs/i18n.md § 3) : une fois le
 * profil chargé, si elle diffère de celle affichée, le cookie est réécrit et la page rechargée.
 * Une seule tentative par onglet, et aucune si le cookie ne peut pas être écrit.
 */
export function LocaleSync() {
  const { profil } = useSession();
  const locale = useLocale();
  const wanted = profil?.locale ?? null;

  useEffect(() => {
    if (!wanted || wanted === locale) return;
    try {
      if (sessionStorage.getItem(ATTEMPT_KEY) === wanted) return;
      sessionStorage.setItem(ATTEMPT_KEY, wanted);
    } catch {
      return;
    }
    if (writeLocaleCookie(wanted)) window.location.reload();
  }, [wanted, locale]);

  return null;
}
