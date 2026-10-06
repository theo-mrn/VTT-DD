'use client';

/**
 * Boutique des dés : vitrine à gauche, fiche du dé sélectionné à droite (en
 * plein écran sur mobile). Un seul filtre de possession (Tous, Possédés, À
 * débloquer) remplace les onglets ; raretés en puces, tri, recherche sans
 * accents. Code (service billing) et Premium dans l'en-tête.
 *
 * - Possession : règle du service dice (`ownsSkin`) ; avec `allSkins`, tout
 *   est possédé et le filtre de possession disparaît.
 * - Performances : la vitrine n'affiche que des vignettes WebP pré-calculées
 *   (aucun canevas, jamais de 3D au survol : elle faisait planter Chrome sous
 *   Windows), rendues à la demande (`content-visibility`). Un seul canevas 3D,
 *   dans la fiche, monté une fois la sélection stable (store/skin-panel.tsx).
 * - Achat : Stripe Checkout (service billing), retour sur la page courante.
 *
 * Module chargé à la demande, à la première ouverture.
 */
import { ArrowDownWideNarrow, ArrowLeft, Check, Crown, Package, Search, Store } from 'lucide-react';
import { PAGES_FRONT } from '@vtt/contracts';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { acheter as lancerAchat } from '@/lib/abonnement';
import { messageErreur } from '@/lib/api';
import {
  ownsSkin,
  useDicePreferences,
  useUpdateDicePreferences,
  type DicePreferences,
} from '@/lib/dice-preferences';
import { prepareDice3D } from '@/lib/dice-throw';
import { cn } from '@/lib/utils';
import {
  CATALOGUE,
  compter,
  filtrer,
  ORDRE_RARETES,
  RARETES,
  type Possession,
  type Rarete,
  type Tri,
} from './store/catalogue';
import { CodeButton } from './store/code-button';
import { SkinPanel } from './store/skin-panel';
import { SkinTile } from './store/skin-tile';
import { getSkinById } from './three/dice-definitions';

const POSSESSIONS: { id: Possession; libelle: string }[] = [
  { id: 'tous', libelle: 'Tous' },
  { id: 'possedes', libelle: 'Possédés' },
  { id: 'a-debloquer', libelle: 'À débloquer' },
];
const TRIS: Record<Tri, string> = { rarete: 'Rareté', prix: 'Prix', nom: 'Nom' };

export default function SkinStore({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const prefs = useDicePreferences();
  const p = prefs.data;
  const [ficheMobile, setFicheMobile] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setFicheMobile(false);
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="flex h-[min(900px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
        onEscapeKeyDown={(e) => {
          // Échap ferme d'abord la fiche plein écran (mobile)
          if (ficheMobile) {
            e.preventDefault();
            setFicheMobile(false);
          }
        }}
      >
        <DialogDescription className="sr-only">
          Vitrine des dés : équiper, acheter, essayer.
        </DialogDescription>
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 pr-12 sm:px-5">
          <Store className="size-5 shrink-0 text-primary" aria-hidden />
          <DialogTitle className="mr-auto truncate text-base">Boutique de dés</DialogTitle>
          <CodeButton
            onUtilise={(r) => {
              if (r.kind !== 'dice_skin' || !r.itemId) return;
              setSelection(r.itemId);
              const id = `skin-${r.itemId}`;
              requestAnimationFrame(() =>
                document.getElementById(id)?.scrollIntoView({ block: 'nearest' }),
              );
            }}
          />
          {p?.allSkins ? (
            <Info texte="Tous les dés, présents et à venir">
              <Badge ton="primaire" taille="md">
                <Crown aria-hidden />
                Premium
              </Badge>
            </Info>
          ) : (
            <Button size="sm" asChild>
              <Link href={PAGES_FRONT.abonnement}>
                <Crown aria-hidden />
                Premium
              </Link>
            </Button>
          )}
        </header>

        {prefs.isPending && <Chargement />}
        {!prefs.isPending && (prefs.isError || !p) && (
          <p className="py-16 text-center text-sm text-destructive">
            Préférences de dés indisponibles : {messageErreur(prefs.error)}
          </p>
        )}
        {p && (
          <Vitrine
            prefs={p}
            selection={selection}
            onSelection={setSelection}
            ficheMobile={ficheMobile}
            onFicheMobile={setFicheMobile}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Vitrine({
  prefs: p,
  selection,
  onSelection,
  ficheMobile,
  onFicheMobile,
}: Readonly<{
  prefs: DicePreferences;
  selection: string | null;
  onSelection: (id: string) => void;
  ficheMobile: boolean;
  onFicheMobile: (ouvert: boolean) => void;
}>) {
  const modifier = useUpdateDicePreferences();
  const [recherche, setRecherche] = useState('');
  const [possession, setPossession] = useState<Possession>('tous');
  const [rarete, setRarete] = useState<Rarete | null>(null);
  const [tri, setTri] = useState<Tri>('rarete');
  const [achat, setAchat] = useState(false);

  const liste = useMemo(
    () => filtrer(CATALOGUE, p, { recherche, possession, rarete, tri }),
    [p, recherche, possession, rarete, tri],
  );
  const compte = useMemo(() => compter(CATALOGUE, p), [p]);
  // Sans choix, la fiche montre le dé équipé
  const skin = getSkinById(selection ?? p.skinId);
  const possede = ownsSkin(p, skin.id);

  const selectionner = useCallback(
    (id: string) => {
      onSelection(id);
      // Sous md, la fiche s'ouvre par-dessus la vitrine ; au-delà, elle est déjà à côté
      if (!window.matchMedia('(min-width: 768px)').matches) onFicheMobile(true);
    },
    [onSelection, onFicheMobile],
  );

  async function equiper() {
    try {
      await modifier.mutateAsync({ skinId: skin.id });
      if (p.animation3d) prepareDice3D([skin.id]);
      toast.success(`${skin.name} équipé`);
    } catch (err) {
      toast.error('Impossible d’équiper ces dés', { description: messageErreur(err) });
    }
  }

  async function acheter() {
    setAchat(true);
    try {
      await lancerAchat(skin.id);
    } catch (err) {
      toast.error('Paiement indisponible', { description: messageErreur(err) });
      setAchat(false);
    }
  }

  const fiche = (
    <SkinPanel
      skin={skin}
      possede={possede}
      equipe={p.skinId === skin.id}
      premium={p.allSkins}
      equipement={modifier.isPending}
      achat={achat}
      onEquiper={() => void equiper()}
      onAcheter={() => void acheter()}
      className="h-full"
    />
  );

  return (
    <>
      <Filtres
        recherche={recherche}
        onRecherche={setRecherche}
        possession={p.allSkins ? null : possession}
        onPossession={setPossession}
        compte={compte}
        rarete={rarete}
        onRarete={setRarete}
        tri={tri}
        onTri={setTri}
      />

      <div className="relative grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_20rem] lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          {liste.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-24 text-subtle">
              <Package className="size-10" aria-hidden />
              <p className="text-sm">Aucun dé</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {liste.map((s) => (
                <li key={s.id}>
                  <SkinTile
                    skin={s}
                    possede={ownsSkin(p, s.id)}
                    equipe={p.skinId === s.id}
                    selectionne={s.id === skin.id}
                    onSelect={selectionner}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="hidden min-h-0 border-l border-border p-5 md:block">{fiche}</aside>

        {ficheMobile && (
          <div className="absolute inset-0 z-10 flex flex-col bg-background p-4 md:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-3 self-start"
              onClick={() => onFicheMobile(false)}
            >
              <ArrowLeft aria-hidden />
              Retour
            </Button>
            <div className="min-h-0 flex-1">{fiche}</div>
          </div>
        )}
      </div>
    </>
  );
}

function Filtres({
  recherche,
  onRecherche,
  possession,
  onPossession,
  compte,
  rarete,
  onRarete,
  tri,
  onTri,
}: Readonly<{
  recherche: string;
  onRecherche: (v: string) => void;
  /** null : tout est possédé (premium), pas de filtre. */
  possession: Possession | null;
  onPossession: (v: Possession) => void;
  compte: Record<Possession, number>;
  rarete: Rarete | null;
  onRarete: (v: Rarete | null) => void;
  tri: Tri;
  onTri: (v: Tri) => void;
}>) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface/40 px-4 py-2.5 sm:px-5">
      <div className="relative w-full sm:w-56">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          value={recherche}
          onChange={(e) => onRecherche(e.target.value)}
          placeholder="Chercher…"
          aria-label="Chercher un dé"
          className="h-9 pl-9"
        />
      </div>

      {possession && (
        <PillGroup>
          <div
            role="radiogroup"
            aria-label="Possession"
            className="flex rounded-lg border border-border bg-surface-2/60 p-0.5"
          >
            {POSSESSIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={possession === o.id}
                onClick={() => onPossession(o.id)}
                className={cn(
                  'relative isolate flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                  possession === o.id
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {possession === o.id && <ActivePill className="bg-surface-3 shadow-sm" />}
                {o.libelle}
                <span className="tabular-nums text-subtle">{compte[o.id]}</span>
              </button>
            ))}
          </div>
        </PillGroup>
      )}

      <div role="radiogroup" aria-label="Rareté" className="flex items-center gap-1">
        {ORDRE_RARETES.map((r) => {
          const actif = rarete === r;
          return (
            <Info key={r} texte={RARETES[r].libelle}>
              <button
                type="button"
                role="radio"
                aria-checked={actif}
                aria-label={RARETES[r].libelle}
                onClick={() => onRarete(actif ? null : r)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-lg border transition-colors',
                  actif
                    ? 'border-border-strong bg-surface-3'
                    : 'border-transparent hover:bg-surface-2',
                )}
              >
                <span
                  className={cn(
                    'size-2.5 rounded-full transition-opacity',
                    RARETES[r].teinte,
                    rarete && !actif && 'opacity-35',
                  )}
                />
              </button>
            </Info>
          );
        })}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground">
            <ArrowDownWideNarrow aria-hidden />
            {TRIS[tri]}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {(Object.keys(TRIS) as Tri[]).map((t) => (
            <DropdownMenuItem key={t} onSelect={() => onTri(t)}>
              <span className="flex-1">{TRIS[t]}</span>
              {tri === t && <Check className="text-primary" aria-hidden />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Chargement() {
  return (
    <div className="grid flex-1 grid-cols-2 content-start gap-3 p-5 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
      ))}
    </div>
  );
}
