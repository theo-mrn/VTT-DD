'use client';

import Link from 'next/link';
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

  if (!profil) return <p className="min-h-screen bg-[#0c0c0e] p-8 text-zinc-400">Chargement…</p>;

  return (
    <main className="min-h-screen bg-[#0c0c0e] p-4 pt-12">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div
          className="h-32 bg-zinc-800 bg-cover bg-center"
          style={profil.bannerUrl ? { backgroundImage: `url(${profil.bannerUrl})` } : undefined}
        />
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-4">
            {profil.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profil.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-2xl text-white">
                {profil.name[0]}
              </div>
            )}
            <div>
              <h1 className="text-2xl text-white">{profil.name}</h1>
              {profil.title && <p className="text-[#c9a965]">{profil.title}</p>}
            </div>
          </div>
          {profil.bio && <p className="text-zinc-400">{profil.bio}</p>}
          <dl className="grid grid-cols-2 gap-2 text-sm text-zinc-400">
            <dt>E-mail</dt>
            <dd className="text-zinc-200">{profil.email ?? '—'}</dd>
            <dt>Temps de jeu</dt>
            <dd className="text-zinc-200">{duree(profil.timeSpentMinutes)}</dd>
          </dl>
          <div className="flex gap-3">
            <Link
              href="/"
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-[#c9a965]"
            >
              Accueil
            </Link>
            <button
              onClick={() => seDeconnecter().then(() => router.replace('/'))}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-red-400 hover:border-red-400"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
