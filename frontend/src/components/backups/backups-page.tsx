'use client';

/**
 * Page « Sauvegardes », pleine largeur (docs/export-campagne.md § 7) : chiffres, campagnes du MJ en
 * grandes cartes (Exporter, Dupliquer), archives en cours et prêtes, import par dépôt.
 */
import { AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { isActive, useArchiveJobs } from '@/lib/archives';
import { useCampagnes } from '@/lib/campagnes';
import { ArchiveCard } from './archive-card';
import { BackupDialog, type BackupRequest } from './backup-dialog';
import { BackupsHero } from './backups-hero';
import { CampaignBackupCard } from './campaign-backup-card';
import { ImportDrop, type ImportDropHandle } from './import-drop';

export function BackupsPage() {
  const t = useTranslations('archives');
  const params = useSearchParams();
  const campaigns = useCampagnes();
  const jobs = useArchiveJobs();
  const drop = useRef<ImportDropHandle>(null);
  const [request, setRequest] = useState<BackupRequest | null>(null);

  const gm = useMemo(() => (campaigns.data ?? []).filter((c) => c.role === 'gm'), [campaigns.data]);
  const byId = useMemo(
    () => new Map((campaigns.data ?? []).map((c) => [c.id, c])),
    [campaigns.data],
  );
  const list = jobs.data ?? [];
  const ready = list.filter((j) => j.status === 'ready' && j.kind === 'export');
  const bytes = ready.reduce((n, j) => n + (j.size ?? 0), 0);

  // Lien depuis les réglages d'une campagne : ?campaign=<id>&kind=export|duplicate
  const asked = params.get('campaign');
  const askedKind = params.get('kind') === 'duplicate' ? 'duplicate' : 'export';
  useEffect(() => {
    const c = asked ? byId.get(asked) : undefined;
    if (c && c.role === 'gm') setRequest({ kind: askedKind, campaign: c });
  }, [asked, askedKind, byId]);

  return (
    <div>
      <BackupsHero
        campaigns={gm.length}
        ready={ready.length}
        bytes={bytes}
        onImport={() => drop.current?.pick()}
      />

      <main className="mx-auto max-w-7xl space-y-14 px-4 py-10 sm:px-8">
        <section className="space-y-5">
          <h2 className="text-lg font-semibold">{t('archivesTitle')}</h2>
          <ImportDrop ref={drop} />
          {jobs.isLoading ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : list.length ? (
            <ul className="grid gap-3 lg:grid-cols-2">
              <AnimatePresence initial={false}>
                {list.map((j) => {
                  const c = byId.get(j.campaignId ?? '') ?? byId.get(j.sourceCampaignId ?? '');
                  return <ArchiveCard key={j.id} job={j} cover={c?.coverUrl} />;
                })}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('noArchive')}</p>
          )}
        </section>

        <section className="space-y-5">
          <h2 className="text-lg font-semibold">{t('myCampaigns')}</h2>
          {campaigns.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="aspect-[4/3] rounded-3xl" />
              ))}
            </div>
          ) : gm.length ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {gm.map((c, i) => {
                const mine = list.filter((j) => j.sourceCampaignId === c.id);
                const last = mine.find((j) => j.kind === 'export' && j.status === 'ready');
                return (
                  <CampaignBackupCard
                    key={c.id}
                    campaign={c}
                    index={i}
                    lastExport={last?.createdAt ?? null}
                    busy={mine.some(isActive)}
                    onAction={(kind) => setRequest({ kind, campaign: c })}
                  />
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('noGmCampaign')}</p>
          )}
        </section>
      </main>

      <BackupDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
