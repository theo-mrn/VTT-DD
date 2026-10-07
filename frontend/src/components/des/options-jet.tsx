'use client';

import { useTranslations } from 'next-intl';
import { ChevronsDown, ChevronsUp, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Campagne } from '@/lib/campagnes';
import type { Macro } from '@/lib/jets';
import type { Personnage } from '@/lib/personnages';
import type { RollableAttribute, RollableGroup } from '@/lib/rollable-attributes';
import { cn } from '@/lib/utils';
import { BasculeSon, ICONE_BARRE } from './barre-options';
import { ICONES_CONTEXTE, PastillesAttributs, SelecteurContexte, signe } from './contexte-jet';
import { PucesMacros, type EditionMacro } from './macros';
import type { ModeD20 } from './outils-formule';
import { FOCUS, TACTILE } from './tactile';

function Section({ titre, children }: Readonly<{ titre: string; children: ReactNode }>) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-subtle">{titre}</h3>
      {children}
    </section>
  );
}

const PETIT = cn(
  'flex h-8 items-center justify-center gap-1 rounded-md px-2 text-[13px] font-medium transition-colors [&_svg]:size-3.5',
  FOCUS,
  TACTILE,
);

/**
 * Le « + » du lanceur : tout ce qui accompagne un jet sans encombrer la
 * carte — avantage, bonus, d100, libellé, modificateurs du héros, macros,
 * contexte (page seule) et son.
 */
export function OptionsJet({
  ouvert,
  onOuvert,
  mode,
  onMode,
  bonus,
  onBonus,
  nbD100,
  onD100,
  libelle,
  onLibelle,
  personnage,
  groupes,
  chargementAttributs,
  fiche,
  onAttribut,
  formuleValide,
  onLancerMacro,
  onChargerMacro,
  onEditerMacro,
  contexte,
}: Readonly<{
  ouvert: boolean;
  onOuvert: (o: boolean) => void;
  mode: ModeD20;
  onMode: (m: ModeD20) => void;
  bonus: number;
  onBonus: (b: number) => void;
  nbD100: number;
  onD100: () => void;
  libelle: string;
  onLibelle: (l: string) => void;
  personnage: Personnage | null;
  groupes: RollableGroup[];
  chargementAttributs: boolean;
  fiche: { chargement: boolean; erreur: string | null };
  onAttribut: (a: RollableAttribute) => void;
  formuleValide: boolean;
  onLancerMacro: (m: Macro) => void;
  onChargerMacro: (m: Macro) => void;
  onEditerMacro: (e: EditionMacro) => void;
  /**
   * Sélecteurs de campagne et de personnage (page de dés) ; à la table, le MJ ne choisit que
   * le personnage (sans `campagnes`).
   */
  contexte: {
    campagnes?: {
      liste: Campagne[];
      chargement: boolean;
      valeur: string | null;
      onChange: (id: string | null) => void;
    };
    personnages: { liste: Personnage[]; chargement: boolean };
    personnageId: string | null;
    onPersonnage: (id: string | null) => void;
  } | null;
}>) {
  const t = useTranslations('dice.options');
  const modifie = mode !== 'normal' || bonus !== 0 || libelle.trim() !== '';
  const basculer = (m: ModeD20) => onMode(mode === m ? 'normal' : m);

  return (
    <Popover open={ouvert} onOpenChange={onOuvert}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={modifie ? t('labelModified') : t('label')}
          title={t('title')}
          className={cn(
            ICONE_BARRE,
            'relative',
            ouvert || modifie
              ? 'border-primary/45 bg-primary/10 text-primary-strong'
              : 'border-border text-muted-foreground hover:bg-surface-3 hover:text-foreground',
          )}
        >
          <SlidersHorizontal aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(34rem,calc(100dvh-6rem))] w-[min(22rem,calc(100vw-2rem))] space-y-3 overflow-y-auto p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={t('advantageGroup')}
            className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
          >
            {(
              [
                ['avantage', t('advantage'), ChevronsUp, '2d20k1'],
                ['desavantage', t('disadvantage'), ChevronsDown, '2d20kl1'],
              ] as const
            ).map(([valeur, nom, Icone, formule]) => (
              <button
                key={valeur}
                type="button"
                aria-pressed={mode === valeur}
                title={formule}
                onClick={() => basculer(valeur)}
                className={cn(
                  PETIT,
                  mode === valeur
                    ? 'bg-primary/15 text-primary-strong'
                    : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
                )}
              >
                <Icone aria-hidden />
                {nom}
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label={t('bonus')}
            className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5"
          >
            <button
              type="button"
              aria-label={t('bonusDown')}
              onClick={() => onBonus(bonus - 1)}
              className={cn(PETIT, 'w-8 px-0 text-muted-foreground hover:bg-surface-3')}
            >
              <Minus aria-hidden />
            </button>
            <output
              aria-live="polite"
              aria-label={t('bonusValue', { value: signe(bonus) })}
              className={cn(
                'w-9 text-center font-mono text-[13px] tabular',
                bonus === 0 ? 'text-subtle' : 'font-semibold text-foreground',
              )}
            >
              {signe(bonus)}
            </output>
            <button
              type="button"
              aria-label={t('bonusUp')}
              onClick={() => onBonus(bonus + 1)}
              className={cn(PETIT, 'w-8 px-0 text-muted-foreground hover:bg-surface-3')}
            >
              <Plus aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={onD100}
            aria-label={t('addD100', { count: nbD100 })}
            className={cn(
              PETIT,
              'border font-mono',
              nbD100
                ? 'border-primary/45 bg-primary/10 text-primary-strong'
                : 'border-border text-muted-foreground hover:bg-surface-3 hover:text-foreground',
            )}
          >
            + d100{nbD100 ? ` ×${nbD100}` : ''}
          </button>
        </div>

        <Input
          value={libelle}
          onChange={(e) => onLibelle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onOuvert(false)}
          placeholder={t('rollLabel')}
          aria-label={t('rollLabelAria')}
          maxLength={80}
          autoComplete="off"
          className="h-9 text-[13px] [@media(pointer:coarse)]:h-11"
        />

        {personnage && (
          <Section titre={t('attributesOf', { name: personnage.name })}>
            <PastillesAttributs
              groupes={groupes}
              chargement={fiche.chargement || chargementAttributs}
              erreur={fiche.erreur}
              nomPersonnage={personnage.name}
              onAjouter={onAttribut}
            />
          </Section>
        )}

        <Section titre={t('macros')}>
          <PucesMacros
            formuleValide={formuleValide}
            onLancer={(m) => {
              onOuvert(false);
              onLancerMacro(m);
            }}
            onCharger={onChargerMacro}
            onEditer={(e) => {
              onOuvert(false);
              onEditerMacro(e);
            }}
          />
        </Section>

        {contexte && (
          <Section titre={t('context')}>
            <div className="flex flex-wrap gap-1.5">
              {contexte.campagnes && (
                <SelecteurContexte
                  etiquette={t('campaign')}
                  icone={ICONES_CONTEXTE.campagne}
                  aucun={t('personalRolls')}
                  vide={t('noCampaign')}
                  chargement={contexte.campagnes.chargement}
                  valeur={contexte.campagnes.valeur}
                  onChange={contexte.campagnes.onChange}
                  options={contexte.campagnes.liste.map((c) => ({
                    id: c.id,
                    libelle: c.name,
                    detail: c.pitch || undefined,
                  }))}
                />
              )}
              <SelecteurContexte
                etiquette={t('character')}
                icone={ICONES_CONTEXTE.personnage}
                aucun={t('noCharacter')}
                vide={t('noCharacters')}
                chargement={contexte.personnages.chargement}
                valeur={contexte.personnageId}
                onChange={contexte.onPersonnage}
                options={contexte.personnages.liste.map((p) => ({
                  id: p.id,
                  libelle: p.name,
                  detail: p.summary.tagline || undefined,
                }))}
              />
            </div>
          </Section>
        )}

        <div className="border-t border-border pt-2.5">
          <BasculeSon />
        </div>
      </PopoverContent>
    </Popover>
  );
}
