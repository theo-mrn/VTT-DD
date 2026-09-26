'use client';

/**
 * « Qui joue ? », reprise de l'ancienne page « personnages » : personnages
 * de la salle (camp des joueurs), le mien, ceux pris par d'autres, « Nouveau
 * héros », « Maître du Jeu » pour le MJ, et le retrait d'un personnage par le MJ.
 */
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Crown,
  Eye,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CharacterCard } from '@/components/campaigns/character-card';
import { Notice } from '@/components/campaigns/elements';
import { NewRoomCharacterDialog } from '@/components/campaigns/new-room-character';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { useResource } from '@/lib/resource';
import {
  getRoom,
  listRoomCharacters,
  playCharacter,
  removeRoomCharacter,
  type RoomCharacter,
} from '@/lib/rooms';
import { useProfile } from '@/lib/session';
import { cn } from '@/lib/utils';

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export default function RoomCharactersPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useProfile();
  const room = useResource(`salle:${id}`, () => getRoom(id));
  const characters = useResource(`salle:${id}:personnages`, () => listRoomCharacters(id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gmLoading, setGmLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<RoomCharacter | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [removing, setRemoving] = useState(false);

  const r = room.data;
  const isGm = r?.role === 'mj';
  const loading = (room.loading && !r) || (characters.loading && !characters.data);
  const list = (characters.data ?? []).filter((c) => c.camp === 'joueurs');
  const memberName = (userId: string) =>
    r?.membres.find((m) => same(m.userId, userId))?.nom ?? 'un joueur';

  async function refresh() {
    await Promise.all([room.reload(), characters.reload()]);
  }

  async function play(c: RoomCharacter) {
    if (selectedId) return;
    setSelectedId(c.characterId);
    setError(null);
    try {
      await playCharacter(id, c.characterId);
      router.push(
        c.creation && same(c.proprietaireId, profile.id)
          ? `/characters/${c.characterId}/creation?room=${encodeURIComponent(id)}`
          : `/campaigns/${id}/play`,
      );
    } catch (err) {
      setError(
        err instanceof ApiError && err.problem.code === 'personnage_pris'
          ? 'Ce personnage vient d’être pris par un autre joueur.'
          : errorMessage(err),
      );
      setSelectedId(null);
      void characters.reload();
    }
  }

  async function startAsGm() {
    setGmLoading(true);
    setError(null);
    try {
      await playCharacter(id, null);
      router.push(`/campaigns/${id}/play`);
    } catch (err) {
      setError(errorMessage(err));
      setGmLoading(false);
    }
  }

  async function confirmRemove() {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await removeRoomCharacter(id, toRemove.characterId);
      characters.update((l) => l?.filter((c) => c.characterId !== toRemove.characterId));
      setToRemove(null);
      setConfirmText('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemoving(false);
    }
  }

  if (room.error && !r)
    return (
      <div className="container mx-auto max-w-lg space-y-4 px-4 py-16">
        <Notice>{room.error}</Notice>
        <Link href="/campaigns" className="text-sm text-[var(--accent-brown)] hover:underline">
          Retour à mes campagnes
        </Link>
      </div>
    );

  const canCreate = !!r && (r.creationPersonnages !== false || isGm);

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center px-4 py-12">
      <Link
        href={`/campaigns/${id}`}
        className="mb-6 inline-flex items-center gap-1 self-start rounded text-sm text-zinc-400 hover:text-[#c0a080] sm:absolute sm:left-6 sm:top-6 sm:mb-0"
      >
        <ArrowLeft className="h-4 w-4" />
        {r?.nom ?? 'Campagne'}
      </Link>

      <motion.div
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="mb-14 text-center"
      >
        <h1
          className="mb-3 font-[family-name:var(--font-aclonica)] text-4xl font-bold tracking-tight md:text-6xl"
          style={{
            background: 'linear-gradient(135deg, #e8d5b7 0%, #c0a080 50%, #8a6a4b 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Qui joue&nbsp;?
        </h1>
        <p className="text-base font-light tracking-wide text-zinc-400 md:text-lg">
          Choisissez votre incarnation pour cette aventure
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || room.loading || characters.loading}
          className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-zinc-400 transition-all hover:bg-white/10 hover:text-[#c0a080]"
        >
          <RotateCcw
            className={cn('h-3.5 w-3.5', (room.loading || characters.loading) && 'animate-spin')}
          />
          {room.loading || characters.loading ? 'Mise à jour...' : 'Actualiser la liste'}
        </button>
      </motion.div>

      {error && (
        <div className="mb-8 w-full max-w-md">
          <Notice>{error}</Notice>
        </div>
      )}
      {characters.error && !characters.data && (
        <div className="mb-8 w-full max-w-md">
          <Notice>{characters.error}</Notice>
        </div>
      )}

      {loading || !r ? (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#c0a080]" />
          <p className="animate-pulse text-sm text-zinc-500">Invocation des héros…</p>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex flex-wrap justify-center gap-8 md:gap-10"
        >
          {list.map((c, i) => {
            const takenByOther = !!c.incarnePar && !same(c.incarnePar, profile.id);
            const mine = same(c.incarnePar, profile.id);
            return (
              <div key={c.characterId} className="relative flex flex-col items-center gap-6">
                <CharacterCard
                  character={c}
                  systemId={r.systeme.id}
                  isSelected={selectedId === c.characterId}
                  isActive={mine}
                  isTaken={takenByOther}
                  occupantName={c.incarnePar ? memberName(c.incarnePar) : undefined}
                  index={i}
                  isBusy={!!selectedId}
                  onPlay={() => !takenByOther && void play(c)}
                />
                {isGm && (
                  <button
                    type="button"
                    onClick={() => {
                      setToRemove(c);
                      setConfirmText('');
                    }}
                    aria-label={`Retirer ${c.nom} de la salle`}
                    title="Retirer le personnage"
                    className="absolute -right-2 -top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-red-900/50 bg-[#150d0a] text-red-400 shadow-lg transition-colors hover:bg-red-950"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                {(isGm || same(c.proprietaireId, profile.id)) && !takenByOther && (
                  <Link
                    href={`/characters/${c.characterId}?room=${encodeURIComponent(id)}`}
                    className="-mt-3 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-[#c0a080]"
                  >
                    <Eye className="h-3.5 w-3.5" /> Voir la fiche
                  </Link>
                )}
                {takenByOther && c.incarnePar && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <Link
                      href={`/players/${c.incarnePar}`}
                      className="group flex items-center gap-2 rounded-full border border-[#c0a080]/20 bg-[#c0a080]/10 px-4 py-2 backdrop-blur-sm transition-all duration-300 hover:border-[#c0a080]/50"
                    >
                      <User className="h-4 w-4 text-[#c0a080]" />
                      <span className="text-xs font-semibold tracking-wide text-[#e8d5b7]">
                        Voir le profil
                      </span>
                    </Link>
                  </motion.div>
                )}
              </div>
            );
          })}

          {/* Nouveau héros */}
          {(canCreate || r.role === 'joueur') && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: list.length * 0.06 + 0.1 }}
              className="group flex flex-col items-center gap-3"
            >
              <button
                type="button"
                onClick={() => setCreating(true)}
                aria-label="Créer un nouveau personnage"
                className={cn(
                  'relative w-[140px] rounded-[24px] [aspect-ratio:17/21] md:w-[160px]',
                  'flex flex-col items-center justify-center gap-3',
                  'border-2 border-dashed border-zinc-700 hover:border-[#c0a080]',
                  'bg-white/5 hover:bg-white/10',
                  'transition-all duration-300 ease-out hover:-translate-y-2',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c0a080]',
                )}
              >
                <Plus className="h-10 w-10 text-zinc-600 transition-colors duration-300 group-hover:text-[#c0a080]" />
                <span className="text-sm font-medium text-zinc-500 transition-colors duration-200 group-hover:text-[#c0a080]">
                  Nouveau héros
                </span>
                <div className="absolute inset-0 rounded-[24px] opacity-0 shadow-[0_0_25px_rgba(192,160,128,0.2)] transition-opacity duration-300 group-hover:opacity-100" />
              </button>
            </motion.div>
          )}

          {/* Maître du Jeu */}
          {isGm && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: (list.length + 1) * 0.06 + 0.1 }}
              className="group flex flex-col items-center gap-3"
            >
              <button
                type="button"
                onClick={() => void startAsGm()}
                disabled={gmLoading}
                aria-label="Entrer comme Maître du Jeu"
                className={cn(
                  'relative w-[140px] rounded-[24px] [aspect-ratio:17/21] md:w-[160px]',
                  'flex flex-col items-center justify-center gap-3',
                  'bg-gradient-to-br from-[#1e1810] via-[#2a2010] to-[#1a140a]',
                  'border border-[#c0a080]/30 hover:border-[#c0a080]/80',
                  'transition-all duration-300 ease-out hover:-translate-y-2',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c0a080]',
                  'shadow-lg hover:shadow-[0_0_30px_rgba(192,160,128,0.15)]',
                )}
              >
                {gmLoading ? (
                  <Loader2 className="h-10 w-10 animate-spin text-[#c0a080]" />
                ) : (
                  <Crown className="h-10 w-10 text-[#c0a080] transition-colors duration-300 group-hover:text-[#e0c090]" />
                )}
                <span className="text-sm font-medium text-zinc-500 transition-colors duration-200 group-hover:text-[#c0a080]">
                  Maître du Jeu
                </span>
              </button>
            </motion.div>
          )}
        </motion.div>
      )}

      {r && (
        <NewRoomCharacterDialog
          open={creating}
          onClose={() => setCreating(false)}
          roomId={id}
          systemId={r.systeme.id}
          engagedIds={(characters.data ?? []).map((c) => c.characterId)}
          canCreate={canCreate}
        />
      )}

      <Dialog
        open={!!toRemove}
        onOpenChange={(open) => {
          if (!open && !removing) {
            setToRemove(null);
            setConfirmText('');
          }
        }}
      >
        <DialogContent className="border border-red-900/40 bg-[#150d0a] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-300">
              <AlertTriangle className="h-5 w-5" />
              Retirer ce personnage de la salle
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Le personnage <span className="font-semibold text-zinc-200">{toRemove?.nom}</span>{' '}
              quitte la campagne et n&apos;est plus jouable ici. Sa fiche reste dans les personnages
              de son propriétaire.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            <p className="text-xs text-zinc-500">
              Pour confirmer, tapez <span className="font-mono text-zinc-300">{toRemove?.nom}</span>{' '}
              ci-dessous :
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={toRemove?.nom}
              disabled={removing}
              autoFocus
              className="border-red-900/40 bg-black/30 text-zinc-100"
            />
          </div>
          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => {
                setToRemove(null);
                setConfirmText('');
              }}
              disabled={removing}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void confirmRemove()}
              disabled={removing || confirmText !== toRemove?.nom}
              className="flex items-center gap-2 rounded-lg bg-red-900/80 px-4 py-2 text-sm font-semibold text-red-100 transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-900/80"
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Retirer de la salle
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
