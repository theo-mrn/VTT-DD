'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function Connexion() {
  const { statut, seConnecter, sInscrire } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (statut === 'connecte') router.replace('/profil');
  }, [statut, router]);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      if (mode === 'connexion') await seConnecter(email, motDePasse);
      else await sInscrire(email, motDePasse, nom);
      router.replace('/profil');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Serveur injoignable');
    } finally {
      setEnvoi(false);
    }
  }

  const champ =
    'w-full rounded-md border border-bordure bg-fond px-3 py-2 outline-none focus:border-accent';

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={valider}
        className="w-full max-w-sm space-y-4 rounded-xl border border-bordure bg-surface p-8 shadow-2xl"
      >
        <h1 className="text-center font-titre text-3xl text-accent">Yner</h1>

        <div className="grid grid-cols-2 gap-1 rounded-md bg-fond p-1 text-sm">
          {(['connexion', 'inscription'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded py-1.5 capitalize ${mode === m ? 'bg-surface text-accent' : 'text-texte-doux'}`}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === 'inscription' && (
          <input
            className={champ}
            placeholder="Nom d'aventurier"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            maxLength={64}
          />
        )}
        <input
          className={champ}
          type="email"
          placeholder="E-mail"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={champ}
          type="password"
          placeholder="Mot de passe"
          autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          required
          minLength={mode === 'inscription' ? 8 : 1}
        />

        {erreur && <p className="text-sm text-erreur">{erreur}</p>}

        <button
          type="submit"
          disabled={envoi}
          className="w-full rounded-md bg-accent py-2 font-semibold text-fond hover:bg-accent-fort disabled:opacity-50"
        >
          {envoi ? '…' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>
    </main>
  );
}
