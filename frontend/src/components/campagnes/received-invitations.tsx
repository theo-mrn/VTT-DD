'use client';

import { Check, Mail, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { formaterDepuis } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import { messageErreur } from '@/lib/api';
import {
  useDeclinerInvitation,
  useInvitationsRecues,
  useRejoindreSansCode,
  type DetailCampagne,
  type InvitationRecue,
} from '@/lib/campagnes';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useNomSysteme } from './carte-campagne';

/**
 * Invitations nominatives reçues (un MJ m'a invité à sa table) : accepter fait
 * entrer sans code, même dans une campagne privée ; décliner retire
 * l'invitation. Rien n'est affiché sans invitation en attente.
 */
export function InvitationsRecues({
  onRejointe,
  className,
}: Readonly<{
  onRejointe?: (c: DetailCampagne) => void | Promise<void>;
  className?: string;
}>) {
  const invitations = useInvitationsRecues();
  if (!invitations.data?.length) return null;
  return (
    <section className={cn('space-y-3', className)} aria-label="Invitations reçues">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Mail className="size-4 text-primary" />
        Vous êtes invité à {invitations.data.length > 1 ? 'ces tables' : 'cette table'}
      </p>
      <ul className="grid gap-2">
        {invitations.data.map((i) => (
          <LigneInvitation key={i.id} invitation={i} onRejointe={onRejointe} />
        ))}
      </ul>
    </section>
  );
}

function LigneInvitation({
  invitation: i,
  onRejointe,
}: Readonly<{
  invitation: InvitationRecue;
  onRejointe?: (c: DetailCampagne) => void | Promise<void>;
}>) {
  const router = useRouter();
  const profil = useProfil();
  const nomSysteme = useNomSysteme(i.system);
  const rejoindre = useRejoindreSansCode();
  const decliner = useDeclinerInvitation(profil.id);
  const [envoi, setEnvoi] = useState(false);

  async function accepter() {
    setEnvoi(true);
    try {
      const c = await rejoindre.mutateAsync(i.id);
      toast.success(`Bienvenue dans « ${c.name} »`);
      if (onRejointe) await onRejointe(c);
      else router.push(`/campagnes/${c.id}/personnage`);
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <li
      data-ambiance={i.ambiance}
      className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/[0.05] p-3"
    >
      <Illustration
        largeur={112}
        src={i.coverUrl}
        graine={i.name}
        className="size-14 shrink-0 rounded-xl ring-1 ring-white/10"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{i.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {nomSysteme} · invité par {i.invitedBy.name} {formaterDepuis(i.invitedAt)}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Décliner l'invitation à ${i.name}`}
          disabled={envoi}
          loading={decliner.isPending}
          onClick={() =>
            decliner.mutate(i.id, {
              onSuccess: () => toast.success('Invitation déclinée'),
              onError: (e) => toast.error(messageErreur(e)),
            })
          }
        >
          {!decliner.isPending && <X />}
        </Button>
        <Button size="sm" onClick={() => void accepter()} loading={envoi}>
          {!envoi && <Check />}
          Rejoindre
        </Button>
      </div>
    </li>
  );
}
