import { Apparition } from './apparition';
import { BoutonCommencer } from './boutons';

/** Dernier appel, centré, avant le pied de page. */
export function Appel() {
  return (
    <section className="relative overflow-hidden py-28 lg:py-40">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[900px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.14),transparent_65%)]"
      />
      <Apparition className="relative mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
          Votre prochaine session{' '}
          <span className="font-display font-normal text-primary">commence ici</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Créez votre table en une minute, invitez vos joueurs avec un code.
        </p>
        <div className="mt-10 flex justify-center">
          <BoutonCommencer libelle="Créer ma table" />
        </div>
      </Apparition>
    </section>
  );
}
