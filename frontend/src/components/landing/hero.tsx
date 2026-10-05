import Image from 'next/image';
import { Apparition } from './apparition';
import { BoutonCommencer } from './boutons';

const ATOUTS = ['Gratuit', 'Sans installation', 'D&D, Star Wars et plus'];

/** Promesse, action principale, puis la vraie table en grand. */
export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-36 sm:pt-44 lg:pb-32">
      {/* Halo doré derrière le titre et la capture */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[720px] w-[1200px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.16),transparent_62%)]"
      />
      <div className="relative mx-auto max-w-6xl px-6 text-center">
        <Apparition>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-primary">
            Table de jeu de rôle en ligne
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl text-balance text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Vos campagnes méritent{' '}
            <span className="font-display font-normal text-primary">une vraie table</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Cartes vivantes, brouillard de guerre, fiches qui calculent pour vous et dés en 3D. Tout
            ce qu’il faut pour jouer, dans votre navigateur.
          </p>
        </Apparition>
        <Apparition delai={0.1} className="mt-10 flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <BoutonCommencer />
            <a
              href="#fonctionnalites"
              className="inline-flex h-12 items-center rounded-full border border-white/10 px-7 text-[15px] text-foreground transition-colors hover:border-white/20 hover:bg-white/[0.04]"
            >
              Découvrir
            </a>
          </div>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-subtle">
            {ATOUTS.map((a, i) => (
              <li key={a} className="flex items-center gap-5">
                {i > 0 && (
                  <span aria-hidden className="hidden size-1 rounded-full bg-white/20 sm:block" />
                )}
                {a}
              </li>
            ))}
          </ul>
        </Apparition>
      </div>

      <Apparition delai={0.2} className="relative mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-1.5 shadow-[0_40px_120px_-30px_hsl(var(--primary)/0.35)] sm:p-2">
          <Image
            src="/landing/table.webp"
            alt="La table de jeu Yner : une taverne de nuit, le groupe face aux bandits, l’ordre d’initiative du combat en haut de l’écran."
            width={2400}
            height={1500}
            priority
            sizes="(min-width: 1152px) 1152px, 100vw"
            className="h-auto w-full rounded-2xl"
          />
        </div>
      </Apparition>
    </section>
  );
}
