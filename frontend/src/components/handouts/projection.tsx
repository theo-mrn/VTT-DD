'use client';

/**
 * Projection plein écran (docs/projection.md), montée par la table pour tous : le document que
 * le MJ projette s'affiche au-dessus de tout. Chacun la ferme pour lui (Échap, clic à côté,
 * bouton) ; le MJ l'arrête pour tous. Une vidéo part au même instant chez tous (heure du
 * serveur), avec son son réglé par le mixeur (bus musique) ; arrivé en retard, on la rejoint à
 * la bonne position.
 */
import { useTranslations } from 'next-intl';
import type { SharedDocument } from '@vtt/contracts';
import { Square, Volume2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { messageErreur } from '@/lib/api';
import { useMixer } from '@/lib/audio';
import { handoutsApi, isVideo, useDocuments } from '@/lib/handouts';

const CLOSED_KEY = 'vtt:projection:closed';

/** Projections fermées par moi (identifiants de partage), gardées dans ce navigateur. */
function readClosed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function Projection({ campaignId, gm }: Readonly<{ campaignId: string; gm: boolean }>) {
  const t = useTranslations();
  const docs = useDocuments(campaignId);
  const [closed, setClosed] = useState<string[]>(() => readClosed());
  const projection = docs.data?.projection ?? null;
  const shown = projection && !closed.includes(projection.id) ? projection : null;

  const close = (id: string) => {
    const next = [...closed.filter((x) => x !== id), id].slice(-50);
    setClosed(next);
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify(next));
    } catch {
      // Navigation privée : fermée pour cette page seulement
    }
  };

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(shown.id);
    };
    // Fenêtre, en capture : avant les raccourcis de la table (Échap fermerait aussi un panneau)
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          role="dialog"
          aria-modal="true"
          aria-label={`Projection : ${shown.handout.name}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => close(shown.id)}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/90 p-4 backdrop-blur-sm sm:p-10"
        >
          <motion.figure
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full max-w-full flex-col items-center gap-3"
          >
            {isVideo(shown.handout.contentType) ? (
              <SyncedVideo doc={shown} offsetMs={docs.data?.offsetMs ?? 0} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shown.handout.url}
                alt={shown.handout.name}
                className="max-h-[calc(100dvh-8rem)] max-w-full rounded-xl object-contain shadow-2xl"
              />
            )}
            <figcaption className="text-sm font-medium text-white/85">
              {shown.handout.name}
            </figcaption>
          </motion.figure>

          <div className="absolute right-4 top-4 flex items-center gap-2">
            {gm && (
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handoutsApi
                    .stop(campaignId, shown.id)
                    .catch((err) =>
                      toast.error(t('handouts.stopFailed'), { description: messageErreur(err) }),
                    );
                }}
              >
                <Square />
                {t('handouts.stopForAll')}
              </Button>
            )}
            <Button
              variant="secondary"
              size="icon-sm"
              aria-label={t('common.actions.close')}
              onClick={(e) => {
                e.stopPropagation();
                close(shown.id);
              }}
            >
              <X />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Vidéo projetée : départ à `startsAt` (heure du serveur), position recalée si on arrive en
 * retard ; volume du mixeur (général × musique). Lecture avec le son refusée par le navigateur :
 * elle part muette, un bouton rétablit le son.
 */
function SyncedVideo({ doc, offsetMs }: Readonly<{ doc: SharedDocument; offsetMs: number }>) {
  const t = useTranslations();
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const { volumes, muted } = useMixer();
  const volume = muted?.master || muted?.music ? 0 : (volumes?.master ?? 1) * (volumes?.music ?? 1);

  useEffect(() => {
    const v = ref.current;
    if (v) v.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      const late = (Date.now() + offsetMs - Date.parse(doc.startsAt)) / 1000;
      if (late > 0 && Number.isFinite(v.duration) && late < v.duration) v.currentTime = late;
      v.play().catch(() => {
        // Lecture automatique avec le son refusée : muette, le son se rétablit d'un clic
        v.muted = true;
        setBlocked(true);
        void v.play().catch(() => undefined);
      });
    };
    const wait = Date.parse(doc.startsAt) - (Date.now() + offsetMs);
    const go = () => (wait > 0 ? (timer = setTimeout(start, wait)) : start());
    if (v.readyState >= 1) go();
    else v.addEventListener('loadedmetadata', go, { once: true });
    return () => {
      if (timer) clearTimeout(timer);
      v.removeEventListener('loadedmetadata', go);
      v.pause();
    };
  }, [doc.id, doc.startsAt, offsetMs]);

  return (
    <div className="relative">
      <video
        ref={ref}
        src={doc.handout.url}
        preload="auto"
        playsInline
        controls={false}
        className="max-h-[calc(100dvh-8rem)] max-w-full rounded-xl shadow-2xl"
      />
      {blocked && (
        <Button
          size="sm"
          className="absolute bottom-3 left-1/2 -translate-x-1/2"
          onClick={() => {
            const v = ref.current;
            if (!v) return;
            v.muted = false;
            setBlocked(false);
          }}
        >
          <Volume2 />
          {t('handouts.unmute')}
        </Button>
      )}
    </div>
  );
}
