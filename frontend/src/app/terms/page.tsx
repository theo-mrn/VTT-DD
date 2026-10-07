import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { pickByLocale } from '@/i18n/localized';
import TermsEn from '@/components/legal/terms/en';
import TermsFr from '@/components/legal/terms/fr';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('titles.terms'), description: t('descriptions.terms') };
}

export default async function TermsPage() {
  const Content = pickByLocale({ fr: TermsFr, en: TermsEn }, await getLocale());
  return <Content />;
}
