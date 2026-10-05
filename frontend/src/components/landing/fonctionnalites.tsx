import { Check } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Apparition } from './apparition';

interface Bloc {
  surtitre: string;
  titre: string;
  texte: string;
  points: string[];
  image: { src: string; alt: string; width: number; height: number };
}

const BLOCS: Bloc[] = [
  {
    surtitre: 'Combat',
    titre: 'Des combats qui s’enchaînent tout seuls',
    texte:
      'L’initiative est tirée, l’ordre affiché, chaque tour mis en avant. Attaques et dégâts s’appliquent directement sur les fiches, sans calcul à la main.',
    points: ['Initiative automatique', 'Tour par tour ou par camp', 'Dégâts appliqués aux fiches'],
    image: {
      src: '/landing/combat-initiative.webp',
      alt: 'Un combat en cours : l’ordre d’initiative en haut de la carte, le tour du nain Borin en surbrillance.',
      width: 1800,
      height: 1245,
    },
  },
  {
    surtitre: 'Vision',
    titre: 'Vos joueurs ne voient que ce que leur personnage voit',
    texte:
      'Brouillard de guerre, lignes de vue, lumières dynamiques et météo : la carte se dévoile au fil de l’exploration, et ce qui rôde dans l’ombre y reste.',
    points: [
      'Brouillard et lignes de vue',
      'Lumières et ombres en temps réel',
      'Pluie, neige, braises, tempête',
    ],
    image: {
      src: '/landing/vision-joueur.webp',
      alt: 'La vue d’une joueuse : seule la clairière éclairée par le feu de camp est visible, le reste de la forêt est sous le brouillard.',
      width: 1440,
      height: 1180,
    },
  },
  {
    surtitre: 'Fiches',
    titre: 'Des fiches qui font les calculs',
    texte:
      'Caractéristiques, défense, bonus et capacités : les règles du système sont appliquées pour vous. Votre personnage progresse, sa fiche suit.',
    points: [
      'Création guidée, étape par étape',
      'Règles de D&D, Star Wars et plus',
      'Capacités, inventaire et progression',
    ],
    image: {
      src: '/landing/fiche-personnage.webp',
      alt: 'La fiche d’Aelwen, rôdeuse elfe : portrait, caractéristiques, défense et voies de capacités.',
      width: 1800,
      height: 824,
    },
  },
];

/** Les grandes fonctionnalités, une par rangée, capture et texte en alternance. */
export function Fonctionnalites() {
  return (
    <section id="fonctionnalites" className="scroll-mt-16 py-24 lg:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Apparition className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Tout pour jouer, rien de superflu
          </h2>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">
            Le maître du jeu prépare, les joueurs jouent. Yner s’occupe du reste.
          </p>
        </Apparition>

        <div className="mt-24 space-y-28 lg:mt-32 lg:space-y-40">
          {BLOCS.map((b, i) => (
            <article
              key={b.surtitre}
              className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16"
            >
              <Apparition
                className={cn('lg:col-span-5', i % 2 === 1 && 'lg:order-2 lg:col-start-8')}
              >
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-primary">
                  {b.surtitre}
                </p>
                <h3 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
                  {b.titre}
                </h3>
                <p className="mt-5 text-pretty text-[17px] leading-relaxed text-muted-foreground">
                  {b.texte}
                </p>
                <ul className="mt-8 space-y-3">
                  {b.points.map((p) => (
                    <li key={p} className="flex items-center gap-3 text-[15px] text-foreground/90">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                        <Check className="size-3 text-primary" aria-hidden />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Apparition>
              <Apparition
                delai={0.1}
                className={cn('lg:col-span-7', i % 2 === 1 && 'lg:order-1 lg:col-start-1')}
              >
                <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.9)]">
                  <Image
                    src={b.image.src}
                    alt={b.image.alt}
                    width={b.image.width}
                    height={b.image.height}
                    sizes="(min-width: 1024px) 660px, 100vw"
                    className="h-auto w-full rounded-[14px]"
                  />
                </div>
              </Apparition>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
