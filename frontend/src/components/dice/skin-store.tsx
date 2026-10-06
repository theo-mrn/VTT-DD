'use client';

/**
 * Boutique des dés : vitrine à gauche, fiche du dé sélectionné à droite (en
 * plein écran sur mobile). Onglets Tous / Ma collection / À débloquer, puces
 * de rareté nommées, tri, recherche sans accents. Code (service billing) et
 * Premium dans l'en-tête.
 *
 * - Possession (store/catalogue.ts) : « Ma collection » = dés à soi en propre,
 *   premium ou non ; « À débloquer » disparaît avec `allSkins` (tout équipable).
 * - Performances : la vitrine n'affiche que des vignettes WebP pré-calculées
 *   (aucun canevas, jamais de 3D au survol : elle faisait planter Chrome sous
 *   Windows), rendues à la demande (`content-visibility`). Un seul canevas 3D,
 *   dans la fiche, monté une fois la sélection stable (store/skin-panel.tsx).
 * - Achat : Stripe Checkout (service billing), retour sur la page courante.
 *
 * Module chargé à la demande, à la première ouverture.
 */
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  Backpack,
  Check,
  Crown,
  LayoutGrid,
  Lock,
  Package,
  Search,
  type LucideIcon,
  Store,
  X,
} from 'lucide-react';
import { PAGES_FRONT } from '@vtt/contracts';
import Link from 'next/link';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
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

const POSSESSIONS: { id: Possession; libelle: string; Icone: LucideIcon }[] = [
  { id: 'tous', libelle: 'Tous', Icone: LayoutGrid },
  { id: 'collection', libelle: 'Ma collection', Icone: Backpack },
  { id: 'a-debloquer', libelle: 'À débloquer', Icone: Lock },
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
        showCloseButton={false}
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
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
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
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Fermer" className="-mr-1.5">
              <X aria-hidden />
            </Button>
          </DialogClose>
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
        possession={possession}
        premium={p.allSkins}
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
  premium,
  onPossession,
  compte,
  rarete,
  onRarete,
  tri,
  onTri,
}: Readonly<{
  recherche: string;
  onRecherche: (v: string) => void;
  possession: Possession;
  /** Tout est équipable : pas d'onglet « À débloquer ». */
  premium: boolean;
  onPossession: (v: Possession) => void;
  compte: Record<Possession, number>;
  rarete: Rarete | null;
  onRarete: (v: Rarete | null) => void;
  tri: Tri;
  onTri: (v: Tri) => void;
}>) {
  const onglets = POSSESSIONS.filter((o) => !(premium && o.id === 'a-debloquer'));
  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex flex-wrap items-center gap-3 px-4 pt-3 sm:px-5">
        <PillGroup>
          <div role="tablist" aria-label="Dés affichés" className="flex gap-1">
            {onglets.map(({ id, libelle, Icone }) => {
              const actif = possession === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={actif}
                  onClick={() => onPossession(id)}
                  className={cn(
                    'relative isolate flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                    actif ? 'text-primary-strong' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {actif && <ActivePill className="border border-primary/30 bg-primary/10" />}
                  <Icone className="size-4" aria-hidden />
                  {libelle}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs tabular-nums',
                      actif ? 'bg-primary/15' : 'bg-surface-3 text-subtle',
                    )}
                  >
                    {compte[id]}
                  </span>
                </button>
              );
            })}
          </div>
        </PillGroup>
        <div className="relative w-full sm:ml-auto sm:w-60">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            value={recherche}
            onChange={(e) => onRecherche(e.target.value)}
            placeholder="Chercher un dé…"
            aria-label="Chercher un dé"
            className="h-9 pl-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] sm:px-5">
        <Puce actif={rarete === null} onClick={() => onRarete(null)}>
          Toutes raretés
        </Puce>
        {ORDRE_RARETES.map((r) => (
          <Puce key={r} actif={rarete === r} onClick={() => onRarete(rarete === r ? null : r)}>
            <span className={cn('size-2 rounded-full', RARETES[r].teinte)} aria-hidden />
            {RARETES[r].libelle}
          </Puce>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto shrink-0 text-muted-foreground">
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
    </div>
  );
}

function Puce({
  actif,
  onClick,
  children,
}: Readonly<{ actif: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
        actif
          ? 'border-border-strong bg-surface-3 text-foreground'
          : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      {children}
    </button>
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
