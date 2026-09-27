'use client';

import type { Fiche, Presentation } from '@vtt/rules';
import { Check, ImageOff, Link2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { InputGroup } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { portraitsParDossier, useAssets } from '@/lib/assets';
import { motsClesPortrait } from '@/lib/creation';
import { cn } from '@/lib/utils';

const PAR_PAGE = 36;

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Portrait : illustrations des entrées choisies (race, profil…), bibliothèque
 * de portraits filtrée par ces mêmes entrées, ou une adresse d'image.
 */
export function EtapePortrait({
  fiche,
  presentation,
  portrait,
  onPortrait,
  nom,
}: {
  fiche: Fiche;
  presentation: Presentation | null;
  portrait: string | null;
  onPortrait: (url: string | null) => void;
  nom: string;
}) {
  const assets = useAssets();
  const dossiers = useMemo(() => portraitsParDossier(assets.data ?? []), [assets.data]);
  const mots = motsClesPortrait(fiche);
  const suggere =
    [...dossiers.keys()].find((d) =>
      mots.some((m) => m.startsWith(normaliser(d)) || normaliser(d).startsWith(m)),
    ) ?? null;
  const [dossier, setDossier] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [url, setUrl] = useState('');
  const actif = dossier ?? suggere ?? [...dossiers.keys()][0] ?? null;

  const illustrations = [...fiche.possessions.values()]
    .map((p) => presentation?.images[p.entree.id])
    .filter((x): x is string => Boolean(x));
  const liste = actif ? (dossiers.get(actif) ?? []) : [];

  return (
    <div className="space-y-7">
      {illustrations.length > 0 && (
        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-subtle">
            Illustrations de vos choix
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {illustrations.map((src) => (
              <Vignette
                key={src}
                src={src}
                nom={nom}
                choisie={portrait === src}
                onClick={() => onPortrait(src)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="mr-2 text-xs font-medium uppercase tracking-wider text-subtle">
            Bibliothèque
          </p>
          {[...dossiers.keys()].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={actif === d}
              onClick={() => {
                setDossier(d);
                setPage(1);
              }}
              className={cn(
                'h-7 rounded-full border px-3 text-xs transition-colors',
                actif === d
                  ? 'border-primary/50 bg-primary/15 text-primary-strong'
                  : 'border-border-strong text-muted-foreground hover:text-foreground',
              )}
            >
              {d}
              {d === suggere && ' ✦'}
            </button>
          ))}
        </div>
        {assets.isLoading ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {liste.slice(0, page * PAR_PAGE).map((a) => (
                <Vignette
                  key={a.path}
                  src={a.path}
                  nom={a.name}
                  choisie={portrait === a.path}
                  onClick={() => onPortrait(a.path)}
                />
              ))}
            </div>
            {liste.length > page * PAR_PAGE && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)}>
                  Voir plus ({liste.length - page * PAR_PAGE})
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 sm:flex-row">
        <InputGroup
          avant={<Link2 />}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Ou collez l'adresse https:// d'une image"
          aria-label="Adresse d'un portrait"
        />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="h-10"
            disabled={!/^https:\/\/\S+$/i.test(url.trim())}
            onClick={() => onPortrait(url.trim())}
          >
            Utiliser
          </Button>
          <Button variant="ghost" className="h-10" onClick={() => onPortrait(null)}>
            <ImageOff />
            Sans portrait
          </Button>
        </div>
      </section>
    </div>
  );
}

function Vignette({
  src,
  nom,
  choisie,
  onClick,
}: {
  src: string;
  nom: string;
  choisie: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={choisie}
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-xl border-2 transition-all',
        choisie ? 'border-primary shadow-glow' : 'border-transparent hover:border-border-strong',
      )}
    >
      <Illustration
        src={src}
        graine={nom}
        position="top"
        initiale={false}
        className="aspect-[3/4]"
        classeImage="transition-transform duration-500 group-hover:scale-105"
      />
      {choisie && (
        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
