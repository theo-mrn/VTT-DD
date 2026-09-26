'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { PublicFrame } from '@/components/account/public-frame';
import { AppButton, Message } from '@/components/account/elements';
import { inputStyle, labelStyle, linkStyle } from '@/components/account/styles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { requestPasswordReset } from '@/lib/security';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <PublicFrame
      title="Mot de passe oublié"
      description="Indiquez l'e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe."
    >
      {sent ? (
        <div className="space-y-4">
          <Message tone="succes">
            Si un compte existe pour {email.trim()}, un lien de réinitialisation vient d&apos;y être
            envoyé. Pensez à vérifier vos indésirables.
          </Message>
          <AppButton tone="secondaire" className="w-full" onClick={() => setSent(false)}>
            Renvoyer un lien
          </AppButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className={labelStyle}>
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputStyle}
              placeholder="vous@exemple.fr"
            />
          </div>
          {error && <Message>{error}</Message>}
          <AppButton type="submit" loading={sending} className="h-10 w-full">
            Envoyer le lien
          </AppButton>
        </form>
      )}
      <p className="text-center">
        <Link href="/login" className={linkStyle}>
          Retour à la connexion
        </Link>
      </p>
    </PublicFrame>
  );
}
