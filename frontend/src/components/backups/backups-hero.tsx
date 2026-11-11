'use client';

/** En-tête de la page Sauvegardes : titre, chiffres clés, import. */
import { Archive, FileUp, HardDrive, Swords } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useFormatBytes } from '@/i18n/units';

export function BackupsHero({
  campaigns,
  ready,
  bytes,
  onImport,
}: Readonly<{ campaigns: number; ready: number; bytes: number; onImport(): void }>) {
  const t = useTranslations('archives');
  const formatBytes = useFormatBytes();
  return (
    <section className="relative overflow-hidden border-b border-border/60">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,hsl(var(--primary)/0.22),transparent_60%)]"
      />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-8 sm:py-14 lg:flex-row lg:items-end lg:justify-between">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
            <Archive className="size-6" />
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            {t('page')}
          </h1>
          <p className="mt-2 text-muted-foreground">{t('heroLead')}</p>
        </motion.div>
        <div className="flex flex-wrap items-stretch gap-3">
          <Stat icon={<Swords />} value={String(campaigns)} label={t('statCampaigns')} />
          <Stat icon={<Archive />} value={String(ready)} label={t('statArchives')} />
          <Stat icon={<HardDrive />} value={formatBytes(bytes)} label={t('statSize')} />
          <Button size="lg" className="h-auto min-h-16 px-6" onClick={onImport}>
            <FileUp />
            {t('import')}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Stat({ icon, value, label }: Readonly<{ icon: ReactNode; value: string; label: string }>) {
  return (
    <div className="flex min-w-36 items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 backdrop-blur [&_svg]:size-5">
      <span className="text-primary">{icon}</span>
      <span>
        <span className="block text-xl font-semibold tabular-nums">{value}</span>
        <span className="block text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}
