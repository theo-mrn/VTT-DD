/**
 * Écritures du bloc Compétences, par les opérations de la fiche (service
 * character) : l'aperçu est calculé ici par le moteur, la réponse du service le remplace.
 * Absent : lecture seule (pas d'opérations, ou grille en cours de personnalisation).
 */
import {
  acheter,
  nouvellePossession,
  rembourser,
  type EtatEntite,
  type ResultatRemboursement,
} from '@vtt/rules';
import { toast } from 'sonner';
import type { ContexteFiche, OperationsFiche } from '../../widgets';

/** Remboursement : exposé par les opérations de la fiche quand la page le fournit. */
type WithRefund = OperationsFiche & {
  rembourser?: (index: number, apercu: EtatEntite) => void;
};

export interface SheetWrites {
  buy(achat: string, objet: string): void;
  /** Absent : la page ne fournit pas le remboursement. */
  refund?: {
    check(index: number): ResultatRemboursement;
    run(index: number): void;
  };
  setActive(entree: string, actif: boolean): void;
}

export function sheetWrites(ctx: ContexteFiche, mode: 'read' | 'edit'): SheetWrites | undefined {
  const ops = ctx.operations as WithRefund | undefined;
  if (!ops || mode === 'edit') return undefined;
  const { systeme } = ctx;
  const etat = ctx.fiche.etat;
  const doRefund = ops.rembourser?.bind(ops);
  return {
    buy(achat, objet) {
      const r = acheter(systeme, etat, { achat, objet, date: new Date().toISOString() });
      if (r.ok) ops.acheter(achat, objet, r.etat);
      else toast.error(r.erreur);
    },
    ...(doRefund
      ? {
          refund: {
            check: (index: number) => rembourser(systeme, etat, index),
            run(index: number) {
              const r = rembourser(systeme, etat, index);
              if (r.ok) doRefund(index, r.etat);
              else toast.error(r.erreur);
            },
          },
        }
      : {}),
    setActive(entree, actif) {
      const existe = etat.possessions.some((p) => p.entree === entree);
      ops.possession(
        { entree, actif },
        {
          ...etat,
          possessions: existe
            ? etat.possessions.map((p) => (p.entree === entree ? { ...p, actif } : p))
            : [...etat.possessions, nouvellePossession(entree, 0, { actif })],
        },
      );
    },
  };
}
