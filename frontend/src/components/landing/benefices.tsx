import { Check } from '@phosphor-icons/react/ssr';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Apparition } from './apparition';
import { Boucle } from './boucle';

const POINTS = ['first', 'second', 'third'] as const;

/** Un bénéfice par rangée (`landing.benefits.<id>`), et la séquence filmée qui le prouve. */
const BENEFICES = [
  { id: 'combat', boucle: 'combat' },
  { id: 'vision', boucle: 'ombres' },
  { id: 'sheets', boucle: 'fiche' },
  { id: 'mood', boucle: 'meteo' },
] as const;

export function Benefices() {
  const t = useTranslations('landing.benefits');
  return (
    <section id="benefices" className="scroll-mt-24 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Apparition className="mx-auto max-w-[680px] text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-6 text-pretty text-lg text-muted-foreground">{t('lead')}</p>
        </Apparition>

        <div className="mt-16 space-y-24">
          {BENEFICES.map((b, i) => (
            <article key={b.id} className="grid items-center gap-12 lg:grid-cols-12">
              <Apparition
                className={cn('lg:col-span-5', i % 2 === 1 && 'lg:order-2 lg:col-start-8')}
              >
                <p className="text-sm font-semibold text-primary">{t(`${b.id}.eyebrow`)}</p>
                <h3 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {t(`${b.id}.title`)}
                </h3>
                <p className="mt-4 text-pretty text-base text-muted-foreground">
                  {t(`${b.id}.text`)}
                </p>
                <ul className="mt-6 space-y-3">
                  {POINTS.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-base text-foreground">
                      <Check
                        weight="bold"
                        className="mt-1 size-4 shrink-0 text-primary"
                        aria-hidden
                      />
                      {t(`${b.id}.points.${p}`)}
                    </li>
                  ))}
                </ul>
              </Apparition>
              <Apparition
                delai={0.1}
                className={cn('lg:col-span-7', i % 2 === 1 && 'lg:order-1 lg:col-start-1')}
              >
                <div className="rounded-2xl border border-white/10 bg-[#181818] p-2">
                  <Boucle nom={b.boucle} alt={t(`${b.id}.imageAlt`)} className="rounded-lg" />
                </div>
              </Apparition>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
