'use client';

/**
 * « Nouveau héros » dans une salle : crée le personnage dans le système de la
 * salle, l'engage, l'incarne, puis ouvre la création avec retour vers la
 * salle. On peut aussi engager un de ses personnages existants du même système.
 */
import { creationDe } from '@vtt/rules';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Loading } from '@/components/account/elements';
import { aclonica } from '@/components/account/styles';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { createCharacter, listCharacters } from '@/lib/characters';
import { useResource } from '@/lib/resource';
import { engageCharacter, playCharacter } from '@/lib/rooms';
import { useSystem } from '@/lib/systems';
import { cn } from '@/lib/utils';
import { Notice } from './elements';

export function NewRoomCharacterDialog({
  open,
  onClose,
  roomId,
  systemId,
  engagedIds,
  canCreate,
}: {
  open: boolean;
  onClose(): void;
  roomId: string;
  systemId: string;
  /** Personnages déjà engagés dans la salle (écartés de « mes personnages »). */
  engagedIds: string[];
  /** Création d'un nouveau personnage permise (salle ouverte à la création, ou MJ). */
  canCreate: boolean;
}) {
  const router = useRouter();
  const ready = useSystem(open ? systemId : null);
  const mine = useResource(open ? 'personnages' : null, listCharacters);
  const [name, setName] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const system = ready.data?.system.source.id === systemId ? ready.data.system : undefined;
  // Types jouables : ceux qui ont une création déclarée, sinon tous
  const withCreation = system
    ? [...system.entites.values()].filter((e) => creationDe(system, e.type.id))
    : [];
  const types = system ? (withCreation.length ? withCreation : [...system.entites.values()]) : [];
  // Sans création libre, un joueur n'engage qu'un personnage terminé (403 creation_interdite)
  const existing = (mine.data ?? []).filter(
    (c) => c.systeme.id === systemId && !engagedIds.includes(c.id) && (canCreate || !c.creation),
  );

  useEffect(() => {
    if (types.length && (!type || !types.some((t) => t.type.id === type)))
      setType(types[0]!.type.id);
  }, [types, type]);

  function close() {
    if (sending) return;
    setName('');
    setError(null);
    onClose();
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!type || !system || sending) return;
    setSending('nouveau');
    setError(null);
    try {
      const c = await createCharacter({ systemeId: systemId, type, nom: name.trim() });
      await engageCharacter(roomId, c.id, 'joueurs');
      await playCharacter(roomId, c.id);
      const wizard = c.etat.creation && !!creationDe(system, type);
      router.push(
        wizard
          ? `/characters/${c.id}/creation?room=${encodeURIComponent(roomId)}`
          : `/campaigns/${roomId}/play`,
      );
    } catch (err) {
      setError(errorMessage(err));
      setSending(null);
    }
  }

  async function engage(id: string, creation: boolean) {
    if (sending) return;
    setSending(id);
    setError(null);
    try {
      await engageCharacter(roomId, id, 'joueurs');
      await playCharacter(roomId, id);
      router.push(
        creation
          ? `/characters/${id}/creation?room=${encodeURIComponent(roomId)}`
          : `/campaigns/${roomId}/play`,
      );
    } catch (err) {
      setError(errorMessage(err));
      setSending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="border-[var(--border-color)] bg-[var(--bg-card)] sm:max-w-lg">
        <div className="max-h-[80vh] space-y-5 overflow-y-auto pr-1">
          <DialogHeader>
            <DialogTitle className={cn(aclonica, 'text-[var(--accent-brown)]')}>
              Nouveau héros
            </DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              {system
                ? `Le personnage suit les règles de la campagne : ${system.source.nom}.`
                : 'Le personnage suit les règles de la campagne.'}
            </DialogDescription>
          </DialogHeader>

          {ready.error && !ready.data ? (
            <Notice>{ready.error}</Notice>
          ) : !system ? (
            <Loading text="Chargement des règles…" />
          ) : canCreate ? (
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="room-character-name" className="text-[var(--text-secondary)]">
                  Nom
                </Label>
                <Input
                  id="room-character-name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-[var(--border-color)] bg-[var(--bg-dark)] text-[var(--text-primary)]"
                  autoFocus
                />
              </div>
              {types.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="room-character-type" className="text-[var(--text-secondary)]">
                    Type de fiche
                  </Label>
                  <select
                    id="room-character-type"
                    value={type ?? ''}
                    onChange={(e) => setType(e.target.value)}
                    className="h-9 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-dark)] px-3 text-sm text-[var(--text-primary)]"
                  >
                    {types.map((t) => (
                      <option key={t.type.id} value={t.type.id}>
                        {t.type.nom}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={!name.trim() || !type || !!sending}
                  className="w-full bg-[var(--accent-brown)] font-bold text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] sm:w-auto"
                >
                  {sending === 'nouveau' && <Loader2 className="h-4 w-4 animate-spin" />}
                  Créer et commencer la création
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <Notice tone="info">
              Le MJ n&apos;autorise pas la création de personnages dans cette campagne : vous pouvez
              engager un de vos personnages existants.
            </Notice>
          )}

          {system && (
            <div className="space-y-2 border-t border-[var(--border-color)] pt-4">
              <p className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                Ou engager un de mes personnages
              </p>
              {mine.loading && !mine.data ? (
                <Loading />
              ) : existing.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Aucun de vos personnages de ce système n&apos;est disponible.
                </p>
              ) : (
                <ul className="space-y-1">
                  {existing.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => void engage(c.id, c.creation)}
                        disabled={!!sending}
                        className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-all hover:border-white/10 hover:bg-white/5 disabled:opacity-50"
                      >
                        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                          {c.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.avatarUrl}
                              alt=""
                              className="h-full w-full object-cover object-top"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center font-serif text-lg font-bold text-zinc-400">
                              {c.nom.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                            {c.nom}
                          </span>
                          <span className="block text-xs text-[var(--text-secondary)]">
                            {system.entites.get(c.type)?.type.nom ?? c.type}
                            {c.creation ? ' · en création' : ''}
                          </span>
                        </span>
                        {sending === c.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-brown)]" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <Notice>{error}</Notice>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
