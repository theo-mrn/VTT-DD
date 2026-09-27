'use client';

import {
  ChevronsLeft,
  ChevronsUpDown,
  LogOut,
  Plus,
  Search,
  Swords,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AvatarJoueur } from '@/components/compte/elements';
import { Illustration } from '@/components/commun/illustration';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Info } from '@/components/ui/tooltip';
import { useDemandesAmis } from '@/lib/amis';
import { useCampagnes } from '@/lib/campagnes';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { estActif, LIENS_COMPTE, NAV_PRINCIPALE, NAV_SOCIALE, type LienNav } from './navigation';

/**
 * Barre latérale : création rapide, recherche, espaces, campagnes récentes,
 * compte. `repliee` : icônes seules avec infobulles.
 */
export function BarreLaterale({
  repliee = false,
  onReplier,
  onRecherche,
  onNavigue,
}: {
  repliee?: boolean;
  onReplier?: () => void;
  onRecherche: () => void;
  /** Appelé après un clic de navigation (ferme le menu mobile). */
  onNavigue?: () => void;
}) {
  const chemin = usePathname();
  const campagnes = useCampagnes();
  const demandes = useDemandesAmis();
  const recues = demandes.data?.received.length ?? 0;

  return (
    <div className="flex h-full flex-col gap-1 overflow-hidden">
      {/* Marque */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2',
          repliee ? 'justify-center px-2' : 'justify-between pl-4 pr-2',
        )}
      >
        <Link
          href="/accueil"
          onClick={onNavigue}
          className="group flex items-center gap-2.5 rounded-lg outline-none"
        >
          <Logo />
          {!repliee && (
            <span className="font-logo text-lg tracking-[0.18em] text-foreground">YNER</span>
          )}
        </Link>
        {!repliee && onReplier && (
          <Info texte="Replier le menu">
            <button
              type="button"
              onClick={onReplier}
              className="hidden size-7 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-3 hover:text-foreground lg:inline-flex"
            >
              <ChevronsLeft className="size-4" />
              <span className="sr-only">Replier le menu</span>
            </button>
          </Info>
        )}
      </div>

      {/* Actions rapides */}
      <div className={cn('flex shrink-0 flex-col gap-1.5', repliee ? 'px-2' : 'px-3')}>
        <MenuCreer repliee={repliee} onNavigue={onNavigue} />
        <Info texte={repliee ? 'Rechercher (⌘K)' : null} cote="right">
          <button
            type="button"
            onClick={onRecherche}
            className={cn(
              'flex h-9 items-center gap-2.5 rounded-lg border border-border bg-surface-2/50 text-[13px] text-subtle transition-colors hover:border-border-strong hover:text-muted-foreground',
              repliee ? 'justify-center' : 'px-3',
            )}
          >
            <Search className="size-4 shrink-0" />
            {!repliee && (
              <>
                <span className="flex-1 text-left">Rechercher…</span>
                <Kbd>⌘K</Kbd>
              </>
            )}
            {repliee && <span className="sr-only">Rechercher</span>}
          </button>
        </Info>
      </div>

      <nav
        aria-label="Navigation principale"
        className={cn(
          'mt-3 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto no-scrollbar',
          repliee ? 'px-2' : 'px-3',
        )}
      >
        <GroupeNav>
          {NAV_PRINCIPALE.map((l) => (
            <ElementNav
              key={l.href}
              lien={l}
              actif={estActif(l, chemin)}
              repliee={repliee}
              onClick={onNavigue}
            />
          ))}
        </GroupeNav>

        {!repliee && (campagnes.data?.length ?? 0) > 0 && (
          <GroupeNav titre="Mes campagnes">
            {campagnes.data!.slice(0, 5).map((c) => {
              const href = `/campagnes/${c.id}`;
              const actif = chemin === href || chemin.startsWith(`${href}/`);
              return (
                <Link
                  key={c.id}
                  href={href}
                  onClick={onNavigue}
                  aria-current={actif ? 'page' : undefined}
                  className={cn(
                    'group flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] transition-colors',
                    actif
                      ? 'bg-surface-3 text-foreground'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                  )}
                >
                  <Illustration
                    src={c.coverUrl}
                    graine={c.name}
                    initiale={false}
                    className="size-5 shrink-0 rounded-md ring-1 ring-white/10"
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </Link>
              );
            })}
          </GroupeNav>
        )}

        <GroupeNav titre={repliee ? undefined : 'Social'}>
          {NAV_SOCIALE.map((l) => (
            <ElementNav
              key={l.href}
              lien={l}
              actif={estActif(l, chemin)}
              repliee={repliee}
              onClick={onNavigue}
              pastille={recues}
            />
          ))}
        </GroupeNav>
      </nav>

      <div className={cn('shrink-0 border-t border-border py-2', repliee ? 'px-2' : 'px-3')}>
        <MenuUtilisateur repliee={repliee} onNavigue={onNavigue} />
      </div>
    </div>
  );
}

function Logo() {
  return (
    <span
      aria-hidden
      className="relative flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-strong via-primary to-primary/60 shadow-glow"
    >
      <svg viewBox="0 0 24 24" className="size-[18px] text-primary-foreground" fill="none">
        <path
          d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4L12 2.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 2.5v19M3.5 7.4 12 12l8.5-4.6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          opacity="0.55"
        />
      </svg>
    </span>
  );
}

function GroupeNav({ titre, children }: { titre?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {titre && (
        <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
          {titre}
        </p>
      )}
      {children}
    </div>
  );
}

function ElementNav({
  lien,
  actif,
  repliee,
  onClick,
  pastille = 0,
}: {
  lien: LienNav;
  actif: boolean;
  repliee: boolean;
  onClick?: () => void;
  pastille?: number;
}) {
  const Icone = lien.icone;
  return (
    <Info texte={repliee ? lien.label : null} cote="right">
      <Link
        href={lien.href}
        onClick={onClick}
        aria-current={actif ? 'page' : undefined}
        className={cn(
          'group relative flex h-9 items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors',
          repliee ? 'justify-center' : 'px-2.5',
          actif
            ? 'bg-surface-3 text-foreground shadow-surface'
            : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        )}
      >
        {actif && (
          <span
            aria-hidden
            className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
          />
        )}
        <Icone
          className={cn(
            'size-[18px] shrink-0 transition-colors',
            actif ? 'text-primary' : 'text-subtle group-hover:text-muted-foreground',
          )}
        />
        {!repliee && <span className="flex-1">{lien.label}</span>}
        {repliee && <span className="sr-only">{lien.label}</span>}
        {pastille > 0 && (
          <span
            className={cn(
              'flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-[18px] text-primary-foreground',
              repliee && 'absolute right-1 top-1 min-w-[14px] leading-[14px]',
            )}
          >
            {pastille}
          </span>
        )}
      </Link>
    </Info>
  );
}

function MenuCreer({ repliee, onNavigue }: { repliee: boolean; onNavigue?: () => void }) {
  const entrees = [
    {
      href: '/campagnes/nouvelle',
      label: 'Campagne',
      desc: 'Devenir maître du jeu',
      icone: Swords,
    },
    {
      href: '/personnages/nouveau',
      label: 'Personnage',
      desc: 'Créer un héros',
      icone: UserRound,
    },
  ];
  return (
    <DropdownMenu>
      <Info texte={repliee ? 'Créer' : null} cote="right">
        <DropdownMenuTrigger
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25)] outline-none transition-colors hover:bg-primary-strong focus-visible:ring-2 focus-visible:ring-ring/60',
            repliee ? 'justify-center' : 'px-3',
          )}
        >
          <Plus className="size-4" />
          {!repliee && <span className="flex-1 text-left">Créer</span>}
          {repliee && <span className="sr-only">Créer</span>}
        </DropdownMenuTrigger>
      </Info>
      <DropdownMenuContent align="start" side={repliee ? 'right' : 'bottom'} className="w-60">
        {entrees.map((e) => (
          <DropdownMenuItem key={e.href} asChild>
            <Link href={e.href} onClick={onNavigue} className="cursor-pointer">
              <span className="flex size-8 items-center justify-center rounded-md border border-border-strong bg-surface-2">
                <e.icone className="size-4 text-primary" />
              </span>
              <span className="flex flex-col">
                <span className="text-foreground">{e.label}</span>
                <span className="text-xs text-subtle">{e.desc}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuUtilisateur({ repliee, onNavigue }: { repliee: boolean; onNavigue?: () => void }) {
  const { profil, seDeconnecter } = useSession();
  if (!profil) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50',
          repliee && 'justify-center',
        )}
      >
        <AvatarJoueur nom={profil.name} url={profil.avatarUrl} taille="sm" />
        {!repliee && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {profil.name}
              </span>
              <span className="block truncate text-[11px] text-subtle">
                {profil.title ?? profil.email ?? 'Aventurier'}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-subtle" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={repliee ? 'start' : 'end'} side="top" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm text-foreground">{profil.name}</span>
          {profil.email && <span className="block truncate text-xs">{profil.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LIENS_COMPTE.map((l) => (
          <DropdownMenuItem key={l.href} asChild>
            <Link href={l.href} onClick={onNavigue} className="cursor-pointer">
              <l.icone />
              {l.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void seDeconnecter()}
          className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
