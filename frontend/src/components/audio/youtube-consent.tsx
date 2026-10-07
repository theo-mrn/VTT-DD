'use client';

/**
 * Accord au lecteur YouTube (lib/consent/youtube.ts), demandé la première fois qu'une
 * musique YouTube doit jouer. Accepter et refuser ont le même poids ; le choix se change
 * ensuite dans le profil.
 */
import { useTranslations } from 'next-intl';
import { Music } from 'lucide-react';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import {
  setYoutubeConsent,
  subscribeYoutubeConsent,
  youtubeConsent,
  youtubeConsentNeeded,
} from '@/lib/consent/youtube';
import { LEGAL_PAGES } from '@/lib/legal';

export function YoutubeConsentBanner() {
  const t = useTranslations();
  const needed = useSyncExternalStore(subscribeYoutubeConsent, youtubeConsentNeeded, () => false);
  if (!needed) return null;
  return (
    <div
      role="dialog"
      aria-label={t('audio.youtube.title')}
      className="pointer-events-auto fixed bottom-[calc(var(--table-dock-h,0px)+4.5rem)] left-1/2 z-50 flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-[13px] shadow-surface"
    >
      <Music className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1">
        {t('audio.youtube.trackers')}{' '}
        <Link
          href={`${LEGAL_PAGES.privacy}#cookies`}
          target="_blank"
          className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t('audio.youtube.more')}
        </Link>
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setYoutubeConsent('denied')}>
          {t('audio.youtube.refuse')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setYoutubeConsent('granted')}>
          {t('audio.youtube.enable')}
        </Button>
      </div>
    </div>
  );
}

/** Choix actuel, pour le réglage du profil (`null` côté serveur et avant tout choix). */
export function useYoutubeConsent() {
  return useSyncExternalStore(subscribeYoutubeConsent, youtubeConsent, () => null);
}
