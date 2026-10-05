import type { Metadata } from 'next';
import { Appel } from '@/components/landing/appel';
import { DeFlottant } from '@/components/landing/de-flottant';
import { Des } from '@/components/landing/des';
import { Fonctionnalites } from '@/components/landing/fonctionnalites';
import { Hero } from '@/components/landing/hero';
import { Navigation } from '@/components/landing/navigation';
import { Outils } from '@/components/landing/outils';
import { Pied } from '@/components/landing/pied';

export const metadata: Metadata = {
  title: 'Yner · Table de jeu de rôle en ligne',
  description:
    'Cartes vivantes, brouillard de guerre, fiches automatiques et dés 3D : la table de jeu de rôle en ligne, gratuite et sans installation.',
};

export default function Accueil() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Navigation />
      <main>
        <Hero />
        <Fonctionnalites />
        <Des />
        <Outils />
        <Appel />
      </main>
      <Pied />
      <DeFlottant />
    </div>
  );
}
