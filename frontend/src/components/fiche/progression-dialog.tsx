'use client';

/**
 * Actions de progression du MJ (passage de niveau…) : les actions du système dont les
 * conséquences changent une valeur réservée au MJ (`saisie: mj`). Le service tire le dé,
 * applique les conséquences et refuse un joueur ; la fenêtre montre le jet puis ce qui a
 * changé sur la fiche. Rien n'est propre à un jeu : l'action vient des règles.
 */
import { calculer, type Action, type Fiche, type ResultatAction } from '@vtt/rules';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Dices, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { messageErreur } from '@/lib/api';
import { marquerJetsPerimes } from '@/lib/jets';
import { differences, type Difference } from './values-dialog';
import type { ContexteFiche } from './widgets';

/** Actions du type d'entité qui changent une valeur réservée au MJ : réservées au MJ. */
export function actionsProgression(ctx: ContexteFiche): Action[] {
  const { systeme, fiche } = ctx;
  return [...systeme.actions.values()].filter(
    (a) =>
      a.pour.includes(fiche.etat.type) &&
      a.consequences.some((c) => {
        if (!('attribut' in c) || c.entite !== 'acteur') return false;
        const attr = fiche.entite.attributs.get(c.attribut);
        return attr?.nature === 'base' && attr.saisie === 'mj';
      }),
  );
}

export function ProgressionDialog({
  ctx,
  action,
  open,
  onOpenChange,
}: {
  ctx: ContexteFiche;
  action: Action;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const requetes = useQueryClient();
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<{ resultat: ResultatAction; diff: Difference[] } | null>(null);

  const fermer = (o: boolean) => {
    onOpenChange(o);
    if (!o) setFait(null);
  };

  async function lancer() {
    const operations = ctx.operations;
    if (!operations) return;
    const avant: Fiche = ctx.fiche;
    setEnvoi(true);
    try {
      const r = await operations.action(action.id, {
        appliquer: true,
        campaignId: ctx.personnage.roomId,
      });
      let diff: Difference[] = [];
      if (r.fiche) {
        try {
          diff = differences(ctx, avant, calculer(ctx.systeme, r.fiche.state));
        } catch {
          diff = [];
        }
      }
      setFait({ resultat: r.resultat, diff });
      marquerJetsPerimes(requetes);
    } catch (err) {
      toast.error(`${action.nom} impossible`, { description: messageErreur(err) });
    } finally {
      setEnvoi(false);
    }
  }

  const total = fait && 'total' in fait.resultat.jet ? fait.resultat.jet.total : null;

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="size-5 text-primary" aria-hidden />
            {action.nom}
          </DialogTitle>
          <DialogDescription>
            {ctx.personnage.name}
            {action.description ? ` · ${action.description}` : ''}
          </DialogDescription>
        </DialogHeader>

        {!fait ? (
          <p className="text-sm text-muted-foreground">
            Le dé est lancé et le résultat appliqué à la fiche aussitôt ; le jet apparaît dans
            l’historique des dés.
          </p>
        ) : (
          <div className="space-y-4">
            {total !== null && (
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-medium uppercase tracking-wider text-subtle">
                  Jet
                </span>
                <span className="font-mono text-4xl font-semibold tabular-nums">{total}</span>
              </div>
            )}
            {fait.diff.length > 0 ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {fait.diff.map((d) => (
                  <li key={d.cle} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{d.nom}</span>
                    <span className="font-mono text-subtle">{d.avant}</span>
                    <ArrowRight className="size-3 text-subtle" aria-hidden />
                    <span className="font-mono font-semibold">{d.apres}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune valeur visible n’a changé.</p>
            )}
          </div>
        )}

        <DialogFooter>
          {fait ? (
            <Button onClick={() => fermer(false)}>Fermer</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => fermer(false)}>
                Annuler
              </Button>
              <Button onClick={() => void lancer()} loading={envoi}>
                <Dices />
                Lancer et appliquer
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
