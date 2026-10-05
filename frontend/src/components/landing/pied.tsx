import Link from 'next/link';
import { LogoYner } from '@/components/commun/logo-yner';
import { LEGAL_PAGES } from '@/lib/legal';
import { SOUTIEN_URL } from '@/lib/soutien';

const LIENS_LEGAUX = [
  { href: LEGAL_PAGES.notice, libelle: 'Mentions légales' },
  { href: LEGAL_PAGES.privacy, libelle: 'Confidentialité' },
  { href: LEGAL_PAGES.terms, libelle: 'Conditions' },
  { href: LEGAL_PAGES.credits, libelle: 'Crédits' },
];

/** Pied de page : la marque, les pages légales, le soutien s'il existe, l'année. */
export function Pied() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <LogoYner className="size-6 text-primary" />
          <span className="font-display tracking-[0.2em] text-foreground">YNER</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-subtle">
          {LIENS_LEGAUX.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.libelle}
            </Link>
          ))}
          {SOUTIEN_URL && (
            <a
              href={SOUTIEN_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Soutenir le projet
            </a>
          )}
          <span>© {new Date().getFullYear()} Yner</span>
        </div>
      </div>
    </footer>
  );
}
