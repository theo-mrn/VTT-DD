'use client';

import {
  ArrowRight,
  CalendarClock,
  Check,
  Crown,
  Dices,
  KeyRound,
  Plus,
  Swords,
  UserRound,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { CarteCampagneSquelette, useNomSysteme } from '@/components/campagnes/carte-campagne';
import { formaterDans, formaterSession } from '@/components/campagnes/elements';
import { Illustration } from '@/components/commun/illustration';
import { Page, Panneau, TitreSection } from '@/components/commun/page';
import { formaterDepuis } from '@/components/compte/elements';
import { DesDuJet } from '@/components/des/resultat-jet';
import {
  CartePersonnage,
  CartePersonnageSquelette,
} from '@/components/personnages/carte-personnage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useCampagnes, type Campagne } from '@/lib/campagnes';
import { useJets } from '@/lib/jets';
import { iconeNote, useNotes } from '@/lib/notes';
import { lienPersonnage, usePersonnages } from '@/lib/personnages';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';

function salutation() {
  const h = new Date().getHours();
  return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
}

/** Tableau de bord : reprendre la dernière campagne, sessions à venir, héros, jets et notes. */
export default function PageAccueil() {
  const profil = useProfil();
  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  const recente = campagnes.data?.[0] ?? null;
  const date = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Page large>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-[13px] text-subtle first-letter:uppercase">{date}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[32px]">
            {salutation()}, <span className="text-gradient-primary">{profil.name}</span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href="/campagnes?rejoindre=1">
              <KeyRound />
              Rejoindre
            </Link>
          </Button>
          <Button asChild>
            <Link href="/campagnes/nouvelle">
              <Plus />
              Nouvelle campagne
            </Link>
          </Button>
        </div>
      </header>

      <PremiersPas />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <TitreSection
            action={
              (campagnes.data?.length ?? 0) > 0 && (
                <Link
                  href="/campagnes"
                  className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
                >
                  Toutes les campagnes <ArrowRight className="size-3.5" />
                </Link>
              )
            }
          >
            Reprendre l&apos;aventure
          </TitreSection>
          {campagnes.isLoading ? (
            <CarteCampagneSquelette />
          ) : recente ? (
            <Reprendre campagne={recente} />
          ) : (
            <InviteCampagne />
          )}
        </section>
        <aside className="space-y-6">
          <AVenir campagnes={campagnes.data ?? []} />
          <ActionsRapides />
        </aside>
      </div>

      <section className="mt-10">
        <TitreSection
          compte={personnages.data?.length}
          action={
            <Link
              href="/personnages"
              className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
            >
              Tous les personnages <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          Mes personnages
        </TitreSection>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {personnages.isLoading &&
            Array.from({ length: 3 }, (_, i) => <CartePersonnageSquelette key={i} />)}
          {personnages.data?.slice(0, 5).map((p) => (
            <CartePersonnage key={p.id} personnage={p} href={lienPersonnage(p)} />
          ))}
          <Link
            href="/personnages/nouveau"
            className="group flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.04] hover:text-foreground"
          >
            <span className="flex size-11 items-center justify-center rounded-full border border-border-strong bg-surface-2 transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <Wand2 className="size-5" />
            </span>
            <span className="text-sm font-medium">Nouveau héros</span>
          </Link>
        </div>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <DerniersJets />
        <NotesRecentes />
      </div>
    </Page>
  );
}

// ─── Reprendre ───────────────────────────────────────────────────────────────

function Reprendre({ campagne: c }: Readonly<{ campagne: Campagne }>) {
  const personnages = usePersonnages();
  const role = c.role;
  const perso = personnages.data?.find((p) => p.id === c.playedCharacterId);
  const session = c.nextSession;
  const nomSysteme = useNomSysteme(c.system);

  return (
    <div
      data-ambiance={c.ambiance}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-surface"
    >
      <Illustration
        src={c.coverUrl}
        graine={c.name}
        className="aspect-[4/5] w-full xs:aspect-[16/10] sm:aspect-[21/9]"
        classeImage="transition-transform duration-[1.2s] ease-out group-hover:scale-[1.03]"
        voile
      >
        <div className="absolute left-5 top-5 flex gap-2">
          {role === 'gm' ? (
            <Badge ton="verre" className="border-primary/40 text-primary-strong">
              <Crown /> Vous êtes MJ
            </Badge>
          ) : (
            <Badge ton="verre">
              <UserRound /> Joueur
            </Badge>
          )}
          <Badge ton="verre">{nomSysteme}</Badge>
        </div>
        <div className="absolute inset-x-5 bottom-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl">{c.name}</h2>
            {c.pitch && <p className="mt-1 line-clamp-1 text-sm text-white/70">{c.pitch}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/70">
              {session && (
                <span className="flex items-center gap-1.5 text-primary-strong">
                  <CalendarClock className="size-3.5" />
                  {formaterSession(session.startsAt)}
                </span>
              )}
              {perso && (
                <span className="flex items-center gap-1.5">
                  <UserRound className="size-3.5" />
                  {perso.name}
                </span>
              )}
              <span>Mise à jour {formaterDepuis(c.updatedAt)}</span>
            </div>
          </div>
          <Button size="lg" asChild className="shrink-0">
            <Link href={`/campagnes/${c.id}`}>
              Ouvrir le salon
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </Illustration>
    </div>
  );
}

function InviteCampagne() {
  return (
    <div className="relative flex aspect-[16/9] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong px-6 text-center sm:aspect-[21/9]">
      <div aria-hidden className="absolute inset-0 bg-grid mask-radial" />
      <div aria-hidden className="absolute inset-0 bg-halo" />
      <span className="relative mb-4 flex size-12 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-primary shadow-surface">
        <Swords className="size-5" />
      </span>
      <p className="relative text-lg font-semibold">Votre première campagne vous attend</p>
      <p className="relative mt-1 max-w-md text-sm text-muted-foreground">
        Menez votre propre aventure, ou rejoignez la table d&apos;un ami avec son code.
      </p>
      <div className="relative mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/campagnes/nouvelle">
            <Plus /> Créer une campagne
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/campagnes?rejoindre=1">
            <KeyRound /> Rejoindre
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── À venir ─────────────────────────────────────────────────────────────────

function AVenir({ campagnes }: Readonly<{ campagnes: Campagne[] }>) {
  const sessions = campagnes
    .flatMap((c) => (c.nextSession ? [{ c, s: c.nextSession }] : []))
    .sort((a, b) => a.s.startsAt.localeCompare(b.s.startsAt))
    .slice(0, 4);

  return (
    <Panneau titre="À venir" corps={false}>
      {sessions.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-subtle">Aucune session planifiée.</p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map(({ c, s }) => {
            const d = new Date(s.startsAt);
            return (
              <li key={s.id} data-ambiance={c.ambiance}>
                <Link
                  href={`/campagnes/${c.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-primary/25 bg-primary/10 py-1">
                    <span className="text-[10px] font-medium uppercase text-primary">
                      {d.toLocaleDateString('fr-FR', { month: 'short' })}
                    </span>
                    <span className="font-mono text-base font-semibold leading-tight">
                      {d.getDate()}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-subtle">
                      {s.title ?? 'Session'} · {formaterDans(s.startsAt)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panneau>
  );
}

// ─── Actions rapides ─────────────────────────────────────────────────────────

function ActionsRapides() {
  const actions: { href: string; label: string; icone: LucideIcon }[] = [
    { href: '/campagnes/nouvelle', label: 'Créer une campagne', icone: Swords },
    { href: '/personnages/nouveau', label: 'Créer un héros', icone: Wand2 },
    { href: '/des', label: 'Lancer des dés', icone: Dices },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-surface transition-all hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-2"
        >
          <span className="flex size-9 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-primary transition-colors group-hover:border-primary/40">
            <a.icone className="size-4" />
          </span>
          <span className="text-[13px] font-medium">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}

// ─── Premiers pas ────────────────────────────────────────────────────────────

function PremiersPas() {
  const profil = useProfil();
  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  const jets = useJets(null);
  const notes = useNotes();
  const [masque, setMasque] = usePreferenceLocale('premiers-pas-masques', false);

  const etapes = [
    {
      ok: Boolean(profil.avatarUrl || profil.bio),
      label: 'Compléter votre profil',
      href: '/profil',
    },
    {
      ok: (campagnes.data?.length ?? 0) > 0,
      label: 'Créer ou rejoindre une campagne',
      href: '/campagnes',
    },
    {
      ok: (personnages.data?.length ?? 0) > 0,
      label: 'Créer votre premier héros',
      href: '/personnages/nouveau',
    },
    { ok: (jets.data?.length ?? 0) > 0, label: 'Lancer vos premiers dés', href: '/des' },
  ];
  const faites = etapes.filter((e) => e.ok).length;
  const charge = campagnes.isSuccess && personnages.isSuccess && jets.isSuccess && notes.isSuccess;
  if (masque || !charge || faites === etapes.length) return null;

  return (
    <section className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-surface">
      <div
        aria-hidden
        className="absolute -left-36 -top-40 size-96 bg-[radial-gradient(closest-side,hsl(var(--primary)/0.08),transparent)]"
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="lg:w-64">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Premiers pas</p>
            <button
              type="button"
              onClick={() => setMasque(true)}
              className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-3 hover:text-foreground lg:hidden"
              aria-label="Masquer"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {faites} sur {etapes.length} : votre table prend forme.
          </p>
          <Progress valeur={(faites / etapes.length) * 100} className="mt-3" label="Progression" />
        </div>
        <ol className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {etapes.map((e) => (
            <li key={e.label}>
              <Link
                href={e.href}
                className={cn(
                  'flex h-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] transition-colors',
                  e.ok
                    ? 'border-border text-subtle line-through decoration-subtle/50'
                    : 'border-border-strong bg-surface-2/60 text-foreground hover:border-primary/40',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border',
                    e.ok
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border-strong',
                  )}
                >
                  {e.ok && <Check className="size-3" strokeWidth={3} />}
                </span>
                {e.label}
              </Link>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setMasque(true)}
          className="hidden rounded-md p-1 text-subtle transition-colors hover:bg-surface-3 hover:text-foreground lg:block"
          aria-label="Masquer les premiers pas"
        >
          <X className="size-4" />
        </button>
      </div>
    </section>
  );
}

// ─── Jets et notes ───────────────────────────────────────────────────────────

function DerniersJets() {
  const jets = useJets(null);
  const liste = jets.data?.slice(0, 5) ?? [];
  return (
    <Panneau
      titre="Derniers jets"
      corps={false}
      action={
        <Link href="/des" className="text-[13px] text-muted-foreground hover:text-foreground">
          Table de dés
        </Link>
      }
    >
      {liste.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-subtle">
          Aucun jet pour l&apos;instant. Essayez <kbd className="font-mono text-foreground">⌘K</kbd>{' '}
          puis « 1d20 ».
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {liste.map((j) => (
            <li key={j.id} className="flex items-center gap-4 px-5 py-3">
              <span
                className={cn(
                  'w-10 text-right font-mono text-xl font-bold tabular',
                  j.critical === 'success' && 'text-primary',
                  j.critical === 'failure' && 'text-destructive',
                )}
              >
                {j.total}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {j.label ?? j.formula}
                </span>
                <span className="block text-xs text-subtle">{formaterDepuis(j.createdAt)}</span>
              </span>
              <span className="hidden sm:block">
                <DesDuJet groupes={j.groups} taille="xs" max={5} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );
}

function NotesRecentes() {
  const notes = useNotes();
  const campagnes = useCampagnes();
  const liste = notes.data?.slice(0, 5) ?? [];
  return (
    <Panneau
      titre="Notes récentes"
      corps={false}
      action={
        <Link href="/notes" className="text-[13px] text-muted-foreground hover:text-foreground">
          Toutes les notes
        </Link>
      }
    >
      {liste.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-subtle">
          Journal, PNJ, indices : vos notes apparaîtront ici.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {liste.map((n) => (
            <li key={n.id}>
              <Link
                href={`/notes?note=${n.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="text-lg">{iconeNote(n)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {n.title || 'Sans titre'}
                  </span>
                  <span className="block truncate text-xs text-subtle">
                    {campagnes.data?.find((c) => c.id === n.roomId)?.name ?? 'Campagne'} ·{' '}
                    {formaterDepuis(n.updatedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );
}
