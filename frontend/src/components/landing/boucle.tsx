'use client';

/**
 * Boucle vidéo muette de la landing (séquences filmées dans l'app, promotion/landing.mjs), servie
 * par R2. Sources posées à 300 px de l'écran, lecture seulement quand la vidéo est vraiment à
 * l'écran, reprise au retour sur l'onglet. Si le navigateur refuse la lecture automatique (mode
 * économie d'énergie, réglages) ou si l'utilisateur réduit les animations, l'image fixe reste et un
 * bouton lance la vidéo.
 */
import { Play } from '@phosphor-icons/react/ssr';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { LANDING_MEDIA } from './media';

export function Boucle({
  nom,
  alt,
  className,
  ratio = '16 / 9',
}: Readonly<{ nom: string; alt: string; className?: string; ratio?: string }>) {
  const t = useTranslations('landing');
  const ref = useRef<HTMLVideoElement>(null);
  const visible = useRef(false);
  const [proche, setProche] = useState(false);
  const [reduit, setReduit] = useState(false);
  const [demandee, setDemandee] = useState(false);
  const [bloquee, setBloquee] = useState(false);

  const jouer = useCallback(() => {
    const video = ref.current;
    if (!video || !visible.current) return;
    video
      .play()
      .then(() => setBloquee(false))
      .catch((e: unknown) => {
        // Lecture automatique refusée : on laisse la main à l'utilisateur
        if (e instanceof DOMException && e.name === 'NotAllowedError') setBloquee(true);
      });
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    setReduit(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const approche = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        setProche(true);
        approche.disconnect();
      },
      { rootMargin: '300px 0px' },
    );
    const ecran = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        visible.current = e.isIntersecting;
        if (e.isIntersecting) jouer();
        else video.pause();
      },
      { threshold: 0.15 },
    );
    const retour = () => {
      if (document.visibilityState === 'visible') jouer();
    };
    approche.observe(video);
    ecran.observe(video);
    document.addEventListener('visibilitychange', retour);
    return () => {
      approche.disconnect();
      ecran.disconnect();
      document.removeEventListener('visibilitychange', retour);
    };
  }, [jouer]);

  // Sources posées après le premier rendu : la vidéo les relit, et part dès qu'elle peut jouer
  // (un play() lancé avant d'avoir des données est perdu) si elle est à l'écran
  const active = proche && (!reduit || demandee);
  useEffect(() => {
    const video = ref.current;
    if (!video || !active) return;
    video.addEventListener('canplay', jouer);
    video.load();
    return () => video.removeEventListener('canplay', jouer);
  }, [active, jouer]);

  const lancer = () => {
    setDemandee(true);
    // Geste de l'utilisateur : la lecture est permise, même si elle avait été refusée
    if (bloquee) void ref.current?.play().then(() => setBloquee(false));
  };

  return (
    <div className="relative">
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="none"
        poster={`${LANDING_MEDIA}/${nom}.webp`}
        aria-label={alt}
        className={cn('block h-auto w-full object-cover', className)}
        style={{ aspectRatio: ratio }}
      >
        {active && <source src={`${LANDING_MEDIA}/${nom}.webm`} type="video/webm" />}
        {active && <source src={`${LANDING_MEDIA}/${nom}.mp4`} type="video/mp4" />}
      </video>
      {((reduit && !demandee) || bloquee) && (
        <button
          type="button"
          onClick={lancer}
          aria-label={t('play')}
          className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-foreground backdrop-blur transition-transform duration-300 ease-weighted hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
        >
          <Play weight="fill" className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
