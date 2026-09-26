'use client';

import { Home, KeyRound, LogOut, Shield, User, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { AvatarJoueur } from './elements';
import { aclonica } from './styles';

export interface LienCompte {
  href: string;
  label: string;
  icone: LucideIcon;
  /** Actif aussi sur les sous-pages (sauf /profil, qui a ses propres sous-pages). */
  exact?: boolean;
}

/** Pages de compte, partagées par la navigation et le menu utilisateur de la landing page. */
export const LIENS_COMPTE: LienCompte[] = [
  { href: '/profil', label: 'Profil', icone: User, exact: true },
  { href: '/profil/securite', label: 'Sécurité', icone: Shield },
  { href: '/amis', label: 'Amis', icone: Users },
  { href: '/profil/cles-api', label: "Clés d'API", icone: KeyRound },
];

const LIENS_NAV: LienCompte[] = [
  { href: '/', label: 'Accueil', icone: Home, exact: true },
  ...LIENS_COMPTE,
];

function estActif(lien: LienCompte, chemin: string) {
  return lien.exact
    ? chemin === lien.href
    : chemin === lien.href || chemin.startsWith(`${lien.href}/`);
}

/** En-tête commun aux pages de compte : logo, onglets, menu utilisateur. */
export function NavigationCompte() {
  const chemin = usePathname();
  const { profil, seDeconnecter } = useSession();
  const [sortie, setSortie] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0c0c0e]/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className={cn(aclonica, 'text-2xl tracking-wider text-white')}>
          YNER
        </Link>

        <nav aria-label="Compte" className="hidden items-center gap-1 md:flex">
          {LIENS_NAV.map((lien) => (
            <OngletNav key={lien.href} lien={lien} actif={estActif(lien, chemin)} />
          ))}
        </nav>

        {profil && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Menu du compte"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#c9a965]"
            >
              <AvatarJoueur nom={profil.name} url={profil.avatarUrl} taille="sm" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 border-zinc-800 bg-[#0c0c0e] text-white"
            >
              <DropdownMenuLabel className="truncate font-normal">
                <span className="block truncate text-sm text-white">{profil.name}</span>
                {profil.email && (
                  <span className="block truncate text-xs text-zinc-500">{profil.email}</span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                disabled={sortie}
                onSelect={() => {
                  setSortie(true);
                  void seDeconnecter();
                }}
                className="cursor-pointer gap-2 text-red-400 focus:bg-red-500/20 focus:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Mobile : onglets défilants sous l'en-tête */}
      <nav
        aria-label="Compte"
        className="flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:hidden"
      >
        {LIENS_NAV.map((lien) => (
          <OngletNav key={lien.href} lien={lien} actif={estActif(lien, chemin)} />
        ))}
      </nav>
    </header>
  );
}

function OngletNav({ lien, actif }: { lien: LienCompte; actif: boolean }) {
  const Icone = lien.icone;
  return (
    <Link
      href={lien.href}
      aria-current={actif ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
        actif
          ? 'bg-zinc-900 text-[#c9a965] ring-1 ring-zinc-800'
          : 'text-zinc-400 hover:bg-zinc-900 hover:text-white',
      )}
    >
      <Icone className="h-4 w-4" />
      {lien.label}
    </Link>
  );
}
