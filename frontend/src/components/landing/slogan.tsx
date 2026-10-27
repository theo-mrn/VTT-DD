'use client';

/**
 * La phrase de la page, en grand : chaque mot part atténué (30 %) et s'allume à son tour, dans
 * l'ordre de lecture, à mesure que la section traverse l'écran. Un seul écouteur de défilement,
 * passif, cadencé par requestAnimationFrame ; les mots allumés le restent.
 */
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function Slogan() {
  const t = useTranslations('landing.tagline');
  const lignes = [t('first'), t('second')];
  const mots = lignes.map((l) => l.split(' '));
  const total = mots.reduce((n, l) => n + l.length, 0);
  const ref = useRef<HTMLElement>(null);
  const [allumes, setAllumes] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAllumes(total);
      return;
    }
    let image = 0;
    const mesurer = () => {
      image = 0;
      const r = el.getBoundingClientRect();
      // De l'entrée de la section par le bas jusqu'au tiers haut de l'écran
      const debut = window.innerHeight * 0.85;
      const fin = window.innerHeight * 0.35;
      const avance = (debut - r.top) / Math.max(1, debut - fin + r.height * 0.3);
      setAllumes((n) => Math.max(n, Math.min(total, Math.floor(avance * total))));
    };
    const surDefilement = () => {
      if (!image) image = requestAnimationFrame(mesurer);
    };
    mesurer();
    window.addEventListener('scroll', surDefilement, { passive: true });
    return () => {
      window.removeEventListener('scroll', surDefilement);
      if (image) cancelAnimationFrame(image);
    };
  }, [total]);

  let index = 0;
  return (
    <section ref={ref} className="px-4 py-24">
      <p className="sr-only">{lignes.join(' ')}</p>
      <p
        aria-hidden
        className="mx-auto max-w-[680px] text-balance text-center text-4xl font-semibold tracking-tight text-foreground sm:text-5xl"
      >
        {mots.map((ligne, l) => (
          <span key={l} className="block">
            {ligne.map((mot, m) => {
              const i = index++;
              return (
                <span
                  key={m}
                  className={cn(
                    'transition-opacity duration-500 ease-weighted',
                    i < allumes ? 'opacity-100' : 'opacity-30',
                  )}
                >
                  {mot}
                  {m < ligne.length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </span>
        ))}
      </p>
    </section>
  );
}
