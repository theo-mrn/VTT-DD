'use client';

/**
 * Réglages des dés de la table (préférences du service dice) : skin équipé
 * et accès à la boutique, animation 3D, son. Animation coupée : pas de dés
 * 3D, le service tire les dés et le résultat s'affiche aussitôt.
 */
import { useSkinText } from './skin-text';
import { translate } from '@/i18n/runtime';
import { useTranslations } from 'next-intl';
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
export function DiceSettings() {
  const prefs = useDicePreferences();
  const modifier = useUpdateDicePreferences();
  const [ouvert, setOuvert] = useState(false);
  const [boutique, setBoutique] = useState(false);
  const [boutiqueChargee, setBoutiqueChargee] = useState(false);
  const p = prefs.data;
  const t = useTranslations('dice.settings');
  const textes = useSkinText();
  const nom = p ? textes.name(p.skinId) : null;

  async function changer(patch: DicePreferencesUpdate) {
    try {
      await modifier.mutateAsync(patch);
    } catch (err) {
      toast.error(translate('dice.bar.notSaved'), { description: messageErreur(err) });
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
          <Button variant="secondary" size="sm" aria-label={t('label')}>
            {p ? (
              <SkinThumbnail skinId={p.skinId} small className="-ml-1 size-5" />
            ) : (
              <Box aria-hidden />
            )}
            {t('dice')}
            {p && !p.animation3d && <span className="text-[11px] text-subtle">2D</span>}
            {p && !p.sound && <VolumeX className="text-subtle" aria-label={t('muted')} />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-4">
          <p className="text-sm font-medium">{t('yourDice')}</p>
          {prefs.isPending && <Skeleton className="h-16 rounded-xl" />}
          {!prefs.isPending && !p && (
            <p className="text-xs text-destructive">
              {t('prefsUnavailable', { error: messageErreur(prefs.error) })}
            </p>
          )}
          {!prefs.isPending && p && (
            <>
              <button
                type="button"
                onClick={ouvrirBoutique}
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2/60 p-2.5 text-left transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-3/70">
                  <SkinThumbnail skinId={p.skinId} alt="" small className="size-11" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {nom ?? t('equippedSkin')}
                  </span>
                  <span className="block text-[11px] text-subtle">{t('storeLink')}</span>
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
                    {t('animation')}
                  </span>
                  <span className="block text-[11px] font-normal text-subtle">
                    {t('animationText')}
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
                    {t('sound')}
                  </span>
                  <span className="block text-[11px] font-normal text-subtle">
                    {t('soundText')}
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
