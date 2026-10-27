'use client';

/**
 * Les dés 3D en gros plan, joués au défilement : les 79 images du rendu de chaque skin dans la
 * boutique (1040 × 1040, recadrées sur le dé, `des-tour-<skin>-<nn>.webp` sur R2), dessinées dans
 * un canvas selon l'avancement. Aucune vidéo : rien qui puisse rester bloqué. Une seule rotation,
 * toujours dans le même sens, couvre toute la section ; tous les rendus ont la même pose au même
 * instant, si bien que le skin change en fondu sans que le dé saute.
 */
import { Check } from '@phosphor-icons/react/ssr';
import { useMotionValueEvent } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSkinText } from '@/components/dice/skin-text';
import { cn } from '@/lib/utils';
import { LANDING_MEDIA } from './media';
import { useTrajet } from './recit';

const POINTS = ['visibility', 'symbols', 'skins'] as const;
const SKINS = [
  'spectre',
  'cyber_neon',
  'eclipse',
  'singularite',
  'marbre_saphir',
  'resine_fumee',
] as const;
/** Images du rendu (2,6 s à 30 images par seconde), une pose chacune. */
const POSES = 79;
/** Fin de la part d'un skin pendant laquelle le suivant apparaît en fondu. */
const FONDU = 0.15;
/** Poses dont un skin a besoin : sa part de la rotation, et la fin de la précédente (fondu). */
const plage = (s: number): [number, number] => [
  Math.max(0, Math.floor(((s - FONDU) / SKINS.length) * (POSES - 1))),
  Math.min(POSES - 1, Math.ceil(((s + 1) / SKINS.length) * (POSES - 1)) + 1),
];
/** Images chargées en même temps. */
const PARALLELE = 6;

const source = (skin: number, k: number) =>
  `${LANDING_MEDIA}/des-tour-${SKINS[skin]}-${String(k).padStart(2, '0')}.webp`;

export function Des() {
  const t = useTranslations('landing.dice');
  const { name } = useSkinText();
  const ref = useRef<HTMLElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const images = useRef<(HTMLImageElement | undefined)[][]>(SKINS.map(() => []));
  const p = useTrajet(ref);
  const [actuel, setActuel] = useState(0);

  const dessiner = useCallback(() => {
    const canvas = toile.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const v = Math.min(Math.max(p.get(), 0), 0.9999);
    // Pose : une seule rotation sur toute la section ; skin : un sixième du trajet chacun
    const pose = v * (POSES - 1);
    const u = v * SKINS.length;
    const skin = Math.floor(u);
    const f = u - skin;
    setActuel(skin);
    const poser = (s: number, alpha: number) => {
      const liste = images.current[s]!;
      const k = Math.floor(pose);
      // Image la plus proche déjà chargée, si la bonne ne l'est pas encore
      let img = liste[k];
      for (let d = 1; !img && d < POSES; d++) img = liste[k - d] ?? liste[k + d];
      if (!img) return false;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Entre deux poses, la suivante en transparence : la rotation reste fluide
      const apres = liste[k + 1];
      if (apres && img === liste[k] && pose > k) {
        ctx.globalAlpha = alpha * (pose - k);
        ctx.drawImage(apres, 0, 0, canvas.width, canvas.height);
      }
      return true;
    };
    if (!poser(skin, 1)) return;
    if (f > 1 - FONDU && skin + 1 < SKINS.length) poser(skin + 1, (f - (1 - FONDU)) / FONDU);
    ctx.globalAlpha = 1;
  }, [p]);

  useMotionValueEvent(p, 'change', dessiner);

  // Taille du canvas : celle affichée, en pixels de l'écran, jusqu'à la définition des images
  useEffect(() => {
    const canvas = toile.current;
    if (!canvas) return;
    const ajuster = () => {
      const cote = Math.min(1040, Math.round(canvas.clientWidth * window.devicePixelRatio));
      if (canvas.width === cote) return;
      canvas.width = cote;
      canvas.height = cote;
      dessiner();
    };
    const obs = new ResizeObserver(ajuster);
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [dessiner]);

  // Chargement à l'approche, seulement les poses utiles : la première de chaque skin, puis les
  // autres dans l'ordre du défilement
  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    let annule = false;
    const ordre = [
      ...SKINS.map((_, s) => [s, plage(s)[0]] as const),
      ...SKINS.flatMap((_, s) => {
        const [de, a] = plage(s);
        return Array.from({ length: a - de }, (_, k) => [s, de + 1 + k] as const);
      }),
    ];
    let suivante = 0;
    const charger = () => {
      if (annule || suivante >= ordre.length) return;
      const [s, k] = ordre[suivante++]!;
      const img = new Image();
      img.src = source(s, k);
      img
        .decode()
        .then(() => {
          if (annule) return;
          images.current[s]![k] = img;
          dessiner();
        })
        .catch(() => undefined)
        .finally(charger);
    };
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        obs.disconnect();
        for (let n = 0; n < PARALLELE; n++) charger();
      },
      { rootMargin: '800px 0px' },
    );
    obs.observe(section);
    return () => {
      annule = true;
      obs.disconnect();
    };
  }, [dessiner]);

  return (
    <section ref={ref} aria-labelledby="des-titre" className="relative h-[250vh] px-4">
      <div className="sticky top-0 flex h-dvh items-center">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-12 lg:gap-12">
          <div className="order-2 lg:order-1 lg:col-span-5">
            <p className="text-sm font-semibold text-primary">{t('eyebrow')}</p>
            <h2
              id="des-titre"
              className="mt-3 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              {t('title')}
            </h2>
            <p className="mt-4 text-pretty text-base text-muted-foreground sm:mt-6 sm:text-lg">
              {t('lead')}
            </p>
            <ul className="mt-8 hidden space-y-3 sm:block">
              {POINTS.map((id) => (
                <li key={id} className="flex items-start gap-3 text-base text-foreground">
                  <Check weight="bold" className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                  {t(`points.${id}`)}
                </li>
              ))}
            </ul>
          </div>

          {/* Cadre 16 px, marge 8 px : l'image garde 8 px d'arrondi */}
          <figure className="order-1 mx-auto w-full max-w-[40dvh] rounded-2xl border border-white/10 bg-[#181818] p-2 lg:order-2 lg:col-span-7 lg:max-w-sm">
            <canvas
              ref={toile}
              role="img"
              aria-label={t('imageAlt')}
              className="block aspect-square w-full rounded-lg bg-cover"
              style={{ backgroundImage: `url(${source(0, 0)})` }}
            />
            <figcaption className="flex items-center justify-between gap-4 px-2 pb-1 pt-3">
              <span className="text-sm font-semibold text-foreground">{name(SKINS[actuel]!)}</span>
              <span className="flex gap-1" aria-hidden>
                {SKINS.map((s, i) => (
                  <span
                    key={s}
                    className={cn(
                      'h-1 w-4 rounded-full transition-colors duration-300 ease-weighted',
                      i === actuel ? 'bg-primary' : 'bg-white/15',
                    )}
                  />
                ))}
              </span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
