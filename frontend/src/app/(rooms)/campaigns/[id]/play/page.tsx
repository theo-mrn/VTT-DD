'use client';

/**
 * Table de jeu d'une campagne, en attendant la carte : emplacement de la
 * carte, panneau d'actions et fiche du personnage incarné. Le MJ sans
 * personnage retrouve les fiches des personnages de la salle.
 */
import { Crown, Eye, Map as MapIcon, Swords, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { ActionsPanel, type ActionTarget } from '@/components/(dices)/actions-panel';
import { Loading } from '@/components/account/elements';
import { aclonica, Notice, RoomImage } from '@/components/campaigns/elements';
import { RoomHeaderBar } from '@/components/campaigns/room-panels';
import { CharacterPage } from '@/components/sheet/character-page';
import { useSheet } from '@/components/sheet/context';
import { CharacterSheet, ThemeFrame } from '@/components/sheet/sheet';
import { ActionTargetsProvider, blockActions } from '@/components/sheet/widget-actions';
import { useResource } from '@/lib/resource';
import { getRoom, listRoomCharacters, type RoomCharacter } from '@/lib/rooms';
import { useProfile } from '@/lib/session';
import { sheetWidgets } from '@/lib/systems';
import { cn } from '@/lib/utils';

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export default function PlayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useProfile();
  const room = useResource(`salle:${id}`, () => getRoom(id));
  const characters = useResource(`salle:${id}:personnages`, () => listRoomCharacters(id));

  if (room.error && !room.data)
    return (
      <div className="container mx-auto max-w-lg px-4 py-16">
        <Notice>{room.error}</Notice>
      </div>
    );
  if (!room.data || (characters.loading && !characters.data))
    return <Loading text="Préparation de la table…" />;

  const r = room.data;
  const isGm = r.role === 'mj';
  const list = characters.data ?? [];
  const mine = list.find((c) => same(c.incarnePar, profile.id));

  return (
    <>
      <RoomHeaderBar title={r.nom} onBack={() => router.push(`/campaigns/${id}`)} />
      <div className="container mx-auto space-y-6 px-3 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            {mine ? (
              <>
                <Swords className="h-4 w-4 text-[var(--accent-brown)]" />
                Vous jouez <span className="font-bold text-[var(--text-primary)]">{mine.nom}</span>
              </>
            ) : isGm ? (
              <>
                <Crown className="h-4 w-4 text-[var(--accent-brown)]" />
                Vous menez la partie en tant que Maître du Jeu
              </>
            ) : (
              'Vous n’incarnez aucun personnage.'
            )}
          </p>
          <Link
            href={`/campaigns/${id}/characters`}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-white/10"
          >
            <Users className="h-4 w-4" />
            Changer de personnage
          </Link>
        </div>

        <MapPlaceholder imageUrl={r.imageUrl} title={r.nom} />

        {characters.error && !characters.data && <Notice>{characters.error}</Notice>}

        {mine ? (
          <CharacterPage id={mine.characterId} gm={isGm}>
            <IncarnatedSheet roomCharacters={list} />
          </CharacterPage>
        ) : isGm ? (
          <GmCharacters roomId={id} characters={list} />
        ) : (
          <Notice tone="info">
            Choisissez un personnage pour prendre place à la table.{' '}
            <Link href={`/campaigns/${id}/characters`} className="font-bold underline">
              Choisir un personnage
            </Link>
          </Notice>
        )}
      </div>
    </>
  );
}

/** Emplacement de la future carte (brouillard, lumières, jetons). */
function MapPlaceholder({
  imageUrl,
  title,
}: {
  imageUrl: string | null | undefined;
  title: string;
}) {
  return (
    <div className="relative aspect-[16/7] min-h-[200px] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-dark)] shadow-2xl">
      <div className="absolute inset-0 scale-110 opacity-30 blur-sm">
        <RoomImage url={imageUrl} alt="" zoom={false} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
      <div className="relative flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div
          className="rounded-2xl p-3"
          style={{
            background: 'color-mix(in srgb, var(--accent-brown) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent-brown) 30%, transparent)',
          }}
        >
          <MapIcon className="h-8 w-8 text-[var(--accent-brown)]" />
        </div>
        <h2 className={cn(aclonica, 'text-xl text-[var(--text-primary)] sm:text-2xl')}>
          La carte arrive
        </h2>
        <p className="max-w-md text-sm text-[var(--text-secondary)]">
          La table de {title} accueillera bientôt la carte, les jetons et le brouillard. En
          attendant, jouez depuis la fiche et le panneau d&apos;actions.
        </p>
      </div>
    </div>
  );
}

/**
 * Fiche du personnage incarné et son panneau d'actions, qui vise les autres
 * personnages de la salle. Le panneau est celui de la fiche quand la
 * présentation en a un ; sinon il est posé au-dessus de la fiche.
 */
function IncarnatedSheet({ roomCharacters }: { roomCharacters: RoomCharacter[] }) {
  const s = useSheet();
  const selfId = s.character.id;
  const targets = useMemo<ActionTarget[]>(
    () =>
      roomCharacters
        .filter((c) => c.characterId !== selfId && !c.creation)
        .map((c) => ({ id: c.characterId, name: c.nom, type: c.type })),
    [roomCharacters, selfId],
  );
  const inSheet = sheetWidgets(s.ready, s.state.type).some((w) => w.type === 'actions');
  const hasActions = blockActions(s.system.actions, s.state.type).length > 0;

  return (
    <ActionTargetsProvider targets={targets}>
      <div className="space-y-6">
        {hasActions && !inSheet && (
          <ThemeFrame className="mx-auto max-w-5xl">
            <ActionsPanel
              characterId={selfId}
              system={s.system}
              presentation={s.presentation}
              sheet={s.sheet}
              name={s.character.nom}
              targets={targets}
              onApplied={() => s.reload()}
            />
          </ThemeFrame>
        )}
        <CharacterSheet />
      </div>
    </ActionTargetsProvider>
  );
}

/** Le MJ sans personnage : accès direct aux fiches de la salle. */
function GmCharacters({ roomId, characters }: { roomId: string; characters: RoomCharacter[] }) {
  if (!characters.length)
    return <Notice tone="info">Aucun personnage n&apos;est encore engagé dans la salle.</Notice>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {characters.map((c) => (
        <li key={c.characterId}>
          <Link
            href={`/characters/${c.characterId}?room=${encodeURIComponent(roomId)}`}
            className="group flex items-center gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3 transition-all hover:border-[color-mix(in_srgb,var(--accent-brown)_40%,transparent)]"
          >
            <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
              {c.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatarUrl} alt="" className="h-full w-full object-cover object-top" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-serif text-xl font-bold text-zinc-400">
                  {c.nom.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-brown)]">
                {c.nom}
              </span>
              <span className="block text-xs text-[var(--text-secondary)]">
                {c.camp === 'joueurs' ? 'Joueurs' : c.camp === 'allies' ? 'Alliés' : 'Adversaires'}
                {c.creation ? ' · en création' : ''}
              </span>
            </span>
            <Eye className="h-4 w-4 text-[var(--text-secondary)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
