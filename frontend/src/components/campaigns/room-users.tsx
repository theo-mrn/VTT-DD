'use client';

/**
 * Joueurs de la salle, repris de l'ancienne app (RoomUsersManager) : membres
 * avec le personnage qu'ils incarnent, bannissement et levée des bannissements
 * par le MJ. Un clic sur un joueur ouvre son profil.
 */
import { Shield, Trash2, User, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { useResource } from '@/lib/resource';
import {
  listBanned,
  listRoomCharacters,
  removeMember,
  unban,
  type BannedUser,
  type RoomMember,
} from '@/lib/rooms';
import { useSession } from '@/lib/session';

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function RoomUsersManager({
  roomId,
  members,
  canManage,
  onChanged,
}: {
  roomId: string;
  members: RoomMember[];
  /** L'utilisateur est MJ : il bannit et lève les bannissements. */
  canManage: boolean;
  onChanged?(): void;
}) {
  const { profile } = useSession();
  const characters = useResource(`salle:${roomId}:personnages`, () => listRoomCharacters(roomId));
  const banned = useResource(canManage ? `salle:${roomId}:bannis` : null, () => listBanned(roomId));
  const [userToKick, setUserToKick] = useState<RoomMember | null>(null);
  const [kicking, setKicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const played = (userId: string) => characters.data?.find((c) => same(c.incarnePar, userId));

  async function handleKick() {
    if (!userToKick) return;
    setKicking(true);
    setError(null);
    try {
      await removeMember(roomId, userToKick.userId, true);
      setUserToKick(null);
      onChanged?.();
      void banned.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setKicking(false);
    }
  }

  async function handleUnban(u: BannedUser) {
    banned.update((list) => list?.filter((b) => b.userId !== u.userId));
    try {
      await unban(roomId, u.userId);
    } catch (err) {
      setError(errorMessage(err));
      void banned.reload();
    }
  }

  const bannedList = banned.data ?? [];

  return (
    <Card className="border-none bg-transparent text-[var(--text-primary)] ring-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Joueurs ({members.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <p className="py-6 text-center text-sm italic text-muted-foreground">
            Aucun joueur dans cette salle pour le moment.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-2">
            {members.map((u) => {
              const isMJ = u.role === 'mj';
              const character = played(u.userId);
              const name = u.nom ?? 'Utilisateur inconnu';
              return (
                <div
                  key={u.userId}
                  className="group flex items-center justify-between rounded-xl border border-transparent p-3 transition-all duration-200 hover:border-white/10 hover:bg-white/5"
                >
                  <Link
                    href={`/players/${u.userId}`}
                    className="flex min-w-0 items-center gap-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brown)]"
                  >
                    <Avatar className="h-10 w-10 border border-[var(--border-color)] transition-colors group-hover:border-[color-mix(in_srgb,var(--accent-brown)_50%,transparent)]">
                      {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={name} />}
                      <AvatarFallback className="bg-[var(--bg-darker)] text-[var(--accent-brown)]">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-[var(--text-primary)]">
                        {name}
                        {isMJ && (
                          <span title="Maître du Jeu">
                            <Shield className="h-3.5 w-3.5 text-[var(--accent-brown)]" />
                          </span>
                        )}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {isMJ && !character ? (
                          <span className="font-medium text-[color-mix(in_srgb,var(--accent-brown)_80%,transparent)]">
                            Maître du Jeu
                          </span>
                        ) : u.role === 'spectateur' && !character ? (
                          <span>Spectateur</span>
                        ) : (
                          <div
                            className="flex min-w-0 items-center gap-2"
                            style={{
                              color: 'color-mix(in srgb, var(--text-primary) 70%, transparent)',
                            }}
                          >
                            {character?.avatarUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={character.avatarUrl}
                                alt={character.nom}
                                className="h-4 w-4 rounded-full border border-white/10 object-cover"
                              />
                            )}
                            <span className="max-w-[140px] truncate tracking-wide">
                              {character?.nom ?? 'Sans personnage'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>

                  {canManage && !same(u.userId, profile?.id) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setUserToKick(u)}
                      className="h-8 w-8 shrink-0 text-muted-foreground opacity-100 transition-all hover:bg-red-500/20 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Bannir"
                      aria-label={`Bannir ${name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="mt-3 px-3 text-xs text-red-400">{error}</p>}

        {canManage && bannedList.length > 0 && (
          <div className="mt-6 border-t border-[var(--border-color)] pt-4">
            <h4 className="mb-3 flex items-center gap-2 px-3 text-sm font-semibold text-red-400">
              <Shield className="h-4 w-4" /> Joueurs Bannis ({bannedList.length})
            </h4>
            <div className="max-h-[30vh] space-y-1 overflow-y-auto pr-2">
              {bannedList.map((u) => (
                <div
                  key={u.userId}
                  className="group flex items-center justify-between rounded-xl border border-transparent p-3 opacity-60 transition-all duration-200 hover:border-white/10 hover:bg-white/5 hover:opacity-100"
                >
                  <Link href={`/players/${u.userId}`} className="flex min-w-0 items-center gap-4">
                    <Avatar className="h-8 w-8 border border-[var(--border-color)] grayscale">
                      {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.nom ?? ''} />}
                      <AvatarFallback className="bg-[var(--bg-darker)] text-[var(--accent-brown)]">
                        <User className="h-3 w-3" />
                      </AvatarFallback>
                    </Avatar>
                    <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {u.nom ?? 'Utilisateur inconnu'}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleUnban(u)}
                    className="h-8 shrink-0 text-xs text-muted-foreground opacity-100 transition-all hover:bg-green-500/20 hover:text-green-400 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    Débannir
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={!!userToKick} onOpenChange={(open) => !open && !kicking && setUserToKick(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bannir un joueur</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir bannir {userToKick?.nom ?? 'ce joueur'} de cette salle ? Ils
              perdront l&apos;accès à la salle et ne pourront plus la rejoindre.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button variant="outline" disabled={kicking}>
                Annuler
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void handleKick()} disabled={kicking}>
              Confirmer le bannissement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
