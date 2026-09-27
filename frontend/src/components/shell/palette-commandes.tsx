'use client';

import { Dices, LogIn, NotebookPen, Plus, Swords, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useCampagnes } from '@/lib/campagnes';
import { messageErreur } from '@/lib/api';
import { useLancer, verifierFormule } from '@/lib/jets';
import { iconeNote, useNotes } from '@/lib/notes';
import { lienPersonnage, usePersonnages } from '@/lib/personnages';
import { LIENS_COMPTE, NAV_PRINCIPALE, NAV_SOCIALE } from './navigation';

/** Palette ⌘K : aller partout, créer, et lancer une formule de dés directement. */
export function PaletteCommandes({
  ouverte,
  onOuverte,
}: {
  ouverte: boolean;
  onOuverte: (v: boolean) => void;
}) {
  const router = useRouter();
  const [saisie, setSaisie] = useState('');
  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  const notes = useNotes();
  const lancer = useLancer();

  const formule = /\d*d\d/i.test(saisie) && verifierFormule(saisie).ok ? saisie.trim() : null;

  function aller(href: string) {
    onOuverte(false);
    setSaisie('');
    router.push(href);
  }

  // Jet personnel : les dés 3D roulent par-dessus l'app, le résultat arrive à leur arrêt
  async function lancerFormule(f: string) {
    onOuverte(false);
    setSaisie('');
    try {
      const jet = await lancer.mutateAsync({ formula: f });
      toast(`${jet.symbolResult ?? jet.total}`, {
        description: `${jet.formula}${jet.critical === 'success' ? ' · critique !' : jet.critical === 'failure' ? ' · échec critique' : ''}`,
        icon: <Dices className="size-4 text-primary" />,
        action: { label: 'Table de dés', onClick: () => router.push('/des') },
      });
    } catch (e) {
      toast.error('Jet impossible', { description: messageErreur(e) });
    }
  }

  return (
    <Dialog open={ouverte} onOpenChange={onOuverte}>
      <DialogContent
        unstyled
        showCloseButton={false}
        className="top-[16%] max-w-xl translate-y-0 overflow-hidden rounded-2xl border border-border-strong bg-popover shadow-elevated data-[state=open]:slide-in-from-top-4 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Palette de commandes</DialogTitle>
        <Command loop>
          <CommandInput
            value={saisie}
            onValueChange={setSaisie}
            placeholder="Chercher une page, une campagne… ou lancer « 2d6+3 »"
            apres={<Kbd>Échap</Kbd>}
          />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>

            {formule && (
              <CommandGroup heading="Lancer">
                <CommandItem value={`lancer ${formule}`} onSelect={() => lancerFormule(formule)}>
                  <Dices className="text-primary" />
                  Lancer <span className="font-mono text-foreground">{formule}</span>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => aller('/campagnes/nouvelle')}>
                <Plus />
                Nouvelle campagne
              </CommandItem>
              <CommandItem onSelect={() => aller('/campagnes?rejoindre=1')}>
                <LogIn />
                Rejoindre une campagne avec un code
              </CommandItem>
              <CommandItem onSelect={() => aller('/personnages/nouveau')}>
                <UserRound />
                Nouveau personnage
              </CommandItem>
              <CommandItem onSelect={() => aller('/notes?nouvelle=1')}>
                <NotebookPen />
                Nouvelle note
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Aller à">
              {[...NAV_PRINCIPALE, ...NAV_SOCIALE, ...LIENS_COMPTE].map((l) => (
                <CommandItem key={l.href} value={`aller ${l.label}`} onSelect={() => aller(l.href)}>
                  <l.icone />
                  {l.label}
                </CommandItem>
              ))}
            </CommandGroup>

            {(campagnes.data?.length ?? 0) > 0 && (
              <CommandGroup heading="Campagnes">
                {campagnes.data!.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`campagne ${c.name} ${c.id}`}
                    onSelect={() => aller(`/campagnes/${c.id}`)}
                  >
                    <Illustration
                      src={c.coverUrl}
                      graine={c.name}
                      initiale={false}
                      className="size-5 rounded-md"
                    />
                    {c.name}
                    <CommandShortcut>
                      <Swords className="!size-3.5" />
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(personnages.data?.length ?? 0) > 0 && (
              <CommandGroup heading="Personnages">
                {personnages.data!.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`personnage ${p.name} ${p.id}`}
                    onSelect={() => aller(lienPersonnage(p))}
                  >
                    <Illustration
                      src={p.portraitUrl}
                      graine={p.name}
                      initiale={false}
                      position="top"
                      className="size-5 rounded-full"
                    />
                    {p.name}
                    <CommandShortcut>{p.summary.tagline}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {(notes.data?.length ?? 0) > 0 && (
              <CommandGroup heading="Notes">
                {notes.data!.slice(0, 12).map((n) => (
                  <CommandItem
                    key={n.id}
                    value={`note ${n.title} ${n.id}`}
                    onSelect={() => aller(`/notes?note=${n.id}`)}
                  >
                    <span className="w-4 text-center text-sm">{iconeNote(n)}</span>
                    {n.title || 'Sans titre'}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
