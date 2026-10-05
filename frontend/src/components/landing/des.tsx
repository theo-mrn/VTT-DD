import { EyeOff, Palette, Shapes } from 'lucide-react';
import { Apparition } from './apparition';
import { Simulateur } from './simulateur';

const POINTS = [
  { Icone: EyeOff, texte: 'Jets publics, privés ou réservés au MJ' },
  { Icone: Shapes, texte: 'Dés à symboles pour Star Wars' },
  { Icone: Palette, texte: 'Chaque joueur choisit son skin' },
];

/** Les dés 3D : un simulateur jouable, le vrai lanceur de l'app. */
export function Des() {
  return (
    <section className="relative overflow-hidden py-24 lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 h-[420px] -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.10),transparent_65%)]"
      />
      <div className="relative mx-auto max-w-6xl px-6 text-center">
        <Apparition className="mx-auto max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-primary">Dés 3D</p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Des dés qu’on a envie de lancer
          </h2>
          <p className="mt-5 text-pretty text-lg text-muted-foreground">
            Plus de 70 dés en 3D, lancés avec une vraie physique : métaux précieux, cristaux,
            résines et orbes enchantés. Essayez, c’est le même lanceur qu’à la table.
          </p>
        </Apparition>
        <Apparition delai={0.1}>
          <Simulateur />
        </Apparition>
        <Apparition delai={0.15}>
          <ul className="mt-14 flex flex-wrap justify-center gap-x-10 gap-y-4 text-[15px] text-muted-foreground">
            {POINTS.map(({ Icone, texte }) => (
              <li key={texte} className="flex items-center gap-2.5">
                <Icone className="size-4 text-primary" aria-hidden />
                {texte}
              </li>
            ))}
          </ul>
        </Apparition>
      </div>
    </section>
  );
}
