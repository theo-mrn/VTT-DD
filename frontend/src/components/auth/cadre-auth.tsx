'use client';

import { motion } from 'framer-motion';
import { Check, Clock, Swords } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { DeVisuel } from '@/components/des/de-visuel';
import { cn } from '@/lib/utils';
import { LogoYner } from '@/components/commun/logo-yner';

/**
 * Pages d'authentification : formulaire à gauche, vitrine de l'app à droite
 * (grand écran). Sert aussi aux pages de mot de passe et de vérification.
 */
export function CadreAuth({ children }: Readonly<{ children: ReactNode }>) {
  const t = useTranslations('auth.frame');
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative flex flex-col px-6 py-6 sm:px-10">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-halo" />
        <Link href="/" className="relative flex w-fit items-center gap-2.5">
          <LogoYner className="size-8 text-primary" />
          <span className="font-logo text-lg tracking-[0.18em]">YNER</span>
        </Link>
        <main className="relative flex flex-1 items-center justify-center py-10">{children}</main>
        <footer className="relative text-xs text-subtle">
          {t('footer', { year: String(new Date().getFullYear()) })}
        </footer>
      </div>
      <Vitrine />
    </div>
  );
}

// Entrée en fondu des cartes de la vitrine. Plus de flottement sans fin : trois
// cartes animées en continu sur une illustration plein cadre repeignaient la
// moitié de l'écran à chaque image.
const entree = (delai: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay: delai, ease: 'easeOut' as const },
});

function Vitrine() {
  const t = useTranslations('auth.frame.showcase');
  return (
    <aside className="relative hidden p-3 lg:block">
      <div className="relative h-full overflow-hidden rounded-[28px] border border-border">
        <Illustration
          src="https://assets.yner.fr/Map/Chateau/Illustration/Cragwind Castle_Night02_static.webp"
          graine="Cragwind" // i18n-ignore
          initiale={false}
          className="absolute inset-0"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/90"
        />
        <div aria-hidden className="absolute inset-0 bg-grid opacity-40 mask-radial" />

        {/* Cartes flottantes : un aperçu de l'app, pas une capture */}
        <div className="absolute inset-0">
          <motion.div
            {...entree(0.2)}
            className="absolute left-[8%] top-[12%] w-64 rounded-2xl border border-white/10 bg-black/70 p-4 shadow-elevated"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-white/50">
              {t('attackRoll')}
            </p>
            <div className="mt-3 flex items-center gap-4">
              <DeVisuel faces={20} valeur={20} etat="critique" taille="lg" />
              <div>
                <p className="font-mono text-4xl font-bold leading-none text-gradient-primary">
                  25
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-primary">
                  {t('critical')}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            {...entree(0.5)}
            className="absolute right-[7%] top-[30%] w-72 overflow-hidden rounded-2xl border border-white/10 bg-black/70 shadow-elevated"
          >
            <Illustration
              src="https://assets.yner.fr/Map/Cimetiere/Illustration/Graveyard_illustration_Night_04.webp"
              graine="La Crypte d'Ashenvale" // i18n-ignore
              largeur={288}
              className="h-24"
              voile
            />
            <div className="space-y-3 p-4">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary">
                  <Swords className="size-3" /> {t('campaign')}
                </p>
                <p className="mt-1 font-display text-lg font-semibold text-white">
                  {t('campaignName')}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex -space-x-2">
                  {['M', 'K', 'L', 'B'].map((l, i) => (
                    <span
                      key={l}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-full border-2 border-black text-[11px] font-semibold text-white',
                        ['bg-amber-700', 'bg-sky-700', 'bg-emerald-700', 'bg-violet-700'][i],
                      )}
                    >
                      {l}
                    </span>
                  ))}
                </div>
                <span className="flex items-center gap-1 text-xs text-white/60">
                  <Clock className="size-3" /> {t('tonight')}
                </span>
              </div>
            </div>
          </motion.div>

          <motion.div
            {...entree(0.8)}
            className="absolute bottom-[26%] left-[14%] w-60 rounded-2xl border border-white/10 bg-black/70 p-4 shadow-elevated"
          >
            <div className="flex items-center gap-3">
              <Illustration
                src="https://assets.yner.fr/images/races/Elfe.webp"
                graine="Aelys" // i18n-ignore
                largeur={44}
                position="top"
                className="size-11 rounded-xl ring-1 ring-white/15"
              />
              <div>
                <p className="font-display text-base font-semibold text-white">Aelys</p>
                <p className="text-xs text-white/55">{t('heroLine')}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[11px] text-white/60">
                <span>{t('hitPoints')}</span>
                <span className="font-mono">18 / 24</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300" />
              </div>
            </div>
          </motion.div>
        </div>

        <div className="absolute inset-x-0 bottom-0 p-10">
          <h2 className="max-w-md text-balance text-3xl font-semibold tracking-tight text-white">
            {t.rich('title', {
              accent: (chunks) => <span className="text-gradient-primary">{chunks}</span>,
            })}
          </h2>
          <ul className="mt-5 grid max-w-lg gap-2 text-sm text-white/70">
            {(['first', 'second', 'third'] as const).map((point) => (
              <li key={point} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                {t(`points.${point}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
