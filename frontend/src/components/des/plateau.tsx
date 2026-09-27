'use client';

import { ChevronsDown, ChevronsUp, Dices, Equal, Minus, Plus } from 'lucide-react';
import { forwardRef, useMemo, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import type { Campagne } from '@/lib/campagnes';
import { normaliserFormule, type Verification, type VisibiliteJet } from '@/lib/jets';
import type { Personnage } from '@/lib/personnages';
import { ChampFormule } from './champ-formule';
import {
  attributsJetables,
  ICONES_CONTEXTE,
  PastillesAttributs,
  SelecteurContexte,
  signe,
  type useFichePersonnage,
} from './contexte-jet';
import { ajouterDe } from './lanceur-rapide';
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
import { Segmente, type OptionSegment } from './segmente';
import { TuilesDes } from './tuiles-des';
import { OPTIONS_VISIBILITE } from './visibilite';

export interface EtatPlateau {
  formule: string;
  libelle: string;
  visibilite: VisibiliteJet;
  campagneId: string | null;
  personnageId: string | null;
  /** Format du brouillon enregistré : 2 = visibilités du service dice. */
  version?: number;
}

const OPTIONS_D20: OptionSegment<ModeD20>[] = [
  {
    valeur: 'normal',
    libelle: 'Normal',
    icone: Equal,
    aide: 'Un seul d20 (1d20)',
  },
  {
    valeur: 'avantage',
    libelle: 'Avantage',
    icone: ChevronsUp,
    aide: 'Deux d20, on garde le meilleur (2d20k1)',
  },
  {
    valeur: 'desavantage',
    libelle: 'Désavantage',
    icone: ChevronsDown,
    aide: 'Deux d20, on garde le pire (2d20kl1)',
  },
];

/**
 * Plateau : tout ce qui compose un jet. Dés rapides, avantage et bonus
 * réécrivent la formule, qui reste modifiable à la main ; les options
 * (libellé, visibilité, campagne, personnage) accompagnent le jet.
 */
export const Plateau = forwardRef<
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
  }
>(function Plateau(
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

  function valider(e: FormEvent) {
    e.preventDefault();
    onLancer();
  }

  return (
    <section
      aria-labelledby="titre-plateau"
      className="rounded-2xl border border-border bg-card shadow-surface"
    >
      <form onSubmit={valider}>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="titre-plateau" className="text-[15px] font-semibold tracking-tight">
              Plateau
            </h2>
            <p className="hidden text-xs text-subtle sm:block">
              Un clic ajoute un dé · le « − » en retire un
            </p>
          </div>

          <TuilesDes
            compte={compte}
            onAjouter={(faces) => ecrire(ajouterDe(formule, faces))}
            onRetirer={(faces) => ecrire(retirerDe(formule, faces))}
            onVider={() => ecrire('')}
            vide={!formule.trim()}
          />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <Segmente
              etiquette="Mode du d20"
              options={OPTIONS_D20}
              valeur={mode}
              onChange={(m) => ecrire(avecModeD20(formule, m))}
              className="w-full sm:w-auto"
            />
            <PasAPas valeur={bonus} onChange={(b) => ecrire(avecBonus(formule, b))} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <ChampFormule
              ref={refFormule}
              valeur={formule}
              onChange={ecrire}
              verification={verification}
              normalisee={normaliserFormule(formule)}
              avecPersonnage={Boolean(fiche.fiche)}
            />
            <Button
              type="submit"
              size="xl"
              loading={enCours}
              disabled={!verification.ok}
              className="w-full shadow-glow sm:w-auto sm:min-w-[148px] [&:disabled]:shadow-none"
            >
              {!enCours && <Dices className="!size-[18px]" aria-hidden />}
              Lancer
              <Kbd
                aria-hidden
                className="ml-0.5 hidden border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground/70 shadow-none sm:inline-flex"
              >
                ↵
              </Kbd>
            </Button>
          </div>
        </div>

        <div className="space-y-4 rounded-b-2xl border-t border-border bg-surface/50 p-4 sm:p-5">
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="libelle-jet" className="block text-xs text-muted-foreground">
                Libellé
              </Label>
              <Input
                id="libelle-jet"
                value={etat.libelle}
                onChange={(e) => onModifier({ libelle: e.target.value })}
                placeholder="Attaque à l’épée…"
                maxLength={80}
                autoComplete="off"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="flex items-baseline justify-between gap-2 text-xs font-medium leading-none text-muted-foreground">
                Visibilité
                {!etat.campagneId && (
                  <span className="truncate font-normal text-subtle">
                    jets personnels : vous seul
                  </span>
                )}
              </p>
              <Segmente
                etiquette="Visibilité du jet"
                options={OPTIONS_VISIBILITE}
                valeur={etat.campagneId ? etat.visibilite : 'self'}
                onChange={(v) => onModifier({ visibilite: v })}
                desactive={!etat.campagneId}
                className="h-10 w-full"
              />
            </div>
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
          </div>

          {personnage && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Modificateurs de <span className="text-foreground">{personnage.name}</span>
              </p>
              <PastillesAttributs
                attributs={attributs}
                chargement={fiche.chargement}
                erreur={fiche.erreur}
                nomPersonnage={personnage.name}
                onAjouter={(cle) => ecrire(ajouterTerme(formule, `mod(@${cle})`))}
              />
            </div>
          )}
        </div>
      </form>
    </section>
  );
});

/** Bonus fixe en fin de formule, par pas de 1. */
function PasAPas({ valeur, onChange }: { valeur: number; onChange: (v: number) => void }) {
  const bouton =
    'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95';
  return (
    <div className="flex items-center gap-2.5">
      <span id="etiquette-bonus" className="text-xs font-medium text-muted-foreground">
        Bonus
      </span>
      <div
        role="group"
        aria-labelledby="etiquette-bonus"
        className="inline-flex h-9 items-center rounded-lg border border-border bg-surface p-0.5"
      >
        <button
          type="button"
          className={bouton}
          onClick={() => onChange(valeur - 1)}
          aria-label="Diminuer le bonus"
        >
          <Minus className="size-3.5" />
        </button>
        <output
          aria-live="polite"
          className={
            valeur === 0
              ? 'w-11 text-center font-mono text-sm text-subtle tabular'
              : 'w-11 text-center font-mono text-sm font-semibold text-foreground tabular'
          }
        >
          {signe(valeur)}
        </output>
        <button
          type="button"
          className={bouton}
          onClick={() => onChange(valeur + 1)}
          aria-label="Augmenter le bonus"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
