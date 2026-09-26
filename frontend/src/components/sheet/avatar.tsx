'use client';

/**
 * Portrait du personnage, repris du bloc « Avatar » de l'ancienne fiche :
 * l'image remplit la case (ou l'initiale sur un dégradé, comme les cartes de
 * personnage) ; le propriétaire la change par son adresse.
 */
import { ImageIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { writes } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { SheetDialog } from './elements';
import { accentButton, field, focus, panel, secondaryButton, textMuted } from './styles';

export function CharacterAvatar({ className }: { className?: string }) {
  const { character, readOnly } = useSheet();
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const url = character.avatarUrl && failed !== character.avatarUrl ? character.avatarUrl : null;

  return (
    <div className={cn(panel, 'group relative overflow-hidden p-0', className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={character.nom}
          onError={() => setFailed(url)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900"
        >
          <span className="select-none font-serif text-6xl font-bold text-zinc-400">
            {character.nom.charAt(0).toUpperCase() || '?'}
          </span>
        </div>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10"
      />
      {!readOnly && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            'absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
            focus,
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          Changer l&apos;image
        </button>
      )}
      {editing && <AvatarDialog onClose={() => setEditing(false)} />}
    </div>
  );
}

function AvatarDialog({ onClose }: { onClose(): void }) {
  const { character, write } = useSheet();
  const [value, setValue] = useState(character.avatarUrl ?? '');
  const [sending, setSending] = useState(false);
  const trimmed = value.trim();
  const valid = trimmed === '' || /^https?:\/\/\S+$/.test(trimmed);

  async function save(url: string | null) {
    setSending(true);
    const ok = await write(writes.update({ avatarUrl: url }));
    setSending(false);
    if (ok) onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) await save(trimmed || null);
  }

  return (
    <SheetDialog
      open
      onClose={onClose}
      title="Image du personnage"
      description="Adresse d'une image (https://…)."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-3">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[color:var(--fiche-bordure)] bg-zinc-900">
            {trimmed && valid && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={trimmed} alt="" className="h-full w-full object-cover object-top" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <label
              htmlFor="avatar-url"
              className={cn(textMuted, 'block text-xs font-bold uppercase tracking-wider')}
            >
              Adresse de l&apos;image
            </label>
            <input
              id="avatar-url"
              type="url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://…"
              className={field}
              aria-invalid={!valid}
              autoFocus
            />
            {!valid && <p className="text-xs text-red-300">Adresse https:// attendue.</p>}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {character.avatarUrl && (
            <button
              type="button"
              className={cn(secondaryButton, 'mr-auto')}
              onClick={() => void save(null)}
              disabled={sending}
            >
              Retirer l&apos;image
            </button>
          )}
          <button type="button" className={secondaryButton} onClick={onClose} disabled={sending}>
            Annuler
          </button>
          <button type="submit" className={accentButton} disabled={sending || !valid}>
            Enregistrer
          </button>
        </div>
      </form>
    </SheetDialog>
  );
}
