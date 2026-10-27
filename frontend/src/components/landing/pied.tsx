import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { LogoYner } from '@/components/commun/logo-yner';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { LEGAL_PAGES } from '@/lib/legal';

const LIENS_LEGAUX = ['notice', 'privacy', 'terms', 'credits'] as const;

/** Pied de page (partagé avec les pages légales) : la marque, les pages légales, la langue. */
export function Pied() {
  const t = useTranslations('landing.footer');
  return (
    <footer className="px-4 pb-12 pt-16">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 rounded-2xl border border-white/10 bg-[#181818] px-6 py-6 sm:flex-row">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <LogoYner className="size-6 text-primary" />
          <span className="text-sm font-semibold tracking-widest text-foreground">YNER</span>
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-subtle">
          {LIENS_LEGAUX.map((page) => (
            <Link
              key={page}
              href={LEGAL_PAGES[page]}
              className="rounded transition-colors duration-300 ease-weighted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t(page)}
            </Link>
          ))}
          <LocaleSwitcher compact />
          <span>© {new Date().getFullYear()} Yner</span>
        </div>
      </div>
    </footer>
  );
}
