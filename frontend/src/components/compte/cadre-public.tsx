import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { aclonica } from './styles';

export { styleLien } from './styles';

/** Cadre centré des pages hors session (mot de passe oublié, réinitialisation, vérification). */
export function CadrePublic({
  titre,
  description,
  children,
}: {
  titre: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c0c0e] p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-10 shadow-2xl">
        <div className="space-y-3 text-center">
          <Link href="/" className={cn(aclonica, 'text-3xl tracking-wider text-white')}>
            YNER
          </Link>
          <h1 className={cn(aclonica, 'text-lg text-[#c9a965]')}>{titre}</h1>
          {description && <p className="text-sm text-zinc-400">{description}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
