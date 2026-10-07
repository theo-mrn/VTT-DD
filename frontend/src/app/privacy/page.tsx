import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { pickByLocale } from '@/i18n/localized';
import PrivacyEn from '@/components/legal/privacy/en';
import PrivacyFr from '@/components/legal/privacy/fr';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('titles.privacy'), description: t('descriptions.privacy') };
}

export default async function PrivacyPage() {
  const Content = pickByLocale({ fr: PrivacyFr, en: PrivacyEn }, await getLocale());
  return <Content />;
}
