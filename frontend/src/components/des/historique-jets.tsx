'use client';

import { compareText } from '@/i18n/runtime';
import { useTranslations } from 'next-intl';
import { EyeOff, Filter, History, RotateCcw, Trash2 } from 'lucide-react';
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
import { depuis, useMaintenant } from './temps';
import { FOCUS, TACTILE } from './tactile';
import { infoVisibilite } from './visibilite';

const PAR_PAGE = 20;

export interface PlusAnciens {
  /** Le service a encore des jets plus anciens. */
  possible: boolean;
  enCours: boolean;
  charger: () => void;
}

/**
 * Historique des jets, en cartes denses comme l'ancien lanceur : avatar, nom,
 * heure, formule, détail du service et total. Un filtre en puces garde les
 * jets d'un seul lanceur ; le bouton ⟲ relance la même formule.
 */
export function HistoriqueJets({
  jets,
  chargement,
  erreur,
  onRelancer,
  plusAnciens,
}: Readonly<{
  jets: Jet[];
  chargement: boolean;
  erreur: unknown;
  onRelancer: (jet: Jet) => void;
  /** Pages suivantes du service, une fois les jets chargés tous affichés. */
  plusAnciens?: PlusAnciens;
}>) {
  const t = useTranslations('dice.history');
  const maintenant = useMaintenant();
  const [limite, setLimite] = useState(PAR_PAGE);
  const [joueur, setJoueur] = useState<string | null>(null);
  const joueurs = useMemo(
    () => [...new Set(jets.map((j) => j.userName))].sort(compareText),
    [jets],
  );
  const filtres = useMemo(
    () => (joueur ? jets.filter((j) => j.userName === joueur) : jets),
    [jets, joueur],
  );

  if (chargement)
    return (
      <div className="space-y-2 p-3" aria-label={t('loading')}>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
    );

  if (erreur)
    return (
      <p className="p-6 text-center text-sm text-destructive">
        {t('unavailable', { error: messageErreur(erreur) })}
      </p>
    );

  if (!jets.length)
    return (
      <div className="flex flex-col items-center px-6 py-8 text-center">
        <History className="mb-2 size-5 text-subtle" aria-hidden />
        <p className="text-xs italic text-subtle">{t('empty')}</p>
      </div>
    );

  return (
    <div className="space-y-2 p-3">
      {joueurs.length > 1 && (
        <div
          role="group"
          aria-label={t('filter')}
          className="flex items-center gap-1 overflow-x-auto border-b border-border pb-2 [scrollbar-width:thin]"
        >
          <Filter className="mr-0.5 size-3 shrink-0 text-subtle" aria-hidden />
          {[null, ...joueurs].map((j) => (
            <button
              key={j ?? 'tous'}
              type="button"
              aria-pressed={joueur === j}
              onClick={() => {
                setJoueur(j);
                setLimite(PAR_PAGE);
              }}
              className={cn(
                'h-6 shrink-0 whitespace-nowrap rounded-md px-2 text-[11px] transition-colors',
                joueur === j
                  ? 'bg-surface-3 font-medium text-foreground'
                  : 'text-subtle hover:text-foreground',
                FOCUS,
                TACTILE,
              )}
            >
              {j ?? t('all')}
            </button>
          ))}
        </div>
      )}

      {filtres.length ? (
        <ul className="space-y-1.5">
          {filtres.slice(0, limite).map((j) => (
            <li key={j.id}>
              <CarteJet
                jet={j}
                quand={depuis(j.createdAt, maintenant)}
                onRelancer={() => onRelancer(j)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-xs italic text-subtle">{t('empty')}</p>
      )}

      {filtres.length > limite ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setLimite((l) => l + PAR_PAGE)}
        >
          {t('showMore', { count: Math.min(PAR_PAGE, filtres.length - limite) })}
        </Button>
      ) : (
        plusAnciens?.possible && (
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
            {t('loadOlder')}
          </Button>
        )
      )}
    </div>
  );
}

function Avatar({ nom, url }: Readonly<{ nom: string; url: string | null }>) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={url} alt="" className="size-8 rounded-full border border-border object-cover" />
    );
  return (
    <span
      aria-hidden
      className="flex size-8 items-center justify-center rounded-full border border-border bg-surface-3 text-[11px] font-bold uppercase text-muted-foreground"
    >
      {nom.trim().slice(0, 2)}
    </span>
  );
}

/** Résultat d'un jet de l'historique : total ou symboles, mention critique ; ou masqué. */
function ResultatCarte({ jet, cache }: Readonly<{ jet: Jet; cache: boolean }>) {
  const t = useTranslations('dice.history');
  if (cache)
    return (
      <span className="flex items-center gap-1.5 text-xs text-subtle">
        <EyeOff className="size-3.5" aria-hidden />
        {t('hidden')}
      </span>
    );
  return (
    <span
      className={cn(
        'text-sm font-bold',
        jet.symbolResult && 'text-primary-strong',
        !jet.symbolResult && jet.critical === 'success' && 'text-primary-strong',
        !jet.symbolResult && jet.critical === 'failure' && 'text-destructive',
        !jet.symbolResult && !jet.critical && 'text-foreground',
      )}
    >
      {jet.symbolResult ?? t('total', { total: String(jet.total) })}
      {jet.critical && (
        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider">
          {jet.critical === 'success' ? t('critical') : t('fumble')}
        </span>
      )}
    </span>
  );
}

function CarteJet({
  jet,
  quand,
  onRelancer,
}: Readonly<{ jet: Jet; quand: string; onRelancer: () => void }>) {
  const t = useTranslations('dice');
  const vis = infoVisibilite(jet.visibility);
  const cache = jet.hidden || jet.total === null;
  return (
    <article
      aria-label={t('history.cardLabel', {
        user: jet.userName,
        label: jet.label ? `${jet.label}, ` : '',
        formula: jet.formula,
        result: cache ? t('history.cardHidden') : String(jet.symbolResult ?? jet.total),
      })}
      className="group relative flex items-start gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-2.5 transition-colors hover:border-border hover:bg-surface-2"
    >
      <Avatar nom={jet.userName} url={jet.userAvatar} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-bold text-foreground">{jet.userName}</span>
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-subtle">
            {jet.visibility !== 'public' && (
              <vis.icone
                className={cn(
                  'size-3',
                  jet.visibility === 'gm' ? 'text-destructive' : 'text-primary',
                )}
                aria-label={t(`visibility.${vis.valeur}.label`)}
              />
            )}
            {quand}
          </span>
        </div>
        <p className="truncate font-mono text-[11px] text-subtle">
          {jet.label && <span className="font-sans text-muted-foreground">{jet.label} · </span>}
          {jet.formula}
        </p>
        {!cache && jet.output && (
          <p className="truncate font-mono text-[10px] text-subtle/80">{jet.output}</p>
        )}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <ResultatCarte jet={jet} cache={cache} />
          <button
            type="button"
            onClick={onRelancer}
            aria-label={t('history.rerollLabel', {
              label: jet.label ? `« ${jet.label} » ` : '',
              formula: jet.formula,
            })}
            title={t('history.reroll')}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-3/60 text-muted-foreground transition-[opacity,color] hover:text-foreground',
              'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
              FOCUS,
              TACTILE,
            )}
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </article>
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
}: Readonly<{
  roomId: string | null;
  /** Nom de la campagne vidée, ou null pour les jets personnels. */
  campagne: string | null;
  desactive: boolean;
  onEfface: () => void;
}>) {
  const t = useTranslations('dice.history');
  const [ouvert, setOuvert] = useState(false);
  const effacer = useEffacerJets(roomId);

  async function confirmer() {
    try {
      await effacer.mutateAsync();
      setOuvert(false);
      onEfface();
      toast.success(t('cleared'));
    } catch (err) {
      toast.error(t('clearFailed'), {
        description: messageErreur(err),
      });
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <Info texte={t('clear')}>
        <Button
          variant="ghost"
          size="icon-sm"
          className={TACTILE}
          disabled={desactive}
          onClick={() => setOuvert(true)}
          aria-label={t('clear')}
        >
          <Trash2 />
        </Button>
      </Info>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('clearTitle')}</DialogTitle>
          <DialogDescription>
            {campagne ? t('clearCampaign', { campaign: campagne }) : t('clearPersonal')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t('cancel')}</Button>
          </DialogClose>
          <Button variant="destructive" onClick={confirmer} loading={effacer.isPending}>
            {!effacer.isPending && <Trash2 aria-hidden />}
            {t('clearButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
