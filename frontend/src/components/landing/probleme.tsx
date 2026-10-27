'use client';

import {
  ChatsCircle,
  DiceFive,
  FileText,
  MapTrifold,
  MusicNotes,
  Check,
} from '@phosphor-icons/react/ssr';
import { MotionConfig, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Apparition, EASE } from './apparition';

/** Ce qu'une partie en ligne demande d'ordinaire, chaque fois remplacé par la table. */
const OUTILS = [
  { id: 'map', Icone: MapTrifold },
  { id: 'sheets', Icone: FileText },
  { id: 'dice', Icone: DiceFive },
  { id: 'voice', Icone: ChatsCircle },
  { id: 'music', Icone: MusicNotes },
] as const;

/** Une étape du remplacement, rangée par rangée : l'ancien outil barré, puis la table. */
const temps = (rangee: number, etape: number) => ({
  duration: 0.5,
  ease: EASE,
  delay: 0.3 + rangee * 0.15 + etape * 0.25,
});

/**
 * Le problème (cinq outils pour une partie), puis la réponse : une seule table. À l'arrivée,
 * chaque ancien outil se barre et laisse place à la table.
 */
export function Probleme() {
  const t = useTranslations('landing.problem');
  return (
    <section className="px-4 py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <Apparition>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-6 text-pretty text-lg text-muted-foreground">{t('text')}</p>
          <p className="mt-6 text-pretty text-lg text-foreground">{t('answer')}</p>
        </Apparition>
        <Apparition delai={0.1}>
          <MotionConfig reducedMotion="user">
            <ul className="rounded-2xl border border-white/10 bg-[#181818] p-2">
              {OUTILS.map(({ id, Icone }, i) => (
                <li key={id} className="flex items-center gap-4 rounded-lg px-4 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#272727] text-muted-foreground">
                    <Icone className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <s className="relative block w-fit text-sm text-subtle no-underline">
                      {t(`tools.${id}.before`)}
                      <motion.span
                        aria-hidden
                        className="absolute inset-x-0 top-1/2 h-px origin-left bg-white/40"
                        initial={{ scaleX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={temps(i, 0)}
                      />
                    </s>
                    <motion.span
                      className="block text-base font-semibold text-foreground"
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={temps(i, 1)}
                    >
                      {t(`tools.${id}.after`)}
                    </motion.span>
                  </span>
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={temps(i, 2)}
                  >
                    <Check weight="bold" className="size-5 shrink-0 text-primary" aria-hidden />
                  </motion.span>
                </li>
              ))}
            </ul>
          </MotionConfig>
        </Apparition>
      </div>
    </section>
  );
}
