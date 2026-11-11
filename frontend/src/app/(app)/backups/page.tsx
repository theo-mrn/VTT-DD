import { Suspense } from 'react';
import { BackupsPage } from '@/components/backups/backups-page';
import { titleMetadata } from '@/i18n/metadata';

export const generateMetadata = titleMetadata('backups');

export default function PageBackups() {
  return (
    <Suspense>
      <BackupsPage />
    </Suspense>
  );
}
