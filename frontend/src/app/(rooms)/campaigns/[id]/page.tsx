'use client';

/**
 * Campagne sélectionnée, reprise de l'ancienne page « mes-campagnes » (vue
 * détaillée) : image, description, discussion, informations, actions,
 * sessions, créateur et joueurs, paramètres pour le MJ.
 */
import { Copy, Link2, Loader2, LogOut, Play, Settings, Users } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loading } from '@/components/account/elements';
import { aclonica, Notice, outlineButton, primaryButton } from '@/components/campaigns/elements';
import { RoomChat } from '@/components/campaigns/room-chat';
import {
  CreatorCard,
  DescriptionCard,
  InfoCard,
  RoomCard,
  RoomHeaderBar,
  RoomHero,
  RoomLayout,
  RoomPanel,
} from '@/components/campaigns/room-panels';
import { RoomSessions } from '@/components/campaigns/room-sessions';
import { RoomSettingsManager } from '@/components/campaigns/room-settings';
import { RoomUsersManager } from '@/components/campaigns/room-users';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { errorMessage } from '@/lib/api';
import { useResource } from '@/lib/resource';
import {
  createInvitation,
  getRoom,
  listRoomCharacters,
  removeMember,
  type Invitation,
} from '@/lib/rooms';
import { useProfile } from '@/lib/session';
import { listSystems } from '@/lib/systems';
import { cn } from '@/lib/utils';

const same = (a: string | null | undefined, b: string) =>
  !!a && a.toLowerCase() === b.toLowerCase();

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useProfile();
  const room = useResource(`salle:${id}`, () => getRoom(id));
  const systems = useResource('systemes', listSystems);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (room.error && !room.data)
    return (
      <div className="container mx-auto max-w-lg space-y-4 px-4 py-16">
        <Notice>{room.error}</Notice>
        <Button
          variant="outline"
          className={outlineButton}
          onClick={() => router.push('/campaigns')}
        >
          Retour à mes campagnes
        </Button>
      </div>
    );
  if (!room.data) return <Loading text="Chargement de la campagne…" />;

  const r = room.data;
  const isOwner = same(r.proprietaireId, profile.id);
  const isGm = r.role === 'mj';
  // Places occupées : membres qui ne sont pas MJ (spectateurs compris)
  const players = r.joueurs ?? r.membres.filter((m) => m.role !== 'mj').length;
  const owner = r.membres.find((m) => same(m.userId, r.proprietaireId));
  const systemName = systems.data?.find((s) => s.id === r.systeme.id)?.nom ?? r.systeme.id;

  // « Jouer » : le MJ va à la table ; un joueur y retrouve son personnage, sinon il en choisit un
  async function play() {
    if (launching) return;
    setLaunching(true);
    setError(null);
    if (isGm) {
      router.push(`/campaigns/${id}/play`);
      return;
    }
    // Le détail de la salle dit quel personnage j'incarne ; sinon on le cherche dans la liste
    let playing = r.personnageIncarne;
    if (playing === undefined) {
      try {
        const characters = await listRoomCharacters(id);
        playing = characters.find((c) => same(c.incarnePar, profile.id))?.characterId ?? null;
      } catch {
        playing = null;
      }
    }
    router.push(playing ? `/campaigns/${id}/play` : `/campaigns/${id}/characters`);
  }

  async function leave() {
    setLeaving(true);
    setError(null);
    try {
      await removeMember(id, profile.id);
      router.push('/campaigns');
    } catch (err) {
      setError(errorMessage(err));
      setLeaving(false);
    }
  }

  return (
    <>
      <RoomHeaderBar title={r.nom} onBack={() => router.push('/campaigns')} />

      <RoomLayout
        main={
          <>
            <RoomHero url={r.imageUrl} title={r.nom} />
            <DescriptionCard text={r.description} />
            <RoomPanel>
              <RoomChat roomId={id} isOwner={isGm} />
            </RoomPanel>
          </>
        }
        side={
          <>
            <InfoCard
              players={players}
              max={r.maxJoueurs}
              isPublic={r.publique}
              system={systemName}
            >
              {isGm && r.code && (
                <div className="border-t border-[var(--border-color)] pt-4">
                  <p className="mb-2 text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                    Code de la salle :
                  </p>
                  <code className="block rounded-lg border border-[var(--border-color)] bg-[var(--bg-dark)] px-4 py-3 text-center font-mono text-lg font-bold text-[var(--accent-brown)] shadow-inner">
                    {r.code}
                  </code>
                </div>
              )}
              {isGm && <InvitationLink roomId={id} />}
            </InfoCard>

            <RoomCard title="Actions">
              <div className="space-y-3">
                <Button
                  onClick={() => void play()}
                  disabled={launching}
                  size="lg"
                  className={cn(primaryButton, 'h-12 w-full gap-2')}
                >
                  {launching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isGm ? 'Jouer (MJ)' : 'Jouer'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/campaigns/${id}/characters`)}
                  className={cn(outlineButton, 'h-12 w-full gap-2')}
                >
                  <Users className="h-4 w-4" />
                  Personnages de la salle
                </Button>
                {isGm && (
                  <Button
                    variant="outline"
                    onClick={() => setSettingsOpen(true)}
                    className={cn(outlineButton, 'h-12 w-full gap-2')}
                  >
                    <Settings className="h-4 w-4" />
                    Gérer la salle
                  </Button>
                )}
                {!isOwner && (
                  <Button
                    variant="ghost"
                    onClick={() => void leave()}
                    disabled={leaving}
                    className="h-10 w-full gap-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    {leaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}
                    Quitter la campagne
                  </Button>
                )}
                {error && <Notice>{error}</Notice>}
              </div>
            </RoomCard>

            <RoomPanel>
              <RoomSessions roomId={id} isOwner={isGm} />
            </RoomPanel>

            {owner && (
              <CreatorCard name={owner.nom ?? 'Maître du jeu'} avatarUrl={owner.avatarUrl} />
            )}

            <RoomPanel>
              <RoomUsersManager
                roomId={id}
                members={r.membres}
                canManage={isGm}
                onChanged={() => void room.reload()}
              />
            </RoomPanel>
          </>
        }
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-2xl overflow-hidden border-[var(--border-color)] bg-[var(--bg-card)] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className={cn(aclonica, 'text-2xl font-bold text-[var(--accent-brown)]')}>
              Paramètres de la campagne
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto">
            <RoomSettingsManager
              room={r}
              players={players}
              isOwner={isOwner}
              onSaved={() => void room.reload()}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Lien d'invitation à partager (MJ) : créé à la demande, copié en un clic. */
function InvitationLink({ roomId }: { roomId: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le lien du service vise /rejoindre/<code> ; le front l'ouvre sous /join/<code>
  const url = invitation
    ? typeof window !== 'undefined'
      ? `${window.location.origin}/join/${encodeURIComponent(invitation.code)}`
      : invitation.url
    : null;

  async function create() {
    setSending(true);
    setError(null);
    try {
      setInvitation(await createInvitation(roomId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copie impossible : sélectionnez le lien à la main.');
    }
  }

  return (
    <div className="space-y-2 border-t border-[var(--border-color)] pt-4">
      {url ? (
        <>
          <p className="text-sm font-bold uppercase tracking-widest text-[var(--text-secondary)]">
            Lien d&apos;invitation :
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              aria-label="Lien d'invitation"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-dark)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={() => void copy()}
              aria-label="Copier le lien"
              className={outlineButton}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {copied && <p className="text-xs text-green-400">Lien copié !</p>}
          {invitation?.expireLe && (
            <p className="text-xs text-[var(--text-secondary)]">
              Expire le{' '}
              {new Date(invitation.expireLe).toLocaleString('fr-FR', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </>
      ) : (
        <Button
          variant="outline"
          onClick={() => void create()}
          disabled={sending}
          className={cn(outlineButton, 'w-full gap-2')}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Créer un lien d&apos;invitation
        </Button>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
