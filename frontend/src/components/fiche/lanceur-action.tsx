'use client';

import {
  nomPossession,
  type Action,
  type Fiche,
  type Presentation,
  type ResultatAction,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Dices, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import { DesDuJet, TotalJet } from '@/components/des/resultat-jet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { messageErreur } from '@/lib/api';
import { libelleAttribut } from '@/lib/creation';
import { marquerJetsPerimes } from '@/lib/jets';
import type { OperationsPersonnage } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import { DesSymboles, ResultatsSymboles } from './symboles';

type Parametre = Action['parametres'][number];

/** Valeur par défaut d'un paramètre, pour préremplir le formulaire. */
function defaut(fiche: Fiche, p: Parametre): Valeur {
  switch (p.type) {
    case 'nombre':
      return p.defaut;
    case 'booleen':
      return p.defaut;
    case 'attribut':
      return optionsAttribut(fiche, p)[0] ?? '';
    case 'entree':
      return p.facultatif ? '' : (optionsEntree(fiche, p)[0]?.id ?? '');
  }
}

function optionsAttribut(fiche: Fiche, p: Extract<Parametre, { type: 'attribut' }>): string[] {
  if (p.attributs?.length) return p.attributs;
  return [...fiche.entite.attributs.values()]
    .filter((a) => a.groupe === p.groupe)
    .map((a) => a.cle);
}

/**
 * Entrées proposées pour un paramètre `entree`. Une entrée possédée en plusieurs
 * exemplaires en propose chacun (`entree#exemplaire`) : l'action lit alors ses valeurs
 * et sa formule propres (dés d'une arme personnalisée).
 */
function optionsEntree(fiche: Fiche, p: Extract<Parametre, { type: 'entree' }>) {
  const convient = (e: { sorte: string; etiquettes: string[] }) =>
    e.sorte === p.sorte && (!p.etiquette || e.etiquettes.includes(p.etiquette));
  const exemplaires = (id: string) => {
    const x = fiche.possessions.get(id);
    if (!x || x.exemplaires.length < 2) return null;
    return x.exemplaires.map((ex, i) => {
      const nom = nomPossession(x.entree, x.sorte, ex);
      return {
        id: ex.exemplaire === undefined ? id : `${id}#${ex.exemplaire}`,
        nom: nom === x.entree.nom ? `${nom} (n° ${i + 1})` : nom,
        rang: x.rang,
      };
    });
  };
  if (!p.possedee)
    return [...fiche.systeme.entrees.values()]
      .filter(convient)
      .flatMap(
        (e) =>
          exemplaires(e.id) ?? [
            { id: e.id, nom: e.nom, rang: fiche.possessions.get(e.id)?.rang ?? 0 },
          ],
      );
  return [...fiche.possessions.values()]
    .filter((x) => convient(x.entree))
    .flatMap(
      (x) =>
        exemplaires(x.entree.id) ?? [
          {
            id: x.entree.id,
            nom: nomPossession(x.entree, x.sorte, x.possession),
            rang: x.rang,
          },
        ],
    );
}

/**
 * Exécute une action du système (test, initiative…) depuis la fiche :
 * paramètres, jet tiré par le service character (qui le transmet à
 * l'historique des dés de la campagne), explications, et conséquences sur le
 * personnage, enregistrées avec le jet si « Appliquer » est coché.
 */
export function LanceurAction({
  systeme,
  presentation,
  fiche,
  action,
  personnage,
  ouvert,
  onOuvert,
  onAction,
}: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  action: Action;
  personnage: { id: string; name: string; roomId: string | null };
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
  /** Jet tiré par le service (voir useOperationsPersonnage). */
  onAction: OperationsPersonnage['action'];
}) {
  const [valeurs, setValeurs] = useState<Record<string, Valeur>>(() =>
    Object.fromEntries(action.parametres.map((p) => [p.id, defaut(fiche, p)])),
  );
  const [resultat, setResultat] = useState<ResultatAction | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [appliquer, setAppliquer] = useState(true);
  const [applique, setApplique] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [numero, setNumero] = useState(0);
  const requetes = useQueryClient();

  async function lancer() {
    const parametres = Object.fromEntries(
      Object.entries(valeurs).filter(([, v]) => v !== ''),
    ) as Record<string, Valeur>;
    setEnvoi(true);
    let r: Awaited<ReturnType<typeof onAction>>;
    try {
      r = await onAction(action.id, {
        parametres,
        appliquer,
        campaignId: personnage.roomId,
      });
    } catch (err) {
      setErreur(messageErreur(err));
      setResultat(null);
      return;
    } finally {
      setEnvoi(false);
    }
    setErreur(null);
    setResultat(r.resultat);
    // Conséquences enregistrées par le service avec le jet
    const aDesConsequences = r.resultat.modifications.some((m) => m.entite === 'acteur');
    setApplique(Boolean(r.fiche) && aDesConsequences);
    if (r.fiche && aDesConsequences) toast.success('Fiche mise à jour');
    setNumero((n) => n + 1);
    // Le jet est transmis par le service character à l'historique des dés (service dice)
    marquerJetsPerimes(requetes);
  }

  const modifs = resultat?.modifications.filter((m) => m.entite === 'acteur') ?? [];

  return (
    <Dialog open={ouvert} onOpenChange={onOuvert}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            {action.nom}
          </DialogTitle>
          {action.description && <DialogDescription>{action.description}</DialogDescription>}
        </DialogHeader>

        {action.parametres.length > 0 && (
          <div className="grid gap-4">
            {action.parametres.map((p) => (
              <ChampParametre
                key={p.id}
                fiche={fiche}
                parametre={p}
                valeur={valeurs[p.id] ?? ''}
                onValeur={(v) => setValeurs((x) => ({ ...x, [p.id]: v }))}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
          <Label htmlFor="appliquer-consequences" className="text-[13px] font-normal">
            Appliquer les conséquences à la fiche
          </Label>
          <Switch id="appliquer-consequences" checked={appliquer} onCheckedChange={setAppliquer} />
        </div>

        {erreur && <Message>{erreur}</Message>}

        <Button size="lg" onClick={() => void lancer()} className="w-full" loading={envoi}>
          {!envoi && <Dices />}
          {resultat ? 'Relancer' : 'Lancer'}
        </Button>

        <AnimatePresence mode="wait">
          {resultat && (
            <motion.div
              key={numero}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 rounded-2xl border border-border bg-surface-2/60 p-4"
              aria-live="polite"
            >
              {resultat.jet.type === 'numerique' ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <TotalJet
                      total={resultat.jet.total}
                      critique={
                        resultat.jet.critique ? 'success' : resultat.jet.fumble ? 'failure' : null
                      }
                      cle={String(numero)}
                    />
                    <BadgeReussite action={action} reussi={resultat.reussi} />
                  </div>
                  <DesDuJet
                    groupes={resultat.jet.jets.map((j) => ({
                      faces: j.faces,
                      total: j.total,
                      dice: j.des.map((d) => ({
                        value: d.valeur,
                        kept: d.garde,
                        exploded: d.explosion,
                      })),
                    }))}
                    roulement
                  />
                  {resultat.jet.bonus.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Bonus :{' '}
                      {resultat.jet.bonus
                        .map((b) => `${b.nom} ${b.valeur >= 0 ? '+' : ''}${b.valeur}`)
                        .join(' · ')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <ResultatsSymboles
                      systeme={systeme}
                      presentation={presentation}
                      resultats={resultat.jet.resultats}
                    />
                    <BadgeReussite action={action} reussi={resultat.reussi} />
                  </div>
                  <DesSymboles
                    systeme={systeme}
                    presentation={presentation}
                    des={resultat.jet.des}
                  />
                </>
              )}

              {modifs.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
                  <p className="text-[13px]">
                    {modifs
                      .map((m) =>
                        'attribut' in m
                          ? `${libelleAttribut(fiche, m.attribut)} ${m.operation === 'retirer' ? '−' : m.operation === 'fixer' ? '=' : '+'}${m.valeur}`
                          : `${m.operation === 'donner' ? '+' : '−'} ${systeme.entrees.get(m.entree)?.nom ?? m.entree}`,
                      )
                      .join(' · ')}
                  </p>
                  {applique ? (
                    <Badge ton="succes" taille="md">
                      <Check /> Appliqué à la fiche
                    </Badge>
                  ) : (
                    <span className="text-xs text-subtle">Non appliqué</span>
                  )}
                </div>
              )}

              {resultat.explications.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setDetails((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn('size-3.5 transition-transform', details && 'rotate-180')}
                    />
                    Déroulé du jet
                  </button>
                  {details && (
                    <ol className="mt-2 space-y-1 border-l border-border pl-3 text-xs text-muted-foreground">
                      {resultat.jet.type === 'numerique' && (
                        <li className="break-all font-mono text-[11px] text-subtle">
                          {resultat.jet.formule}
                        </li>
                      )}
                      {resultat.explications.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function BadgeReussite({ action, reussi }: { action: Action; reussi: boolean }) {
  // Sans condition de réussite déclarée, « réussi » n'a pas de sens pour ce jet
  if (!action.jet.reussite) return null;
  return reussi ? (
    <Badge ton="succes" taille="md">
      <Check /> Réussite
    </Badge>
  ) : (
    <Badge ton="danger" taille="md">
      <X /> Échec
    </Badge>
  );
}

function ChampParametre({
  fiche,
  parametre: p,
  valeur,
  onValeur,
}: {
  fiche: Fiche;
  parametre: Parametre;
  valeur: Valeur;
  onValeur: (v: Valeur) => void;
}) {
  const id = `param-${p.id}`;
  if (p.type === 'booleen')
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{p.nom}</Label>
        <Switch id={id} checked={valeur === true} onCheckedChange={onValeur} />
      </div>
    );
  if (p.type === 'nombre')
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{p.nom}</Label>
        <Input
          id={id}
          type="number"
          value={String(valeur)}
          onChange={(e) => onValeur(Number(e.target.value))}
          className="h-9 w-24 text-right font-mono"
        />
      </div>
    );
  if (p.type === 'attribut') {
    const options = optionsAttribut(fiche, p);
    return (
      <div className="space-y-2">
        <Label>{p.nom}</Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={p.nom}>
          {options.map((cle) => {
            const v = fiche.valeurs.get(cle);
            return (
              <button
                key={cle}
                type="button"
                role="radio"
                aria-checked={valeur === cle}
                onClick={() => onValeur(cle)}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors',
                  valeur === cle
                    ? 'border-primary/60 bg-primary/15 text-primary-strong'
                    : 'border-border-strong text-muted-foreground hover:text-foreground',
                )}
              >
                {libelleAttribut(fiche, cle)}
                {v?.modificateur !== undefined && (
                  <span className="font-mono text-[11px] opacity-80">
                    {v.modificateur >= 0 ? '+' : ''}
                    {v.modificateur}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  const options = optionsEntree(fiche, p);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{p.nom}</Label>
      <select
        id={id}
        value={String(valeur)}
        onChange={(e) => onValeur(e.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-surface-2/60 px-3 text-sm"
      >
        {p.facultatif && <option value="">Aucune</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
            {o.rang > 0 ? ` (rang ${o.rang})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
