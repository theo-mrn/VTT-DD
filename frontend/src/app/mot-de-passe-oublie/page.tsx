'use client';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations('auth');
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
    <CadrePublic titre={t('forgot.title')} description={t('forgot.lead')}>
      {envoye ? (
        <div className="space-y-4">
          <Message ton="succes">{t('forgot.sent', { email: email.trim() })}</Message>
          <Bouton ton="secondaire" className="w-full" onClick={() => setEnvoye(false)}>
            {t('forgot.resend')}
          </Bouton>
        </div>
      ) : (
        <form onSubmit={valider} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className={styleLabel}>
              {t('form.email')}
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styleChamp}
              placeholder={t('form.emailPlaceholder')}
            />
          </div>
          {erreur && <Message>{erreur}</Message>}
          <Bouton type="submit" chargement={envoi} className="h-10 w-full">
            {t('forgot.send')}
          </Bouton>
        </form>
      )}
      <p className="text-center">
        <Link href="/connexion" className={styleLien}>
          {t('forgot.backToSignIn')}
        </Link>
      </p>
    </CadrePublic>
  );
}
