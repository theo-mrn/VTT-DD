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
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { CarteCampagneSquelette, useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { Page, Panneau, TitreSection } from '@/components/commun/page';
import { DesDuJet } from '@/components/des/resultat-jet';
import {
  CartePersonnage,
  CartePersonnageSquelette,
} from '@/components/personnages/carte-personnage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useDates } from '@/i18n/dates';
import { useCampagnes, type Campagne } from '@/lib/campagnes';
import { useJets } from '@/lib/jets';
import { iconeNote, useNotes } from '@/lib/notes';
import { lienPersonnage, usePersonnages } from '@/lib/personnages';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';

function moment(): 'night' | 'morning' | 'afternoon' | 'evening' {
  const h = new Date().getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  return h < 18 ? 'afternoon' : 'evening';
}

/** Tableau de bord : reprendre la dernière campagne, sessions à venir, héros, jets et notes. */
export default function PageAccueil() {
  const t = useTranslations('home');
  const format = useFormatter();
  const profil = useProfil();
  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  const recente = campagnes.data?.[0] ?? null;
  const date = format.dateTime(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Page large>
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-[13px] text-subtle first-letter:uppercase">{date}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[32px]">
            {t.rich('hello', {
              greeting: t(`greeting.${moment()}`),
              name: profil.name,
              b: (chunks) => <span className="text-gradient-primary">{chunks}</span>,
            })}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href="/campagnes?rejoindre=1">
              <KeyRound />
              {t('join')}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/campagnes/nouvelle">
              <Plus />
              {t('newCampaign')}
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
                  {t('allCampaigns')} <ArrowRight className="size-3.5" />
                </Link>
              )
            }
          >
            {t('resume')}
          </TitreSection>
          {campagnes.isLoading && <CarteCampagneSquelette />}
          {!campagnes.isLoading && recente && <Reprendre campagne={recente} />}
          {!campagnes.isLoading && !recente && <InviteCampagne />}
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
              {t('allCharacters')} <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {t('myCharacters')}
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
            <span className="text-sm font-medium">{t('newHero')}</span>
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
  const t = useTranslations();
  const dates = useDates();
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
              <Crown /> {t('campaigns.badges.youAreGm')}
            </Badge>
          ) : (
            <Badge ton="verre">
              <UserRound /> {t('campaigns.badges.player')}
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
                  {dates.session(session.startsAt)}
                </span>
              )}
              {perso && (
                <span className="flex items-center gap-1.5">
                  <UserRound className="size-3.5" />
                  {perso.name}
                </span>
              )}
              <span>{t('home.updated', { since: dates.since(c.updatedAt) })}</span>
            </div>
          </div>
          <Button size="lg" asChild className="shrink-0">
            <Link href={`/campagnes/${c.id}`}>
              {t('home.openLobby')}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </Illustration>
    </div>
  );
}

function InviteCampagne() {
  const t = useTranslations('home');
  return (
    <div className="relative flex aspect-[16/9] flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong px-6 text-center sm:aspect-[21/9]">
      <div aria-hidden className="absolute inset-0 bg-grid mask-radial" />
      <div aria-hidden className="absolute inset-0 bg-halo" />
      <span className="relative mb-4 flex size-12 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-primary shadow-surface">
        <Swords className="size-5" />
      </span>
      <p className="relative text-lg font-semibold">{t('firstCampaign')}</p>
      <p className="relative mt-1 max-w-md text-sm text-muted-foreground">
        {t('firstCampaignText')}
      </p>
      <div className="relative mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/campagnes/nouvelle">
            <Plus /> {t('createCampaign')}
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/campagnes?rejoindre=1">
            <KeyRound /> {t('join')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── À venir ─────────────────────────────────────────────────────────────────

function AVenir({ campagnes }: Readonly<{ campagnes: Campagne[] }>) {
  const t = useTranslations('home');
  const format = useFormatter();
  const dates = useDates();
  const sessions = campagnes
    .flatMap((c) => (c.nextSession ? [{ c, s: c.nextSession }] : []))
    .sort((a, b) => a.s.startsAt.localeCompare(b.s.startsAt))
    .slice(0, 4);

  return (
    <Panneau titre={t('upcoming')} corps={false}>
      {sessions.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-subtle">{t('noSession')}</p>
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
                      {format.dateTime(d, { month: 'short' })}
                    </span>
                    <span className="font-mono text-base font-semibold leading-tight">
                      {d.getDate()}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-subtle">
                      {t('sessionLine', {
                        title: s.title ?? t('session'),
                        when: dates.inDays(s.startsAt),
                      })}
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
  const t = useTranslations('home.quick');
  const actions: { href: string; label: string; icone: LucideIcon }[] = [
    { href: '/campagnes/nouvelle', label: t('createCampaign'), icone: Swords },
    { href: '/personnages/nouveau', label: t('createHero'), icone: Wand2 },
    { href: '/des', label: t('rollDice'), icone: Dices },
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
  const t = useTranslations('home.firstSteps');
  const profil = useProfil();
  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  const jets = useJets(null);
  const notes = useNotes();
  const [masque, setMasque] = usePreferenceLocale('premiers-pas-masques', false);

  const etapes = [
    {
      ok: Boolean(profil.avatarUrl || profil.bio),
      label: t('profile'),
      href: '/profil',
    },
    {
      ok: (campagnes.data?.length ?? 0) > 0,
      label: t('campaign'),
      href: '/campagnes',
    },
    {
      ok: (personnages.data?.length ?? 0) > 0,
      label: t('hero'),
      href: '/personnages/nouveau',
    },
    { ok: (jets.data?.length ?? 0) > 0, label: t('dice'), href: '/des' },
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
            <p className="font-semibold">{t('title')}</p>
            <button
              type="button"
              onClick={() => setMasque(true)}
              className="rounded-md p-1 text-subtle transition-colors hover:bg-surface-3 hover:text-foreground lg:hidden"
              aria-label={t('hide')}
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {t('progress', { done: faites, total: etapes.length })}
          </p>
          <Progress
            valeur={(faites / etapes.length) * 100}
            className="mt-3"
            label={t('progressLabel')}
          />
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
          aria-label={t('hideAll')}
        >
          <X className="size-4" />
        </button>
      </div>
    </section>
  );
}

// ─── Jets et notes ───────────────────────────────────────────────────────────

function DerniersJets() {
  const t = useTranslations('home.rolls');
  const dates = useDates();
  const jets = useJets(null);
  const liste = jets.data?.slice(0, 5) ?? [];
  return (
    <Panneau
      titre={t('title')}
      corps={false}
      action={
        <Link href="/des" className="text-[13px] text-muted-foreground hover:text-foreground">
          {t('diceTable')}
        </Link>
      }
    >
      {liste.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-subtle">
          {t.rich('empty', {
            kbd: (chunks) => <kbd className="font-mono text-foreground">{chunks}</kbd>,
          })}
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
                <span className="block text-xs text-subtle">{dates.since(j.createdAt)}</span>
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
  const t = useTranslations('home.notes');
  const dates = useDates();
  const notes = useNotes();
  const campagnes = useCampagnes();
  const liste = notes.data?.slice(0, 5) ?? [];
  return (
    <Panneau
      titre={t('title')}
      corps={false}
      action={
        <Link href="/notes" className="text-[13px] text-muted-foreground hover:text-foreground">
          {t('all')}
        </Link>
      }
    >
      {liste.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-subtle">{t('empty')}</p>
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
                    {n.title || t('untitled')}
                  </span>
                  <span className="block truncate text-xs text-subtle">
                    {campagnes.data?.find((c) => c.id === n.roomId)?.name ?? t('campaign')} ·{' '}
                    {dates.since(n.updatedAt)}
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
