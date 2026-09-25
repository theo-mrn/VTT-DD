'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';

function duree(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

export default function Profil() {
  const { statut, profil, seDeconnecter } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (statut === 'anonyme') router.replace('/connexion');
  }, [statut, router]);

  if (!profil) return <p className="p-8 text-texte-doux">Chargement…</p>;

  return (
    <main className="mx-auto max-w-2xl p-4 pt-12">
      <div className="overflow-hidden rounded-xl border border-bordure bg-surface">
        <div
          className="h-32 bg-bordure bg-cover bg-center"
          style={profil.bannerUrl ? { backgroundImage: `url(${profil.bannerUrl})` } : undefined}
        />
        <div className="space-y-3 p-6">
          <div className="flex items-center gap-4">
            {profil.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profil.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bordure font-titre text-2xl">
                {profil.name[0]}
              </div>
            )}
            <div>
              <h1 className="font-titre text-2xl">{profil.name}</h1>
              {profil.title && <p className="text-accent">{profil.title}</p>}
            </div>
          </div>
          {profil.bio && <p className="text-texte-doux">{profil.bio}</p>}
          <dl className="grid grid-cols-2 gap-2 text-sm text-texte-doux">
            <dt>E-mail</dt>
            <dd>{profil.email ?? '—'}</dd>
            <dt>Temps de jeu</dt>
            <dd>{duree(profil.timeSpentMinutes)}</dd>
          </dl>
          <button
            onClick={() => seDeconnecter().then(() => router.replace('/connexion'))}
            className="rounded-md border border-bordure px-4 py-2 text-sm hover:border-accent"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </main>
  );
}
