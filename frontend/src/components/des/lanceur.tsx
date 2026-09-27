'use client';

import { ChevronsDown, ChevronsUp, Dices, Minus, Plus, UserRound } from 'lucide-react';
import { forwardRef, useMemo, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Info } from '@/components/ui/tooltip';
import type { Campagne } from '@/lib/campagnes';
import { normaliserFormule, type Macro, type Verification, type VisibiliteJet } from '@/lib/jets';
import type { Personnage } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import { ReglagesDes, VisibiliteIcones } from './barre-options';
import { ChampFormule, EtatFormule } from './champ-formule';
import {
  attributsJetables,
  ICONES_CONTEXTE,
  PastillesAttributs,
  SelecteurContexte,
  signe,
  type useFichePersonnage,
} from './contexte-jet';
import { ajouterDe } from './lanceur-rapide';
import { PucesMacros } from './macros';
import {
  ajouterTerme,
  avecBonus,
  avecModeD20,
  bonusDe,
  compterDes,
  modeD20,
  retirerDe,
  type ModeD20,
} from './outils-formule';
import { RangeeDes } from './rangee-des';
import { FOCUS, TACTILE } from './tactile';

export interface EtatPlateau {
  formule: string;
  libelle: string;
  visibilite: VisibiliteJet;
  campagneId: string | null;
  personnageId: string | null;
  /** Format du brouillon enregistré : 2 = visibilités du service dice. */
  version?: number;
}

/**
 * Lanceur compact : formule et gros bouton Lancer, rangée de dés, avantage et
 * bonus, libellé, modificateurs du personnage et macros en puces, puis la
 * visibilité et les réglages des dés en icônes. Dés, avantage, bonus et
 * modificateurs réécrivent la formule, qui reste modifiable à la main.
 */
export const Lanceur = forwardRef<
  HTMLInputElement,
  {
    etat: EtatPlateau;
    onModifier: (maj: Partial<EtatPlateau>) => void;
    verification: Verification;
    fiche: ReturnType<typeof useFichePersonnage>;
    campagnes: { liste: Campagne[]; chargement: boolean };
    personnages: { liste: Personnage[]; chargement: boolean };
    /** Campagne et personnage imposés (table d'une campagne) : pas de sélecteurs. */
    contexteFixe?: boolean;
    onLancer: () => void;
    enCours: boolean;
    onLancerMacro: (m: Macro) => void;
    onChargerMacro: (m: Macro) => void;
  }
>(function Lanceur(
  {
    etat,
    onModifier,
    verification,
    fiche,
    campagnes,
    personnages,
    contexteFixe = false,
    onLancer,
    enCours,
    onLancerMacro,
    onChargerMacro,
  },
  refFormule,
) {
  const { formule } = etat;
  const compte = useMemo(() => compterDes(formule), [formule]);
  const bonus = bonusDe(formule);
  const mode = modeD20(formule);
  const personnage = personnages.liste.find((p) => p.id === etat.personnageId) ?? null;
  const attributs = useMemo(
    () => (fiche.fiche ? attributsJetables(fiche.fiche) : []),
    [fiche.fiche],
  );
  const ecrire = (f: string) => onModifier({ formule: f });
  const basculerMode = (m: ModeD20) => ecrire(avecModeD20(formule, mode === m ? 'normal' : m));

  function valider(e: FormEvent) {
    e.preventDefault();
    // Le formulaire d'une fenêtre (macro, boutique) remonte ici par l'arbre React : ignoré
    if (e.target !== e.currentTarget) return;
    onLancer();
  }

  return (
    <form onSubmit={valider} aria-label="Composer un jet">
      <div className="space-y-2.5 p-3 [@container(min-width:26rem)]:p-4">
        {/* Formule et Lancer */}
        <div className="space-y-1">
          <div className="flex items-stretch gap-2">
            <ChampFormule
              ref={refFormule}
              valeur={formule}
              onChange={ecrire}
              verification={verification}
              avecPersonnage={Boolean(fiche.fiche)}
            />
            <Button
              type="submit"
              size="xl"
              loading={enCours}
              disabled={!verification.ok}
              aria-keyshortcuts="Enter"
              className="px-4 shadow-glow [&:disabled]:shadow-none [@container(min-width:26rem)]:px-6"
            >
              {!enCours && <Dices className="!size-[18px]" aria-hidden />}
              Lancer
              <Kbd
                aria-hidden
                className="ml-0.5 hidden border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/70 shadow-none [@container(min-width:30rem)]:inline-flex"
              >
                ↵
              </Kbd>
            </Button>
          </div>
          <EtatFormule
            valeur={formule}
            verification={verification}
            normalisee={normaliserFormule(formule)}
          />
        </div>

        <RangeeDes
          compte={compte}
          onAjouter={(faces) => ecrire(ajouterDe(formule, faces))}
          onRetirer={(faces) => ecrire(retirerDe(formule, faces))}
          onVider={() => ecrire('')}
          vide={!formule.trim()}
        />

        {/* Avantage, bonus, libellé */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Avantage ou désavantage sur le d20"
            className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
          >
            <BoutonMode
              actif={mode === 'avantage'}
              onClick={() => basculerMode('avantage')}
              aide="Avantage : deux d20, on garde le meilleur (2d20k1)"
              icone={<ChevronsUp aria-hidden />}
              libelle="Avantage"
              court="Av."
            />
            <BoutonMode
              actif={mode === 'desavantage'}
              onClick={() => basculerMode('desavantage')}
              aide="Désavantage : deux d20, on garde le pire (2d20kl1)"
              icone={<ChevronsDown aria-hidden />}
              libelle="Désavantage"
              court="Désav."
            />
          </div>
          <PasAPas valeur={bonus} onChange={(b) => ecrire(avecBonus(formule, b))} />
          <Input
            value={etat.libelle}
            onChange={(e) => onModifier({ libelle: e.target.value })}
            placeholder="Libellé (facultatif)"
            aria-label="Libellé du jet"
            maxLength={80}
            autoComplete="off"
            className="h-9 min-w-[9rem] flex-1 text-[13px] [@media(pointer:coarse)]:h-11"
          />
        </div>

        {/* Modificateurs du personnage */}
        {personnage && (
          <div className="flex min-w-0 items-center gap-2">
            <Info texte={`Modificateurs de ${personnage.name}`}>
              <span className="flex shrink-0 items-center text-subtle">
                <UserRound className="size-3.5" aria-hidden />
                <span className="sr-only">Modificateurs de {personnage.name}</span>
              </span>
            </Info>
            <div className="min-w-0 flex-1">
              <PastillesAttributs
                attributs={attributs}
                chargement={fiche.chargement}
                erreur={fiche.erreur}
                nomPersonnage={personnage.name}
                onAjouter={(cle) => ecrire(ajouterTerme(formule, `mod(@${cle})`))}
              />
            </div>
          </div>
        )}

        {/* Macros */}
        <PucesMacros
          formule={formule}
          libelle={etat.libelle}
          formuleValide={verification.ok}
          onLancer={onLancerMacro}
          onCharger={onChargerMacro}
        />
      </div>

      {/* Contexte, visibilité, réglages des dés */}
      <div className="flex flex-wrap items-center gap-2 rounded-b-2xl border-t border-border bg-surface/50 px-3 py-2 [@container(min-width:26rem)]:px-4">
        {!contexteFixe && (
          <>
            <SelecteurContexte
              etiquette="Campagne"
              icone={ICONES_CONTEXTE.campagne}
              aucun="Jets personnels"
              vide="Aucune campagne pour l’instant."
              chargement={campagnes.chargement}
              valeur={etat.campagneId}
              onChange={(id) => onModifier({ campagneId: id })}
              options={campagnes.liste.map((c) => ({
                id: c.id,
                libelle: c.name,
                detail: c.pitch || undefined,
              }))}
            />
            <SelecteurContexte
              etiquette="Personnage"
              icone={ICONES_CONTEXTE.personnage}
              aucun="Sans personnage"
              vide="Aucun personnage pour l’instant."
              chargement={personnages.chargement}
              valeur={etat.personnageId}
              onChange={(id) => onModifier({ personnageId: id })}
              options={personnages.liste.map((p) => ({
                id: p.id,
                libelle: p.name,
                detail: p.summary.tagline || undefined,
              }))}
            />
          </>
        )}
        {etat.campagneId ? (
          <VisibiliteIcones
            valeur={etat.visibilite}
            onChange={(v) => onModifier({ visibilite: v })}
          />
        ) : (
          <span className="text-[11px] text-subtle">Vous seul voyez ces jets</span>
        )}
        <div className="ml-auto">
          <ReglagesDes />
        </div>
      </div>
    </form>
  );
});

function BoutonMode({
  actif,
  onClick,
  aide,
  icone,
  libelle,
  court,
}: {
  actif: boolean;
  onClick: () => void;
  aide: string;
  icone: ReactNode;
  libelle: string;
  court: string;
}) {
  return (
    <Info texte={aide}>
      <button
        type="button"
        aria-pressed={actif}
        aria-label={libelle}
        onClick={onClick}
        className={cn(
          'flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors [&_svg]:size-3.5',
          actif
            ? 'bg-primary/15 text-primary-strong'
            : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
          FOCUS,
          TACTILE,
        )}
      >
        {icone}
        <span aria-hidden className="[@container(min-width:24rem)]:hidden">
          {court}
        </span>
        <span aria-hidden className="hidden [@container(min-width:24rem)]:inline">
          {libelle}
        </span>
      </button>
    </Info>
  );
}

/** Bonus fixe en fin de formule, par pas de 1. */
function PasAPas({ valeur, onChange }: { valeur: number; onChange: (v: number) => void }) {
  const bouton = cn(
    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground',
    FOCUS,
    TACTILE,
  );
  return (
    <div
      role="group"
      aria-label="Bonus"
      className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5"
    >
      <button
        type="button"
        className={bouton}
        onClick={() => onChange(valeur - 1)}
        aria-label="Diminuer le bonus"
      >
        <Minus className="size-3.5" aria-hidden />
      </button>
      <output
        aria-live="polite"
        aria-label={`Bonus ${signe(valeur)}`}
        className={cn(
          'w-9 text-center font-mono text-[13px] tabular',
          valeur === 0 ? 'text-subtle' : 'font-semibold text-foreground',
        )}
      >
        {signe(valeur)}
      </output>
      <button
        type="button"
        className={bouton}
        onClick={() => onChange(valeur + 1)}
        aria-label="Augmenter le bonus"
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
