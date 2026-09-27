'use client';

/**
 * Réglages des dés de la table (préférences du service dice) : skin équipé
 * et accès à la boutique, animation 3D, son. Animation coupée : pas de dés
 * 3D, le service tire les dés et le résultat s'affiche aussitôt.
 */
import { Box, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { messageErreur } from '@/lib/api';
import {
  useDicePreferences,
  useUpdateDicePreferences,
  type DicePreferencesUpdate,
} from '@/lib/dice-preferences';
import { SkinThumbnail } from './skin-thumbnail';

// Boutique et catalogue des skins : chargés à la première ouverture
const SkinStore = dynamic(() => import('./skin-store'), { ssr: false });

/** Nom d'un skin, lu dans le catalogue chargé à la demande. */
function useSkinName(skinId: string | undefined, actif: boolean): string | null {
  const [nom, setNom] = useState<{ id: string; nom: string } | null>(null);
  useEffect(() => {
    if (!skinId || !actif) return;
    let annule = false;
    void import('./three/dice-definitions').then((m) => {
      if (!annule) setNom({ id: skinId, nom: m.getSkinById(skinId).name });
    });
    return () => {
      annule = true;
    };
  }, [skinId, actif]);
  return nom && nom.id === skinId ? nom.nom : null;
}

export function DiceSettings() {
  const prefs = useDicePreferences();
  const modifier = useUpdateDicePreferences();
  const [ouvert, setOuvert] = useState(false);
  const [boutique, setBoutique] = useState(false);
  const [boutiqueChargee, setBoutiqueChargee] = useState(false);
  const p = prefs.data;
  const nom = useSkinName(p?.skinId, ouvert);

  async function changer(patch: DicePreferencesUpdate) {
    try {
      await modifier.mutateAsync(patch);
    } catch (err) {
      toast.error('Réglage non enregistré', { description: messageErreur(err) });
    }
  }

  function ouvrirBoutique() {
    setOuvert(false);
    setBoutiqueChargee(true);
    setBoutique(true);
  }

  return (
    <>
      <Popover open={ouvert} onOpenChange={setOuvert}>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" aria-label="Réglages des dés">
            {p ? <SkinThumbnail skinId={p.skinId} className="-ml-1 size-5" /> : <Box aria-hidden />}
            Dés
            {p && !p.animation3d && <span className="text-[11px] text-subtle">2D</span>}
            {p && !p.sound && <VolumeX className="text-subtle" aria-label="Son coupé" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-4">
          <p className="text-sm font-medium">Vos dés</p>
          {prefs.isPending ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : !p ? (
            <p className="text-xs text-destructive">
              Préférences indisponibles : {messageErreur(prefs.error)}
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={ouvrirBoutique}
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2/60 p-2.5 text-left transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-3/70">
                  <SkinThumbnail skinId={p.skinId} alt="" className="size-11" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {nom ?? 'Skin équipé'}
                  </span>
                  <span className="block text-[11px] text-subtle">
                    Boutique : changer d’apparence
                  </span>
                </span>
                <ChevronRight
                  className="size-4 text-subtle transition-colors group-hover:text-foreground"
                  aria-hidden
                />
              </button>

              <div className="flex items-start justify-between gap-4">
                <Label htmlFor="des-3d" className="space-y-0.5">
                  <span className="flex items-center gap-1.5 text-[13px]">
                    <Box className="size-3.5 text-subtle" aria-hidden />
                    Animation 3D
                  </span>
                  <span className="block text-[11px] font-normal text-subtle">
                    Les faces lues à l’arrêt font le jet. Coupée : dés tirés par le serveur.
                  </span>
                </Label>
                <Switch
                  id="des-3d"
                  checked={p.animation3d}
                  onCheckedChange={(v) => void changer({ animation3d: v })}
                />
              </div>

              <div className="flex items-start justify-between gap-4">
                <Label htmlFor="des-son" className="space-y-0.5">
                  <span className="flex items-center gap-1.5 text-[13px]">
                    <Volume2 className="size-3.5 text-subtle" aria-hidden />
                    Son des dés
                  </span>
                  <span className="block text-[11px] font-normal text-subtle">
                    Impacts graves à chaque rebond.
                  </span>
                </Label>
                <Switch
                  id="des-son"
                  checked={p.sound}
                  onCheckedChange={(v) => void changer({ sound: v })}
                />
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
      {boutiqueChargee && <SkinStore open={boutique} onOpenChange={setBoutique} />}
    </>
  );
}
