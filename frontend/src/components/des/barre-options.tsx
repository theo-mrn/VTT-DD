'use client';

import { Box, Check, Store, Volume2, VolumeX } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { infoVisibilite, OPTIONS_VISIBILITE } from './visibilite';

// Boutique des skins : chargée à la première ouverture
const SkinStore = dynamic(() => import('@/components/dice/skin-store'), { ssr: false });

/** Petit bouton carré de la barre du lanceur. */
export const ICONE_BARRE = cn(
  'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-45 [&_svg]:size-4',
  FOCUS,
  TACTILE,
);
const REPOS = 'border-border text-muted-foreground hover:bg-surface-3 hover:text-foreground';
const ACTIF = 'border-primary/45 bg-primary/10 text-primary-strong';

function useReglages() {
  const prefs = useDicePreferences();
  const modifier = useUpdateDicePreferences();
  async function changer(patch: DicePreferencesUpdate) {
    try {
      await modifier.mutateAsync(patch);
    } catch (err) {
      toast.error('Réglage non enregistré', { description: messageErreur(err) });
    }
  }
  return { p: prefs.data, changer };
}

/**
 * Visibilité du jet : un seul bouton (son icône dit le choix en cours) et un
 * petit menu. Hors campagne, le jet est personnel : le bouton est figé.
 */
export function VisibiliteMenu({
  valeur,
  onChange,
  personnel,
}: Readonly<{
  valeur: VisibiliteJet;
  onChange: (v: VisibiliteJet) => void;
  /** Jets personnels (hors campagne) : vous seul les voyez. */
  personnel: boolean;
}>) {
  const vis = infoVisibilite(personnel ? 'self' : valeur);
  const Icone = vis.icone;
  if (personnel)
    return (
      <Info texte="Jets personnels : vous seul les voyez">
        <span
          role="img"
          aria-label="Visibilité : jets personnels, vous seul"
          className={cn(ICONE_BARRE, REPOS, 'opacity-60')}
        >
          <Icone aria-hidden />
        </span>
      </Info>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Visibilité : ${vis.libelle}`}
        title={`Visibilité : ${vis.libelle}`}
        className={cn(ICONE_BARRE, teinteVisibilite(valeur))}
      >
        <Icone aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Qui voit le jet</DropdownMenuLabel>
        {OPTIONS_VISIBILITE.map((o) => (
          <DropdownMenuItem
            key={o.valeur}
            onSelect={() => onChange(o.valeur)}
            className="items-start py-1.5"
          >
            <o.icone aria-hidden className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="block text-foreground">{o.libelle}</span>
              <span className="block text-[11px] leading-snug text-subtle">{o.aide}</span>
            </span>
            {o.valeur === valeur && <Check className="mt-0.5 text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Animation 3D : ses faces lues à l'arrêt font le jet ; coupée, le service tire les dés. */
export function Bascule3D() {
  const { p, changer } = useReglages();
  const actif = Boolean(p?.animation3d);
  return (
    <Info texte={actif ? 'Dés 3D : leurs faces font le jet' : 'Dés 3D coupés : le serveur tire'}>
      <button
        type="button"
        aria-pressed={actif}
        aria-label="Animation 3D des dés"
        disabled={!p}
        onClick={() => p && void changer({ animation3d: !p.animation3d })}
        className={cn(ICONE_BARRE, actif ? ACTIF : REPOS)}
      >
        <Box aria-hidden />
      </button>
    </Info>
  );
}

/** Son des dés, en bascule. */
export function BasculeSon() {
  const { p, changer } = useReglages();
  const actif = Boolean(p?.sound);
  return (
    <button
      type="button"
      aria-pressed={actif}
      disabled={!p}
      onClick={() => p && void changer({ sound: !p.sound })}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
        actif ? ACTIF : REPOS,
        FOCUS,
        '[@media(pointer:coarse)]:h-11',
      )}
    >
      {actif ? (
        <Volume2 className="size-3.5" aria-hidden />
      ) : (
        <VolumeX className="size-3.5" aria-hidden />
      )}
      Son des dés
    </button>
  );
}

/** Boutique des skins de dés. */
export function BoutonBoutique() {
  const [ouvert, setOuvert] = useState(false);
  const [chargee, setChargee] = useState(false);
  return (
    <>
      <Info texte="Boutique : skins de dés">
        <button
          type="button"
          aria-label="Boutique des skins de dés"
          aria-haspopup="dialog"
          onClick={() => {
            setChargee(true);
            setOuvert(true);
          }}
          className={cn(ICONE_BARRE, REPOS)}
        >
          <Store aria-hidden />
        </button>
      </Info>
      {chargee && <SkinStore open={ouvert} onOpenChange={setOuvert} />}
    </>
  );
}

function teinteVisibilite(valeur: string): string {
  if (valeur === 'public') return REPOS;
  return valeur === 'gm' ? 'border-destructive/45 bg-destructive/10 text-destructive' : ACTIF;
}
