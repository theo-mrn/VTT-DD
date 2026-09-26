'use client';

/** En-tête de la fiche (nom, système, création, renommer, supprimer) et message d'écriture. */
import { ArrowLeft, Loader2, MoreVertical, Pencil, Sparkles, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PlayerAvatar, AppButton, Message } from '@/components/account/elements';
import { aclonica, inputStyle, labelStyle } from '@/components/account/styles';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { writes, deleteCharacter } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { useSheet } from './context';

export function SheetHeader({ page }: { page: 'fiche' | 'creation' }) {
  const { character, system, state, readOnly, pending } = useSheet();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const type = system.entites.get(state.type)?.type.nom ?? state.type;

  return (
    <header className="space-y-3">
      <Link
        href="/characters"
        className="inline-flex items-center gap-1 rounded text-sm text-zinc-400 hover:text-[#c9a965] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a965]"
      >
        <ArrowLeft className="h-4 w-4" />
        Mes personnages
      </Link>
      <div className="flex items-center gap-3 sm:gap-4">
        <PlayerAvatar name={character.nom} url={character.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className={cn(aclonica, 'truncate text-2xl tracking-wide text-white sm:text-3xl')}>
            {character.nom}
          </h1>
          <p className="truncate text-sm text-zinc-400">
            {type} · {system.source.nom}
          </p>
          <p aria-live="polite" className="h-4 text-xs text-zinc-500">
            {pending > 0 && (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Enregistrement…
              </span>
            )}
          </p>
        </div>
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Actions du personnage"
              className="rounded-lg p-2 text-zinc-400 outline-none hover:bg-zinc-900 hover:text-white focus-visible:ring-2 focus-visible:ring-[#c9a965]"
            >
              <MoreVertical className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52 border-zinc-800 bg-[#0c0c0e] text-white"
            >
              <DropdownMenuItem onSelect={() => setRenaming(true)} className="cursor-pointer gap-2">
                <Pencil className="h-4 w-4" />
                Renommer
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setRemoving(true)}
                className="cursor-pointer gap-2 text-red-400 focus:bg-red-500/20 focus:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {state.creation && page === 'fiche' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c9a965]/30 bg-[#c9a965]/10 px-4 py-3 text-sm text-[#e2cc97]">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            La création de ce personnage n&apos;est pas terminée.
          </span>
          {!readOnly && (
            <AppButton asChild size="sm">
              <Link href={`/characters/${character.id}/creation`}>Reprendre la création</Link>
            </AppButton>
          )}
        </div>
      )}

      <RenameDialog open={renaming} onClose={() => setRenaming(false)} />
      <DeleteDialog open={removing} onClose={() => setRemoving(false)} />
    </header>
  );
}

export function RenameDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { character, write } = useSheet();
  const [name, setName] = useState(character.nom);
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    const ok = await write(writes.update({ nom: name.trim() }));
    setSending(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className={cn(aclonica, 'text-white')}>Renommer</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Nom affiché dans vos listes et en partie.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="renommer-personnage" className={labelStyle}>
              Nom
            </Label>
            <Input
              id="renommer-personnage"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputStyle}
              autoFocus
            />
          </div>
          <DialogFooter>
            <AppButton type="button" tone="secondaire" onClick={onClose} disabled={sending}>
              Annuler
            </AppButton>
            <AppButton type="submit" loading={sending} disabled={!name.trim()}>
              Enregistrer
            </AppButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { character } = useSheet();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setSending(true);
    setError(null);
    try {
      await deleteCharacter(character.id);
      router.push('/characters');
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4">
          <DialogHeader>
            <DialogTitle className={cn(aclonica, 'text-white')}>
              Supprimer {character.nom} ?
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              La fiche, ses achats et son historique seront définitivement effacés.
            </DialogDescription>
          </DialogHeader>
          {error && <Message>{error}</Message>}
          <DialogFooter>
            <AppButton type="button" tone="secondaire" onClick={onClose} disabled={sending}>
              Annuler
            </AppButton>
            <AppButton tone="danger" onClick={remove} loading={sending}>
              Supprimer
            </AppButton>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Erreur de la dernière écriture, en bas de l'écran (visible même en bas de fiche). */
export function WriteError({ error, onClose }: { error: string | null; onClose(): void }) {
  if (!error) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl items-start gap-2 sm:bottom-6">
      <Message className="flex-1 bg-zinc-950/95 shadow-xl backdrop-blur">{error}</Message>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer le message"
        className="rounded-lg bg-zinc-950/95 p-2 text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a965]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
