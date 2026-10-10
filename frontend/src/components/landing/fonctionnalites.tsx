import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Apparition } from './apparition';
import { Boucle } from './boucle';

/** Un bloc par grande fonctionnalité : textes dans `landing.features.<id>`. */
const POINTS = ['first', 'second', 'third'] as const;

/** Bloc : textes `landing.features.<id>`, boucle `<boucle>` (promotion/landing.mjs). */
const BLOCS = [
  { id: 'combat', boucle: 'combat' },
  { id: 'vision', boucle: 'ombres' },
  { id: 'weather', boucle: 'meteo' },
  { id: 'sheets', boucle: 'fiche' },
  { id: 'attack', boucle: 'attaque' },
  { id: 'audio', boucle: 'zone-sonore' },
] as const;

/** Les grandes fonctionnalités, une par rangée, séquence filmée et texte en alternance. */
export function Fonctionnalites() {
  const t = useTranslations('landing.features');
  return (
    <section id="fonctionnalites" className="scroll-mt-16 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Apparition className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t('title')}
          </h2>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">{t('lead')}</p>
        </Apparition>

        <div className="mt-24 space-y-28 lg:mt-32 lg:space-y-40">
          {BLOCS.map((b, i) => (
            <article key={b.id} className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
              <Apparition
                className={cn('lg:col-span-5', i % 2 === 1 && 'lg:order-2 lg:col-start-8')}
              >
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-primary">
                  {t(`${b.id}.eyebrow`)}
                </p>
                <h3 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
                  {t(`${b.id}.title`)}
                </h3>
                <p className="mt-5 text-pretty text-[17px] leading-relaxed text-muted-foreground">
                  {t(`${b.id}.text`)}
                </p>
                <ul className="mt-8 space-y-3">
                  {POINTS.map((p) => (
                    <li key={p} className="flex items-center gap-3 text-[15px] text-foreground/90">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                        <Check className="size-3 text-primary" aria-hidden />
                      </span>
                      {t(`${b.id}.points.${p}`)}
                    </li>
                  ))}
                </ul>
              </Apparition>
              <Apparition
                delai={0.1}
                className={cn('lg:col-span-7', i % 2 === 1 && 'lg:order-1 lg:col-start-1')}
              >
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.9)]">
                  <Boucle nom={b.boucle} alt={t(`${b.id}.imageAlt`)} className="rounded-[14px]" />
                </div>
              </Apparition>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
