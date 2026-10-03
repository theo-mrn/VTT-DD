'use client';

import type { Fiche, Presentation } from '@vtt/rules';
import { Check, Crop, ImageOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { PortraitStudio } from '@/components/portraits/portrait-studio';
import { ImageDrop } from '@/components/uploads/image-drop';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { portraitsParDossier, useAssets } from '@/lib/assets';
import { motsClesPortrait } from '@/lib/creation';
import { useModifierPersonnage } from '@/lib/personnages';
import { cn } from '@/lib/utils';

const PAR_PAGE = 36;

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Portrait : votre image (glisser, coller, recadrer au format portrait, envoi sur le
 * stockage), illustrations des entrées choisies (race, profil…), bibliothèque de portraits
 * filtrée par ces mêmes entrées.
 */
export function EtapePortrait({
  fiche,
  presentation,
  portrait,
  onPortrait,
  nom,
  personnageId,
}: Readonly<{
  fiche: Fiche;
  presentation: Presentation | null;
  portrait: string | null;
  onPortrait: (url: string | null) => void;
  nom: string;
  /** Personnage en création : son dossier reçoit l'image envoyée. */
  personnageId: string | null;
}>) {
  const assets = useAssets();
  const dossiers = useMemo(() => portraitsParDossier(assets.data ?? []), [assets.data]);
  const mots = motsClesPortrait(fiche);
  const suggere =
    [...dossiers.keys()].find((d) =>
      mots.some((m) => m.startsWith(normaliser(d)) || normaliser(d).startsWith(m)),
    ) ?? null;
  const [dossier, setDossier] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const actif = dossier ?? suggere ?? [...dossiers.keys()][0] ?? null;

  const illustrations = [...fiche.possessions.values()]
    .map((p) => presentation?.images[p.entree.id])
    .filter((x): x is string => Boolean(x));
  const liste = actif ? (dossiers.get(actif) ?? []) : [];

  return (
    <div className="space-y-7">
      <section className="flex items-start gap-4">
        <ImageDrop
          className="w-44 shrink-0"
          target={personnageId ? { kind: 'character', id: personnageId } : null}
          usage="portrait"
          value={portrait}
          onChange={onPortrait}
          label="Votre image"
        />
        {portrait && (
          <div className="flex flex-col items-start gap-1.5">
            {personnageId && (
              <OuvrirStudio
                personnageId={personnageId}
                nom={nom}
                portrait={portrait}
                onPortrait={onPortrait}
              />
            )}
            <Button variant="ghost" size="sm" onClick={() => onPortrait(null)}>
              <ImageOff />
              Sans portrait
            </Button>
          </div>
        )}
      </section>

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
    </div>
  );
}

/** Studio du portrait : cadrages et token, enregistrés sur le personnage en création. */
function OuvrirStudio({
  personnageId,
  nom,
  portrait,
  onPortrait,
}: Readonly<{
  personnageId: string;
  nom: string;
  portrait: string;
  onPortrait: (url: string | null) => void;
}>) {
  const modifier = useModifierPersonnage(personnageId);
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOuvert(true)}>
        <Crop />
        Studio
      </Button>
      <PortraitStudio
        open={ouvert}
        onOpenChange={setOuvert}
        characterId={personnageId}
        name={nom}
        current={{ portraitUrl: portrait, studio: null }}
        onSave={async (r) => {
          await modifier.mutateAsync({
            portraitUrl: r.portraitUrl,
            tokenUrl: r.tokenUrl,
            portraitStudio: r.studio,
          });
          onPortrait(r.portraitUrl);
        }}
      />
    </>
  );
}

function Vignette({
  src,
  nom,
  choisie,
  onClick,
}: Readonly<{
  src: string;
  nom: string;
  choisie: boolean;
  onClick: () => void;
}>) {
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
        largeur={200}
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
