'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { PublicFrame } from '@/components/account/public-frame';
import { AppButton, Loading, Message } from '@/components/account/elements';
import { inputStyle, labelStyle, linkStyle } from '@/components/account/styles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/api';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, resetPassword } from '@/lib/security';
import { useSession } from '@/lib/session';

function Reset() {
  const token = useSearchParams().get('jeton');
  const { status, forgetSession } = useSession();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await resetPassword(token, password);
      // Toutes les sessions sont révoquées : celle de cet onglet aussi
      if (status === 'connecte') forgetSession();
      setFinished(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (!token)
    return (
      <div className="space-y-4">
        <Message>Ce lien est incomplet : il manque le jeton de réinitialisation.</Message>
        <Link href="/forgot-password" className={linkStyle}>
          Demander un nouveau lien
        </Link>
      </div>
    );

  if (finished)
    return (
      <div className="space-y-4">
        <Message tone="succes">
          Mot de passe modifié. Par sécurité, tous vos appareils ont été déconnectés :
          reconnectez-vous avec votre nouveau mot de passe.
        </Message>
        <AppButton asChild className="h-10 w-full">
          <Link href="/login">Se connecter</Link>
        </AppButton>
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="mdp" className={labelStyle}>
          Nouveau mot de passe
        </Label>
        <Input
          id="mdp"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputStyle}
        />
        <p className="text-xs text-zinc-500">{MIN_PASSWORD_LENGTH} caractères minimum.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmation" className={labelStyle}>
          Confirmation
        </Label>
        <Input
          id="confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className={inputStyle}
        />
      </div>
      {error && <Message>{error}</Message>}
      <AppButton type="submit" loading={sending} className="h-10 w-full">
        Changer le mot de passe
      </AppButton>
      <p className="text-center">
        <Link href="/forgot-password" className={linkStyle}>
          Lien expiré ? En demander un nouveau
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <PublicFrame title="Nouveau mot de passe">
      <Suspense fallback={<Loading />}>
        <Reset />
      </Suspense>
    </PublicFrame>
  );
}
