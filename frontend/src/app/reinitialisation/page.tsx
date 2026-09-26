'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { CadrePublic } from '@/components/compte/cadre-public';
import { Bouton, Chargement, Message } from '@/components/compte/elements';
import { styleChamp, styleLabel, styleLien } from '@/components/compte/styles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageErreur } from '@/lib/api';
import { LONGUEUR_MAX_MDP, LONGUEUR_MIN_MDP, reinitialiserMotDePasse } from '@/lib/securite';
import { useSession } from '@/lib/session';

function Reinitialisation() {
  const jeton = useSearchParams().get('jeton');
  const { statut, oublierSession } = useSession();
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [fini, setFini] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider(e: FormEvent) {
    e.preventDefault();
    if (!jeton) return;
    if (motDePasse !== confirmation) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setErreur(null);
    setEnvoi(true);
    try {
      await reinitialiserMotDePasse(jeton, motDePasse);
      // Toutes les sessions sont révoquées : celle de cet onglet aussi
      if (statut === 'connecte') oublierSession();
      setFini(true);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  if (!jeton)
    return (
      <div className="space-y-4">
        <Message>Ce lien est incomplet : il manque le jeton de réinitialisation.</Message>
        <Link href="/mot-de-passe-oublie" className={styleLien}>
          Demander un nouveau lien
        </Link>
      </div>
    );

  if (fini)
    return (
      <div className="space-y-4">
        <Message ton="succes">
          Mot de passe modifié. Par sécurité, tous vos appareils ont été déconnectés :
          reconnectez-vous avec votre nouveau mot de passe.
        </Message>
        <Bouton asChild className="h-10 w-full">
          <Link href="/connexion">Se connecter</Link>
        </Bouton>
      </div>
    );

  return (
    <form onSubmit={valider} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="mdp" className={styleLabel}>
          Nouveau mot de passe
        </Label>
        <Input
          id="mdp"
          type="password"
          autoComplete="new-password"
          required
          minLength={LONGUEUR_MIN_MDP}
          maxLength={LONGUEUR_MAX_MDP}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className={styleChamp}
        />
        <p className="text-xs text-zinc-500">{LONGUEUR_MIN_MDP} caractères minimum.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmation" className={styleLabel}>
          Confirmation
        </Label>
        <Input
          id="confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className={styleChamp}
        />
      </div>
      {erreur && <Message>{erreur}</Message>}
      <Bouton type="submit" chargement={envoi} className="h-10 w-full">
        Changer le mot de passe
      </Bouton>
      <p className="text-center">
        <Link href="/mot-de-passe-oublie" className={styleLien}>
          Lien expiré ? En demander un nouveau
        </Link>
      </p>
    </form>
  );
}

export default function PageReinitialisation() {
  return (
    <CadrePublic titre="Nouveau mot de passe">
      <Suspense fallback={<Chargement />}>
        <Reinitialisation />
      </Suspense>
    </CadrePublic>
  );
}
