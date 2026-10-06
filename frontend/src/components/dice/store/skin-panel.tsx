'use client';

/**
 * Fiche du dé sélectionné : vignette tout de suite, puis le d20 en 3D une fois
 * la sélection stable (on peut parcourir la vitrine au clavier ou en cliquant
 * vite sans créer un contexte WebGL par dé). Un canevas par skin (`key`), jamais
 * de changement de skin sur un contexte actif. Actions : équiper, acheter
 * (Stripe Checkout), premium, essayer un lancer (lanceur 3D de l'app).
 */
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
  const r = RARETES[rareteDe(skin)];
  const stable = useStable(skin.id, DELAI_3D_MS);
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_50%_45%,hsl(var(--surface-3)),hsl(var(--surface))_75%)]">
        <SkinThumbnail
          key={skin.id}
          skinId={skin.id}
          alt=""
          className="absolute inset-0 size-full p-10"
        />
        {stable === skin.id && (
          <div className="absolute inset-0 animate-in fade-in duration-500">
            <DicePreview key={skin.id} skinId={skin.id} type="d20" className="size-full" />
          </div>
        )}
        <span className={cn('absolute inset-x-0 bottom-0 h-1', r.teinte)} aria-hidden />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge ton={r.ton}>{r.libelle}</Badge>
            {equipe && (
              <Badge ton="primaire">
                <Check aria-hidden />
                Équipé
              </Badge>
            )}
          </div>
          <h3 className="text-xl font-semibold tracking-tight">{skin.name}</h3>
          {skin.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{skin.description}</p>
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
                  Équipé
                </>
              ) : (
                'Équiper'
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
                  <Link href={PAGES_FRONT.abonnement} title="Tous les dés avec Premium">
                    <Crown aria-hidden />
                    Premium
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
            Essayer un lancer
          </Button>
        </div>
      </div>
    </div>
  );
}
