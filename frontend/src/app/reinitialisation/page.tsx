'use client';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations('auth');
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
      setErreur(t('reset.mismatch'));
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
        <Message>{t('reset.missingToken')}</Message>
        <Link href="/mot-de-passe-oublie" className={styleLien}>
          {t('reset.requestNew')}
        </Link>
      </div>
    );

  if (fini)
    return (
      <div className="space-y-4">
        <Message ton="succes">{t('reset.done')}</Message>
        <Bouton asChild className="h-10 w-full">
          <Link href="/connexion">{t('form.signIn')}</Link>
        </Bouton>
      </div>
    );

  return (
    <form onSubmit={valider} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="mdp" className={styleLabel}>
          {t('reset.newPassword')}
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
        <p className="text-xs text-subtle">{t('reset.minLength', { min: LONGUEUR_MIN_MDP })}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmation" className={styleLabel}>
          {t('reset.confirmation')}
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
        {t('reset.submit')}
      </Bouton>
      <p className="text-center">
        <Link href="/mot-de-passe-oublie" className={styleLien}>
          {t('reset.expired')}
        </Link>
      </p>
    </form>
  );
}

export default function PageReinitialisation() {
  const t = useTranslations('auth.reset');
  return (
    <CadrePublic titre={t('title')}>
      <Suspense fallback={<Chargement />}>
        <Reinitialisation />
      </Suspense>
    </CadrePublic>
  );
}
