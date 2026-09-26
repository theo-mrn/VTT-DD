'use client';

import {
  Home,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  PlusCircle,
  ScrollText,
  Shield,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
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
import { PlayerAvatar } from './elements';
import { aclonica } from './styles';

export interface AccountLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Actif aussi sur les sous-pages (sauf /profil, qui a ses propres sous-pages). */
  exact?: boolean;
}

/** Pages de compte, partagées par la navigation et le menu utilisateur de la landing page. */
export const ACCOUNT_LINKS: AccountLink[] = [
  { href: '/profile', label: 'Profil', icon: User, exact: true },
  { href: '/profile/security', label: 'Sécurité', icon: Shield },
  { href: '/friends', label: 'Amis', icon: Users },
  { href: '/profile/api-keys', label: "Clés d'API", icon: KeyRound },
];

/** Campagnes, comme la barre de l'ancienne app (Mes campagnes, Rejoindre, Créer). */
export const CAMPAIGN_LINKS: AccountLink[] = [
  { href: '/campaigns', label: 'Mes campagnes', icon: LayoutDashboard },
  { href: '/join', label: 'Rejoindre', icon: LogIn },
  { href: '/campaigns/new', label: 'Créer', icon: PlusCircle, exact: true },
];

const NAV_LINKS: AccountLink[] = [
  { href: '/', label: 'Accueil', icon: Home, exact: true },
  ...CAMPAIGN_LINKS,
  { href: '/characters', label: 'Personnages', icon: ScrollText },
  ...ACCOUNT_LINKS,
];

function matches(link: AccountLink, path: string) {
  return link.exact ? path === link.href : path === link.href || path.startsWith(`${link.href}/`);
}

/** Onglet actif : le lien le plus précis qui correspond (/campaigns/new plutôt que /campaigns). */
function activeHref(path: string): string | undefined {
  return NAV_LINKS.filter((l) => matches(l, path)).sort((a, b) => b.href.length - a.href.length)[0]
    ?.href;
}

/** En-tête commun aux pages de compte : logo, onglets, menu utilisateur. */
export function AccountNav() {
  const path = usePathname();
  const active = activeHref(path);
  const { profile, signOut } = useSession();
  const [leaving, setLeaving] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0c0c0e]/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className={cn(aclonica, 'text-2xl tracking-wider text-white')}>
          YNER
        </Link>

        <nav aria-label="Compte" className="hidden items-center gap-1 xl:flex">
          {NAV_LINKS.map((link) => (
            <NavTab key={link.href} link={link} active={link.href === active} />
          ))}
        </nav>

        {profile && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Menu du compte"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#c9a965]"
            >
              <PlayerAvatar name={profile.name} url={profile.avatarUrl} size="sm" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 border-zinc-800 bg-[#0c0c0e] text-white"
            >
              <DropdownMenuLabel className="truncate font-normal">
                <span className="block truncate text-sm text-white">{profile.name}</span>
                {profile.email && (
                  <span className="block truncate text-xs text-zinc-500">{profile.email}</span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                disabled={leaving}
                onSelect={() => {
                  setLeaving(true);
                  void signOut();
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
        className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:px-6 xl:hidden"
      >
        {NAV_LINKS.map((link) => (
          <NavTab key={link.href} link={link} active={link.href === active} />
        ))}
      </nav>
    </header>
  );
}

function NavTab({ link, active }: { link: AccountLink; active: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-zinc-900 text-[#c9a965] ring-1 ring-zinc-800'
          : 'text-zinc-400 hover:bg-zinc-900 hover:text-white',
      )}
    >
      <Icon className="h-4 w-4" />
      {link.label}
    </Link>
  );
}
