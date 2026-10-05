import { LogoYner } from '@/components/commun/logo-yner';
import { SOUTIEN_URL } from '@/lib/soutien';

/** Pied de page minimal : la marque, le soutien s'il existe, l'année. */
export function Pied() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <LogoYner className="size-6 text-primary" />
          <span className="font-display tracking-[0.2em] text-foreground">YNER</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-subtle">
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
