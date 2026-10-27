'use client';

import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LogoYner } from '@/components/commun/logo-yner';
import { cn } from '@/lib/utils';
import { EASE } from './apparition';
import { BoutonCommencer, LienConnexion, SURVOL } from './boutons';

/** Ancres de la page, dans l'ordre de lecture (`landing.nav.<id>`). */
const SECTIONS = ['benefices', 'etapes', 'faq'] as const;

/** Section à l'écran : son lien de la barre est marqué courant. */
function useSectionCourante() {
  const [courante, setCourante] = useState<string | null>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) if (e.isIntersecting) setCourante(e.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const id of SECTIONS) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, []);
  return courante;
}

/**
 * Barre flottante, détachée du haut et ajustée à son contenu, translucide sur un flou. Sur
 * mobile, un panneau plein écran dont les liens arrivent l'un après l'autre.
 */
export function Navigation() {
  const t = useTranslations('landing.nav');
  const [ouvert, setOuvert] = useState(false);
  const courante = useSectionCourante();

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', fermer);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', fermer);
    };
  }, [ouvert]);

  return (
    <MotionConfig reducedMotion="user">
      <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        <nav
          aria-label={t('label')}
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#181818]/70 p-2 backdrop-blur-xl"
        >
          <Link
            href="/"
            aria-label={t('home')}
            aria-current="page"
            className="flex items-center gap-2 rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogoYner className="size-6 text-primary" />
            <span className="text-sm font-semibold tracking-widest text-foreground">YNER</span>
          </Link>
          <ul className="hidden items-center gap-1 md:flex">
            {SECTIONS.map((id) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={courante === id ? 'location' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    SURVOL,
                    courante === id ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {t(id)}
                </a>
              </li>
            ))}
          </ul>
          <LienConnexion className="hidden md:inline-flex" />
          <BoutonCommencer compact libelle={t('start')} />
          <button
            type="button"
            aria-expanded={ouvert}
            aria-controls="menu-landing"
            aria-label={ouvert ? t('closeMenu') : t('openMenu')}
            onClick={() => setOuvert((o) => !o)}
            className="relative grid size-10 place-items-center rounded-lg text-foreground hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
          >
            {/* Deux traits qui se croisent en X à l'ouverture */}
            <span
              aria-hidden
              className={cn(
                'absolute h-0.5 w-4 rounded-full bg-current transition-transform',
                SURVOL,
                ouvert ? 'rotate-45' : '-translate-y-1',
              )}
            />
            <span
              aria-hidden
              className={cn(
                'absolute h-0.5 w-4 rounded-full bg-current transition-transform',
                SURVOL,
                ouvert ? '-rotate-45' : 'translate-y-1',
              )}
            />
          </button>
        </nav>
      </header>

      <AnimatePresence>
        {ouvert && (
          <motion.div
            id="menu-landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="fixed inset-0 z-40 flex flex-col bg-black/90 px-6 pt-24 backdrop-blur-2xl md:hidden"
          >
            <ul className="flex flex-col gap-2">
              {[
                ...SECTIONS.map((id) => ({ id, href: `#${id}`, label: t(id) })),
                { id: 'connexion', href: '/connexion', label: t('signIn') },
              ].map((l, i) => (
                <motion.li
                  key={l.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: Math.min(i * 0.06, 0.4) }}
                >
                  <a
                    href={l.href}
                    onClick={() => setOuvert(false)}
                    className="block rounded-lg py-3 text-3xl font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
