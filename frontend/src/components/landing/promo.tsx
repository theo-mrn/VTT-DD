import { useTranslations } from 'next-intl';
import { Apparition } from './apparition';
import { LANDING_MEDIA } from './media';

/** La vidéo de présentation (promotion/), lue à la demande, avec le son. */
export function Promo() {
  const t = useTranslations('landing.promo');
  return (
    <section className="py-24 lg:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <Apparition className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-primary">
            {t('eyebrow')}
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t('title')}
          </h2>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">{t('lead')}</p>
        </Apparition>
        <Apparition delai={0.1} className="mt-14">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_40px_120px_-30px_hsl(var(--primary)/0.35)] sm:p-2">
            <video
              controls
              playsInline
              preload="none"
              poster={`${LANDING_MEDIA}/promo.webp`}
              aria-label={t('play')}
              className="aspect-video h-auto w-full rounded-2xl bg-black"
            >
              <source src={`${LANDING_MEDIA}/promo.mp4`} type="video/mp4" />
            </video>
          </div>
        </Apparition>
      </div>
    </section>
  );
}
