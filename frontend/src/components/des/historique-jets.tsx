'use client';

import { EyeOff, History, RotateCcw, Sparkles, Trash2, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { useEffacerJets, type Jet } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { DesDuJet } from './resultat-jet';
import { cleJour, depuis, heureDe, libelleJour, useMaintenant } from './temps';
import { infoVisibilite } from './visibilite';

const PAR_PAGE = 20;

/** Jets regroupés par jour, du plus récent au plus ancien (la liste arrive déjà triée). */
function parJour(jets: Jet[], maintenant: number) {
  const groupes: { cle: string; libelle: string; jets: Jet[] }[] = [];
  for (const j of jets) {
    const cle = cleJour(j.createdAt);
    const dernier = groupes.at(-1);
    if (dernier?.cle === cle) dernier.jets.push(j);
    else
      groupes.push({
        cle,
        libelle: libelleJour(j.createdAt, maintenant),
        jets: [j],
      });
  }
  return groupes;
}

export interface PlusAnciens {
  /** Le service a encore des jets plus anciens. */
  possible: boolean;
  enCours: boolean;
  charger: () => void;
}

/** Historique des jets : un clic sur une ligne relance la même formule. */
export function HistoriqueJets({
  jets,
  chargement,
  erreur,
  moi,
  onRelancer,
  plusAnciens,
}: {
  jets: Jet[];
  chargement: boolean;
  erreur: unknown;
  /** Identifiant de l'utilisateur : les jets des autres joueurs montrent leur auteur. */
  moi: string | null;
  onRelancer: (jet: Jet) => void;
  /** Pages suivantes du service, une fois les jets chargés tous affichés. */
  plusAnciens?: PlusAnciens;
}) {
  const maintenant = useMaintenant();
  const [limite, setLimite] = useState(PAR_PAGE);
  const groupes = useMemo(
    () => parJour(jets.slice(0, limite), maintenant),
    [jets, limite, maintenant],
  );

  if (chargement)
    return (
      <div className="space-y-2 p-3" aria-label="Chargement de l’historique">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="size-11 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );

  if (erreur)
    return (
      <p className="p-6 text-center text-sm text-destructive">
        Historique indisponible : {messageErreur(erreur)}
      </p>
    );

  if (!jets.length)
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-border-strong bg-surface-2 shadow-surface">
          <History className="size-5 text-subtle" aria-hidden />
        </div>
        <p className="text-sm font-medium">Aucun jet pour l’instant</p>
        <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">
          Vos lancers s’afficheront ici, du plus récent au plus ancien.
        </p>
      </div>
    );

  return (
    <div className="pb-2">
      {groupes.map((g) => (
        <section key={g.cle} aria-label={g.libelle}>
          <h3 className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card/90 px-5 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle backdrop-blur-md">
            {g.libelle}
            <span className="font-mono tabular normal-case tracking-normal">{g.jets.length}</span>
          </h3>
          <ul className="space-y-0.5 px-2 py-1.5">
            {g.jets.map((j) => (
              <li key={j.id}>
                <LigneJet
                  jet={j}
                  auteur={moi && j.userId !== moi ? j.userName : null}
                  quand={
                    g.libelle === 'Aujourd’hui'
                      ? depuis(j.createdAt, maintenant)
                      : heureDe(j.createdAt)
                  }
                  onRelancer={() => onRelancer(j)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {jets.length > limite ? (
        <div className="px-4 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setLimite((l) => l + PAR_PAGE)}
          >
            Afficher {Math.min(PAR_PAGE, jets.length - limite)} jets de plus
          </Button>
        </div>
      ) : (
        plusAnciens?.possible && (
          <div className="px-4 pt-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              loading={plusAnciens.enCours}
              onClick={() => {
                setLimite((l) => l + PAR_PAGE);
                plusAnciens.charger();
              }}
            >
              Charger des jets plus anciens
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function LigneJet({
  jet,
  auteur,
  quand,
  onRelancer,
}: {
  jet: Jet;
  auteur: string | null;
  quand: string;
  onRelancer: () => void;
}) {
  const vis = infoVisibilite(jet.visibility);
  const Icone = vis.icone;
  const nbDes = jet.groups.reduce((n, g) => n + g.dice.length, 0);
  const resultat = jet.hidden ? 'caché' : (jet.symbolResult ?? String(jet.total));
  // Nom affiché du jet (personnage, « MJ » ou profil), sans le répéter
  const noms = [...new Set([auteur, jet.characterName].filter(Boolean))];

  return (
    <button
      type="button"
      onClick={onRelancer}
      aria-label={`Relancer ${jet.label ? `« ${jet.label} » ` : ''}${jet.formula} (résultat précédent : ${resultat}${jet.critical === 'success' ? ', critique' : jet.critical === 'failure' ? ', échec critique' : ''}, ${vis.libelle.toLowerCase()})`}
      className={cn(
        'group relative flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors',
        'hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      <span
        className={cn(
          'flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border px-1.5 font-mono text-lg font-semibold tabular',
          jet.critical === 'success' && 'border-primary/40 bg-primary/10 text-primary-strong',
          jet.critical === 'failure' && 'border-destructive/35 bg-destructive/10 text-destructive',
          !jet.critical && 'border-border bg-surface-2 text-foreground',
        )}
      >
        {jet.hidden ? (
          <EyeOff className="size-4 text-subtle" aria-hidden />
        ) : jet.symbolResult ? (
          <Sparkles className="size-4 text-primary" aria-hidden />
        ) : (
          jet.total
        )}
      </span>

      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-[13px] font-medium text-foreground',
              !jet.label && 'font-mono',
            )}
          >
            {jet.label || jet.formula}
          </span>
          {jet.critical && (
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider',
                jet.critical === 'success'
                  ? 'bg-primary/15 text-primary-strong'
                  : 'bg-destructive/15 text-destructive',
              )}
            >
              {jet.critical === 'success' ? 'Critique' : 'Échec'}
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-subtle">
          {jet.label && <span className="truncate font-mono">{jet.formula}</span>}
          {noms.length > 0 && (
            <>
              {jet.label && <span aria-hidden>·</span>}
              <UserRound className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{noms.join(' · ')}</span>
            </>
          )}
        </span>
        {jet.symbolResult && !jet.hidden && (
          <span className="block truncate text-[11px] text-muted-foreground">
            {jet.symbolResult}
          </span>
        )}
        {nbDes > 0 && (
          <span className="block pt-1">
            <DesDuJet groupes={jet.groups} taille="xs" max={8} />
          </span>
        )}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
        <span className="text-[11px] text-subtle tabular">{quand}</span>
        <span className="relative flex size-4 items-center justify-center">
          {Icone && (
            <Icone
              className="size-3.5 text-subtle transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0"
              aria-hidden
            />
          )}
          <RotateCcw
            className="absolute size-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          />
        </span>
      </span>
    </button>
  );
}

/**
 * Bouton « Effacer » et sa confirmation : l'historique ne revient pas. Sans
 * campagne, mes jets personnels ; dans une campagne, tout son historique
 * (le MJ seul peut le vider).
 */
export function EffacerHistorique({
  roomId,
  campagne,
  desactive,
  onEfface,
}: {
  roomId: string | null;
  /** Nom de la campagne vidée, ou null pour les jets personnels. */
  campagne: string | null;
  desactive: boolean;
  onEfface: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const effacer = useEffacerJets(roomId);

  async function confirmer() {
    try {
      await effacer.mutateAsync();
      setOuvert(false);
      onEfface();
      toast.success('Historique effacé');
    } catch (err) {
      toast.error('Impossible d’effacer l’historique', {
        description: messageErreur(err),
      });
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <Info texte="Effacer l’historique">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={desactive}
          onClick={() => setOuvert(true)}
          aria-label="Effacer l’historique"
        >
          <Trash2 />
        </Button>
      </Info>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Effacer l’historique ?</DialogTitle>
          <DialogDescription>
            {campagne
              ? `Tous les jets de « ${campagne} » seront supprimés, ceux de tous les joueurs, pour toute la table. Les statistiques de la campagne repartiront de zéro. Cette action est définitive.`
              : 'Tous vos jets personnels seront supprimés. Vos jets de campagne restent. Cette action est définitive.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Annuler</Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirmer} loading={effacer.isPending}>
            {!effacer.isPending && <Trash2 aria-hidden />}
            Effacer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
