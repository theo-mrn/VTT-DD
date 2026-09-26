'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * Connexion / inscription sur le service identity. Utilisé dans la fenêtre de
 * la landing page et sur /connexion. Même apparence que l'ancien formulaire.
 */
export function FormulaireConnexion({ onConnecte }: { onConnecte?: () => void }) {
  const { seConnecter, sInscrire } = useSession();
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      if (mode === 'connexion') await seConnecter(email, motDePasse);
      else await sInscrire(email, motDePasse, nom);
      onConnecte?.();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Serveur injoignable');
    } finally {
      setEnvoi(false);
    }
  }

  const champ =
    'w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 text-white placeholder:text-zinc-500 outline-none focus:border-[#c9a965]';

  return (
    <form
      onSubmit={valider}
      className="w-full max-w-sm space-y-4 rounded-2xl bg-zinc-900 px-6 py-10 shadow-2xl"
    >
      <h2 className="text-center font-[family-name:var(--font-aclonica)] text-3xl tracking-wider text-white">
        YNER
      </h2>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-800/60 p-1 text-sm">
        {(['connexion', 'inscription'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md py-1.5 capitalize transition-colors',
              mode === m ? 'bg-zinc-900 text-[#c9a965]' : 'text-zinc-400 hover:text-white',
            )}
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

      {erreur && <p className="text-sm text-red-400">{erreur}</p>}

      <button
        type="submit"
        disabled={envoi}
        className="w-full rounded-lg bg-[#c9a965] py-2.5 font-semibold text-zinc-950 transition-colors hover:bg-[#d8bb7a] disabled:opacity-50"
      >
        {envoi ? '…' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
      </button>
    </form>
  );
}
