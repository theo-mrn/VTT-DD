import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Apparition } from './apparition';

/** Une rangée de dés de la collection, cuits par le moteur 3D (public/dice). */
const DES = ['kyber_violet', 'beholder_orb', 'gold', 'magma', 'resine_jade', 'singularite', 'ruby'];

/** Les dés 3D : la collection, en rangée flottante. */
export function Des() {
  return (
    <section className="relative overflow-hidden py-24 lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[420px] -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.10),transparent_65%)]"
      />
      <div className="relative mx-auto max-w-7xl px-6 text-center">
        <Apparition className="mx-auto max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-primary">Dés 3D</p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Des dés qu’on a envie de lancer
          </h2>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">
            Plus de 70 dés en 3D, lancés avec une vraie physique : métaux précieux, cristaux,
            résines et orbes enchantés. Tous offerts.
          </p>
        </Apparition>
        <Apparition delai={0.1}>
          <ul className="mt-16 flex flex-wrap items-center justify-center gap-2 lg:flex-nowrap">
            {DES.map((d, i) => (
              <li
                key={d}
                className={cn(
                  'w-[30%] motion-safe:animate-[flotter_6s_ease-in-out_infinite] sm:w-[23%] lg:w-auto lg:flex-1',
                  // Six sur petit écran : deux rangées pleines
                  i === DES.length - 1 && 'hidden lg:block',
                )}
                style={{ animationDelay: `${i * -0.85}s` }}
              >
                <Image
                  src={`/dice/${d}.webp`}
                  alt=""
                  width={512}
                  height={512}
                  sizes="(min-width: 1024px) 180px, 30vw"
                  className="h-auto w-full drop-shadow-[0_24px_30px_rgba(0,0,0,0.6)]"
                />
              </li>
            ))}
          </ul>
        </Apparition>
      </div>
    </section>
  );
}
