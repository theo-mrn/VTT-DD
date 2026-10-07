'use client';

/**
 * Stockage de la campagne (MJ, docs/stockage.md) : place occupée sur la limite de 5 Go, par
 * catégorie, et la galerie de tout ce qui a été envoyé (images, vidéos, sons) avec sa taille, sa
 * date et où il sert. Un fichier que plus rien n'utilise se supprime ici.
 */
import { STORAGE_WARNING_RATIO, type CampaignStorage, type StorageFile } from '@vtt/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AudioLines,
  Film,
  HardDrive,
  Headphones,
  RotateCw,
  Settings2,
  Square,
  Trash2,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Chips } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from '@/components/ui/tooltip';
import { useFormatBytes } from '@/i18n/units';
import { api, messageErreur } from '@/lib/api';
import { useAudioLibrary, usePreview } from '@/lib/audio';
import { campagnes } from '@/lib/campagnes';
import { clesPersonnages } from '@/lib/personnages';
import { cn } from '@/lib/utils';

const cle = (campaignId: string) => ['campagne', campaignId, 'stockage'] as const;
const route = (campaignId: string) => `/v1/campaigns/${encodeURIComponent(campaignId)}/storage`;

type Tri = 'taille' | 'date';
const UNUSED = 'unused';

/** Personnage ou son d'un fichier, d'après sa clé (`characters/<id>/…`, `audio/…/<id>/…`). */
function ownerOf(key: string): { kind: 'character' | 'sound'; id: string } | null {
  const parts = key.split('/');
  if (parts[0] === 'characters' && parts[1]) return { kind: 'character', id: parts[1] };
  if (parts[0] === 'audio' && parts[3]) return { kind: 'sound', id: parts[3] };
  return null;
}

export function StockageCampagne({ campaignId }: Readonly<{ campaignId: string }>) {
  const t = useTranslations('campaigns.storage');
  const format = useFormatter();
  const formatBytes = useFormatBytes();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: cle(campaignId),
    queryFn: () => api<CampaignStorage>(route(campaignId)),
    staleTime: 60_000,
  });
  const [actualise, setActualise] = useState(false);
  const [filtre, setFiltre] = useState('all');
  const [tri, setTri] = useState<Tri>('taille');
  const library = useAudioLibrary(campaignId);
  const personnages = useQuery({
    queryKey: clesPersonnages.campagne(campaignId),
    queryFn: () => campagnes.personnages(campaignId),
  });
  const preview = usePreview();

  const noms = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of personnages.data ?? []) if (p.name) m.set(p.characterId, p.name);
    for (const a of library.assets) m.set(a.id, a.name);
    return m;
  }, [personnages.data, library.assets]);

  const actualiser = async () => {
    setActualise(true);
    try {
      client.setQueryData(
        cle(campaignId),
        await api<CampaignStorage>(`${route(campaignId)}?refresh=1`),
      );
    } catch (e) {
      toast.error(t('refreshFailed'), { description: messageErreur(e) });
    } finally {
      setActualise(false);
    }
  };

  const supprimer = async (f: StorageFile) => {
    try {
      await api<void>(`${route(campaignId)}/files?key=${encodeURIComponent(f.key)}`, {
        method: 'DELETE',
      });
      client.setQueryData<CampaignStorage>(cle(campaignId), (s) =>
        s
          ? {
              ...s,
              usedBytes: s.usedBytes - f.size,
              files: s.files.filter((x) => x.key !== f.key),
              byCategory: s.byCategory
                .map((c) =>
                  c.category === f.category
                    ? { ...c, bytes: c.bytes - f.size, count: c.count - 1 }
                    : c,
                )
                .filter((c) => c.count > 0),
            }
          : s,
      );
      toast.success(t('freed', { size: formatBytes(f.size) }));
    } catch (e) {
      toast.error(t('deleteRefused'), { description: messageErreur(e) });
      void client.invalidateQueries({ queryKey: cle(campaignId) });
    }
  };

  const s = q.data;
  const fichiers = useMemo(() => {
    if (!s) return [];
    const out = s.files.filter((f) => correspondAuFiltre(f, filtre));
    return tri === 'taille' ? out : [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [s, filtre, tri]);

  if (q.isPending)
    return (
      <p className="px-6 py-10 text-center text-[13px] text-muted-foreground">{t('loading')}</p>
    );
  if (!s)
    return (
      <div className="space-y-3 px-6 py-10 text-center">
        <p className="text-[13px] text-muted-foreground">{messageErreur(q.error)}</p>
        <Button variant="secondary" size="sm" onClick={() => void q.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );

  const ratio = s.usedBytes / s.quotaBytes;
  const inutilises = s.files.filter((f) => f.deletable);
  const options = [
    { value: 'all', label: t('all'), count: s.files.length },
    ...s.byCategory.map((c) => ({
      value: c.category,
      label: t('category', {
        label: t(`categories.${c.category}`),
        size: formatBytes(c.bytes),
      }),
      count: c.count,
    })),
    ...(inutilises.length
      ? [
          {
            value: UNUSED,
            label: t('unused', {
              size: formatBytes(inutilises.reduce((total, f) => total + f.size, 0)),
            }),
            count: inutilises.length,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5 px-6 py-5">
      <section aria-label={t('used')} className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="size-4 text-muted-foreground" aria-hidden />
            {formatBytes(s.usedBytes)}
            <span className="font-normal text-muted-foreground">
              {t('of', { total: formatBytes(s.quotaBytes) })}
            </span>
          </p>
          <Info
            texte={
              s.inventoriedAt
                ? t('inventoriedAt', {
                    date: format.dateTime(new Date(s.inventoriedAt), 'dateTime'),
                  })
                : t('refresh')
            }
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('refresh')}
              onClick={() => void actualiser()}
              disabled={actualise}
            >
              <RotateCw className={cn(actualise && 'animate-spin')} />
            </Button>
          </Info>
        </div>
        <div
          role="meter"
          aria-label={t('used')}
          aria-valuemin={0}
          aria-valuemax={s.quotaBytes}
          aria-valuenow={s.usedBytes}
          aria-valuetext={t('usedOf', {
            used: formatBytes(s.usedBytes),
            total: formatBytes(s.quotaBytes),
          })}
          className="h-2.5 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-out',
              couleurJauge(ratio),
            )}
            style={{ width: `${Math.min(100, Math.max(ratio > 0 ? 1 : 0, ratio * 100))}%` }}
          />
        </div>
        {ratio >= 1 && <p className="text-[13px] text-destructive">{t('full')}</p>}
      </section>

      {s.files.length > 0 && (
        <div className="space-y-3">
          <Chips label={t('categoryLabel')} value={filtre} onChange={setFiltre} options={options} />
          <SelectField
            aria-label={t('sort')}
            value={tri}
            onValueChange={(v) => setTri(v as Tri)}
            options={[
              { valeur: 'taille', nom: t('sortSize') },
              { valeur: 'date', nom: t('sortDate') },
            ]}
            className="w-56"
          />
        </div>
      )}

      {fichiers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-muted-foreground">
          {s.files.length ? t('emptyCategory') : t('empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fichiers.map((f) => {
            const owner = ownerOf(f.key);
            const nom = owner ? noms.get(owner.id) : undefined;
            // Son supprimé de la bibliothèque : ses fichiers attendent la purge du service audio
            const sonSupprime =
              f.category === 'sounds' && owner && !library.loading && !noms.has(owner.id);
            return (
              <Fichier
                key={f.key}
                fichier={f}
                nom={nom ?? (sonSupprime ? t('deletedSound') : null)}
                usedBy={sonSupprime ? [] : f.usedBy}
                ecoute={preview.playingId === f.key}
                onEcoute={() =>
                  preview.playingId === f.key
                    ? preview.stop()
                    : preview.play({ id: f.key, url: f.url, name: nom ?? t('sound') })
                }
                onSupprimer={() => supprimer(f)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Fichier({
  fichier: f,
  nom,
  usedBy,
  ecoute,
  onEcoute,
  onSupprimer,
}: Readonly<{
  fichier: StorageFile;
  nom: string | null;
  usedBy: string[];
  ecoute: boolean;
  onEcoute: () => void;
  onSupprimer: () => Promise<void>;
}>) {
  const t = useTranslations('campaigns.storage');
  const format = useFormatter();
  const formatBytes = useFormatBytes();
  const [confirmer, setConfirmer] = useState(false);
  const [busy, setBusy] = useState(false);
  // Second clic attendu dans les 3 s, sinon la demande retombe
  useEffect(() => {
    if (!confirmer) return;
    const t = setTimeout(() => setConfirmer(false), 3_000);
    return () => clearTimeout(t);
  }, [confirmer]);
  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-surface duration-200 ease-out animate-in fade-in-0">
      <div className="relative grid aspect-video place-items-center overflow-hidden bg-surface-2">
        <Apercu fichier={f} nom={nom} ecoute={ecoute} onEcoute={onEcoute} />
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-[11px] tabular-nums">
          {formatBytes(f.size)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <p className="truncate text-[13px] font-medium">{nom ?? t(`categories.${f.category}`)}</p>
        <p className="text-[11px] text-muted-foreground">
          {f.pending
            ? t('uploading')
            : format.dateTime(new Date(f.createdAt), {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span
            className={cn(
              'min-w-0 truncate text-[11px]',
              usedBy.length ? 'text-muted-foreground' : 'text-warning',
            )}
            title={usedBy.join(', ')}
          >
            {usedBy.length ? usedBy.join(', ') : t('unusedFile')}
          </span>
          {f.deletable && (
            <Button
              variant={confirmer ? 'destructive' : 'ghost'}
              size="xs"
              loading={busy}
              aria-label={confirmer ? t('confirmDelete') : t('delete')}
              onClick={async () => {
                if (!confirmer) return setConfirmer(true);
                setBusy(true);
                await onSupprimer();
                setBusy(false);
              }}
            >
              <Trash2 />
              {confirmer && t('confirm')}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Réglages de la campagne ou son stockage (aussi dans la fenêtre du salon). */
export function OngletsReglages({
  vue,
  onVue,
}: Readonly<{
  vue: 'campagne' | 'stockage';
  onVue: (v: 'campagne' | 'stockage') => void;
}>) {
  const t = useTranslations('campaigns.settings');
  return (
    <Tabs value={vue} onValueChange={(v) => onVue(v as 'campagne' | 'stockage')}>
      <TabsList>
        <TabsTrigger value="campagne">
          <Settings2 aria-hidden />
          {t('tabCampaign')}
        </TabsTrigger>
        <TabsTrigger value="stockage">
          <HardDrive aria-hidden />
          {t('tabStorage')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/** Aperçu d'un fichier : image, vidéo, bouton d'écoute d'un son, ou icône. */
function Apercu({
  fichier: f,
  nom,
  ecoute,
  onEcoute,
}: Readonly<{ fichier: StorageFile; nom: string | null; ecoute: boolean; onEcoute: () => void }>) {
  const t = useTranslations('campaigns.storage');
  const type = f.contentType ?? '';
  if (type.startsWith('image/'))
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={f.url}
        alt={nom ?? ''}
        loading="lazy"
        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    );
  if (type.startsWith('video/'))
    return (
      <>
        <video src={f.url} muted preload="metadata" className="size-full object-cover" />
        <Film className="absolute left-2 top-2 size-4 text-white drop-shadow" aria-hidden />
      </>
    );
  if (f.category === 'sounds')
    return (
      <Button
        variant="secondary"
        size="icon"
        aria-label={ecoute ? t('stopListening') : t('listen')}
        onClick={onEcoute}
        disabled={f.pending}
      >
        {ecoute ? <Square /> : <Headphones />}
      </Button>
    );
  return <AudioLines className="size-6 text-muted-foreground" aria-hidden />;
}

/** Jauge du stockage : rouge plein, orange au seuil d'alerte, sinon couleur primaire. */
function couleurJauge(ratio: number): string {
  if (ratio >= 1) return 'bg-destructive';
  return ratio >= STORAGE_WARNING_RATIO ? 'bg-warning' : 'bg-primary';
}

function correspondAuFiltre(f: StorageFile, filtre: string): boolean {
  if (filtre === 'all') return true;
  return filtre === UNUSED ? f.deletable : f.category === filtre;
}
