'use client';

import {
  CalendarPlus,
  Check,
  Copy,
  Crown,
  DoorOpen,
  LogOut,
  MoreHorizontal,
  NotebookPen,
  PartyPopper,
  Play,
  RefreshCw,
  Settings2,
  Trash2,
  UserMinus,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { EtatVide, Panneau } from '@/components/commun/page';
import { AvatarJoueur, formaterDepuis } from '@/components/compte/elements';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import {
  useAnnulerInvitation,
  useCampagne,
  useDeplanifier,
  useNouveauCode,
  usePlanifier,
  useRetirerMembre,
  useSessionsCampagne,
  useSortirCampagne,
  type DetailCampagne,
  type Membre,
} from '@/lib/campagnes';
import { iconeNote, useNotes, useNotesSync } from '@/lib/notes';
import { usePersonnagesCampagne, type Personnage } from '@/lib/personnages';
import { useSynchroCampagne } from '@/lib/realtime-sync';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useNomSysteme } from './carte-campagne';
import { BadgeRole, BadgeVisibilite, formaterDans, formaterSession } from './elements';
import { ReglagesCampagne } from './reglages-campagne';
import { PanneauReglesOptionnelles } from './reglages-regles';

/** Salon d'une campagne : présentation, table (joueurs et héros), invitation, sessions. */
export function SalonCampagne({ id }: Readonly<{ id: string }>) {
  const profil = useProfil();
  const campagne = useCampagne(id);
  const personnages = usePersonnagesCampagne(id);
  // Table, réglages, sessions et héros mis à jour en direct
  useSynchroCampagne(id);

  if (campagne.isLoading) return <SalonSquelette />;
  if (campagne.isError || !campagne.data)
    return (
      <div className="px-4 py-16 sm:px-8">
        <EtatVide
          icone={DoorOpen}
          titre="Campagne introuvable"
          description="Elle a peut-être été supprimée, ou vous n'en faites plus partie."
          action={
            <Button asChild variant="secondary">
              <Link href="/campagnes">Retour aux campagnes</Link>
            </Button>
          }
        />
      </div>
    );

  const c = campagne.data;
  const role = c.role;
  const moi = c.members.find((m) => m.userId === profil.id);
  const monPerso = personnages.data?.find((p) => p.id === moi?.characterId) ?? null;

  return (
    <div data-ambiance={c.ambiance}>
      <Banniere campagne={c} role={role} monPerso={monPerso} />
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <div className="min-w-0 space-y-6">
          <BandeauBienvenue campagne={c} />
          <Table
            campagne={c}
            personnages={personnages.data ?? []}
            moi={profil.id}
            gm={role === 'gm'}
          />
          {c.description && (
            <Panneau titre="Présentation">
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
                {c.description}
              </p>
            </Panneau>
          )}
          <NotesCampagne campagneId={c.id} />
        </div>
        <aside className="space-y-6">
          <CarteInvitation campagne={c} gm={role === 'gm'} />
          <Sessions campagne={c} gm={role === 'gm'} />
          <PanneauReglesOptionnelles campaignId={c.id} systemId={c.system} />
          {c.invitations.length > 0 && <InvitationsEnAttente campagne={c} />}
        </aside>
      </div>
    </div>
  );
}

/** Invitations nominatives en attente (MJ) : l'invité voit l'invitation et rejoint sans code. */
function InvitationsEnAttente({ campagne: c }: Readonly<{ campagne: DetailCampagne }>) {
  const annuler = useAnnulerInvitation(c.id);
  return (
    <Panneau titre="Invitations en attente" corps={false}>
      <ul className="divide-y divide-border">
        {c.invitations.map((i) => (
          <li key={i.userId} className="group flex items-center gap-3 px-5 py-3">
            <AvatarJoueur nom={i.name} url={i.avatarUrl} taille="sm" />
            <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
            <span className="text-xs text-subtle">{formaterDepuis(i.invitedAt)}</span>
            <Info texte="Annuler l'invitation">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Annuler l'invitation de ${i.name}`}
                className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                disabled={annuler.isPending}
                onClick={() =>
                  annuler.mutate(i.userId, {
                    onSuccess: () => toast.success(`Invitation de ${i.name} annulée`),
                    onError: (e) => toast.error(messageErreur(e)),
                  })
                }
              >
                <X />
              </Button>
            </Info>
          </li>
        ))}
      </ul>
    </Panneau>
  );
}

// ─── Bannière ────────────────────────────────────────────────────────────────

function Banniere({
  campagne: c,
  role,
  monPerso,
}: Readonly<{
  campagne: DetailCampagne;
  role: Membre['role'] | null;
  monPerso: Personnage | null;
}>) {
  const profil = useProfil();
  const nomSysteme = useNomSysteme(c.system);
  const [reglages, setReglages] = useState(false);
  const [sortie, setSortie] = useState<'supprimer' | 'quitter' | null>(null);
  // Un joueur entre à la table avec son héros ; le MJ et les spectateurs, directement
  const aTable = role === 'gm' || role === 'spectator' || Boolean(c.playedCharacterId);

  return (
    <section className="relative isolate overflow-hidden border-b border-border">
      <Illustration
        src={c.coverUrl}
        graine={c.name}
        initiale={false}
        className="absolute inset-0 -z-10"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/80 to-background/20"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-background/90 via-background/40 to-transparent"
      />

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-8 pt-16 sm:px-6 sm:pt-24 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="min-w-0 max-w-2xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <BadgeRole role={role} />
            <Badge ton="verre">{nomSysteme}</Badge>
            <BadgeVisibilite campagne={c} />
            {c.tags.map((t) => (
              <Badge key={t} ton="verre" className="text-white/70">
                {t}
              </Badge>
            ))}
          </div>
          <h1 className="text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            {c.name}
          </h1>
          {c.pitch && <p className="text-lg text-muted-foreground">{c.pitch}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {aTable ? (
            <Button size="lg" asChild className="shadow-glow">
              <Link href={`/campagnes/${c.id}/table`}>
                <Play />
                Entrer à la table
              </Link>
            </Button>
          ) : (
            <Button size="lg" asChild className="shadow-glow">
              <Link href={`/campagnes/${c.id}/personnage`}>
                <UserRound />
                Choisir mon héros
              </Link>
            </Button>
          )}
          {aTable && role !== 'spectator' && (
            <Button size="lg" variant="secondary" asChild>
              <Link href={`/campagnes/${c.id}/personnage`}>
                {role === 'gm' ? <Crown /> : <UserRound />}
                {libelleHeros(Boolean(monPerso), role === 'gm')}
              </Link>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                aria-label="Plus d'actions"
                className="size-11"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {role === 'gm' && (
                <DropdownMenuItem onSelect={() => setReglages(true)} className="cursor-pointer">
                  <Settings2 />
                  Réglages de la campagne
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href={`/notes?nouvelle=1&campagne=${c.id}`}>
                  <NotebookPen />
                  Nouvelle note de campagne
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {c.ownerId === profil.id ? (
                <DropdownMenuItem
                  onSelect={() => setSortie('supprimer')}
                  className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 />
                  Supprimer la campagne
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() => setSortie('quitter')}
                  className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut />
                  Quitter la campagne
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {role === 'gm' && <ReglagesCampagne campagne={c} ouvert={reglages} onOuvert={setReglages} />}
      <DialogueSortie campagne={c} mode={sortie} onFerme={() => setSortie(null)} />
    </section>
  );
}

function DialogueSortie({
  campagne,
  mode,
  onFerme,
}: Readonly<{
  campagne: DetailCampagne;
  mode: 'supprimer' | 'quitter' | null;
  onFerme: () => void;
}>) {
  const router = useRouter();
  const profil = useProfil();
  const sortir = useSortirCampagne(campagne.id, profil.id);
  const [confirmation, setConfirmation] = useState('');
  const supprimer = mode === 'supprimer';

  async function valider() {
    if (!mode) return;
    try {
      await sortir.mutateAsync(mode);
      toast.success(supprimer ? 'Campagne supprimée' : 'Vous avez quitté la campagne');
      router.replace('/campagnes');
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(v) => !v && (onFerme(), setConfirmation(''))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {supprimer ? 'Supprimer la campagne ?' : 'Quitter la campagne ?'}
          </DialogTitle>
          <DialogDescription>
            {supprimer
              ? 'Les joueurs perdront l’accès au salon, aux notes et à l’historique. Cette action est définitive.'
              : 'Vous pourrez revenir avec le code de la campagne.'}
          </DialogDescription>
        </DialogHeader>
        {supprimer && (
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">
              Tapez <span className="font-medium text-foreground">{campagne.name}</span> pour
              confirmer.
            </p>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onFerme}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => void valider()}
            loading={sortir.isPending}
            disabled={supprimer && confirmation.trim() !== campagne.name}
          >
            {supprimer ? 'Supprimer' : 'Quitter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bandeau après création ──────────────────────────────────────────────────

function BandeauBienvenue({ campagne }: Readonly<{ campagne: DetailCampagne }>) {
  const router = useRouter();
  const nouvelle = useSearchParams().get('bienvenue') === '1';
  if (!nouvelle) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/[0.07] p-5 shadow-glow">
      <div
        aria-hidden
        className="absolute -right-24 -top-24 size-72 bg-[radial-gradient(closest-side,hsl(var(--primary)/0.16),transparent)]"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <PartyPopper className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Votre campagne est prête !</p>
          <p className="text-[13px] text-muted-foreground">
            Partagez le code{' '}
            <span className="font-mono font-semibold text-primary-strong">{campagne.code}</span> à
            vos joueurs, ou planifiez la première session.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fermer"
          onClick={() => router.replace(`/campagnes/${campagne.id}`, { scroll: false })}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

// ─── Table : membres et héros ────────────────────────────────────────────────

function Table({
  campagne: c,
  personnages,
  moi,
  gm,
}: Readonly<{
  campagne: DetailCampagne;
  personnages: Personnage[];
  moi: string;
  gm: boolean;
}>) {
  const retirer = useRetirerMembre(c.id);
  const mj = c.members.filter((m) => m.role === 'gm');
  const joueurs = c.members.filter((m) => m.role === 'player');
  const spectateurs = c.members.filter((m) => m.role === 'spectator');

  return (
    <Panneau
      titre={
        <span className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          La table
          <span className="text-[13px] font-normal text-subtle">
            {joueurs.length} {joueurs.length > 1 ? 'joueurs' : 'joueur'}
          </span>
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...mj, ...joueurs, ...spectateurs].map((m) => {
          return (
            <SiegeMembre
              key={m.userId}
              membre={m}
              estMoi={m.userId === moi}
              action={
                gm && m.userId !== c.ownerId ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" aria-label={`Actions pour ${m.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
                        onSelect={() =>
                          retirer.mutate(m.userId, {
                            onSuccess: () => toast.success(`${m.name} a été retiré de la table`),
                            onError: (e) => toast.error(messageErreur(e)),
                          })
                        }
                      >
                        <UserMinus />
                        Retirer de la campagne
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
            />
          );
        })}
      </div>
    </Panneau>
  );
}

/** Un membre de la table : l'utilisateur (avatar, nom, rôle), pas son personnage. */
function SiegeMembre({
  membre: m,
  estMoi,
  action,
}: Readonly<{
  membre: Membre;
  estMoi: boolean;
  action: React.ReactNode;
}>) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 overflow-hidden rounded-xl border bg-surface-2/50 p-3 transition-colors',
        estMoi ? 'border-primary/40' : 'border-border',
      )}
    >
      <AvatarJoueur nom={m.name} url={m.avatarUrl} taille="md" className="m-[5px]" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
          {m.role === 'gm' && <Crown className="size-3.5 shrink-0 text-primary" />}
          <span className="truncate">{m.name}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {ROLES[m.role] ?? 'Joueur'}
          {estMoi && ' · vous'}
        </p>
      </div>
      {action && (
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {action}
        </div>
      )}
    </div>
  );
}

// ─── Invitation ──────────────────────────────────────────────────────────────

function CarteInvitation({ campagne: c, gm }: Readonly<{ campagne: DetailCampagne; gm: boolean }>) {
  const [copie, setCopie] = useState<'code' | 'lien' | null>(null);
  const nouveauCode = useNouveauCode(c.id);

  async function copier(quoi: 'code' | 'lien') {
    const texte =
      quoi === 'code' ? c.code : `${window.location.origin}/campagnes?rejoindre=1&code=${c.code}`;
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(quoi);
      setTimeout(() => setCopie(null), 1600);
    } catch {
      toast.error('Copie impossible : sélectionnez le code à la main.');
    }
  }

  return (
    <Panneau titre="Inviter des joueurs" description="Le code suffit pour rejoindre la table.">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border-strong bg-surface-2 p-2 pl-4">
        <span className="font-mono text-2xl font-semibold tracking-[0.3em] text-primary-strong">
          {c.code}
        </span>
        <Info texte={copie === 'code' ? 'Copié !' : 'Copier le code'}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void copier('code')}
            aria-label="Copier le code"
          >
            {copie === 'code' ? <Check className="text-success" /> : <Copy />}
          </Button>
        </Info>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => void copier('lien')}
        >
          {copie === 'lien' ? <Check className="text-success" /> : <Copy />}
          {copie === 'lien' ? 'Lien copié' : 'Copier le lien'}
        </Button>
        {gm && (
          <Info texte="Nouveau code : l'ancien ne fonctionnera plus">
            <Button
              variant="ghost"
              size="sm"
              loading={nouveauCode.isPending}
              onClick={() =>
                nouveauCode.mutate(undefined, {
                  onSuccess: () => toast.success('Nouveau code généré'),
                  onError: (e) => toast.error(messageErreur(e)),
                })
              }
            >
              {!nouveauCode.isPending && <RefreshCw />}
              Changer
            </Button>
          </Info>
        )}
      </div>
    </Panneau>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

function Sessions({ campagne: c, gm }: Readonly<{ campagne: DetailCampagne; gm: boolean }>) {
  const planifier = usePlanifier(c.id);
  const deplanifier = useDeplanifier(c.id);
  const sessions = useSessionsCampagne(c.id);
  const [date, setDate] = useState('');
  const [titre, setTitre] = useState('');
  const [ajout, setAjout] = useState(false);
  // Le service ne liste que les sessions à venir, par date croissante
  const aVenir = sessions.data ?? [];

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!date) return;
    try {
      await planifier.mutateAsync({
        startsAt: new Date(date).toISOString(),
        title: titre.trim() || null,
      });
      setDate('');
      setTitre('');
      setAjout(false);
      toast.success('Session planifiée');
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  return (
    <Panneau
      titre="Sessions"
      action={
        gm && !ajout ? (
          <Button variant="ghost" size="xs" onClick={() => setAjout(true)}>
            <CalendarPlus />
            Planifier
          </Button>
        ) : null
      }
    >
      {ajout && (
        <form
          onSubmit={valider}
          className="mb-4 space-y-2 rounded-xl border border-border bg-surface-2/60 p-3"
        >
          <Input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            aria-label="Date et heure"
            className="[color-scheme:dark]"
          />
          <Input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            placeholder="Titre (facultatif) : « Session 3 — Le col »"
            maxLength={80}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAjout(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" loading={planifier.isPending}>
              Planifier
            </Button>
          </div>
        </form>
      )}
      {aVenir.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-subtle">
          {gm
            ? 'Aucune session prévue. Fixez la prochaine date !'
            : 'Aucune session prévue pour le moment.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {aVenir.map((s, i) => {
            const d = new Date(s.startsAt);
            return (
              <li
                key={s.id}
                className={cn(
                  'group flex items-center gap-3 rounded-xl border p-2.5',
                  i === 0 ? 'border-primary/30 bg-primary/[0.06]' : 'border-border',
                )}
              >
                <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-surface-3 py-1">
                  <span className="text-[10px] font-medium uppercase text-primary">
                    {d.toLocaleDateString('fr-FR', { month: 'short' })}
                  </span>
                  <span className="font-mono text-base font-semibold leading-tight">
                    {d.getDate()}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {s.title ?? 'Session de jeu'}
                  </span>
                  <span className="block text-xs text-subtle">
                    {formaterSession(s.startsAt)} · {formaterDans(s.startsAt)}
                  </span>
                </span>
                {gm && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Annuler la session"
                    onClick={() =>
                      deplanifier.mutate(s.id, { onError: (e) => toast.error(messageErreur(e)) })
                    }
                  >
                    <X />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panneau>
  );
}

// ─── Notes de la campagne ────────────────────────────────────────────────────

function NotesCampagne({ campagneId }: Readonly<{ campagneId: string }>) {
  const notes = useNotes({ campaignId: campagneId, limit: 6 });
  // Notes de la campagne tenues à jour en direct (écrites ou partagées par les autres)
  useNotesSync(campagneId);
  const liste = notes.data ?? [];
  return (
    <Panneau
      titre="Notes de campagne"
      action={
        <Button variant="ghost" size="xs" asChild>
          <Link href={`/notes?nouvelle=1&campagne=${campagneId}`}>
            <NotebookPen />
            Écrire
          </Link>
        </Button>
      }
    >
      {liste.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-subtle">
          Journal de session, PNJ croisés, indices : gardez tout ici.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {liste.map((n) => (
            <li key={n.id}>
              <Link
                href={`/notes?note=${n.id}`}
                className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-border-strong hover:bg-surface-2"
              >
                <span className="text-lg">{iconeNote(n)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {n.title || 'Sans titre'}
                  </span>
                  <span className="block text-xs text-subtle">{formaterDepuis(n.updatedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );
}

function SalonSquelette() {
  return (
    <div>
      <div className="border-b border-border px-4 pb-8 pt-24 sm:px-8">
        <div className="mx-auto max-w-7xl space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-96 max-w-full" />
          <Skeleton className="h-5 w-72" />
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

const ROLES: Partial<Record<string, string>> = { gm: 'Maître du jeu', spectator: 'Spectateur' };

function libelleHeros(aUnHeros: boolean, mj: boolean): string {
  if (aUnHeros) return 'Changer de héros';
  return mj ? 'Jouer un héros' : 'Mon héros';
}
