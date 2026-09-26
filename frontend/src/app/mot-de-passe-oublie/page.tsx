'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { CadrePublic } from '@/components/compte/cadre-public';
import { Bouton, Message } from '@/components/compte/elements';
import { styleChamp, styleLabel, styleLien } from '@/components/compte/styles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { messageErreur } from '@/lib/api';
import { demanderReinitialisation } from '@/lib/securite';

export default function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await demanderReinitialisation(email.trim());
      setEnvoye(true);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <CadrePublic
      titre="Mot de passe oublié"
      description="Indiquez l'e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe."
    >
      {envoye ? (
        <div className="space-y-4">
          <Message ton="succes">
            Si un compte existe pour {email.trim()}, un lien de réinitialisation vient d&apos;y être
            envoyé. Pensez à vérifier vos indésirables.
          </Message>
          <Bouton ton="secondaire" className="w-full" onClick={() => setEnvoye(false)}>
            Renvoyer un lien
          </Bouton>
        </div>
      ) : (
        <form onSubmit={valider} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className={styleLabel}>
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styleChamp}
              placeholder="vous@exemple.fr"
            />
          </div>
          {erreur && <Message>{erreur}</Message>}
          <Bouton type="submit" chargement={envoi} className="h-10 w-full">
            Envoyer le lien
          </Bouton>
        </form>
      )}
      <p className="text-center">
        <Link href="/connexion" className={styleLien}>
          Retour à la connexion
        </Link>
      </p>
    </CadrePublic>
  );
}
