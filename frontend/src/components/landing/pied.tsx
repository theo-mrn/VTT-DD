import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { LogoYner } from '@/components/commun/logo-yner';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { LEGAL_PAGES } from '@/lib/legal';

const LIENS_LEGAUX = ['notice', 'privacy', 'terms', 'credits'] as const;

/** Pied de page : la marque, les pages légales, la langue, l'année. */
export function Pied() {
  const t = useTranslations('landing.footer');
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <LogoYner className="size-6 text-primary" />
          <span className="font-display tracking-[0.2em] text-foreground">YNER</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-subtle">
          {LIENS_LEGAUX.map((page) => (
            <Link
              key={page}
              href={LEGAL_PAGES[page]}
              className="transition-colors hover:text-foreground"
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
