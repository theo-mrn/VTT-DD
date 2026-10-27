import { useTranslations } from 'next-intl';
import { Apparition } from './apparition';
import { LANDING_MEDIA } from './media';

/** La preuve : une vraie partie filmée dans Yner, lue à la demande, avec le son. */
export function Promo() {
  const t = useTranslations('landing.promo');
  return (
    <section className="px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <Apparition className="mx-auto max-w-[680px] text-center">
          <p className="text-sm font-semibold text-primary">{t('eyebrow')}</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-6 text-pretty text-lg text-muted-foreground">{t('lead')}</p>
        </Apparition>
        <Apparition delai={0.1} className="mt-12">
          <div className="rounded-2xl border border-white/10 bg-[#181818] p-2">
            <video
              controls
              playsInline
              preload="none"
              poster={`${LANDING_MEDIA}/promo.webp`}
              aria-label={t('play')}
              className="aspect-video h-auto w-full rounded-lg bg-black"
            >
              <source src={`${LANDING_MEDIA}/promo.mp4`} type="video/mp4" />
            </video>
          </div>
        </Apparition>
      </div>
    </section>
  );
}
