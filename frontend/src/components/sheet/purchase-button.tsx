'use client';

import type { ObjetAchetable } from '@vtt/rules';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { boutonIcone } from './styles';

/** Achat d'un objet : coût affiché, raisons du blocage au survol et pour les lecteurs d'écran. */
export function BoutonAchat({
  objet,
  libelle,
  monnaie,
  onAcheter,
  texteBouton,
}: {
  objet: ObjetAchetable;
  libelle: string;
  monnaie: string;
  onAcheter(): Promise<boolean>;
  texteBouton?: string;
}) {
  const [envoi, setEnvoi] = useState(false);
  const raison = objet.blocages.map((b) => b.message).join(' ; ');
  return (
    <button
      type="button"
      className={cn(boutonIcone, 'w-auto gap-1 px-2 text-xs tabular-nums')}
      disabled={!objet.possible || envoi}
      title={objet.possible ? `${libelle} : ${objet.cout} ${monnaie}` : raison}
      aria-label={`${libelle} : ${objet.cout} ${monnaie}${objet.possible ? '' : ` (impossible : ${raison})`}`}
      onClick={async () => {
        setEnvoi(true);
        await onAcheter();
        setEnvoi(false);
      }}
    >
      <Plus className="h-3.5 w-3.5" />
      {texteBouton ?? objet.cout}
    </button>
  );
}
