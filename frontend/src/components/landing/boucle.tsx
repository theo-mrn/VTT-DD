'use client';

/**
 * Boucle vidéo muette de la landing (séquences filmées dans l'app, promotion/landing.mjs), servie
 * par R2. Sources posées à l'approche, lecture seulement à l'écran ; image fixe si l'utilisateur
 * réduit les animations.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { LANDING_MEDIA } from './media';

export function Boucle({
  nom,
  alt,
  className,
  ratio = '16 / 9',
}: Readonly<{ nom: string; alt: string; className?: string; ratio?: string }>) {
  const ref = useRef<HTMLVideoElement>(null);
  const visible = useRef(false);
  const [proche, setProche] = useState(false);
  const [reduit, setReduit] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    setReduit(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        if (e.isIntersecting) setProche(true);
        visible.current = e.intersectionRatio > 0.25;
        if (visible.current) void video.play().catch(() => undefined);
        else video.pause();
      },
      { rootMargin: '300px 0px', threshold: [0, 0.25] },
    );
    obs.observe(video);
    return () => obs.disconnect();
  }, []);

  // Sources posées après le premier rendu : la vidéo les relit, et part dès qu'elle peut jouer
  // (un play() lancé avant d'avoir des données est perdu) si elle est à l'écran
  useEffect(() => {
    const video = ref.current;
    if (!video || !proche || reduit) return;
    const partir = () => {
      if (visible.current) void video.play().catch(() => undefined);
    };
    video.addEventListener('canplay', partir);
    video.load();
    return () => video.removeEventListener('canplay', partir);
  }, [proche, reduit]);

  return (
    <video
      ref={ref}
      muted
      loop
      autoPlay={proche && !reduit}
      playsInline
      preload="none"
      poster={`${LANDING_MEDIA}/${nom}.webp`}
      aria-label={alt}
      className={cn('h-auto w-full object-cover', className)}
      style={{ aspectRatio: ratio }}
    >
      {proche && !reduit && <source src={`${LANDING_MEDIA}/${nom}.webm`} type="video/webm" />}
      {proche && !reduit && <source src={`${LANDING_MEDIA}/${nom}.mp4`} type="video/mp4" />}
    </video>
  );
}
