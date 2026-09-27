import Link from 'next/link';
import type { ReactNode } from 'react';
import { AvatarJoueur } from './elements';

/** Ligne de liste : avatar, nom (lien vers le profil public), détail et actions. */
export function LigneJoueur({
  id,
  nom,
  avatarUrl,
  detail,
  actions,
}: {
  id: string;
  nom: string;
  avatarUrl: string | null;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3.5">
      <Link href={`/joueurs/${encodeURIComponent(id)}`} className="shrink-0" tabIndex={-1}>
        <AvatarJoueur nom={nom} url={avatarUrl} taille="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/joueurs/${encodeURIComponent(id)}`}
          className="block truncate text-sm font-medium text-foreground transition-colors hover:text-primary"
        >
          {nom}
        </Link>
        {detail && <p className="truncate text-xs text-subtle">{detail}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </li>
  );
}
