'use client';

/**
 * Composeur : le créateur choisit, dans une campagne dont il est MJ, les scènes, modèles de PNJ
 * et d'objets du pack ; le navigateur les lit (routes existantes), construit le `PackContent`
 * (lib/marketplace/pack-builder.ts) et l'envoie sur la version. Les adresses refusées par le
 * service (autre site, fichier disparu) peuvent être retirées avant un nouvel envoi.
 */
import type { MapScene, MapSnapshot, PackContentInput, StudioVersion } from '@vtt/contracts';
import { useQuery } from '@tanstack/react-query';
import { Box, Loader2, Map as MapIcon, Upload, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
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
import { api, ApiError, messageErreur } from '@/lib/api';
import { useCampagnes } from '@/lib/campagnes';
import { marketplaceApi, useMarketplaceMutation } from '@/lib/marketplace/api';
import {
  buildPack,
  withoutUrls,
  type SourceNpcTemplate,
  type SourceObjectTemplate,
} from '@/lib/marketplace/pack-builder';
import { cn } from '@/lib/utils';

const campaignUrl = (id: string, path = '') => `/v1/campaigns/${encodeURIComponent(id)}${path}`;

/** Ce que la campagne propose (MJ seulement : les modèles lui sont réservés). */
function useCampaignContent(campaignId: string) {
  return useQuery({
    queryKey: ['marketplace', 'composer', campaignId],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const [maps, npcs, objects] = await Promise.all([
        api<{ items: MapScene[] }>(campaignUrl(campaignId, '/maps')),
        api<(SourceNpcTemplate & { etat: unknown })[]>(campaignUrl(campaignId, '/npc-templates')),
        api<SourceObjectTemplate[]>(campaignUrl(campaignId, '/object-templates')),
      ]);
      return {
        maps: maps.items,
        npcs: npcs.map((n) => ({
          ...n,
          etat: n.etat && typeof n.etat === 'object' ? (n.etat as Record<string, unknown>) : null,
        })),
        objects,
      };
    },
  });
}

type Refusal = { code: string; urls: string[] };

export function PackComposer({
  open,
  onOpenChange,
  version,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; version: StudioVersion }>) {
  const t = useTranslations('marketplace.studio.composer');
  const campaigns = useCampagnes();
  const mine = (campaigns.data ?? []).filter((c) => c.role === 'gm');
  const [campaignId, setCampaignId] = useState('');
  const campaign = mine.find((c) => c.id === campaignId);
  const content = useCampaignContent(campaignId);
  const [maps, setMaps] = useState<Set<string>>(new Set());
  const [npcs, setNpcs] = useState<Set<string>>(new Set());
  const [objects, setObjects] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'idle' | 'reading' | 'sending'>('idle');
  const [refusal, setRefusal] = useState<{ refusal: Refusal; pack: PackContentInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = useMarketplaceMutation((pack: PackContentInput) =>
    marketplaceApi.setContent(version.id, pack),
  );

  const total = maps.size + npcs.size + objects.size;

  function choose(id: string) {
    setCampaignId(id);
    setMaps(new Set());
    setNpcs(new Set());
    setObjects(new Set());
    setRefusal(null);
    setError(null);
  }

  async function upload(pack: PackContentInput) {
    setPhase('sending');
    setError(null);
    try {
      await send.mutateAsync(pack);
      toast.success(t('saved'));
      setRefusal(null);
      onOpenChange(false);
    } catch (err) {
      const p =
        err instanceof ApiError ? (err.problem as ApiError['problem'] & { urls?: string[] }) : null;
      if (p?.code?.startsWith('asset_') && p.urls?.length)
        setRefusal({ refusal: { code: p.code, urls: p.urls }, pack });
      else setError(messageErreur(err));
    } finally {
      setPhase('idle');
    }
  }

  async function compose() {
    if (!content.data || !campaign) return;
    setPhase('reading');
    setError(null);
    try {
      const scenes: MapSnapshot[] = [];
      for (const map of content.data.maps.filter((m) => maps.has(m.id)))
        scenes.push(
          await api<MapSnapshot>(campaignUrl(campaign.id, `/maps/${encodeURIComponent(map.id)}`)),
        );
      const pack = buildPack({
        systemId: campaign.system,
        scenes,
        npcTemplates: content.data.npcs.filter((n) => npcs.has(n.id)),
        objectTemplates: content.data.objects.filter((o) => objects.has(o.id)),
      });
      await upload(pack);
    } catch (err) {
      setError(messageErreur(err));
      setPhase('idle');
    }
  }

  const busy = phase !== 'idle';

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="flex max-h-[min(90dvh,760px)] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title', { number: version.number })}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="composer-campaign">{t('campaign')}</Label>
          <SelectField
            id="composer-campaign"
            value={campaignId}
            onValueChange={choose}
            placeholder={t('chooseCampaign')}
            options={mine.map((c) => ({ valeur: c.id, nom: c.name }))}
            disabled={busy}
          />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {content.isPending && campaignId && (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
            </div>
          )}
          {content.isError && <Message>{messageErreur(content.error)}</Message>}
          {content.data && (
            <>
              <Choices
                icon={<MapIcon aria-hidden />}
                title={t('scenes')}
                items={content.data.maps.map((m) => ({ id: m.id, name: m.name }))}
                selected={maps}
                onChange={setMaps}
              />
              <Choices
                icon={<Users aria-hidden />}
                title={t('npcs')}
                items={content.data.npcs.map((n) => ({
                  id: n.id,
                  name: n.name,
                  disabled: n.etat === null,
                }))}
                selected={npcs}
                onChange={setNpcs}
              />
              <Choices
                icon={<Box aria-hidden />}
                title={t('objects')}
                items={content.data.objects.map((o) => ({ id: o.id, name: o.name }))}
                selected={objects}
                onChange={setObjects}
              />
            </>
          )}
        </div>

        {refusal && (
          <Message ton="info">{t('refusedImages', { count: refusal.refusal.urls.length })}</Message>
        )}
        {error && <Message>{error}</Message>}

        <DialogFooter>
          {refusal ? (
            <Button
              loading={busy}
              onClick={() => void upload(withoutUrls(refusal.pack, refusal.refusal.urls))}
            >
              {t('sendWithout')}
            </Button>
          ) : (
            <Button disabled={total === 0} loading={busy} onClick={() => void compose()}>
              {!busy && <Upload aria-hidden />}
              {phase === 'reading' ? t('reading') : t('send')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Choices({
  icon,
  title,
  items,
  selected,
  onChange,
}: Readonly<{
  icon: ReactNode;
  title: string;
  items: { id: string; name: string; disabled?: boolean }[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}>) {
  const t = useTranslations('marketplace.studio.composer');
  const enabled = useMemo(() => items.filter((i) => !i.disabled), [items]);
  if (items.length === 0) return null;
  const all = enabled.length > 0 && enabled.every((i) => selected.has(i.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-primary">
        {icon}
        {title}
        <span className="rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-medium text-muted-foreground">
          {selected.size}/{items.length}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => onChange(all ? new Set() : new Set(enabled.map((i) => i.id)))}
        >
          {all ? t('selectNone') : t('selectAll')}
        </Button>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors',
                selected.has(i.id)
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border hover:border-border-strong',
                i.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selected.has(i.id)}
                disabled={i.disabled}
                onChange={() => toggle(i.id)}
              />
              <span className="truncate">{i.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
