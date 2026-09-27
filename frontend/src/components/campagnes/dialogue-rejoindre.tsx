'use client';

import { KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { messageErreur } from '@/lib/api';
import { LONGUEUR_CODE, useRejoindreCampagne } from '@/lib/campagnes';

/** Rejoindre une campagne avec le code donné par le MJ ; le code complet valide tout seul. */
export function DialogueRejoindre({
  ouvert,
  onOuvert,
  codeInitial = '',
}: {
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
  /** Code reçu par lien d'invitation (?code=). */
  codeInitial?: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState(codeInitial.toUpperCase().slice(0, LONGUEUR_CODE));
  const rejoindre = useRejoindreCampagne();

  async function valider(valeur = code, e?: FormEvent) {
    e?.preventDefault();
    if (valeur.length !== LONGUEUR_CODE || rejoindre.isPending) return;
    try {
      const c = await rejoindre.mutateAsync(valeur);
      toast.success(`Bienvenue dans « ${c.name} »`);
      onOuvert(false);
      setCode('');
      router.push(`/campagnes/${c.id}/personnage`);
    } catch {
      // L'erreur est affichée sous le code
    }
  }

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(v) => {
        onOuvert(v);
        if (!v) rejoindre.reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center pr-0 text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-glow">
            <KeyRound className="size-5" />
          </span>
          <DialogTitle>Rejoindre une campagne</DialogTitle>
          <DialogDescription>
            Saisissez le code à {LONGUEUR_CODE} caractères que votre maître du jeu vous a transmis.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void valider(code, e)} className="flex flex-col items-center gap-5">
          <InputOTP
            maxLength={LONGUEUR_CODE}
            value={code}
            autoFocus
            pattern="^[A-Za-z0-9]*$"
            onChange={(v) => {
              const c = v.toUpperCase();
              setCode(c);
              rejoindre.reset();
              if (c.length === LONGUEUR_CODE) void valider(c);
            }}
            aria-label="Code de la campagne"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          {rejoindre.isError && (
            <Message className="w-full">{messageErreur(rejoindre.error)}</Message>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={code.length !== LONGUEUR_CODE}
            loading={rejoindre.isPending}
          >
            Rejoindre la table
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
