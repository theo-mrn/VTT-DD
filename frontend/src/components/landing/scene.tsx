'use client';

/**
 * Une rencontre jouée au défilement, sur la vraie capture de la taverne (`public/landing/table.webp`)
 * : la salle dans le noir autour du groupe, l'embuscade que le MJ dévoile, la grille qui se
 * trace sur la carte, puis l'initiative lancée pour tous. La section est quatre écrans de haut ;
 * la scène reste épinglée (`recit.tsx`) et chaque quart du trajet joue un chapitre, dans les
 * deux sens. Positions en pourcentage de l'image (16:10), relevées sur la capture.
 */
import {
  MotionConfig,
  cubicBezier,
  motion,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Chapitre, Jauge, useTrajet } from './recit';

const CHAPITRES = ['dark', 'reveal', 'grid', 'initiative'] as const;
const lisse = cubicBezier(0.22, 1, 0.36, 1);

/** Centre du groupe, autour duquel la salle reste éclairée au début. */
const GROUPE = { x: 32.5, y: 57 };
/** Le capitaine des bandits, que le MJ signale. */
const CAPITAINE = { x: 55, y: 56.4 };

/** Jets d'initiative posés au-dessus de chaque jeton, dans l'ordre du tour. */
const INITIATIVE = [
  { x: 32.75, y: 51.2, jet: 19 }, // Borin
  { x: 31.8, y: 62.8, jet: 17 }, // Sylvara
  { x: 55, y: 56.4, jet: 15 }, // Capitaine
  { x: 37.5, y: 57.2, jet: 12 }, // Kaelith
  { x: 59.9, y: 50.6, jet: 11 }, // Bandit
  { x: 27.85, y: 57, jet: 8 }, // Vorthax
  { x: 60.6, y: 62, jet: 6 }, // Bandit 2
  { x: 64.6, y: 56.4, jet: 4 }, // Bandit 3
] as const;

/**
 * Quadrillage, en pixels de l'image (2400 × 1500) : des cases de deux cases de la capture
 * (63,45 px chacune), calées sur ses lignes ; première ligne et bords du canevas relevés.
 */
const GRILLE = { pas: 126.9, gauche: 39.3, haut: 66, droite: 2360, bas: 1434 };
const lignes = (de: number, a: number) =>
  Array.from({ length: Math.floor((a - de) / GRILLE.pas) + 1 }, (_, k) => de + k * GRILLE.pas);
const COLONNES = lignes(GRILLE.gauche, GRILLE.droite);
const RANGEES = lignes(GRILLE.haut, GRILLE.bas);
/**
 * Ce que la grille ne recouvre pas, comme dans l'app : les panneaux de l'interface (barre de
 * scène, ordre du tour, barre latérale, outils), en pixels de l'image, et les jetons.
 */
const PANNEAUX = [
  { x: 126, y: 14, l: 530, h: 104 },
  { x: 1018, y: 14, l: 994, h: 104 },
  { x: 14, y: 206, l: 110, h: 1088 },
  { x: 458, y: 1396, l: 1487, h: 90 },
];
const RAYON_JETON = 48;

export function Scene() {
  const t = useTranslations('landing.scene');
  const ref = useRef<HTMLElement>(null);
  const reduit = useReducedMotion() ?? false;
  // Identifiant sans « : » ni guillemets, sûr dans url(#…)
  const masque = `grille-${useId().replace(/[^\w-]/g, '')}`;
  const p = useTrajet(ref);

  // 1. Le noir complet s'efface : il ne reste que la lueur autour du groupe
  const noir = useTransform(p, [0.03, 0.15], [1, 0]);
  // 2. La lueur s'élargit à toute la salle ; le MJ signale le capitaine
  const lueur = useTransform(p, [0.28, 0.46], [1, 10], { ease: lisse });
  const brume = useTransform(p, reduit ? [0.28, 0.46] : [0.42, 0.48], [1, 0]);
  const signal = useTransform(p, [0.38, 0.42, 0.5, 0.53], [0, 1, 1, 0]);

  return (
    <MotionConfig reducedMotion="user">
      <section ref={ref} aria-labelledby="scene-titre" className="relative h-[400vh] px-4">
        <div className="sticky top-0 flex h-dvh items-center">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-6 lg:grid-cols-12 lg:gap-12">
            {/* Récit, chapitre par chapitre */}
            <div className="order-2 lg:order-1 lg:col-span-4">
              <h2 id="scene-titre" className="text-sm font-semibold text-primary">
                {t('label')}
              </h2>
              <div className="mt-4 flex gap-1" aria-hidden>
                {CHAPITRES.map((c, i) => (
                  <Jauge key={c} p={p} index={i} total={CHAPITRES.length} />
                ))}
              </div>
              <div className="mt-6 grid">
                {CHAPITRES.map((c, i) => (
                  <Chapitre key={c} p={p} index={i} total={CHAPITRES.length}>
                    <p className="text-sm font-semibold text-muted-foreground">
                      {t(`chapters.${c}.eyebrow`)}
                    </p>
                    <h3 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                      {t(`chapters.${c}.title`)}
                    </h3>
                    <p className="mt-4 text-pretty text-base text-muted-foreground">
                      {t(`chapters.${c}.text`)}
                    </p>
                  </Chapitre>
                ))}
              </div>
            </div>

            {/* La scène : cadre 16 px, marge 8 px, l'image garde 8 px d'arrondi */}
            <div className="order-1 rounded-2xl border border-white/10 bg-[#181818] p-2 lg:order-2 lg:col-span-8">
              <div className="relative aspect-[16/10] overflow-hidden rounded-lg">
                <Image
                  src="/landing/table.webp"
                  alt={t('imageAlt')}
                  fill
                  sizes="(min-width: 1024px) 760px, 100vw"
                  className="object-cover"
                />

                {/* Vision : un voile percé autour du groupe, qui s'élargit à toute la salle */}
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute aspect-square w-[400%]"
                  style={{
                    left: `${GROUPE.x}%`,
                    top: `${GROUPE.y}%`,
                    x: '-50%',
                    y: '-50%',
                    // Pixellisé une fois à sa taille d'origine : un dégradé agrandi reste net
                    willChange: 'transform',
                    scale: reduit ? 1 : lueur,
                    opacity: brume,
                    background:
                      'radial-gradient(circle closest-side, transparent 5%, rgba(0,0,0,0.94) 8%)',
                  }}
                />
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-black"
                  style={{ opacity: noir }}
                />

                {/* Signal du MJ sur le capitaine */}
                <Repere x={CAPITAINE.x} y={CAPITAINE.y} className="w-[6%]">
                  <motion.span className="absolute inset-0" style={{ opacity: signal }}>
                    {[0, 0.6].map((d) => (
                      <motion.span
                        key={d}
                        className="absolute inset-0 rounded-full border-2 border-primary"
                        animate={{ scale: [0.6, 1.8], opacity: [1, 0] }}
                        transition={{ duration: 1.2, ease: lisse, repeat: Infinity, delay: d }}
                      />
                    ))}
                  </motion.span>
                </Repere>

                {/* 3. La grille se trace, de gauche à droite et de haut en bas */}
                <svg
                  aria-hidden
                  viewBox="0 0 2400 1500"
                  className="pointer-events-none absolute inset-0 size-full"
                >
                  <mask id={masque}>
                    <rect width="2400" height="1500" fill="white" />
                    {PANNEAUX.map((r) => (
                      <rect
                        key={r.x}
                        x={r.x}
                        y={r.y}
                        width={r.l}
                        height={r.h}
                        rx={36}
                        fill="black"
                      />
                    ))}
                    {INITIATIVE.map((j) => (
                      <circle
                        key={`${j.x}-${j.y}`}
                        cx={j.x * 24}
                        cy={j.y * 15}
                        r={RAYON_JETON}
                        fill="black"
                      />
                    ))}
                  </mask>
                  <g mask={`url(#${masque})`}>
                    {COLONNES.map((x, k) => (
                      <Trait
                        key={`c${k}`}
                        p={p}
                        part={k / COLONNES.length}
                        x1={x}
                        y1={GRILLE.haut}
                        x2={x}
                        y2={GRILLE.bas}
                      />
                    ))}
                    {RANGEES.map((y, k) => (
                      <Trait
                        key={`r${k}`}
                        p={p}
                        part={k / RANGEES.length}
                        x1={GRILLE.gauche}
                        y1={y}
                        x2={GRILLE.droite}
                        y2={y}
                      />
                    ))}
                  </g>
                </svg>

                {/* 4. Initiative : un jet au-dessus de chaque jeton, dans l'ordre du tour */}
                {INITIATIVE.map((j, i) => (
                  <Puce key={i} p={p} index={i} x={j.x} y={j.y} premier={i === 0}>
                    {j.jet}
                  </Puce>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}

/** Conteneur carré centré sur un point de l'image. */
function Repere({
  x,
  y,
  className,
  children,
}: Readonly<{ x: number; y: number; className: string; children: ReactNode }>) {
  return (
    <span
      aria-hidden
      className={cn('absolute aspect-square -translate-x-1/2 -translate-y-1/2', className)}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {children}
    </span>
  );
}

/** Jet d'initiative au-dessus d'un jeton, qui arrive à son tour. */
function Puce({
  p,
  index,
  x,
  y,
  premier,
  children,
}: Readonly<{
  p: MotionValue<number>;
  index: number;
  x: number;
  y: number;
  premier: boolean;
  children: ReactNode;
}>) {
  const debut = 0.77 + index * 0.02;
  const opacity = useTransform(p, [debut, debut + 0.03], [0, 1]);
  const decalage = useTransform(p, [debut, debut + 0.03], [8, 0], { ease: lisse });
  return (
    <span
      aria-hidden
      className="absolute -translate-x-1/2 -translate-y-full"
      style={{ left: `${x}%`, top: `${y - 3.5}%` }}
    >
      <motion.span
        className={cn(
          'block rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
          premier ? 'bg-primary text-primary-foreground' : 'bg-black/80 text-foreground',
        )}
        style={{ opacity, y: decalage }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/**
 * Ligne de la grille, tracée lentement à son tour pendant le troisième chapitre (et effacée en
 * remontant) : les tracés se chevauchent, la grille se pose comme une vague.
 */
function Trait({
  p,
  part,
  ...ligne
}: Readonly<{
  p: MotionValue<number>;
  part: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}>) {
  const debut = 0.5 + part * 0.1;
  const pathLength = useTransform(p, [debut, debut + 0.13], [0, 1], { ease: lisse });
  const opacity = useTransform(p, [debut, debut + 0.02], [0, 1]);
  return (
    <motion.line
      {...ligne}
      className="stroke-primary"
      strokeOpacity={0.45}
      strokeWidth={4}
      style={{ pathLength, opacity }}
    />
  );
}
