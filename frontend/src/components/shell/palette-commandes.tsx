'use client';

import { LogIn, Plus, Swords, UserRound } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { iconeNote, useNotes } from '@/lib/notes';
import { lienPersonnage, usePersonnages } from '@/lib/personnages';
import { LIENS_COMPTE, NAV_PRINCIPALE, NAV_SOCIALE } from './navigation';

// Moteur de règles (jets) : chargé seulement quand la saisie ressemble à une formule de dés
const GroupeLancer = dynamic(() => import('./palette-jet').then((m) => m.GroupeLancer), {
  ssr: false,
});

/** Palette ⌘K : aller partout, créer, et lancer une formule de dés directement. */
export function PaletteCommandes({
  ouverte,
  onOuverte,
}: Readonly<{
  ouverte: boolean;
  onOuverte: (v: boolean) => void;
}>) {
  const router = useRouter();
  const [saisie, setSaisie] = useState('');
  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  const notes = useNotes();
  const formuleProbable = /d\d/i.test(saisie);

  function aller(href: string) {
    onOuverte(false);
    setSaisie('');
    router.push(href);
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

            {formuleProbable && (
              <GroupeLancer
                saisie={saisie}
                onLance={() => {
                  onOuverte(false);
                  setSaisie('');
                }}
              />
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
                      largeur={40}
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
                      largeur={20}
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
