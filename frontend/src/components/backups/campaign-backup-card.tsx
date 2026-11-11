'use client';

/** Carte d'une campagne de MJ : couverture plein cadre, dernier export, Exporter et Dupliquer. */
import { Copy, FileArchive, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDates } from '@/i18n/dates';
import type { Campagne } from '@/lib/campagnes';

export function CampaignBackupCard({
  campaign: c,
  lastExport,
  busy,
  index,
  onAction,
}: Readonly<{
  campaign: Pick<Campagne, 'id' | 'name' | 'pitch' | 'coverUrl' | 'system' | 'ambiance'>;
  /** Date du dernier export prêt. */
  lastExport: string | null;
  /** Export ou duplication en cours pour cette campagne. */
  busy: boolean;
  index: number;
  onAction(kind: 'export' | 'duplicate'): void;
}>) {
  const t = useTranslations('archives');
  const dates = useDates();
  const system = useNomSysteme(c.system);
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      data-ambiance={c.ambiance}
      className="group relative overflow-hidden rounded-3xl border border-border bg-card shadow-surface transition-shadow duration-300 hover:shadow-elevated"
    >
      <Illustration
        largeur={720}
        src={c.coverUrl}
        graine={c.name || c.id}
        className="aspect-[4/3] w-full"
        classeImage="transition-transform duration-700 ease-out group-hover:scale-[1.05]"
        voile
      >
        {system && (
          <div className="absolute right-4 top-4">
            <Badge ton="verre">{system}</Badge>
          </div>
        )}
        {busy && (
          <div className="absolute left-4 top-4">
            <Badge ton="verre" className="gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              {t('status.running')}
            </Badge>
          </div>
        )}
        <div className="absolute inset-x-5 bottom-5">
          <h3 className="truncate text-2xl font-semibold tracking-tight text-white drop-shadow">
            {c.name || t('untitled')}
          </h3>
          <p className="mt-1 text-sm text-white/70">
            {lastExport ? t('lastExport', { when: dates.since(lastExport) }) : t('neverExported')}
          </p>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => onAction('export')}>
              <FileArchive />
              {t('export')}
            </Button>
            <Button
              variant="secondary"
              className="flex-1 border-white/15 bg-black/40 text-white backdrop-blur hover:bg-black/60"
              disabled={busy}
              onClick={() => onAction('duplicate')}
            >
              <Copy />
              {t('duplicate')}
            </Button>
          </div>
        </div>
      </Illustration>
    </motion.article>
  );
}
