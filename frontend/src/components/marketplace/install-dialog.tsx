'use client';

/**
 * Installer un pack dans une de mes campagnes (MJ) : choix de la campagne, application du
 * contenu par les routes de la campagne (lib/marketplace/installer.ts), progression, bilan.
 * Une installation interrompue se reprend : chaque écriture est idempotente.
 */
import type { InstallCreated, InstallStart } from '@vtt/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Download, Loader2, RotateCcw, Swords } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { Message } from '@/components/compte/elements';
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
import { Progress } from '@/components/ui/progress';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { useCampagnes, type Campagne } from '@/lib/campagnes';
import { marketplaceApi, marketplaceKeys } from '@/lib/marketplace/api';
import { countsLabel } from '@/lib/marketplace/format';
import { campaignInstallClient, planInstall, runInstall } from '@/lib/marketplace/installer';
import { cn } from '@/lib/utils';
import { useSystemName } from './elements';

type Phase =
  | { kind: 'choose' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; created: InstallCreated; campaignId: string }
  /** `resumable` : l'installation a commencé, elle se reprend avec les mêmes clés. */
  | { kind: 'error'; message: string; resumable: boolean };

export function InstallDialog({
  open,
  onOpenChange,
  listingId,
  title,
  systemId,
  installed = [],
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
  title: string;
  /** Système du pack (ses PNJ ne s'installent que dans une campagne du même système). */
  systemId: string | null;
  /** Campagnes où le pack est déjà installé, et en quelle version. */
  installed?: { campaignId: string; versionNumber: string }[];
}>) {
  const client = useQueryClient();
  const campaigns = useCampagnes();
  const systemName = useSystemName();
  const mine = useMemo(
    () => (campaigns.data ?? []).filter((c) => c.role === 'gm'),
    [campaigns.data],
  );
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  // Installation commencée : reprise avec les mêmes clés d'idempotence
  const started = useRef<{ start: InstallStart; campaign: Campagne } | null>(null);

  const selected = mine.find((c) => c.id === campaignId) ?? null;
  const busy = phase.kind === 'running';

  async function install() {
    if (!selected || busy) return;
    try {
      if (started.current?.campaign.id !== selected.id) {
        setPhase({ kind: 'running', done: 0, total: 1 });
        started.current = {
          start: await marketplaceApi.startInstall(listingId, selected.id),
          campaign: selected,
        };
      }
      const { start, campaign } = started.current;
      const plan = planInstall(start.content, {
        campaignSystemId: campaign.system,
        title: start.listingTitle,
      });
      setPhase({ kind: 'running', done: 0, total: plan.steps.length });
      const created = await runInstall(
        plan,
        campaignInstallClient(campaign.id),
        start.install.id,
        (done, total) => setPhase({ kind: 'running', done, total }),
      );
      await marketplaceApi.completeInstall(start.install.id, created);
      started.current = null;
      setPhase({ kind: 'done', created, campaignId: campaign.id });
      void client.invalidateQueries({ queryKey: marketplaceKeys.library });
    } catch (err) {
      setPhase({ kind: 'error', message: messageErreur(err), resumable: started.current !== null });
    }
  }

  function close(v: boolean) {
    if (busy) return;
    onOpenChange(v);
    if (!v) {
      setPhase({ kind: 'choose' });
      started.current = null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Installer « {title} »</DialogTitle>
          <DialogDescription className="sr-only">
            Choisissez la campagne où ajouter le contenu du pack.
          </DialogDescription>
        </DialogHeader>

        {phase.kind === 'done' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-success/10 text-success">
              <Check className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-medium">{countsLabel(phase.created) || 'Installé'}</p>
            {phase.created.skipped > 0 && (
              <Badge ton="alerte">
                {phase.created.skipped} PNJ ignoré{phase.created.skipped > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        ) : mine.length === 0 && !campaigns.isPending ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
            <Swords className="size-6 text-subtle" aria-hidden />
            Aucune campagne dont vous êtes le MJ
          </div>
        ) : (
          <ul className="-mx-1 max-h-72 space-y-1 overflow-y-auto px-1" role="radiogroup">
            {mine.map((c) => {
              const already = installed.find((i) => i.campaignId === c.id);
              const npcsSkipped = systemId !== null && c.system !== systemId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={campaignId === c.id}
                    disabled={busy}
                    onClick={() => setCampaignId(c.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                      campaignId === c.id
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border hover:border-border-strong',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {systemName(c.system)}
                      </span>
                    </span>
                    {already && <Badge>v{already.versionNumber}</Badge>}
                    {npcsSkipped && (
                      <Info texte="Autre système : les PNJ du pack ne seront pas ajoutés">
                        <span>
                          <Badge ton="alerte">Sans PNJ</Badge>
                        </span>
                      </Info>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {phase.kind === 'running' && (
          <Progress valeur={(phase.done / Math.max(1, phase.total)) * 100} label="Installation" />
        )}
        {phase.kind === 'error' && <Message>{phase.message}</Message>}

        <DialogFooter>
          {phase.kind === 'done' ? (
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                Fermer
              </Button>
              <Button asChild>
                <Link href={`/campagnes/${phase.campaignId}`}>Ouvrir la campagne</Link>
              </Button>
            </>
          ) : (
            <Button onClick={() => void install()} disabled={!selected || busy}>
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : phase.kind === 'error' && phase.resumable ? (
                <RotateCcw aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
              {phase.kind === 'error' && phase.resumable ? 'Reprendre' : 'Installer'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
