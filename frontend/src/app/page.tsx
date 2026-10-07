import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Appel } from '@/components/landing/appel';
import { DeFlottant } from '@/components/landing/de-flottant';
import { Des } from '@/components/landing/des';
import { Fonctionnalites } from '@/components/landing/fonctionnalites';
import { Hero } from '@/components/landing/hero';
import { Navigation } from '@/components/landing/navigation';
import { Outils } from '@/components/landing/outils';
import { Pied } from '@/components/landing/pied';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: { absolute: t('landingTitle') }, description: t('landingDescription') };
}

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
