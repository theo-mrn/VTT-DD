'use client';

import { Check } from '@phosphor-icons/react/ssr';
import { MotionConfig, motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Apparition, EASE } from './apparition';

const ETAPES = ['create', 'invite', 'play'] as const;
const SYSTEMES = ['dnd', 'nooblies', 'starwars'] as const;
const CODE = 'K7Q2XM'; // i18n-ignore : code de campagne d'exemple
const JOUEURS = ['L', 'M', 'I', 'T']; // i18n-ignore : initiales d'exemple

/** Arrivée d'un détail d'illustration, après celle de sa carte. */
const detail = (i: number, base = 0.3) => ({
  initial: { opacity: 0, y: 8 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, ease: EASE, delay: base + i * 0.08 },
});

/**
 * Comment ça marche : trois étapes reliées par une ligne qui se remplit au défilement, chacune
 * illustrée (choix du système, code d'invitation, table en jeu).
 */
export function Etapes() {
  const t = useTranslations('landing.steps');
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 70%'] });
  // Étapes atteintes : la première dès le départ, les suivantes quand leur trait est rempli
  const [atteintes, setAtteintes] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (v) =>
    setAtteintes(
      v <= 0 ? 0 : Math.min(ETAPES.length, Math.floor(v * (ETAPES.length - 1) + 0.02) + 1),
    ),
  );

  const illustrations: Record<(typeof ETAPES)[number], ReactNode> = {
    create: (
      <ul className="flex h-full flex-col justify-center gap-2 p-4">
        {SYSTEMES.map((s, i) => (
          <motion.li
            key={s}
            {...detail(i)}
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold',
              i === 0 ? 'bg-primary/15 text-foreground' : 'bg-[#313131] text-muted-foreground',
            )}
          >
            {t(`create.systems.${s}`)}
            {i === 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.7 }}
              >
                <Check weight="bold" className="size-4 text-primary" aria-hidden />
              </motion.span>
            )}
          </motion.li>
        ))}
      </ul>
    ),
    invite: (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
        <p className="text-xs font-semibold text-subtle">{t('invite.code')}</p>
        <p className="flex gap-1">
          <span className="sr-only">{CODE}</span>
          {[...CODE].map((c, i) => (
            <motion.span
              key={i}
              {...detail(i)}
              aria-hidden
              className="grid size-10 place-items-center rounded-md bg-[#313131] font-mono text-lg font-semibold text-foreground"
            >
              {c}
            </motion.span>
          ))}
        </p>
        <div className="flex items-center gap-3">
          <span className="flex" aria-hidden>
            {JOUEURS.map((j, i) => (
              <motion.span
                key={j}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.9 + i * 0.12 }}
                className="-ml-2 grid size-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary ring-2 ring-[#272727] first:ml-0"
              >
                {j}
              </motion.span>
            ))}
          </span>
          <span className="text-xs text-muted-foreground">
            {t('invite.joined', { count: JOUEURS.length })}
          </span>
        </div>
      </div>
    ),
    play: (
      <div className="relative h-full">
        <Image
          src="/landing/table.webp"
          alt={t('play.imageAlt')}
          fill
          sizes="(min-width: 768px) 33vw, 100vw"
          className="object-cover"
        />
        {/* Signal posé sur la carte : un anneau qui s'élargit en boucle */}
        <span
          className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2"
          aria-hidden
        >
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-primary"
            animate={{ scale: [0.5, 2.4], opacity: [1, 0] }}
            transition={{ duration: 1.8, ease: EASE, repeat: Infinity }}
          />
          <span className="absolute inset-2 rounded-full bg-primary" />
        </span>
      </div>
    ),
  };

  return (
    <section id="etapes" className="scroll-mt-24 px-4 py-16 sm:py-24">
      <MotionConfig reducedMotion="user">
        <div className="mx-auto max-w-6xl">
          <Apparition className="mx-auto max-w-[680px] text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {t('title')}
            </h2>
          </Apparition>
          <ol ref={ref} className="mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
            {ETAPES.map((id, i) => (
              <li key={id} className="flex flex-col">
                <div className="flex items-center gap-4">
                  <span
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-full text-base font-semibold transition-colors duration-500 ease-weighted',
                      i < atteintes
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-[#272727] text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  {i < ETAPES.length - 1 && (
                    <Segment progression={scrollYProgress} index={i} traits={ETAPES.length - 1} />
                  )}
                </div>
                <Apparition
                  delai={i * 0.1}
                  className="mt-6 flex-1 rounded-2xl border border-white/10 bg-[#181818] p-2"
                >
                  {/* Cadre 16 px, marge 8 px : l'illustration garde 8 px d'arrondi */}
                  <div className="h-48 overflow-hidden rounded-lg bg-[#272727]">
                    {illustrations[id]}
                  </div>
                  <div className="p-4">
                    <h3 className="text-xl font-semibold text-foreground">{t(`${id}.title`)}</h3>
                    <p className="mt-2 text-pretty text-base text-muted-foreground">
                      {t(`${id}.text`)}
                    </p>
                  </div>
                </Apparition>
              </li>
            ))}
          </ol>
        </div>
      </MotionConfig>
    </section>
  );
}

/** Trait vers l'étape suivante (écran large), rempli pendant sa part du défilement. */
function Segment({
  progression,
  index,
  traits,
}: Readonly<{ progression: MotionValue<number>; index: number; traits: number }>) {
  const scaleX = useTransform(progression, [index / traits, (index + 1) / traits], [0, 1]);
  return (
    <span className="relative hidden h-px flex-1 bg-white/10 md:-mr-6 md:block" aria-hidden>
      <motion.span className="absolute inset-0 origin-left bg-primary" style={{ scaleX }} />
    </span>
  );
}
