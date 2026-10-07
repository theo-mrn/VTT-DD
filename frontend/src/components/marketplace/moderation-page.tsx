'use client';

/**
 * File de modération (docs/marketplace.md § 7) : versions en revue (contenu à examiner,
 * publier ou refuser), fiches modifiées après publication, signalements (classer ou retirer).
 * Retirer pour droits purge aussi les fichiers du pack.
 */
import {
  ModerationReason,
  type ModerationQueue,
  type PackContent,
  type StudioListing,
} from '@vtt/contracts';
import { Ban, Check, Eye, Flag, Inbox, ShieldAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import { EtatVide, Page } from '@/components/commun/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import {
  marketplaceApi,
  useMarketplaceMe,
  useMarketplaceMutation,
  useModerationQueue,
} from '@/lib/marketplace/api';
import { Cover, MarketplaceTabs, WarningBadges } from './elements';
import { useStudioLabels } from './studio-labels';

type Listing = Omit<StudioListing, 'versions'>;

export function ModerationPage() {
  const t = useTranslations('marketplace.studio.moderation');
  const me = useMarketplaceMe();
  const moderator = me.data?.moderator ?? false;
  const queue = useModerationQueue(moderator);

  return (
    <Page large>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{t('title')}</h1>
        <MarketplaceTabs />
      </header>
      {me.data && !moderator && <EtatVide icone={ShieldAlert} titre={t('reserved')} />}
      {queue.isError && <Message>{messageErreur(queue.error)}</Message>}
      {moderator && queue.isPending && <Skeleton className="h-64 w-full rounded-2xl" />}
      {queue.data && <Queue queue={queue.data} />}
    </Page>
  );
}

function Queue({ queue }: Readonly<{ queue: ModerationQueue }>) {
  const t = useTranslations('marketplace.studio.moderation');
  const labels = useStudioLabels();
  const reports = queue.reports.reduce((n, g) => n + g.reports.length, 0);
  return (
    <Tabs defaultValue="versions">
      <TabsList className="mb-5">
        <TabsTrigger value="versions">
          {t('tabs.versions', { count: queue.versions.length })}
        </TabsTrigger>
        <TabsTrigger value="recheck">
          {t('tabs.recheck', { count: queue.recheck.length })}
        </TabsTrigger>
        <TabsTrigger value="reports">{t('tabs.reports', { count: reports })}</TabsTrigger>
      </TabsList>

      <TabsContent value="versions" className="space-y-3">
        {queue.versions.length === 0 && <EtatVide icone={Inbox} titre={t('nothingInReview')} />}
        {queue.versions.map(({ listing, version }) => (
          <Row key={version.id} listing={listing}>
            <p className="text-[13px]">
              <span className="font-semibold">v{version.number}</span>
              <span className="text-muted-foreground">
                {' '}
                · {version.counts ? labels.counts(version.counts) : ''} ·{' '}
                {t('submittedOn', { date: labels.date(version.submittedAt) })}
              </span>
            </p>
            {version.notes && (
              <p className="whitespace-pre-line text-[13px] text-muted-foreground">
                {version.notes}
              </p>
            )}
            <VersionActions versionId={version.id} />
          </Row>
        ))}
      </TabsContent>

      <TabsContent value="recheck" className="space-y-3">
        {queue.recheck.length === 0 && <EtatVide icone={Inbox} titre={t('nothingToRecheck')} />}
        {queue.recheck.map((listing) => (
          <Row key={listing.id} listing={listing}>
            <RecheckActions listing={listing} />
          </Row>
        ))}
      </TabsContent>

      <TabsContent value="reports" className="space-y-3">
        {queue.reports.length === 0 && <EtatVide icone={Inbox} titre={t('noReports')} />}
        {queue.reports.map(({ listing, reports: list }) => (
          <Row key={listing.id} listing={listing}>
            <ul className="space-y-1.5">
              {list.map((r) => (
                <ReportLine key={r.id} report={r} />
              ))}
            </ul>
            <div className="flex justify-end">
              <RemoveButton listing={listing} />
            </div>
          </Row>
        ))}
      </TabsContent>
    </Tabs>
  );
}

function Row({ listing, children }: Readonly<{ listing: Listing; children: ReactNode }>) {
  const labels = useStudioLabels();
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row">
      <span className="w-full shrink-0 overflow-hidden rounded-xl border border-border sm:w-48">
        <Cover url={listing.coverUrl} alt="" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/marketplace/${listing.slug}`}
            className="truncate text-[15px] font-semibold hover:underline"
          >
            {listing.title}
          </Link>
          <Badge>{labels.price(listing.priceCents, listing.currency)}</Badge>
          <WarningBadges warnings={listing.contentWarnings} />
        </div>
        {listing.summary && <p className="text-[13px] text-muted-foreground">{listing.summary}</p>}
        {children}
      </div>
    </article>
  );
}

function VersionActions({ versionId }: Readonly<{ versionId: string }>) {
  const t = useTranslations('marketplace.studio.moderation');
  const [content, setContent] = useState<PackContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const approve = useMarketplaceMutation(() => marketplaceApi.approve(versionId));

  async function show() {
    setLoading(true);
    try {
      setContent(await marketplaceApi.moderationContent(versionId));
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {content && <ContentPreview content={content} />}
      <div className="flex flex-wrap justify-end gap-2">
        {!content && (
          <Button variant="ghost" size="sm" loading={loading} onClick={() => void show()}>
            <Eye aria-hidden />
            {t('content')}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setRejecting(true)}>
          <X aria-hidden />
          {t('reject')}
        </Button>
        <Button
          size="sm"
          loading={approve.isPending}
          onClick={() =>
            approve.mutate(undefined, {
              onSuccess: () => toast.success(t('published')),
              onError: (e) => toast.error(messageErreur(e)),
            })
          }
        >
          <Check aria-hidden />
          {t('publish')}
        </Button>
      </div>
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={t('rejectTitle')}
        action={t('reject')}
        noteRequired
        run={(reason, note) => marketplaceApi.reject(versionId, { reason, note })}
      />
    </>
  );
}

/** Aperçu du contenu : noms et images de chaque élément. */
function ContentPreview({ content }: Readonly<{ content: PackContent }>) {
  const images = [
    ...content.scenes.map((s) => ({ name: s.scene.name, url: s.scene.backgroundUrl ?? null })),
    ...content.npcTemplates.map((n) => ({ name: n.name, url: n.imageUrl ?? n.tokenUrl })),
    ...content.objectTemplates.map((o) => ({ name: o.name, url: o.imageUrl })),
  ];
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {images.map((i, n) => (
        <li key={`${i.name}-${n}`} className="space-y-1">
          <span className="block overflow-hidden rounded-lg border border-border">
            <Cover url={i.url} alt="" />
          </span>
          <span className="line-clamp-1 text-[11px] text-muted-foreground">{i.name}</span>
        </li>
      ))}
    </ul>
  );
}

function RecheckActions({ listing }: Readonly<{ listing: Listing }>) {
  const t = useTranslations('marketplace.studio.moderation');
  const ok = useMarketplaceMutation(() => marketplaceApi.recheck(listing.id));
  return (
    <div className="flex justify-end gap-2">
      <RemoveButton listing={listing} />
      <Button
        size="sm"
        loading={ok.isPending}
        onClick={() => ok.mutate(undefined, { onError: (e) => toast.error(messageErreur(e)) })}
      >
        <Check aria-hidden />
        {t('compliant')}
      </Button>
    </div>
  );
}

function ReportLine({
  report,
}: Readonly<{ report: ModerationQueue['reports'][number]['reports'][number] }>) {
  const t = useTranslations('marketplace.studio.moderation');
  const labels = useStudioLabels();
  const dismiss = useMarketplaceMutation(() => marketplaceApi.dismissReport(report.id));
  return (
    <li className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-[13px]">
      <Flag className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{labels.reportReason(report.reason)}</span>
        <span className="text-xs text-subtle"> · {labels.date(report.createdAt)}</span>
        {report.details && (
          <span className="block whitespace-pre-line text-muted-foreground">{report.details}</span>
        )}
      </span>
      <Button
        variant="ghost"
        size="xs"
        loading={dismiss.isPending}
        onClick={() => dismiss.mutate(undefined, { onError: (e) => toast.error(messageErreur(e)) })}
      >
        {t('dismiss')}
      </Button>
    </li>
  );
}

function RemoveButton({ listing }: Readonly<{ listing: Listing }>) {
  const t = useTranslations('marketplace.studio.moderation');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Ban aria-hidden />
        {t('remove')}
      </Button>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={t('removeTitle', { title: listing.title })}
        action={t('remove')}
        purges
        run={async (reason, note) => {
          const r = await marketplaceApi.remove(listing.id, { reason, ...(note ? { note } : {}) });
          if (r.purged) toast.success(t('purged', { count: r.purged }));
        }}
      />
    </>
  );
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  action,
  noteRequired = false,
  purges = false,
  run,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  action: string;
  noteRequired?: boolean;
  /** Retrait : un motif de droits supprime aussi les fichiers du pack. */
  purges?: boolean;
  run: (reason: ModerationReason, note: string) => Promise<unknown>;
}>) {
  const t = useTranslations('marketplace.studio.moderation');
  const labels = useStudioLabels();
  const [reason, setReason] = useState<ModerationReason | ''>('');
  const [note, setNote] = useState('');
  const mutation = useMarketplaceMutation(() => run(reason as ModerationReason, note.trim()));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{t('reasonDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mod-reason">{t('reason')}</Label>
            <SelectField
              id="mod-reason"
              value={reason}
              onValueChange={(v) => setReason(v as ModerationReason)}
              placeholder={t('chooseReason')}
              options={ModerationReason.options.map((r) => ({
                valeur: r,
                nom: labels.moderationReason(r),
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mod-note">{t('note')}</Label>
            <Textarea
              id="mod-note"
              value={note}
              maxLength={1000}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {reason === 'rights' && purges && <Message ton="info">{t('purgeWarning')}</Message>}
          {mutation.isError && <Message>{messageErreur(mutation.error)}</Message>}
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!reason || (noteRequired && !note.trim())}
            loading={mutation.isPending}
            onClick={() =>
              mutation.mutate(undefined, {
                onSuccess: () => {
                  onOpenChange(false);
                  setReason('');
                  setNote('');
                },
              })
            }
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
