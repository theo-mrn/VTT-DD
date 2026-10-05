'use client';

/**
 * Simulateur de dés de la landing : le vrai lanceur 3D de l'app (monté pour tout le site par
 * `DiceThrowerHost`, chargé au premier lancer), sans compte. On compose le jet, on choisit le
 * skin, les dés roulent sur la page et le total est lu sur les faces à l'arrêt.
 */
import { Dices, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MAX_3D_DICE, prepareDice3D, roll3D, SHAPES_3D, type ThrowResult } from '@/lib/dice-throw';
import { cn } from '@/lib/utils';

const SKINS = [
  { id: 'gold', nom: 'Or' },
  { id: 'kyber_violet', nom: 'Kyber améthyste' },
  { id: 'magma', nom: 'Magma' },
  { id: 'resine_jade', nom: 'Résine de jade' },
  { id: 'singularite', nom: 'Singularité' },
  { id: 'ruby', nom: 'Rubis' },
  { id: 'beholder_orb', nom: 'Orbe du tyrannœil' },
];

type Forme = (typeof SHAPES_3D)[number];
type Compte = Record<Forme, number>;

const VIDE: Compte = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0 };
const faces = (f: Forme) => Number(f.slice(1));

/** Tirage local quand la 3D ne répond pas (WebGL absent, délai dépassé). */
function tirageLocal(compte: Compte): ThrowResult[] {
  return SHAPES_3D.flatMap((f) =>
    Array.from({ length: compte[f] }, () => ({
      type: f,
      value: 1 + (crypto.getRandomValues(new Uint32Array(1))[0]! % faces(f)),
    })),
  );
}

export function Simulateur() {
  const [compte, setCompte] = useState<Compte>({ ...VIDE, d20: 1 });
  const [skin, setSkin] = useState(SKINS[0]!.id);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<ThrowResult[] | null>(null);

  const total = SHAPES_3D.reduce((n, f) => n + compte[f], 0);
  const formule =
    SHAPES_3D.filter((f) => compte[f] > 0)
      .map((f) => `${compte[f]}${f}`)
      .join(' + ') || 'Aucun dé';

  const ajouter = (f: Forme) => {
    if (total >= MAX_3D_DICE) return;
    setCompte((c) => ({ ...c, [f]: c[f] + 1 }));
    setResultat(null);
  };
  const choisirSkin = (id: string) => {
    setSkin(id);
    prepareDice3D([id]);
  };

  async function lancer() {
    if (!total || enCours) return;
    setEnCours(true);
    setResultat(null);
    const demandes = SHAPES_3D.filter((f) => compte[f] > 0).map((f) => ({
      type: f,
      count: compte[f],
    }));
    const faces3D = await roll3D(demandes, { enabled: true, skinId: skin });
    setResultat(faces3D ?? tirageLocal(compte));
    setEnCours(false);
  }

  const somme = resultat?.reduce((n, r) => n + r.value, 0);

  return (
    <div
      className="mx-auto mt-14 max-w-3xl rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 text-left shadow-[0_40px_120px_-50px_rgba(0,0,0,0.9)] sm:p-8"
      // Préchauffe le lanceur à la première intention : le premier lancer part plus vite
      onPointerEnter={() => prepareDice3D([skin])}
      onFocus={() => prepareDice3D([skin])}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-foreground">Composez votre jet</p>
        <button
          type="button"
          onClick={() => {
            setCompte(VIDE);
            setResultat(null);
          }}
          className="flex items-center gap-1.5 text-sm text-subtle transition-colors hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Vider
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {SHAPES_3D.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => ajouter(f)}
            aria-label={`Ajouter un ${f}`}
            className={cn(
              'relative flex h-14 items-center justify-center rounded-xl border font-mono text-base transition-colors',
              compte[f] > 0
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground',
            )}
          >
            {f}
            {compte[f] > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {compte[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mt-7 text-sm font-medium text-foreground">Votre dé</p>
      <div role="radiogroup" aria-label="Skin des dés" className="mt-3 flex flex-wrap gap-2">
        {SKINS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={skin === s.id}
            aria-label={s.nom}
            title={s.nom}
            onClick={() => choisirSkin(s.id)}
            className={cn(
              'rounded-xl border p-1.5 transition-colors',
              skin === s.id
                ? 'border-primary bg-primary/10'
                : 'border-white/10 hover:border-white/20',
            )}
          >
            <Image
              src={`/dice/thumbs/${s.id}.webp`}
              alt=""
              width={44}
              height={44}
              className="size-11"
            />
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-5 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-[60px]">
          {resultat ? (
            <div className="flex items-center gap-4">
              <span className="text-5xl font-semibold tabular-nums text-primary">{somme}</span>
              <span className="flex flex-wrap gap-1.5">
                {resultat.map((r, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-xs text-muted-foreground"
                  >
                    {r.type} · <span className="text-foreground">{r.value}</span>
                  </span>
                ))}
              </span>
            </div>
          ) : (
            <p className="font-mono text-lg text-muted-foreground">{formule}</p>
          )}
        </div>
        <Button
          size="lg"
          onClick={() => void lancer()}
          disabled={!total}
          loading={enCours}
          className="h-12 shrink-0 rounded-full px-8 text-[15px]"
        >
          {!enCours && <Dices aria-hidden />}
          {enCours ? 'Les dés roulent…' : 'Lancer'}
        </Button>
      </div>
    </div>
  );
}
