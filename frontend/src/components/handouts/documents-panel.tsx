'use client';

/**
 * Panneau « Documents » de la table (docs/projection.md).
 *
 * - Joueur : les documents reçus, du plus récent au plus ancien ; un clic l'agrandit.
 * - MJ : sa bibliothèque (dépôt de fichiers, renommer, supprimer, « Projeter » en plein écran ou
 *   « Envoyer », à toute la table ou à certains joueurs) et l'historique des partages
 *   (« Arrêter » sur la projection en cours).
 */
import { useFormatter, useTranslations } from 'next-intl';
import type { Handout, SharedDocument } from '@vtt/contracts';
import {
  Check,
  CloudUpload,
  Film,
  Library,
  MoreHorizontal,
  Pencil,
  Presentation,
  Send,
  Square,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Segmented } from '@/components/audio/parts';
import { useTable } from '@/components/table/contexte';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { handoutsApi, isVideo, useDocuments, useHandoutLibrary } from '@/lib/handouts';
import { prepareUpload } from '@/lib/uploads/prepare';
import { uploadFile } from '@/lib/uploads/uploader';
import { translate } from '@/i18n/runtime';
import { cn } from '@/lib/utils';

/** Jour et heure d'un partage : « 4 oct., 20:30 ». */
const QUAND = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } as const;

const sansExtension = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 200) || translate('handouts.document');

export function DocumentsPanel() {
  const t = useTranslations();
  const { campagne, gm } = useTable();
  const [vue, setVue] = useState<'library' | 'shared'>('library');
  if (!gm) return <Recus campaignId={campagne.id} />;
  return (
    <div className="space-y-4 px-5 py-4">
      <Segmented
        label={t('handouts.view')}
        value={vue}
        onChange={(v) => setVue(v as 'library' | 'shared')}
        options={[
          { value: 'library', label: t('handouts.library'), icon: Library },
          { value: 'shared', label: t('handouts.shared'), icon: Send },
        ]}
      />
      {vue === 'library' ? (
        <Bibliotheque campaignId={campagne.id} />
      ) : (
        <Partages campaignId={campagne.id} />
      )}
    </div>
  );
}

// ─── Vignettes ───────────────────────────────────────────────────────────────

function Vignette({ h, className }: Readonly<{ h: Handout; className?: string }>) {
  return (
    <div className={cn('relative grid place-items-center overflow-hidden bg-surface-2', className)}>
      {isVideo(h.contentType) ? (
        <>
          <video src={h.url} muted preload="metadata" className="size-full object-cover" />
          <Film className="absolute left-2 top-2 size-4 text-white drop-shadow" aria-hidden />
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={h.url}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
    </div>
  );
}

/** Document agrandi (joueur, historique) : image entière, vidéo avec ses commandes. */
function Agrandi({ doc, onClose }: Readonly<{ doc: Handout | null; onClose: () => void }>) {
  const t = useTranslations();
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl p-3 sm:p-4">
        <DialogTitle className="sr-only">{doc?.name}</DialogTitle>
        <DialogDescription className="sr-only">{t('handouts.campaignDocument')}</DialogDescription>
        {doc &&
          (isVideo(doc.contentType) ? (
            <video src={doc.url} controls autoPlay className="max-h-[80dvh] w-full rounded-lg" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.url}
              alt={doc.name}
              className="max-h-[80dvh] w-full rounded-lg object-contain"
            />
          ))}
        {doc && <p className="text-center text-sm font-medium">{doc.name}</p>}
      </DialogContent>
    </Dialog>
  );
}

// ─── Joueur : documents reçus ────────────────────────────────────────────────

function Recus({ campaignId }: Readonly<{ campaignId: string }>) {
  const format = useFormatter();
  const t = useTranslations();
  const docs = useDocuments(campaignId);
  const [ouvert, setOuvert] = useState<Handout | null>(null);
  // Un document partagé plusieurs fois (projeté puis renvoyé…) n'apparaît qu'une fois, à la date
  // de son dernier partage (la liste arrive du plus récent au plus ancien)
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (docs.data?.items ?? []).filter((d) =>
      seen.has(d.handout.id) ? false : (seen.add(d.handout.id), true),
    );
  }, [docs.data?.items]);
  return (
    <div className="px-5 py-4">
      {docs.isPending && (
        <p className="py-8 text-center text-[13px] text-muted-foreground">
          {t('common.states.loading')}
        </p>
      )}
      {!docs.isPending && items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-muted-foreground">
          {t('handouts.noneReceived')}
        </p>
      )}
      {!docs.isPending && items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3">
          {items.map((d) => (
            <li
              key={d.id}
              className="duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-1"
            >
              <button
                type="button"
                onClick={() => setOuvert(d.handout)}
                className="group flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-surface transition-[border-color,transform] duration-200 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]"
              >
                <Vignette h={d.handout} className="aspect-video" />
                <span className="truncate px-2.5 pt-2 text-[13px] font-medium">
                  {d.handout.name}
                </span>
                <span className="px-2.5 pb-2 text-[11px] text-muted-foreground">
                  {format.dateTime(new Date(d.sharedAt), QUAND)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Agrandi doc={ouvert} onClose={() => setOuvert(null)} />
    </div>
  );
}

// ─── MJ : bibliothèque ───────────────────────────────────────────────────────

function Bibliotheque({ campaignId }: Readonly<{ campaignId: string }>) {
  const t = useTranslations();
  const { campagne } = useTable();
  const library = useHandoutLibrary(campaignId, true);
  const input = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [envois, setEnvois] = useState<{ id: string; name: string; ratio: number }[]>([]);
  /** Destinataires des prochains partages ; null : toute la table. */
  const [destinataires, setDestinataires] = useState<string[] | null>(null);
  const joueurs = campagne.members.filter((m) => m.role !== 'gm');

  async function envoyer(files: File[]) {
    for (const file of files) {
      const id = crypto.randomUUID();
      const name = sansExtension(file.name);
      setEnvois((l) => [...l, { id, name, ratio: 0 }]);
      try {
        const prepared = await prepareUpload(file, 'handout');
        const url = await uploadFile({ kind: 'campaign', id: campaignId }, 'handout', prepared, {
          onProgress: (p) =>
            setEnvois((l) => l.map((e) => (e.id === id ? { ...e, ratio: p.progress } : e))),
        });
        await handoutsApi.create(campaignId, { name, url });
        void library.refresh();
      } catch (e) {
        toast.error(t('handouts.notUploaded', { name }), { description: messageErreur(e) });
      } finally {
        setEnvois((l) => l.filter((e) => e.id !== id));
      }
    }
  }

  const partager = (h: Handout, mode: 'show' | 'send') =>
    handoutsApi
      .share(campaignId, h.id, { mode, recipients: destinataires })
      .then(() => {
        if (mode === 'send') toast.success(t('handouts.sent', { name: h.name }));
      })
      .catch((e) => toast.error(t('handouts.shareFailed'), { description: messageErreur(e) }));

  return (
    <div className="space-y-4">
      <input
        ref={input}
        type="file"
        multiple
        accept="image/*,video/webm,video/mp4"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void envoyer([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setSurvol(false);
          void envoyer([...e.dataTransfer.files]);
        }}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-[13px] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          survol
            ? 'border-primary bg-primary/[0.06] text-foreground'
            : 'border-border-strong text-muted-foreground hover:border-primary/50 hover:text-foreground',
        )}
      >
        <CloudUpload className="size-4" aria-hidden />
        {t('handouts.drop')}
      </button>

      {envois.map((e) => (
        <div key={e.id} className="space-y-1">
          <p className="truncate text-[12px] text-muted-foreground">{e.name}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${Math.round(e.ratio * 100)}%` }}
            />
          </div>
        </div>
      ))}

      <Destinataires joueurs={joueurs} value={destinataires} onChange={setDestinataires} />

      {library.loading && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {t('common.states.loading')}
        </p>
      )}
      {!library.loading && library.items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3">
          {library.items.map((h) => (
            <Document
              key={h.id}
              h={h}
              campaignId={campaignId}
              onShow={() => void partager(h, 'show')}
              onSend={() => void partager(h, 'send')}
              onChanged={() => void library.refresh()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** À qui partager : toute la table, ou des joueurs cochés. */
function Destinataires({
  joueurs,
  value,
  onChange,
}: Readonly<{
  joueurs: { userId: string; name: string | null }[];
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}>) {
  const t = useTranslations();
  const nom = (id: string) =>
    joueurs.find((j) => j.userId === id)?.name ?? t('common.roles.player');
  let libelle = t('handouts.wholeTable');
  if (value)
    libelle = value.length === 1 ? nom(value[0]!) : t('handouts.players', { count: value.length });
  const basculer = (id: string) => {
    const set = new Set(value ?? []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(set.size ? [...set] : null);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="w-full justify-start gap-2">
          <Users className="opacity-60" />
          <span className="text-muted-foreground">À :</span>
          <span className="truncate">{libelle}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
        >
          <Check className={cn('size-4', value ? 'opacity-0' : 'opacity-100')} />
          {t('handouts.wholeTable')}
        </button>
        {joueurs.map((j) => (
          <button
            key={j.userId}
            type="button"
            onClick={() => basculer(j.userId)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
          >
            <Check
              className={cn('size-4', value?.includes(j.userId) ? 'opacity-100' : 'opacity-0')}
            />
            <span className="truncate">{j.name ?? 'Joueur'}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Document({
  h,
  campaignId,
  onShow,
  onSend,
  onChanged,
}: Readonly<{
  h: Handout;
  campaignId: string;
  onShow: () => void;
  onSend: () => void;
  onChanged: () => void;
}>) {
  const t = useTranslations();
  const [renaming, setRenaming] = useState<string | null>(null);
  const valider = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== h.name)
      handoutsApi
        .rename(campaignId, h.id, name)
        .then(onChanged)
        .catch((e) => toast.error(t('handouts.renameFailed'), { description: messageErreur(e) }));
  };
  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-surface duration-200 ease-out animate-in fade-in-0 zoom-in-[0.98]">
      <Vignette h={h} className="aspect-video" />
      <div className="flex items-center gap-1 px-2 pt-1.5">
        {renaming !== null ? (
          <Input
            autoFocus
            value={renaming}
            maxLength={200}
            aria-label={t('handouts.newName')}
            className="h-7 text-[13px]"
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={valider}
            onKeyDown={(e) => {
              if (e.key === 'Enter') valider();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{h.name}</span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('handouts.actionsOf', { name: h.name })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(h.name)}>
              <Pencil />
              {t('common.actions.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() =>
                handoutsApi
                  .remove(campaignId, h.id)
                  .then(onChanged)
                  .catch((e) =>
                    toast.error(t('handouts.deleteFailed'), { description: messageErreur(e) }),
                  )
              }
            >
              <Trash2 />
              {t('common.actions.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2">
        <Info texte={t('handouts.projectHint')}>
          <Button size="xs" onClick={onShow}>
            <Presentation />
            {t('handouts.project')}
          </Button>
        </Info>
        <Info texte={t('handouts.sendHint')}>
          <Button size="xs" variant="secondary" onClick={onSend}>
            <Send />
            {t('common.actions.send')}
          </Button>
        </Info>
      </div>
    </li>
  );
}

// ─── MJ : historique des partages ────────────────────────────────────────────

function Partages({ campaignId }: Readonly<{ campaignId: string }>) {
  const format = useFormatter();
  const t = useTranslations();
  const { campagne } = useTable();
  const docs = useDocuments(campaignId);
  const [ouvert, setOuvert] = useState<Handout | null>(null);
  const noms = useMemo(
    () => new Map(campagne.members.map((m) => [m.userId, m.name ?? t('common.roles.player')])),
    [campagne.members],
  );
  const items = docs.data?.items ?? [];
  const enCours = docs.data?.projection?.id ?? null;
  const pour = (d: SharedDocument) =>
    d.recipients
      ? d.recipients.map((id) => noms.get(id) ?? t('common.roles.player')).join(', ')
      : t('handouts.wholeTable');

  if (!items.length)
    return (
      <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-muted-foreground">
        {t('handouts.nothingShared')}
      </p>
    );
  return (
    <>
      <ul className="space-y-2">
        {items.map((d) => (
          <li
            key={d.id}
            className={cn(
              'flex items-center gap-3 rounded-xl border p-2 duration-200 ease-out animate-in fade-in-0',
              d.id === enCours ? 'border-primary/50 bg-primary/[0.06]' : 'border-border bg-card',
            )}
          >
            <button
              type="button"
              onClick={() => setOuvert(d.handout)}
              className="group size-14 shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              aria-label={`Agrandir ${d.handout.name}`}
            >
              <Vignette h={d.handout} className="size-full" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{d.handout.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {d.mode === 'show' ? t('handouts.shown') : t('handouts.sentShort')} · {pour(d)} ·{' '}
                {format.dateTime(new Date(d.sharedAt), QUAND)}
              </p>
            </div>
            {d.id === enCours && (
              <Button
                size="xs"
                variant="secondary"
                onClick={() =>
                  handoutsApi
                    .stop(campaignId, d.id)
                    .catch((e) =>
                      toast.error(t('handouts.stopFailed'), { description: messageErreur(e) }),
                    )
                }
              >
                <Square />
                {t('handouts.stop')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Agrandi doc={ouvert} onClose={() => setOuvert(null)} />
    </>
  );
}
