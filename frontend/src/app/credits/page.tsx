import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { pickByLocale } from '@/i18n/localized';
import CreditsEn from '@/components/legal/credits/en';
import CreditsFr from '@/components/legal/credits/fr';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('titles.credits'), description: t('descriptions.credits') };
}

export default async function CreditsPage() {
  const Content = pickByLocale({ fr: CreditsFr, en: CreditsEn }, await getLocale());
  return <Content />;
}
