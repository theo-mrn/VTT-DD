import Link from 'next/link';
import { LogoYner } from '@/components/commun/logo-yner';
import { BoutonCommencer, LienConnexion } from './boutons';

/** Barre fixe, translucide : la marque, une ancre, la connexion et l'action principale. */
export function Navigation() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
      <nav
        aria-label="Navigation principale"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
      >
        <Link href="/" className="flex items-center gap-2.5" aria-label="Yner, accueil">
          <LogoYner className="size-7 text-primary" />
          <span className="font-display text-lg tracking-[0.2em] text-foreground">YNER</span>
        </Link>
        <div className="flex items-center gap-2">
          <a
            href="#fonctionnalites"
            className="hidden rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Fonctionnalités
          </a>
          <LienConnexion />
          <BoutonCommencer libelle="Commencer" className="h-9 px-5 text-sm" />
        </div>
      </nav>
    </header>
  );
}
