import { EyeOff, Palette, Shapes } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Apparition } from './apparition';
import { Boucle } from './boucle';

const POINTS = [
  { Icone: EyeOff, id: 'visibility' },
  { Icone: Shapes, id: 'symbols' },
  { Icone: Palette, id: 'skins' },
] as const;

/** Les dés 3D : gros plans de skins de la boutique, filmés dans l'app. */
export function Des() {
  const t = useTranslations('landing.dice');
  return (
    <section className="relative overflow-hidden py-24 lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[420px] -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.10),transparent_65%)]"
      />
      <div className="relative mx-auto max-w-7xl px-6 text-center">
        <Apparition className="mx-auto max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-primary">
            {t('eyebrow')}
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t('title')}
          </h2>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">{t('lead')}</p>
        </Apparition>
        <Apparition delai={0.1} className="mx-auto mt-14 max-w-sm">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_40px_120px_-30px_hsl(var(--primary)/0.35)]">
            <Boucle nom="des" alt={t('videoAlt')} ratio="1 / 1" className="rounded-[22px]" />
          </div>
        </Apparition>
        <Apparition delai={0.15}>
          <ul className="mt-14 flex flex-wrap justify-center gap-x-10 gap-y-4 text-[15px] text-muted-foreground">
            {POINTS.map(({ Icone, id }) => (
              <li key={id} className="flex items-center gap-2.5">
                <Icone className="size-4 text-primary" aria-hidden />
                {t(`points.${id}`)}
              </li>
            ))}
          </ul>
        </Apparition>
      </div>
    </section>
  );
}
