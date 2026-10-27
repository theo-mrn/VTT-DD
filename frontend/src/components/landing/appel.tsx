import { useTranslations } from 'next-intl';
import { Apparition } from './apparition';
import { BoutonCommencer } from './boutons';

/** Dernier appel, identique à celui du haut, avec ce qui lève le risque. */
export function Appel() {
  const t = useTranslations('landing.finalCta');
  return (
    <section className="px-4 py-16 sm:py-24">
      <Apparition className="mx-auto flex max-w-[680px] flex-col items-center rounded-3xl border border-white/10 bg-[#181818] px-6 py-16 text-center">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t('title')}
        </h2>
        <p className="mt-6 text-pretty text-lg text-muted-foreground">{t('lead')}</p>
        <div className="mt-8">
          <BoutonCommencer />
        </div>
        <p className="mt-4 text-pretty text-sm text-subtle">{t('reassurance')}</p>
      </Apparition>
    </section>
  );
}
