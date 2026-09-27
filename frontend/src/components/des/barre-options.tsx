'use client';

import { Box, Store, Volume2, VolumeX } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import {
  useDicePreferences,
  useUpdateDicePreferences,
  type DicePreferencesUpdate,
} from '@/lib/dice-preferences';
import type { VisibiliteJet } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { FOCUS, TACTILE } from './tactile';
import { OPTIONS_VISIBILITE } from './visibilite';

// Boutique des skins : chargée à la première ouverture
const SkinStore = dynamic(() => import('@/components/dice/skin-store'), { ssr: false });

const ICONE =
  'flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors disabled:opacity-45 [&_svg]:size-4';

/**
 * Qui voit le jet, en icônes à bascule (groupe radio : flèches pour se
 * déplacer, un seul arrêt de tabulation). Hors campagne, le jet est personnel.
 */
export function VisibiliteIcones({
  valeur,
  onChange,
}: {
  valeur: VisibiliteJet;
  onChange: (v: VisibiliteJet) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function clavier(e: KeyboardEvent, i: number) {
    const pas =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!pas) return;
    e.preventDefault();
    const n = OPTIONS_VISIBILITE.length;
    const suivant = (i + pas + n) % n;
    onChange(OPTIONS_VISIBILITE[suivant]!.valeur);
    refs.current[suivant]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Visibilité du jet"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
    >
      {OPTIONS_VISIBILITE.map((o, i) => {
        const actif = o.valeur === valeur;
        const Icone = o.icone;
        return (
          <Info key={o.valeur} texte={`${o.libelle} : ${o.aide}`}>
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={actif}
              aria-label={`${o.libelle} : ${o.aide}`}
              tabIndex={actif ? 0 : -1}
              onClick={() => onChange(o.valeur)}
              onKeyDown={(e) => clavier(e, i)}
              className={cn(
                ICONE,
                'size-8 rounded-md',
                actif
                  ? o.valeur === 'gm'
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-primary/15 text-primary-strong'
                  : 'hover:bg-surface-3 hover:text-foreground',
                FOCUS,
                TACTILE,
              )}
            >
              <Icone aria-hidden />
            </button>
          </Info>
        );
      })}
    </div>
  );
}

function Bascule({
  actif,
  libelle,
  aide,
  onClick,
  desactive,
  children,
}: {
  actif: boolean;
  libelle: string;
  aide: ReactNode;
  onClick: () => void;
  desactive?: boolean;
  children: ReactNode;
}) {
  return (
    <Info texte={aide}>
      <button
        type="button"
        aria-pressed={actif}
        aria-label={libelle}
        onClick={onClick}
        disabled={desactive}
        className={cn(
          ICONE,
          'border',
          actif
            ? 'border-primary/40 bg-primary/10 text-primary-strong'
            : 'border-border hover:bg-surface-3 hover:text-foreground',
          FOCUS,
          TACTILE,
        )}
      >
        {children}
      </button>
    </Info>
  );
}

/**
 * Réglages des dés en icônes : animation 3D, son, boutique des skins.
 * Animation coupée : pas de dés 3D, le service tire les dés.
 */
export function ReglagesDes() {
  const prefs = useDicePreferences();
  const modifier = useUpdateDicePreferences();
  const [boutique, setBoutique] = useState(false);
  const [boutiqueChargee, setBoutiqueChargee] = useState(false);
  const p = prefs.data;

  async function changer(patch: DicePreferencesUpdate) {
    try {
      await modifier.mutateAsync(patch);
    } catch (err) {
      toast.error('Réglage non enregistré', { description: messageErreur(err) });
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Bascule
        actif={Boolean(p?.animation3d)}
        desactive={!p}
        libelle="Animation 3D des dés"
        aide={
          p?.animation3d
            ? 'Dés 3D : leurs faces lues à l’arrêt font le jet'
            : 'Dés 3D coupés : le serveur tire les dés'
        }
        onClick={() => p && void changer({ animation3d: !p.animation3d })}
      >
        <Box aria-hidden />
      </Bascule>
      <Bascule
        actif={Boolean(p?.sound)}
        desactive={!p}
        libelle="Son des dés"
        aide={p?.sound ? 'Son des dés activé' : 'Son des dés coupé'}
        onClick={() => p && void changer({ sound: !p.sound })}
      >
        {p?.sound === false ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
      </Bascule>
      <Info texte="Boutique : skins de dés">
        <button
          type="button"
          aria-label="Boutique des skins de dés"
          aria-haspopup="dialog"
          onClick={() => {
            setBoutiqueChargee(true);
            setBoutique(true);
          }}
          className={cn(
            ICONE,
            'border border-border hover:bg-surface-3 hover:text-foreground',
            FOCUS,
            TACTILE,
          )}
        >
          <Store aria-hidden />
        </button>
      </Info>
      {boutiqueChargee && <SkinStore open={boutique} onOpenChange={setBoutique} />}
    </div>
  );
}
