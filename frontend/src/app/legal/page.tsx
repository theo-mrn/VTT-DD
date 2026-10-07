import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { pickByLocale } from '@/i18n/localized';
import NoticeEn from '@/components/legal/notice/en';
import NoticeFr from '@/components/legal/notice/fr';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('titles.notice'), description: t('descriptions.notice') };
}

export default async function LegalNoticePage() {
  const Content = pickByLocale({ fr: NoticeFr, en: NoticeEn }, await getLocale());
  return <Content />;
}
