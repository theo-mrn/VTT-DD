'use client';

/**
 * Groupe « Lancer » de la palette ⌘K. Il porte le moteur de règles (vérification de la formule,
 * jet) : chargé à part, seulement quand la saisie ressemble à une formule de dés.
 */
import { Dices } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { messageErreur } from '@/lib/api';
import { useLancer, verifierFormule } from '@/lib/jets';

export function GroupeLancer({
  saisie,
  onLance,
}: Readonly<{ saisie: string; onLance: () => void }>) {
  const t = useTranslations('shell.palette');
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
        description: t('rollResult', {
          formula: jet.formula,
          critical:
            jet.critical === 'success' || jet.critical === 'failure' ? jet.critical : 'none',
        }),
        icon: <Dices className="size-4 text-primary" />,
        action: { label: t('diceTable'), onClick: () => router.push('/des') },
      });
    } catch (e) {
      toast.error(t('rollFailed'), { description: messageErreur(e) });
    }
  }

  return (
    <CommandGroup heading={t('roll')}>
      <CommandItem value={`${t('roll')} ${formule}`} onSelect={() => void lancerFormule(formule)}>
        <Dices className="text-primary" />
        {t.rich('rollFormula', {
          formula: formule,
          b: (chunks) => <span className="font-mono text-foreground">{chunks}</span>,
        })}
        <CommandShortcut>↵</CommandShortcut>
      </CommandItem>
    </CommandGroup>
  );
}
