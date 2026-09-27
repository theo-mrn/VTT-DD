'use client';

import { Globe, KeyRound } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { messageErreur } from '@/lib/api';
import { LONGUEUR_CODE, useRejoindreCampagne } from '@/lib/campagnes';
import { cn } from '@/lib/utils';
import { CampagnesOuvertes } from './public-campaigns';
import { InvitationsRecues } from './received-invitations';

type Onglet = 'code' | 'ouvertes';

/**
 * Rejoindre une campagne : avec le code donné par le MJ (le code complet
 * valide tout seul), parmi les campagnes ouvertes, ou par une invitation
 * reçue. On arrive ensuite au choix du héros.
 */
export function DialogueRejoindre({
  ouvert,
  onOuvert,
  codeInitial = '',
  ongletInitial = 'code',
}: {
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
  /** Code reçu par lien d'invitation (?code=). */
  codeInitial?: string;
  ongletInitial?: Onglet;
}) {
  const router = useRouter();
  const [code, setCode] = useState(codeInitial.toUpperCase().slice(0, LONGUEUR_CODE));
  const [onglet, setOnglet] = useState<Onglet>(codeInitial ? 'code' : ongletInitial);
  const rejoindre = useRejoindreCampagne();

  async function valider(valeur = code, e?: FormEvent) {
    e?.preventDefault();
    if (valeur.length !== LONGUEUR_CODE || rejoindre.isPending) return;
    try {
      const c = await rejoindre.mutateAsync(valeur);
      toast.success(`Bienvenue dans « ${c.name} »`);
      entrer(c.id);
    } catch {
      // L'erreur est affichée sous le code
    }
  }

  /** Après avoir rejoint (code, campagne ouverte ou invitation) : le choix du héros. */
  function entrer(id: string) {
    onOuvert(false);
    setCode('');
    router.push(`/campagnes/${id}/personnage`);
  }

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(v) => {
        onOuvert(v);
        if (!v) rejoindre.reset();
      }}
    >
      <DialogContent
        className={cn(
          'max-h-[92dvh] overflow-y-auto transition-[max-width]',
          onglet === 'ouvertes' ? 'sm:max-w-3xl' : 'sm:max-w-md',
        )}
      >
        <DialogHeader className="items-center pr-0 text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-glow">
            {onglet === 'code' ? <KeyRound className="size-5" /> : <Globe className="size-5" />}
          </span>
          <DialogTitle>Rejoindre une campagne</DialogTitle>
          <DialogDescription>
            {onglet === 'code'
              ? `Saisissez le code à ${LONGUEUR_CODE} caractères que votre maître du jeu vous a transmis.`
              : 'Les campagnes publiques accueillent tous les joueurs, sans code.'}
          </DialogDescription>
        </DialogHeader>
        <InvitationsRecues onRejointe={(c) => entrer(c.id)} />
        <Tabs value={onglet} onValueChange={(v) => setOnglet(v as Onglet)}>
          <TabsList className="mx-auto w-full sm:w-auto">
            <TabsTrigger value="code" className="flex-1">
              <KeyRound />
              Avec un code
            </TabsTrigger>
            <TabsTrigger value="ouvertes" className="flex-1">
              <Globe />
              Campagnes ouvertes
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ouvertes" className="mt-5">
            <CampagnesOuvertes compacte onRejointe={(c) => entrer(c.id)} />
          </TabsContent>
          <TabsContent value="code" className="mt-5">
            <form
              onSubmit={(e) => void valider(code, e)}
              className="flex flex-col items-center gap-5"
            >
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
