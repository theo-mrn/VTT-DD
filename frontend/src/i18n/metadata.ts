import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Messages } from './types';

/** `generateMetadata` d'une page dont seul le titre change : `meta.titles.<key>`. */
export function titleMetadata(key: keyof Messages['meta']['titles']) {
  return async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('meta.titles');
    return { title: t(key) };
  };
}
