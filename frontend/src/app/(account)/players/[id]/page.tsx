'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  PlayerAvatar,
  AppButton,
  Card,
  Loading,
  Message,
  formatDuration,
} from '@/components/account/elements';
import { aclonica, linkStyle } from '@/components/account/styles';
import {
  acceptFriendRequest,
  sendFriendRequest,
  removeFriend,
  deleteFriendRequest,
  useRelations,
} from '@/lib/friends';
import { getPlayer } from '@/lib/profile';
import { useResource } from '@/lib/resource';
import { useProfile } from '@/lib/session';
import { cn } from '@/lib/utils';

/** Profil public d'un joueur (GET /v1/users/:id), avec la relation d'amitié. */
export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const me = useProfile();
  const player = useResource(id ? `joueur-${id}` : null, () => getPlayer(id));
  const { relation, act, busy, error } = useRelations(me.id);

  if (player.loading && !player.data) return <Loading />;
  if (player.error || !player.data) {
    return (
      <Card>
        <Message>{player.error ?? 'Joueur introuvable.'}</Message>
        <Link href="/friends" className={cn('mt-4 inline-block', linkStyle)}>
          Retour aux amis
        </Link>
      </Card>
    );
  }

  const p = player.data;
  const link = relation(p.id);
  const isBusy = busy === p.id;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div
          className="h-36 bg-zinc-800 bg-cover bg-center sm:h-44"
          style={p.bannerUrl ? { backgroundImage: `url(${p.bannerUrl})` } : undefined}
        />
        <div className="space-y-4 p-6">
          <div className="-mt-16 flex flex-wrap items-end gap-4">
            <PlayerAvatar name={p.name} url={p.avatarUrl} border={p.borderType} size="xl" />
            <div className="min-w-0 flex-1">
              <h1 className={cn('truncate text-2xl text-white sm:text-3xl', aclonica)}>{p.name}</h1>
              {p.title && <p className="text-[#c9a965]">{p.title}</p>}
            </div>
            <div className="flex gap-2">
              {link === 'moi' && (
                <AppButton asChild tone="secondaire">
                  <Link href="/profile">Modifier mon profil</Link>
                </AppButton>
              )}
              {link === 'aucune' && (
                <AppButton loading={isBusy} onClick={() => act(p.id, sendFriendRequest)}>
                  Ajouter en ami
                </AppButton>
              )}
              {link === 'envoyee' && (
                <AppButton
                  tone="secondaire"
                  loading={isBusy}
                  onClick={() => act(p.id, deleteFriendRequest)}
                >
                  Annuler la demande
                </AppButton>
              )}
              {link === 'recue' && (
                <>
                  <AppButton loading={isBusy} onClick={() => act(p.id, acceptFriendRequest)}>
                    Accepter
                  </AppButton>
                  <AppButton
                    tone="secondaire"
                    disabled={isBusy}
                    onClick={() => act(p.id, deleteFriendRequest)}
                  >
                    Refuser
                  </AppButton>
                </>
              )}
              {link === 'ami' && (
                <AppButton tone="danger" loading={isBusy} onClick={() => act(p.id, removeFriend)}>
                  Retirer des amis
                </AppButton>
              )}
            </div>
          </div>

          {error && <Message>{error}</Message>}
          {p.bio && <p className="whitespace-pre-line text-zinc-300">{p.bio}</p>}
          <p className="text-sm text-zinc-400">
            Temps de jeu :{' '}
            <span className="text-zinc-200">{formatDuration(p.timeSpentMinutes)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
