'use client';

/** Lancer un export ou une duplication : deux grands choix visuels pour l'avancement. */
import { Flag, History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { messageErreur } from '@/lib/api';
import { useStartArchive } from '@/lib/archives';
import type { Campagne } from '@/lib/campagnes';
import { cn } from '@/lib/utils';

export interface BackupRequest {
  kind: 'export' | 'duplicate';
  campaign: Pick<Campagne, 'id' | 'name' | 'coverUrl'>;
}

export function BackupDialog({
  request,
  onClose,
}: Readonly<{ request: BackupRequest | null; onClose(): void }>) {
  const t = useTranslations('archives');
  const tc = useTranslations('common.actions');
  const start = useStartArchive();
  const [keep, setKeep] = useState<boolean | null>(null);
  const keepProgress = keep ?? request?.kind === 'export';

  function close() {
    if (start.isPending) return;
    setKeep(null);
    onClose();
  }

  async function run() {
    if (!request) return;
    try {
      await start.mutateAsync({
        kind: request.kind,
        campaignId: request.campaign.id,
        keepProgress,
      });
      toast.success(t('started'));
      setKeep(null);
      onClose();
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <Dialog open={request !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        {request && (
          <>
            <Illustration
              largeur={640}
              src={request.campaign.coverUrl}
              graine={request.campaign.name || request.campaign.id}
              className="aspect-[16/6] w-full"
              voile
            >
              <div className="absolute inset-x-6 bottom-4">
                <DialogTitle className="text-xl font-semibold text-white drop-shadow">
                  {request.kind === 'duplicate' ? t('duplicateTitle') : t('exportTitle')}
                </DialogTitle>
                <p className="truncate text-sm text-white/75">{request.campaign.name}</p>
              </div>
            </Illustration>
            <DialogDescription className="sr-only">{t('backupHint')}</DialogDescription>
            <div className="grid gap-3 px-6 pt-5 sm:grid-cols-2">
              <Choice
                active={keepProgress}
                onClick={() => setKeep(true)}
                icon={<History />}
                title={t('withProgress')}
                hint={t('withProgressHint')}
              />
              <Choice
                active={!keepProgress}
                onClick={() => setKeep(false)}
                icon={<Flag />}
                title={t('fresh')}
                hint={t('freshHint')}
              />
            </div>
            <DialogFooter className="px-6 pb-6 pt-5">
              <Button variant="ghost" onClick={close}>
                {tc('cancel')}
              </Button>
              <Button onClick={() => void run()} loading={start.isPending}>
                {request.kind === 'duplicate' ? t('duplicate') : t('export')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  active,
  onClick,
  icon,
  title,
  hint,
}: Readonly<{ active: boolean; onClick(): void; icon: ReactNode; title: string; hint: string }>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5',
        active
          ? 'border-primary/60 bg-primary/10 ring-1 ring-primary'
          : 'border-border hover:border-border-strong hover:bg-surface-2',
      )}
    >
      <span
        className={cn(
          'inline-flex size-10 items-center justify-center rounded-xl',
          active ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
