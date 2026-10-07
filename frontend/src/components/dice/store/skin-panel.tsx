'use client';

/**
 * Fiche du dé sélectionné : vignette tout de suite, puis le d20 en 3D une fois
 * la sélection stable (on peut parcourir la vitrine au clavier ou en cliquant
 * vite sans créer un contexte WebGL par dé). Un canevas par skin (`key`), jamais
 * de changement de skin sur un contexte actif. Actions : équiper, acheter
 * (Stripe Checkout), premium, essayer un lancer (lanceur 3D de l'app).
 */
import { useSkinText } from '../skin-text';
import { useTranslations } from 'next-intl';
import { Check, Crown, Dices, ShoppingCart } from 'lucide-react';
import { PAGES_FRONT } from '@vtt/contracts';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { previewDice3D } from '@/lib/dice-throw';
import { cn } from '@/lib/utils';
import { SkinThumbnail } from '../skin-thumbnail';
import type { DiceSkin } from '../three/dice-definitions';
import { prix, RARETES, rareteDe } from './catalogue';

// Pas d'écran de chargement : la vignette reste visible jusqu'au premier rendu 3D
const DicePreview = dynamic(() => import('../three/preview'), { ssr: false, loading: () => null });

/** Délai avant de monter la 3D d'une nouvelle sélection. */
const DELAI_3D_MS = 350;

/** `valeur` une fois restée identique pendant `delai` ms. */
function useStable<T>(valeur: T, delai: number): T | null {
  const [stable, setStable] = useState<T | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setStable(valeur), delai);
    return () => clearTimeout(t);
  }, [valeur, delai]);
  return stable;
}

export function SkinPanel({
  skin,
  possede,
  equipe,
  premium,
  equipement,
  achat,
  onEquiper,
  onAcheter,
  className,
}: Readonly<{
  skin: DiceSkin;
  possede: boolean;
  equipe: boolean;
  /** Accès à tout le catalogue : pas d'offre premium. */
  premium: boolean;
  equipement: boolean;
  achat: boolean;
  onEquiper: () => void;
  onAcheter: () => void;
  className?: string;
}>) {
  const t = useTranslations('dice.store');
  const textes = useSkinText();
  const rarete = rareteDe(skin);
  const r = RARETES[rarete];
  const description = textes.description(skin.id);
  const stable = useStable(skin.id, DELAI_3D_MS);
  // Skin dont le dé 3D est dessiné : la vignette s'efface (fond du canevas transparent)
  const [pret, setPret] = useState<string | null>(null);
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_50%_45%,hsl(var(--surface-3)),hsl(var(--surface))_75%)]">
        <SkinThumbnail
          key={skin.id}
          skinId={skin.id}
          alt=""
          className={cn(
            'absolute inset-0 size-full p-10 transition-opacity duration-300',
            pret === skin.id && 'opacity-0',
          )}
        />
        {stable === skin.id && (
          <div
            className={cn(
              'absolute inset-0 transition-opacity duration-300',
              pret === skin.id ? 'opacity-100' : 'opacity-0',
            )}
          >
            <DicePreview
              key={skin.id}
              skinId={skin.id}
              type="d20"
              className="size-full"
              onReady={() => setPret(skin.id)}
            />
          </div>
        )}
        <span className={cn('absolute inset-x-0 bottom-0 h-1', r.teinte)} aria-hidden />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge ton={r.ton}>{t(`rarities.${rarete}`)}</Badge>
            {equipe && (
              <Badge ton="primaire">
                <Check aria-hidden />
                {t('equippedBadge')}
              </Badge>
            )}
          </div>
          <h3 className="text-xl font-semibold tracking-tight">{textes.name(skin.id)}</h3>
          {description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {possede ? (
            <Button
              size="lg"
              variant={equipe ? 'secondary' : 'default'}
              disabled={equipe || equipement}
              onClick={onEquiper}
            >
              {equipe ? (
                <>
                  <Check aria-hidden />
                  {t('equippedBadge')}
                </>
              ) : (
                t('equip')
              )}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="lg" className="flex-1" loading={achat} onClick={onAcheter}>
                {!achat && <ShoppingCart aria-hidden />}
                {prix(skin)}
              </Button>
              {!premium && (
                <Button size="lg" variant="secondary" asChild>
                  <Link href={PAGES_FRONT.abonnement} title={t('premiumHint')}>
                    <Crown aria-hidden />
                    {t('premium')}
                  </Link>
                </Button>
              )}
            </div>
          )}
          <Button
            size="lg"
            variant="ghost"
            onClick={() => previewDice3D([{ type: 'd20', count: 1 }], skin.id)}
          >
            <Dices aria-hidden />
            {t('tryRoll')}
          </Button>
        </div>
      </div>
    </div>
  );
}
