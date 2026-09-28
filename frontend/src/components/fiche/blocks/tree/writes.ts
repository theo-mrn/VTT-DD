/**
 * Écritures du bloc Compétences, par les opérations de la fiche (service
 * character) : l'aperçu est calculé ici par le moteur, la réponse du service le remplace.
 * Absent : lecture seule (pas d'opérations, ou grille en cours de personnalisation).
 */
import {
  acheter,
  estExemplaire,
  nouvellePossession,
  rembourser,
  reporterEffetsDesactives,
  sourceExemplaire,
  type Effet,
  type EtatEntite,
  type ResultatRemboursement,
} from '@vtt/rules';
import { toast } from 'sonner';
import { cibleBonusPropres } from '../../bonus-editor/model';
import type { ContexteFiche, OperationsFiche } from '../../widgets';
import { envoyerBascule } from '../effects/model';

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
  /**
   * Active ou coupe des effets (clés `<source>/<index>`) : la même opération que le bloc
   * Bonus. Absent : la page ne fournit pas l'opération.
   */
  toggleEffects?(cles: string[], actif: boolean): void;
  /**
   * Remplace les effets propres (bonus ajoutés à la main) de l'entrée possédée, sur sa
   * possession ou sur une possession créée au rang 0 (voir `cibleBonusPropres`).
   */
  setOwnEffects(entree: string, effets: Effet[]): void;
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
    ...(ops.effet
      ? {
          toggleEffects: (cles: string[], actif: boolean) =>
            envoyerBascule(ctx.fiche, ops.effet?.bind(ops), cles, actif),
        }
      : {}),
    setOwnEffects(entree, effets) {
      const cible = cibleBonusPropres(ctx.fiche, entree);
      if (!cible.ok) {
        toast.error(cible.raison);
        return;
      }
      const p = cible.possession;
      if (p) {
        const ex = p.exemplaire;
        ops.possession(
          { entree, ...(ex !== undefined ? { exemplaire: ex } : {}), effets },
          {
            ...etat,
            possessions: etat.possessions.map((x) =>
              estExemplaire(x, entree, ex) ? { ...x, effets } : x,
            ),
            // Les effets coupés suivent leur effet, comme le fait le service
            effetsDesactives: reporterEffetsDesactives(
              etat.effetsDesactives,
              sourceExemplaire(p),
              p.effets,
              effets,
            ),
          },
        );
        return;
      }
      // Possession créée : elle garde l'état actif de l'entrée (actif par défaut de la sorte)
      ops.possession(
        { entree, actif: cible.actif, effets },
        {
          ...etat,
          possessions: [
            ...etat.possessions,
            nouvellePossession(entree, 0, { actif: cible.actif, effets }),
          ],
        },
      );
    },
  };
}
