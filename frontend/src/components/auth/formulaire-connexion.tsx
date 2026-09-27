'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Lock, Mail, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Message } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import { InputGroup } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageErreur } from '@/lib/api';
import type { Fournisseur } from '@/lib/profil';
import {
  LONGUEUR_MAX_MDP,
  LONGUEUR_MIN_MDP,
  lireFournisseursOAuth,
  urlOAuth,
  type FournisseursOAuth,
} from '@/lib/securite';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

export type ModeAuth = 'connexion' | 'inscription';

/**
 * Connexion / inscription sur le service identity. Utilisé sur /connexion
 * (mise en page en deux colonnes) et dans la fenêtre de la landing page
 * (`carte` : le formulaire porte son propre cadre).
 *
 * `redirection` : page où revenir après une connexion Google / Discord
 * (par défaut, la page courante).
 */
export function FormulaireConnexion({
  onConnecte,
  redirection,
  erreurInitiale = null,
  modeInitial = 'connexion',
  carte = false,
}: {
  onConnecte?: (mode: ModeAuth) => void;
  redirection?: string;
  erreurInitiale?: string | null;
  modeInitial?: ModeAuth;
  carte?: boolean;
}) {
  const { seConnecter, sInscrire } = useSession();
  const chemin = usePathname();
  const [mode, setMode] = useState<ModeAuth>(modeInitial);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [visible, setVisible] = useState(false);
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(erreurInitiale);
  const [envoi, setEnvoi] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<FournisseursOAuth | null>(null);
  const [depart, setDepart] = useState<Fournisseur | null>(null);
  const ids = useId();

  useEffect(() => {
    lireFournisseursOAuth()
      .then(setFournisseurs)
      .catch(() => setFournisseurs(null));
  }, []);

  useEffect(() => setErreur(erreurInitiale), [erreurInitiale]);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      if (mode === 'connexion') await seConnecter(email, motDePasse);
      else await sInscrire(email, motDePasse, nom.trim());
      onConnecte?.(mode);
    } catch (err) {
      setErreur(messageErreur(err, 'Serveur injoignable, réessayez dans un instant.'));
    } finally {
      setEnvoi(false);
    }
  }

  function continuerAvec(f: Fournisseur) {
    setDepart(f);
    window.location.assign(urlOAuth(f, redirection ?? chemin ?? '/'));
  }

  const actifs = (['google', 'discord'] as const).filter((f) => fournisseurs?.[f]);
  const inscription = mode === 'inscription';

  return (
    <div
      className={cn(
        'w-full max-w-[400px]',
        carte &&
          'rounded-2xl border border-border-strong bg-popover/95 p-6 shadow-elevated backdrop-blur-xl sm:p-8',
      )}
    >
      <div className="mb-7 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {inscription ? 'Créez votre compte' : 'Bon retour parmi nous'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {inscription
            ? 'Quelques secondes, et votre première aventure vous attend.'
            : 'Connectez-vous pour retrouver vos campagnes et vos héros.'}
        </p>
      </div>

      <SelecteurMode mode={mode} onChange={(m) => (setMode(m), setErreur(null))} />

      {actifs.length > 0 && (
        <>
          <div className={cn('mt-5 grid gap-2', actifs.length > 1 && 'grid-cols-2')}>
            {actifs.map((f) => (
              <Button
                key={f}
                type="button"
                variant="secondary"
                className="h-10"
                onClick={() => continuerAvec(f)}
                disabled={depart !== null}
                loading={depart === f}
              >
                {depart !== f && (f === 'google' ? <LogoGoogle /> : <LogoDiscord />)}
                {NOMS[f]}
              </Button>
            ))}
          </div>
          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-subtle">
            <span className="h-px flex-1 bg-border" />
            ou avec votre e-mail
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={valider} className={cn('space-y-4', actifs.length === 0 && 'mt-6')}>
        {inscription && (
          <div className="space-y-2">
            <Label htmlFor={`${ids}-nom`}>Nom d&apos;aventurier</Label>
            <InputGroup
              id={`${ids}-nom`}
              avant={<UserRound />}
              placeholder="Elrond, Kaël, Morgane…"
              autoComplete="nickname"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
              maxLength={64}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor={`${ids}-email`}>E-mail</Label>
          <InputGroup
            id={`${ids}-email`}
            avant={<Mail />}
            type="email"
            placeholder="vous@exemple.fr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor={`${ids}-mdp`}>Mot de passe</Label>
            {!inscription && (
              <Link
                href="/mot-de-passe-oublie"
                className="text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                Mot de passe oublié ?
              </Link>
            )}
          </div>
          <InputGroup
            id={`${ids}-mdp`}
            avant={<Lock />}
            type={visible ? 'text' : 'password'}
            placeholder={inscription ? `${LONGUEUR_MIN_MDP} caractères minimum` : '••••••••'}
            autoComplete={inscription ? 'new-password' : 'current-password'}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            required
            minLength={inscription ? LONGUEUR_MIN_MDP : 1}
            maxLength={LONGUEUR_MAX_MDP}
            apres={
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="flex size-7 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-3 hover:text-foreground"
                aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
          {inscription && <ForceMotDePasse motDePasse={motDePasse} />}
        </div>

        {erreur && <Message>{erreur}</Message>}

        <Button type="submit" size="lg" className="group w-full" loading={envoi}>
          {inscription ? 'Créer mon compte' : 'Se connecter'}
          {!envoi && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
        </Button>

        {inscription && (
          <p className="text-center text-xs leading-relaxed text-subtle">
            En créant un compte, vous acceptez que vos campagnes et personnages soient conservés
            pour vous et vos groupes de jeu.
          </p>
        )}
      </form>
    </div>
  );
}

function SelecteurMode({ mode, onChange }: { mode: ModeAuth; onChange: (m: ModeAuth) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Connexion ou inscription"
      className="relative grid grid-cols-2 rounded-xl border border-border bg-surface p-1"
    >
      {(['connexion', 'inscription'] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={mode === m}
          onClick={() => onChange(m)}
          className={cn(
            'relative z-10 h-8 rounded-lg text-[13px] font-medium transition-colors',
            mode === m ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {mode === m && (
            <motion.span
              layoutId="pastille-mode-auth"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              className="absolute inset-0 -z-10 rounded-lg bg-surface-3 shadow-surface"
            />
          )}
          {m === 'connexion' ? 'Connexion' : 'Inscription'}
        </button>
      ))}
    </div>
  );
}

/** Indication de solidité : longueur, variété des caractères. */
function ForceMotDePasse({ motDePasse }: { motDePasse: string }) {
  if (!motDePasse) return null;
  const criteres = [
    motDePasse.length >= LONGUEUR_MIN_MDP,
    motDePasse.length >= 12,
    /[a-z]/.test(motDePasse) && /[A-Z]/.test(motDePasse),
    /\d/.test(motDePasse) || /[^A-Za-z0-9]/.test(motDePasse),
  ];
  const score = criteres.filter(Boolean).length;
  const libelles = ['Trop court', 'Faible', 'Correct', 'Solide', 'Excellent'];
  const couleurs = ['bg-destructive', 'bg-destructive', 'bg-warning', 'bg-success', 'bg-success'];
  return (
    <div className="flex items-center gap-3 pt-1" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i < score ? couleurs[score] : 'bg-surface-3',
            )}
          />
        ))}
      </div>
      <span className="w-16 text-right text-[11px] text-subtle">
        {criteres[0] ? libelles[score] : libelles[0]}
      </span>
    </div>
  );
}

const NOMS: Record<Fournisseur, string> = { google: 'Google', discord: 'Discord' };

function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

function LogoDiscord() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#5865F2"
        d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"
      />
    </svg>
  );
}
