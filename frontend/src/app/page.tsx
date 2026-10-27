import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Appel } from '@/components/landing/appel';
import { Benefices } from '@/components/landing/benefices';
import { DeFlottant } from '@/components/landing/de-flottant';
import { Des } from '@/components/landing/des';
import { Etapes } from '@/components/landing/etapes';
import { Faq } from '@/components/landing/faq';
import { Hero } from '@/components/landing/hero';
import { Navigation } from '@/components/landing/navigation';
import { Outils } from '@/components/landing/outils';
import { Pied } from '@/components/landing/pied';
import { Probleme } from '@/components/landing/probleme';
import { Scene } from '@/components/landing/scene';
import { Promo } from '@/components/landing/promo';
import { Slogan } from '@/components/landing/slogan';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { absolute: t('landingTitle') },
    description: t('landingDescription'),
    openGraph: { title: t('landingTitle'), description: t('landingDescription'), type: 'website' },
  };
}

/**
 * Landing (docs/landing.md) : une offre, un public (les MJ qui jouent en ligne), une action,
 * créer sa table. Fond noir plat, police unique, preuves tirées de l'app elle-même.
 */
export default async function Accueil() {
  const t = await getTranslations('landing');
  return (
    <div className="min-h-dvh bg-black font-sans text-foreground">
      <a
        href="#contenu"
        className="sr-only z-[60] rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('skip')}
      </a>
      <Navigation />
      <main id="contenu">
        <Hero />
        <Probleme />
        <Scene />
        <Benefices />
        <Slogan />
        <Etapes />
        <Des />
        <Outils />
        <Promo />
        <Faq />
        <Appel />
      </main>
      <Pied />
      <DeFlottant />
    </div>
  );
}
