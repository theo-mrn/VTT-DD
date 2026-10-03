'use client';

/**
 * Groupe « Lancer » de la palette ⌘K. Il porte le moteur de règles (vérification de la formule,
 * jet) : chargé à part, seulement quand la saisie ressemble à une formule de dés.
 */
import { Dices } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { messageErreur } from '@/lib/api';
import { useLancer, verifierFormule } from '@/lib/jets';

export function GroupeLancer({
  saisie,
  onLance,
}: Readonly<{ saisie: string; onLance: () => void }>) {
  const router = useRouter();
  const lancer = useLancer();
  const formule = verifierFormule(saisie).ok ? saisie.trim() : null;
  if (!formule) return null;

  // Jet personnel : les dés 3D roulent par-dessus l'app, le résultat arrive à leur arrêt
  async function lancerFormule(f: string) {
    onLance();
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
    <CommandGroup heading="Lancer">
      <CommandItem value={`lancer ${formule}`} onSelect={() => void lancerFormule(formule)}>
        <Dices className="text-primary" />
        Lancer <span className="font-mono text-foreground">{formule}</span>
        <CommandShortcut>↵</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  );
}
