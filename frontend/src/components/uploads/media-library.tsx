'use client';

/**
 * Médiathèque de la campagne dans la zone d'envoi (docs/mediatheque.md) : fil d'Ariane, dossiers
 * puis images du dossier ouvert ; un clic sur une image la choisit. Créer, renommer, supprimer
 * un dossier ; glisser une image sur un dossier (ou un niveau du fil d'Ariane) l'y range ; le MJ
 * rend un dossier ou une image visible des joueurs. « Envoyer ici » envoie dans le dossier ouvert.
 */
import type { LibraryKind, MediaFile, MediaFolder } from '@vtt/contracts';
import { useTranslations } from 'next-intl';
import {
  ChevronRight,
  Eye,
  EyeOff,
  Film,
  Folder,
  FolderPlus,
  ImageOff,
  Images,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Info } from '@/components/ui/tooltip';
import { lastMediaFolder, useMediaListing, useMediaMutations } from '@/lib/media';
import { cn } from '@/lib/utils';

const GLISSE = 'application/x-vtt-media';

export function MediaLibrary({
  campaignId,
  kind,
  value,
  open,
  onOpenChange,
  onPick,
  onUploadHere,
}: Readonly<{
  campaignId: string;
  kind: LibraryKind;
  value: string | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPick(url: string): void;
  /** Envoyer un fichier dans ce dossier (null : racine). */
  onUploadHere(folderId: string | null): void;
}>) {
  const t = useTranslations('uploads.library');
  const dossier = useStore(lastMediaFolder, (s) => s[campaignId] ?? null);
  const ouvrir = (id: string | null) => lastMediaFolder.setState({ [campaignId]: id });
  const listing = useMediaListing(campaignId, dossier, kind, open);
  const m = useMediaMutations(campaignId);
  const [nouveau, setNouveau] = useState(false);
  const data = listing.data;

  // Dossier disparu (supprimé ailleurs, plus visible) : retour à la racine
  useEffect(() => {
    if (listing.isError && dossier) ouvrir(null);
  }, [listing.isError, dossier]); // eslint-disable-line react-hooks/exhaustive-deps

  const ranger = (key: string, folderId: string | null) =>
    m.updateFile.mutate({ key, body: { folderId } });
  const deposer = (folderId: string | null) => (e: DragEvent) => {
    const key = e.dataTransfer.getData(GLISSE);
    if (!key) return;
    e.preventDefault();
    ranger(key, folderId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(42rem,85dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('hint')}</DialogDescription>

        {/* Fil d'Ariane et actions */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 pr-12">
          <nav aria-label={t('path')} className="flex min-w-0 flex-1 items-center gap-0.5 text-sm">
            <Etape
              actif={!dossier}
              onClick={() => ouvrir(null)}
              onDrop={deposer(null)}
              icone={<Images className="size-4" aria-hidden />}
            >
              {t('title')}
            </Etape>
            {data?.path.map((p) => (
              <span key={p.id} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight className="size-3.5 shrink-0 text-subtle" aria-hidden />
                <Etape actif={p.id === dossier} onClick={() => ouvrir(p.id)} onDrop={deposer(p.id)}>
                  {p.name}
                </Etape>
              </span>
            ))}
          </nav>
          {(data?.path.length ?? 0) < 3 && (
            <Info texte={t('newFolder')}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('newFolder')}
                onClick={() => setNouveau(true)}
              >
                <FolderPlus />
              </Button>
            </Info>
          )}
          <Button size="sm" onClick={() => onUploadHere(dossier)}>
            <Upload />
            {t('uploadHere')}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {listing.isLoading ? (
            <Loader2 className="mx-auto mt-16 size-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="space-y-5">
              {(nouveau || (data?.folders.length ?? 0) > 0) && (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
                  {nouveau && (
                    <li>
                      <NomDossier
                        onDone={(name) => {
                          setNouveau(false);
                          if (name) m.createFolder.mutate({ name, parentId: dossier });
                        }}
                      />
                    </li>
                  )}
                  {data?.folders.map((f) => (
                    <li key={f.id}>
                      <CarteDossier
                        folder={f}
                        gm={data.gm}
                        onOpen={() => ouvrir(f.id)}
                        onDrop={deposer(f.id)}
                        onRename={(name) =>
                          m.updateFolder.mutate({ id: f.id, body: { name, version: f.version } })
                        }
                        onVisible={(visibleToPlayers) =>
                          m.updateFolder.mutate({
                            id: f.id,
                            body: { visibleToPlayers, version: f.version },
                          })
                        }
                        onDelete={() => m.removeFolder.mutate(f.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {data && data.files.length > 0 ? (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
                  {data.files.map((f) => (
                    <li key={f.key}>
                      <Vignette
                        file={f}
                        gm={data.gm}
                        selected={f.url === value}
                        parent={data.path.at(-2)?.id ?? null}
                        inFolder={!!dossier}
                        onPick={() => {
                          onPick(f.url);
                          onOpenChange(false);
                        }}
                        onMove={(folderId) => ranger(f.key, folderId)}
                        onVisible={(visibleToPlayers) =>
                          m.updateFile.mutate({ key: f.key, body: { visibleToPlayers } })
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                !nouveau &&
                !data?.folders.length && (
                  <div className="grid place-items-center gap-2 pt-16 text-muted-foreground">
                    <span className="grid size-12 place-items-center rounded-2xl bg-surface-2">
                      <ImageOff className="size-5" aria-hidden />
                    </span>
                    <span className="text-[13px]">{t('empty')}</span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Un niveau du fil d'Ariane : l'ouvrir, ou y déposer une image. */
function Etape({
  actif,
  onClick,
  onDrop,
  icone,
  children,
}: Readonly<{
  actif: boolean;
  onClick(): void;
  onDrop(e: DragEvent): void;
  icone?: ReactNode;
  children: ReactNode;
}>) {
  const [survol, setSurvol] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => {
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        setSurvol(false);
        onDrop(e);
      }}
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition-colors',
        actif
          ? 'text-foreground'
          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        survol && 'bg-primary/15 text-primary',
      )}
    >
      {icone}
      <span className="truncate">{children}</span>
    </button>
  );
}

function NomDossier({
  initial = '',
  onDone,
}: Readonly<{ initial?: string; onDone(name: string | null): void }>) {
  const t = useTranslations('uploads.library');
  const [nom, setNom] = useState(initial);
  const finir = () => onDone(nom.trim() ? nom.trim().slice(0, 60) : null);
  return (
    <div className="flex h-14 items-center gap-2 rounded-xl bg-surface-2/70 px-3 ring-1 ring-primary/50">
      <Folder className="size-5 shrink-0 text-primary" aria-hidden />
      <Input
        autoFocus
        value={nom}
        maxLength={60}
        placeholder={t('folderName')}
        aria-label={t('folderName')}
        onChange={(e) => setNom(e.target.value)}
        onBlur={finir}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finir();
          if (e.key === 'Escape') onDone(null);
        }}
        className="h-8 border-none bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

function CarteDossier({
  folder: f,
  gm,
  onOpen,
  onDrop,
  onRename,
  onVisible,
  onDelete,
}: Readonly<{
  folder: MediaFolder;
  gm: boolean;
  onOpen(): void;
  onDrop(e: DragEvent): void;
  onRename(name: string): void;
  onVisible(visible: boolean): void;
  onDelete(): void;
}>) {
  const t = useTranslations('uploads.library');
  const [renommer, setRenommer] = useState(false);
  const [survol, setSurvol] = useState(false);
  const modifiable = gm || f.mine;
  if (renommer)
    return (
      <NomDossier
        initial={f.name}
        onDone={(name) => {
          setRenommer(false);
          if (name && name !== f.name) onRename(name);
        }}
      />
    );
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        setSurvol(false);
        onDrop(e);
      }}
      className={cn(
        'group relative flex h-14 items-center rounded-xl bg-surface-2/60 transition-colors hover:bg-surface-2',
        survol && 'bg-primary/15 ring-1 ring-primary/60',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-3 text-left"
      >
        <Folder className="size-5 shrink-0 fill-primary/15 text-primary" aria-hidden />
        <span className="truncate text-[13px] font-medium">{f.name}</span>
        {gm && f.visibleToPlayers && (
          <Eye className="size-3.5 shrink-0 text-primary" aria-label={t('visible')} />
        )}
      </button>
      {modifiable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('folderActions', { name: f.name })}
              className="mr-1.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {gm && (
              <DropdownMenuItem onSelect={() => onVisible(!f.visibleToPlayers)}>
                {f.visibleToPlayers ? <EyeOff /> : <Eye />}
                {f.visibleToPlayers ? t('hideFromPlayers') : t('showToPlayers')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setRenommer(true)}>
              <Pencil />
              {t('rename')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onDelete}
            >
              <Trash2 />
              {t('deleteFolder')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function Vignette({
  file: f,
  gm,
  selected,
  parent,
  inFolder,
  onPick,
  onMove,
  onVisible,
}: Readonly<{
  file: MediaFile;
  gm: boolean;
  selected: boolean;
  /** Dossier parent du dossier ouvert (pour « remonter d'un niveau »). */
  parent: string | null;
  inFolder: boolean;
  onPick(): void;
  onMove(folderId: string | null): void;
  onVisible(visible: boolean): void;
}>) {
  const t = useTranslations('uploads.library');
  const video = f.contentType?.startsWith('video/') ?? false;
  const rangeable = gm || f.mine;
  return (
    <div
      draggable={rangeable}
      onDragStart={(e) => {
        e.dataTransfer.setData(GLISSE, f.key);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-xl bg-surface-2 ring-offset-2 ring-offset-background transition-shadow',
        selected ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-border-strong',
      )}
    >
      <button
        type="button"
        onClick={onPick}
        aria-label={t('pick')}
        className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {video ? (
          <video src={f.url} muted preload="metadata" className="size-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.url} alt="" loading="lazy" className="size-full object-cover" />
        )}
      </button>
      <span className="pointer-events-none absolute left-1.5 top-1.5 flex gap-1">
        {video && (
          <span className="grid size-5 place-items-center rounded-md bg-background/80">
            <Film className="size-3" aria-hidden />
          </span>
        )}
        {gm && f.visibleToPlayers && (
          <span className="grid size-5 place-items-center rounded-md bg-background/80 text-primary">
            <Eye className="size-3" aria-label={t('visible')} />
          </span>
        )}
      </span>
      {(gm || (rangeable && inFolder)) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon-xs"
              aria-label={t('imageActions')}
              className="absolute right-1.5 top-1.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {gm && (
              <DropdownMenuItem onSelect={() => onVisible(!f.visibleToPlayers)}>
                {f.visibleToPlayers ? <EyeOff /> : <Eye />}
                {f.visibleToPlayers ? t('hideFromPlayers') : t('showToPlayers')}
              </DropdownMenuItem>
            )}
            {rangeable && inFolder && (
              <DropdownMenuItem onSelect={() => onMove(parent)}>
                <Folder />
                {t('moveUp')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
