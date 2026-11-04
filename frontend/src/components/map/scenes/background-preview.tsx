'use client';

/**
 * Aperçu en grand d'un fond de la bibliothèque, par-dessus la grille du sélecteur : la version
 * choisie, ses versions (variantes, grille dessinée), le titre, les facettes, la description et
 * « Utiliser ce fond ». Flèches (et touches ← →) : fond précédent ou suivant des résultats.
 */
import { translate } from '@/i18n/runtime';
import type { Background, BackgroundVariant } from '@vtt/contracts';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Grid3x3, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Vignette d'une variante : la sienne, sinon l'image elle-même. */
export const thumbOf = (v: BackgroundVariant | undefined) =>
  v ? (v.thumbUrl ?? (v.kind === 'image' ? v.url : null)) : null;

/** Facettes lisibles d'un fond : lieu, cadre, moment, ambiances. */
export function tagsOf(b: Background): string[] {
  return [
    b.place && b.place !== 'other' ? translate(`map.scenes.places.${b.place}`) : null,
    b.setting ? translate(`map.scenes.settings.${b.setting}`) : null,
    b.timeOfDay && b.timeOfDay !== 'unknown' ? translate(`map.scenes.times.${b.timeOfDay}`) : null,
    ...b.moods.map((m) => translate(`map.scenes.moods.${m}`)),
  ].filter((t): t is string => !!t);
}

export function BackgroundPreview({
  background: b,
  position,
  total,
  current,
  onPrevious,
  onNext,
  onPick,
  onClose,
}: Readonly<{
  background: Background;
  /** Rang du fond dans les résultats (à partir de 1). */
  position: number;
  total: number;
  current: string | null;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onPick(url: string): void;
  onClose(): void;
}>) {
  const [variant, setVariant] = useState<BackgroundVariant | undefined>(
    () => b.variants.find((v) => v.url === current) ?? b.variants[0],
  );
  const tags = tagsOf(b);

  // ← → : fond précédent ou suivant (hors saisie)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft' && onPrevious) onPrevious();
      if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrevious, onNext]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background/95 backdrop-blur-xl">
      <header className="flex items-center gap-2 px-4 py-3 sm:px-6">
        <Button variant="ghost" size="sm" onClick={onClose} className="-ml-2">
          <ArrowLeft /> {translate('common.actions.back')}
        </Button>
        <span className="ml-auto text-xs tabular-nums text-subtle">
          {position} / {total}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={translate('common.actions.close')}
          className="-mr-1.5"
        >
          <X />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 px-4 pb-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* L'image, entre ses flèches */}
        <div className="relative grid min-h-0 place-items-center">
          <div className="relative aspect-video max-h-full w-full overflow-hidden rounded-2xl bg-surface-2 shadow-elevated ring-1 ring-border">
            {variant?.kind === 'video' ? (
              <video
                key={variant.url}
                src={variant.previewUrl ?? variant.url}
                poster={variant.thumbUrl ?? undefined}
                muted
                loop
                autoPlay
                playsInline
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              variant && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={variant.url}
                  src={variant.url}
                  alt={b.title}
                  className="absolute inset-0 size-full object-cover"
                />
              )
            )}
          </div>
          {onPrevious && (
            <Button
              variant="secondary"
              size="icon"
              onClick={onPrevious}
              aria-label={translate('common.actions.previous')}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full shadow-md"
            >
              <ChevronLeft />
            </Button>
          )}
          {onNext && (
            <Button
              variant="secondary"
              size="icon"
              onClick={onNext}
              aria-label={translate('common.actions.next')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full shadow-md"
            >
              <ChevronRight />
            </Button>
          )}
        </div>

        {/* Le fond : titre, facettes, description, versions, choix */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto [scrollbar-width:thin]">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">{b.title}</h3>
            {(tags.length > 0 || b.collection) && (
              <p className="mt-1 text-xs text-subtle">
                {[...tags, b.collection].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {b.description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{b.description}</p>
          )}
          {b.variants.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {b.variants.map((v) => {
                const label = v.grid
                  ? translate('map.scenes.withGrid')
                  : translate('map.scenes.version');
                const thumb = thumbOf(v);
                return (
                  <Info key={v.id} texte={label}>
                    <button
                      type="button"
                      onClick={() => setVariant(v)}
                      aria-pressed={variant?.id === v.id}
                      aria-label={label}
                      className={cn(
                        'relative aspect-video overflow-hidden rounded-lg bg-surface-2 ring-1 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        variant?.id === v.id
                          ? 'ring-2 ring-primary'
                          : 'ring-border hover:ring-border-strong',
                      )}
                    >
                      {thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />
                      )}
                      {v.grid && (
                        <Grid3x3
                          className="absolute bottom-1 right-1 size-3.5 rounded bg-black/60 p-0.5 text-white"
                          aria-hidden
                        />
                      )}
                    </button>
                  </Info>
                );
              })}
            </div>
          )}
          <Button
            size="lg"
            className="mt-auto w-full"
            disabled={!variant || variant.url === current}
            onClick={() => variant && onPick(variant.url)}
          >
            <Check /> {translate('map.scenes.useBackground')}
          </Button>
        </aside>
      </div>
    </div>
  );
}
