'use client';

/**
 * Carte d'une archive : vignette de la campagne, sorte, avancement animé ou issue (taille,
 * expiration, erreur), actions.
 */
import type { ArchiveJob } from '@vtt/contracts';
import {
  AlertTriangle,
  ArchiveRestore,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDates } from '@/i18n/dates';
import { useFormatBytes } from '@/i18n/units';
import { messageErreur } from '@/lib/api';
import { downloadArchive, isActive, useDeleteArchiveJob } from '@/lib/archives';
import { cn } from '@/lib/utils';

const ERRORS = [
  'archive_invalid',
  'archive_unsupported_version',
  'archive_unknown_system',
  'archive_too_large',
  'storage_quota_exceeded',
  'campaign_not_found',
] as const;
type ErrorCode = (typeof ERRORS)[number] | 'internal';

const KIND_ICON = { export: FileArchive, import: ArchiveRestore, duplicate: Copy } as const;

export function ArchiveCard({
  job,
  cover,
}: Readonly<{ job: ArchiveJob; cover: string | null | undefined }>) {
  const t = useTranslations('archives');
  const dates = useDates();
  const formatBytes = useFormatBytes();
  const remove = useDeleteArchiveJob();
  const Icon = KIND_ICON[job.kind];
  const active = isActive(job);
  const failed = job.status === 'failed';
  const error: ErrorCode = (ERRORS as readonly string[]).includes(job.error ?? '')
    ? (job.error as ErrorCode)
    : 'internal';
  const name = job.campaignName ?? t('untitled');

  let detail: string;
  if (failed) detail = t(`errors.${error}`);
  else if (job.status === 'running' && job.step) detail = t(`steps.${job.step}`);
  else if (job.status === 'ready' && job.kind === 'export' && job.expiresAt)
    detail = `${formatBytes(job.size ?? 0)} · ${t('expires', { when: dates.inDays(job.expiresAt) })}`;
  else detail = t(`status.${job.status}`);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group flex items-stretch overflow-hidden rounded-2xl border bg-card shadow-surface',
        failed ? 'border-destructive/40' : 'border-border',
      )}
    >
      <Illustration
        largeur={240}
        src={cover}
        graine={name}
        className="relative w-28 shrink-0 sm:w-40"
        voile
      >
        <span
          className={cn(
            'absolute bottom-2 left-2 inline-flex size-8 items-center justify-center rounded-lg backdrop-blur [&_svg]:size-4',
            failed ? 'bg-destructive/80 text-white' : 'bg-black/55 text-white',
          )}
        >
          {failed ? <AlertTriangle /> : <Icon />}
        </span>
      </Illustration>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-semibold">{name}</h3>
          <Badge ton={failed ? 'danger' : job.status === 'ready' ? 'succes' : 'primaire'}>
            {t(`kinds.${job.kind}`)}
          </Badge>
        </div>
        <p
          className={cn('truncate text-xs', failed ? 'text-destructive' : 'text-muted-foreground')}
        >
          {dates.since(job.createdAt)} · {detail}
        </p>
        {active && (
          <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              initial={false}
              animate={{ width: `${Math.max(4, job.progress * 100)}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent motion-reduce:animate-none" />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pr-3">
        {job.status === 'ready' && job.kind === 'export' && (
          <Button
            size="sm"
            onClick={() =>
              void downloadArchive(job.id).catch((e: unknown) => toast.error(messageErreur(e)))
            }
          >
            <Download />
            <span className="hidden sm:inline">{t('download')}</span>
          </Button>
        )}
        {job.status === 'ready' && job.campaignId && (
          <Button size="sm" variant="secondary" asChild>
            <Link href={`/campagnes/${job.campaignId}`}>
              <ExternalLink />
              <span className="hidden sm:inline">{t('open')}</span>
            </Link>
          </Button>
        )}
        {job.status !== 'running' && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('delete')}
            className="opacity-60 transition-opacity group-hover:opacity-100"
            loading={remove.isPending && remove.variables === job.id}
            onClick={() => remove.mutate(job.id, { onError: (e) => toast.error(messageErreur(e)) })}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </motion.li>
  );
}
