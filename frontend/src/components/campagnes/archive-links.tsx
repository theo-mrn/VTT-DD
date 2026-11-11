'use client';

/** Réglages du MJ : accès direct à l'export et à la duplication (page Sauvegardes). */
import { Archive, Copy, FileArchive } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';

export function ArchiveCampagne({ campaignId }: Readonly<{ campaignId: string }>) {
  const t = useTranslations('archives');
  const href = (kind: 'export' | 'duplicate') =>
    `/backups?campaign=${encodeURIComponent(campaignId)}&kind=${kind}`;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
      <Info texte={t('backupHint')}>
        <span className="flex items-center gap-2 text-sm font-medium">
          <Archive className="size-4 text-primary" />
          {t('page')}
        </span>
      </Info>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" asChild>
          <Link href={href('export')}>
            <FileArchive />
            {t('export')}
          </Link>
        </Button>
        <Button variant="secondary" size="sm" asChild>
          <Link href={href('duplicate')}>
            <Copy />
            {t('duplicate')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
