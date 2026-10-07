'use client';

import { useTranslations } from 'next-intl';
import {
  acheterEtape,
  achatsPossibles,
  rembourser,
  soldes,
  type EtapeCreation,
  type EtatEntite,
  type Fiche,
  type SystemeCharge,
} from '@vtt/rules';
import { Coins, Lock, Plus, Search, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Message } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import { InputGroup } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from '@/components/ui/tooltip';
import type { OperationCreation } from '@/lib/personnages';
import { cn } from '@/lib/utils';

type Etape = Extract<EtapeCreation, { type: 'acheter' }>;

const PAR_PAGE = 60;

/**
 * Étape « acheter » : dépenser une monnaie (XP de départ…) dans les achats
 * autorisés, avec le coût et les blocages calculés par le moteur, et l'annulation
 * des achats faits pendant la création.
 */
export function EtapeAcheter({
  systeme,
  etat,
  fiche,
  etape,
  onEtat,
}: Readonly<{
  systeme: SystemeCharge;
  etat: EtatEntite;
  fiche: Fiche;
  etape: Etape;
  /** Nouvel état calculé localement (aperçu) et l'écriture à envoyer au service. */
  onEtat: (e: EtatEntite, op: OperationCreation) => void;
}>) {
  const t = useTranslations();
  const [recherche, setRecherche] = useState('');
  const [tous, setTous] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const disponibles = achatsPossibles(fiche, etape.achats);
  const monnaies = soldes(fiche).filter((m) =>
    disponibles.some((d) => d.achat.monnaie === m.monnaie.id),
  );
  const journal = etat.journal
    .map((l, index) => ({ l, index }))
    .filter(({ l }) => l.creation && etape.achats.includes(l.achat));

  function acheter(achat: string, objet: string) {
    const r = acheterEtape(systeme, etat, etape.id, {
      achat,
      objet,
      date: new Date().toISOString(),
    });
    if (r.ok) {
      setErreur(null);
      onEtat(r.etat, { type: 'etape', etape: etape.id, corps: { achat, objet } });
    } else setErreur(r.erreur);
  }

  function annuler(index: number) {
    const r = rembourser(systeme, etat, index);
    if (r.ok) {
      setErreur(null);
      onEtat(r.etat, { type: 'rembourser', index });
    } else setErreur(r.erreur);
  }

  if (disponibles.length === 0)
    return (
      <Message ton="info">
        Rien à acheter pour le moment : faites d&apos;abord les étapes précédentes.
      </Message>
    );

  const terme = recherche.trim().toLowerCase();

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {monnaies.map((m) => (
          <div
            key={m.monnaie.id}
            className="rounded-2xl border border-border bg-card p-5 shadow-surface"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Coins className="size-4 text-primary" />
                {m.monnaie.nom}
              </p>
              <p className="font-mono text-2xl font-bold tabular text-primary-strong">{m.solde}</p>
            </div>
            <Progress valeur={m.total ? (m.depense / m.total) * 100 : 0} />
            <p className="mt-1.5 text-xs text-subtle">
              {m.depense} dépensé(s) sur {m.total}
            </p>
          </div>
        ))}
      </div>

      {erreur && <Message>{erreur}</Message>}

      <Tabs defaultValue={disponibles[0]!.achat.id}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="h-auto flex-wrap">
            {disponibles.map((d) => (
              <TabsTrigger key={d.achat.id} value={d.achat.id} className="h-8">
                {d.achat.nom}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-3">
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={tous} onCheckedChange={setTous} />
              {t('creation.buy.unavailable')}
            </label>
            <div className="w-56">
              <InputGroup
                avant={<Search />}
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder={t('creation.buy.filter')}
                className="h-9"
                aria-label={t('creation.buy.filterLabel')}
              />
            </div>
          </div>
        </div>
        {disponibles.map((d) => {
          const objets = d.objets
            .filter((o) => tous || o.possible)
            .filter((o) => !terme || o.nom.toLowerCase().includes(terme))
            .sort((a, b) => Number(b.possible) - Number(a.possible) || a.cout - b.cout);
          return (
            <TabsContent key={d.achat.id} value={d.achat.id}>
              {d.achat.description && (
                <p className="mb-3 text-[13px] text-muted-foreground">{d.achat.description}</p>
              )}
              {objets.length === 0 ? (
                <p className="py-8 text-center text-sm text-subtle">
                  Rien d&apos;achetable ici avec votre solde actuel.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {objets.slice(0, PAR_PAGE).map((o) => (
                    <li
                      key={`${o.achat}-${o.objet}`}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3',
                        o.possible ? 'border-border bg-card' : 'border-border/60 opacity-60',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{o.nom}</p>
                        <p className="text-xs text-subtle">
                          {o.type === 'entree' || o.type === 'noeud'
                            ? t('creation.buy.new')
                            : `${o.actuel} → ${o.cible}`}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular text-primary">
                        {o.cout}
                      </span>
                      {o.possible ? (
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          onClick={() => acheter(o.achat, o.objet)}
                          aria-label={`Acheter ${o.nom}`}
                        >
                          <Plus />
                        </Button>
                      ) : (
                        <Info texte={o.blocages.map((b) => b.message).join(' · ')}>
                          <span className="flex size-8 items-center justify-center rounded-lg text-subtle">
                            <Lock className="size-4" />
                          </span>
                        </Info>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {objets.length > PAR_PAGE && (
                <p className="mt-3 text-center text-xs text-subtle">
                  {objets.length - PAR_PAGE} autres : affinez le filtre.
                </p>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {journal.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-surface">
          <p className="mb-3 text-sm font-semibold">{t('creation.buy.title')}</p>
          <ul className="space-y-1.5">
            {journal
              .slice()
              .reverse()
              .map(({ l, index }) => (
                <li key={index} className="flex items-center gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">
                    {systeme.achats.get(l.achat)?.nom} ·{' '}
                    <span className="text-foreground">
                      {systeme.entrees.get(l.objet)?.nom ??
                        fiche.entite.attributs.get(l.objet)?.nom ??
                        l.objet}
                    </span>
                  </span>
                  <span className="font-mono text-primary">−{l.cout}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => annuler(index)}
                    aria-label={t('creation.buy.cancel')}
                  >
                    <Undo2 />
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
