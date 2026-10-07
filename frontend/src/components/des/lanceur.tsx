'use client';

import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { forwardRef, useMemo, useState, type FormEvent } from 'react';
import type { Campagne } from '@/lib/campagnes';
import type { Jet, Macro, Verification, VisibiliteJet } from '@/lib/jets';
import type { Personnage } from '@/lib/personnages';
import { useRollableAttributes } from '@/lib/rollable-attributes';
import { cn } from '@/lib/utils';
import { Bascule3D, BoutonBoutique, VisibiliteMenu } from './barre-options';
import { AideLanceur, ChampFormule } from './champ-formule';
import type { useFichePersonnage } from './contexte-jet';
import { GrilleDes } from './grille-des';
import { ajouterDe } from './lanceur-rapide';
import { LigneResultat } from './ligne-resultat';
import { EditionMacroDialogue, type EditionMacro } from './macros';
import { OptionsJet } from './options-jet';
import {
  ajouterTerme,
  avecBonus,
  avecModeD20,
  bonusDe,
  compterDes,
  modeD20,
  retirerDe,
} from './outils-formule';
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
 * Lanceur de dés, sur le modèle de l'ancien : la grille des dés à gauche ; à
 * droite, la formule en grand, le dernier résultat en petit dessous et une seule
 * rangée d'actions (boutique, 3D, visibilité, options, vider, lancer).
 * Avantage, bonus, libellé, modificateurs et macros sont dans le « + ».
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
    /** Table fixée, mais le personnage se choisit (MJ : personnages de la campagne). */
    choixPersonnage?: boolean;
    /** Nom du contexte, sous le titre (campagne ou « Jets personnels »). */
    sousTitre: string;
    onLancer: () => void;
    enCours: boolean;
    onLancerMacro: (m: Macro) => void;
    onChargerMacro: (m: Macro) => void;
    jet: Jet | null;
    anime: boolean;
    onRelancer: () => void;
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
    choixPersonnage = false,
    sousTitre,
    onLancer,
    enCours,
    onLancerMacro,
    onChargerMacro,
    jet,
    anime,
    onRelancer,
  },
  refFormule,
) {
  const { formule } = etat;
  const compte = useMemo(() => compterDes(formule), [formule]);
  const mode = modeD20(formule);
  const personnage = personnages.liste.find((p) => p.id === etat.personnageId) ?? null;
  const { groups, loading } = useRollableAttributes(etat.campagneId, fiche.fiche);
  const t = useTranslations('dice.launcher');
  const [options, setOptions] = useState(false);
  const [edition, setEdition] = useState<EditionMacro | null>(null);
  const ecrire = (f: string) => onModifier({ formule: f });

  function valider(e: FormEvent) {
    e.preventDefault();
    // Le formulaire d'une fenêtre (macro, boutique) remonte ici par l'arbre React : ignoré
    if (e.target !== e.currentTarget) return;
    onLancer();
  }

  return (
    <form
      onSubmit={valider}
      aria-label={t('title')}
      className="relative isolate flex min-h-[14.5rem] overflow-hidden rounded-2xl border border-border bg-card shadow-surface"
    >
      <div className="flex shrink-0 items-center justify-center border-r border-border p-2">
        <GrilleDes
          compte={compte}
          onAjouter={(faces) => ecrire(ajouterDe(formule, faces))}
          onRetirer={(faces) => ecrire(retirerDe(formule, faces))}
        />
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col px-3 pb-2.5 pt-2">
        <div aria-hidden className="absolute inset-0 -z-10 bg-dots opacity-70 mask-radial" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background: halo(jet?.critical),
          }}
        />

        <div className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
          <h2 className="shrink-0 text-xs font-medium text-muted-foreground">{t('title')}</h2>
          <AideLanceur
            onEssayer={(f) => {
              ecrire(f);
              document.getElementById('formule-des')?.focus();
            }}
            avecPersonnage={Boolean(fiche.fiche)}
          />
          <span className="ml-auto min-w-0 truncate text-[11px] text-subtle">{sousTitre}</span>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-1 py-1.5">
          <ChampFormule
            ref={refFormule}
            valeur={formule}
            onChange={ecrire}
            verification={verification}
          />
          <LigneResultat jet={jet} anime={anime} enCours={enCours} onRelancer={onRelancer} />
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          <BoutonBoutique />
          <Bascule3D />
          <VisibiliteMenu
            valeur={etat.visibilite}
            onChange={(v) => onModifier({ visibilite: v })}
            personnel={!etat.campagneId}
          />
          <OptionsJet
            ouvert={options}
            onOuvert={setOptions}
            mode={mode}
            onMode={(m) => ecrire(avecModeD20(formule, m))}
            bonus={bonusDe(formule)}
            onBonus={(b) => ecrire(avecBonus(formule, b))}
            nbD100={compte.get(100) ?? 0}
            onD100={() => ecrire(ajouterDe(formule, 100))}
            libelle={etat.libelle}
            onLibelle={(l) => onModifier({ libelle: l })}
            personnage={personnage}
            groupes={groups}
            chargementAttributs={loading}
            fiche={fiche}
            onAttribut={(a) => ecrire(ajouterTerme(formule, a.key))}
            formuleValide={verification.ok}
            onLancerMacro={onLancerMacro}
            onChargerMacro={onChargerMacro}
            onEditerMacro={setEdition}
            contexte={
              contexteFixe && !choixPersonnage
                ? null
                : {
                    ...(contexteFixe
                      ? {}
                      : {
                          campagnes: {
                            ...campagnes,
                            valeur: etat.campagneId,
                            onChange: (id: string | null) => onModifier({ campagneId: id }),
                          },
                        }),
                    personnages,
                    personnageId: etat.personnageId,
                    onPersonnage: (id) => onModifier({ personnageId: id }),
                  }
            }
          />
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => ecrire('')}
              disabled={!formule.trim()}
              aria-label={t('clearLabel')}
              className={cn(
                'h-8 shrink-0 rounded-lg border border-border bg-background/40 px-2.5 text-[11px] font-bold tracking-wide text-muted-foreground transition-colors hover:text-foreground disabled:opacity-45',
                FOCUS,
                TACTILE,
              )}
            >
              {t('clear')}
            </button>
            <button
              type="submit"
              disabled={!verification.ok || enCours}
              aria-busy={enCours || undefined}
              aria-keyshortcuts="Enter"
              className={cn(
                'group flex h-9 shrink-0 items-center gap-2 rounded-xl bg-primary pl-4 pr-3 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-glow transition-[background-color,transform,opacity] hover:bg-primary-strong active:scale-95 disabled:opacity-50 disabled:shadow-none motion-reduce:active:scale-100',
                FOCUS,
                '[@media(pointer:coarse)]:h-11',
              )}
            >
              {t('roll')}
              <Send
                className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden
              />
            </button>
          </div>
        </div>
      </div>

      <EditionMacroDialogue
        edition={edition}
        formule={formule}
        libelle={etat.libelle}
        onFermer={() => setEdition(null)}
      />
    </form>
  );
});

/** Halo du lanceur : rouge sur un échec critique, doré plus vif sur une réussite critique. */
function halo(critical: string | null | undefined): string {
  if (critical === 'failure')
    return 'radial-gradient(90% 110% at 0% 0%, hsl(var(--destructive) / 0.14), transparent 70%)';
  const force = critical === 'success' ? 0.2 : 0.08;
  return `radial-gradient(90% 110% at 0% 0%, hsl(var(--primary) / ${force}), transparent 70%)`;
}
