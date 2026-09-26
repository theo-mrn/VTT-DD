'use client';

import { Check, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AppButton,
  Card,
  Loading,
  formatDate,
  formatSince,
  Message,
  PageTitle,
  Empty,
} from '@/components/account/elements';
import { PlayerRow } from '@/components/account/player-row';
import { inputStyle } from '@/components/account/styles';
import { Input } from '@/components/ui/input';
import {
  acceptFriendRequest,
  sendFriendRequest,
  removeFriend,
  deleteFriendRequest,
  useRelations,
  type Relation,
} from '@/lib/friends';
import { errorMessage } from '@/lib/api';
import { searchPlayers, type FoundPlayer } from '@/lib/profile';
import { useProfile } from '@/lib/session';
import { cn } from '@/lib/utils';

const SEARCH_DELAY = 300;

export default function FriendsPage() {
  const profile = useProfile();
  const { friends, requests, relation, act, busy, error } = useRelations(profile.id);
  const [toRemove, setToRemove] = useState<string | null>(null);

  const received = requests.data?.received ?? [];
  const sent = requests.data?.sent ?? [];

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Retrouvez vos compagnons d'aventure.">Amis</PageTitle>

      {error && <Message>{error}</Message>}

      <PlayerSearch relation={relation} act={act} busy={busy} />

      {received.length > 0 && (
        <Card title={`Demandes reçues (${received.length})`}>
          <ul className="divide-y divide-zinc-800">
            {received.map((d) => (
              <PlayerRow
                key={d.id}
                id={d.id}
                name={d.name}
                avatarUrl={d.avatarUrl}
                detail={`Demande ${formatSince(d.createdAt)}`}
                actions={
                  <>
                    <AppButton
                      size="sm"
                      loading={busy === d.id}
                      onClick={() => act(d.id, acceptFriendRequest)}
                    >
                      <Check />
                      Accepter
                    </AppButton>
                    <AppButton
                      size="sm"
                      tone="secondaire"
                      disabled={busy === d.id}
                      onClick={() => act(d.id, deleteFriendRequest)}
                    >
                      <X />
                      Refuser
                    </AppButton>
                  </>
                }
              />
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <Card title={`Mes amis${friends.data ? ` (${friends.data.length})` : ''}`}>
          {friends.loading && !friends.data ? (
            <Loading />
          ) : friends.error ? (
            <Message>{friends.error}</Message>
          ) : !friends.data?.length ? (
            <Empty>Pas encore d&apos;amis : cherchez des joueurs ci-dessus.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {friends.data.map((a) => (
                <PlayerRow
                  key={a.id}
                  id={a.id}
                  name={a.name}
                  avatarUrl={a.avatarUrl}
                  detail={[a.title, `ami depuis le ${formatDate(a.since)}`]
                    .filter(Boolean)
                    .join(' · ')}
                  actions={
                    toRemove === a.id ? (
                      <>
                        <AppButton
                          size="sm"
                          tone="danger"
                          loading={busy === a.id}
                          onClick={() => act(a.id, removeFriend).then(() => setToRemove(null))}
                        >
                          Confirmer
                        </AppButton>
                        <AppButton size="sm" tone="discret" onClick={() => setToRemove(null)}>
                          Annuler
                        </AppButton>
                      </>
                    ) : (
                      <AppButton size="sm" tone="discret" onClick={() => setToRemove(a.id)}>
                        Retirer
                      </AppButton>
                    )
                  }
                />
              ))}
            </ul>
          )}
        </Card>

        <Card title="Demandes envoyées">
          {requests.loading && !requests.data ? (
            <Loading />
          ) : requests.error ? (
            <Message>{requests.error}</Message>
          ) : sent.length === 0 ? (
            <Empty>Aucune demande en attente.</Empty>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {sent.map((d) => (
                <PlayerRow
                  key={d.id}
                  id={d.id}
                  name={d.name}
                  avatarUrl={d.avatarUrl}
                  detail={`Envoyée ${formatSince(d.createdAt)}`}
                  actions={
                    <AppButton
                      size="sm"
                      tone="discret"
                      loading={busy === d.id}
                      onClick={() => act(d.id, deleteFriendRequest)}
                    >
                      Annuler
                    </AppButton>
                  }
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Recherche de joueurs ────────────────────────────────────────────────────

function PlayerSearch({
  relation,
  act,
  busy,
}: {
  relation(id: string): Relation;
  act(id: string, action: (id: string) => Promise<unknown>): Promise<boolean>;
  busy: string | null;
}) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<FoundPlayer[] | null>(null);
  const [search, setSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Anti-rebond : on attend que la saisie se calme avant d'interroger l'API
  useEffect(() => {
    const t = text.trim();
    if (t.length < 2) {
      setResults(null);
      setSearch(false);
      setError(null);
      return;
    }
    let active = true;
    setSearch(true);
    const timer = setTimeout(() => {
      searchPlayers(t)
        .then((r) => {
          if (!active) return;
          setResults(r);
          setError(null);
        })
        .catch((err) => active && setError(errorMessage(err)))
        .finally(() => active && setSearch(false));
    }, SEARCH_DELAY);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [text]);

  const visible = (results ?? []).filter((j) => relation(j.id) !== 'moi');

  return (
    <Card title="Trouver des joueurs">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nom d'un joueur (2 caractères minimum)"
          aria-label="Rechercher un joueur"
          className={cn(inputStyle, 'pl-9')}
        />
      </div>

      {text.trim().length >= 2 && (
        <div className="mt-3">
          {error ? (
            <Message>{error}</Message>
          ) : search && !results ? (
            <Loading text="Recherche…" />
          ) : visible.length === 0 ? (
            !search && <Empty>Aucun joueur trouvé pour « {text.trim()} ».</Empty>
          ) : (
            <ul className={cn('divide-y divide-zinc-800', search && 'opacity-60')}>
              {visible.map((j) => (
                <PlayerRow
                  key={j.id}
                  id={j.id}
                  name={j.name}
                  avatarUrl={j.avatarUrl}
                  detail={j.title}
                  actions={
                    <ActionRelation
                      relation={relation(j.id)}
                      loading={busy === j.id}
                      onAdd={() => act(j.id, sendFriendRequest)}
                      onAccept={() => act(j.id, acceptFriendRequest)}
                    />
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function ActionRelation({
  relation,
  loading,
  onAdd,
  onAccept,
}: {
  relation: Relation;
  loading: boolean;
  onAdd(): void;
  onAccept(): void;
}) {
  if (relation === 'ami') return <span className="text-xs text-emerald-400">Ami</span>;
  if (relation === 'envoyee') return <span className="text-xs text-zinc-500">Demande envoyée</span>;
  if (relation === 'recue')
    return (
      <AppButton size="sm" loading={loading} onClick={onAccept}>
        <Check />
        Accepter
      </AppButton>
    );
  return (
    <AppButton size="sm" tone="secondaire" loading={loading} onClick={onAdd}>
      <UserPlus />
      Ajouter
    </AppButton>
  );
}
