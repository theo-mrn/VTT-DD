'use client';

import {
  aleatoireCrypto,
  appliquerModifications,
  executerAction,
  type Action,
  type EtatEntite,
  type Fiche,
  type Presentation,
  type ResultatAction,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
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
import { libelleAttribut } from '@/lib/creation';
import { useLancer, type Critique } from '@/lib/jets';
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

function optionsEntree(fiche: Fiche, p: Extract<Parametre, { type: 'entree' }>) {
  const convient = (e: { sorte: string; etiquettes: string[] }) =>
    e.sorte === p.sorte && (!p.etiquette || e.etiquettes.includes(p.etiquette));
  if (!p.possedee)
    return [...fiche.systeme.entrees.values()]
      .filter(convient)
      .map((e) => ({ id: e.id, nom: e.nom, rang: fiche.possessions.get(e.id)?.rang ?? 0 }));
  return [...fiche.possessions.values()]
    .filter((x) => convient(x.entree))
    .map((x) => ({ id: x.entree.id, nom: x.entree.nom, rang: x.rang }));
}

/**
 * Exécute une action du système (test, initiative…) depuis la fiche :
 * paramètres, jet calculé par le moteur, explications, et conséquences sur
 * le personnage à appliquer d'un clic.
 */
export function LanceurAction({
  systeme,
  presentation,
  fiche,
  action,
  personnage,
  ouvert,
  onOuvert,
  onEtat,
}: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  action: Action;
  personnage: { id: string; name: string; roomId: string | null };
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
  /** Applique un nouvel état au personnage (conséquences acceptées). */
  onEtat: (etat: EtatEntite) => void;
}) {
  const [valeurs, setValeurs] = useState<Record<string, Valeur>>(() =>
    Object.fromEntries(action.parametres.map((p) => [p.id, defaut(fiche, p)])),
  );
  const [resultat, setResultat] = useState<ResultatAction | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [applique, setApplique] = useState(false);
  const [numero, setNumero] = useState(0);
  const historique = useLancer();

  function lancer() {
    const parametres = Object.fromEntries(
      Object.entries(valeurs).filter(([, v]) => v !== ''),
    ) as Record<string, Valeur>;
    const r = executerAction(systeme, {
      action: action.id,
      acteur: fiche,
      parametres,
      aleatoire: aleatoireCrypto(),
    });
    if (!r.ok) {
      setErreur(r.erreurs.map((e) => e.message).join(' · '));
      setResultat(null);
      return;
    }
    setErreur(null);
    setResultat(r.resultat);
    setApplique(false);
    setNumero((n) => n + 1);
    // Les jets numériques rejoignent l'historique des dés
    const jet = r.resultat.jet;
    if (jet.type === 'numerique') {
      const critical: Critique = jet.critique ? 'success' : jet.fumble ? 'failure' : null;
      historique.mutate({
        formula: jet.formule,
        label: action.nom,
        roomId: personnage.roomId,
        characterId: personnage.id,
        characterName: personnage.name,
        resultat: {
          formula: jet.formule,
          total: jet.total,
          critical,
          groups: jet.jets.map((j) => ({
            faces: j.faces,
            total: j.total,
            dice: j.des.map((d) => ({ value: d.valeur, kept: d.garde, exploded: d.explosion })),
          })),
        },
      });
    }
  }

  const modifs = resultat?.modifications.filter((m) => m.entite === 'acteur') ?? [];

  function appliquer() {
    if (!resultat) return;
    onEtat(appliquerModifications(fiche, modifs, 'acteur'));
    setApplique(true);
    toast.success('Fiche mise à jour');
  }

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

        {erreur && <Message>{erreur}</Message>}

        <Button size="lg" onClick={lancer} className="w-full">
          <Dices />
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
                  <Button
                    size="sm"
                    variant={applique ? 'ghost' : 'secondary'}
                    onClick={appliquer}
                    disabled={applique}
                  >
                    {applique ? <Check /> : null}
                    {applique ? 'Appliqué' : 'Appliquer à la fiche'}
                  </Button>
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
