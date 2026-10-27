import { useTranslations } from 'next-intl';
import { Apparition } from './apparition';
import { Boucle } from './boucle';
import { BoutonCommencer } from './boutons';

/** Promesse (deux lignes, coupées là où la phrase respire), l'action, une preuve, la vraie table. */
export function Hero() {
  const t = useTranslations('landing.hero');
  return (
    <section className="px-4 pb-16 pt-24 sm:pb-24">
      <div className="mx-auto flex max-w-6xl flex-col items-center pt-12 text-center">
        <Apparition>
          <p className="text-sm font-semibold text-primary">{t('eyebrow')}</p>
          <h1 className="mx-auto mt-4 max-w-[680px] text-balance bg-gradient-to-r from-white to-[#9B9B9B] bg-clip-text text-5xl font-semibold tracking-tight text-transparent sm:text-6xl">
            {t.rich('title', { l: (chunks) => <span className="block">{chunks}</span> })}
          </h1>
          <p className="mx-auto mt-6 max-w-[680px] text-pretty text-lg text-muted-foreground">
            {t('lead')}
          </p>
        </Apparition>
        <Apparition delai={0.1} className="mt-8 flex flex-col items-center gap-4">
          <BoutonCommencer />
          <p className="text-pretty text-sm text-subtle">{t('proof')}</p>
        </Apparition>
      </div>
      <Apparition delai={0.2} className="mx-auto mt-16 max-w-6xl">
        {/* Cadre 16 px, marge 8 px : la vidéo garde 8 px d'arrondi */}
        <div className="rounded-2xl border border-white/10 bg-[#181818] p-2">
          <Boucle nom="hero" alt={t('imageAlt')} className="rounded-lg" />
        </div>
      </Apparition>
    </section>
  );
}
