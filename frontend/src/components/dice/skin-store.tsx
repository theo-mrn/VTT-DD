'use client';

/**
 * Boutique des dés, reprise de l'ancienne app (`store-modal.tsx`) dans l'UI
 * actuelle : catalogue, collection, premium ; recherche, rareté, pages ; page
 * de détail avec le dé en 3D et « Essayer un lancer ».
 *
 * - Possession : règle du service dice, `allSkins` (tout le catalogue) ou
 *   skin dans l'inventaire (gratuits compris). « Ma collection » liste donc
 *   tous les skins possédés, ceux ouverts par `allSkins` compris.
 * - Achat et abonnement : paiement reporté (pas encore de service billing),
 *   boutons affichés mais désactivés, « Bientôt disponible ».
 * - 3D : la grille n'affiche que des vignettes pré-calculées (aucun canevas,
 *   jamais de survol 3D : il faisait planter Chrome sous Windows) ; un seul
 *   canevas dans la page de détail, monté au clic, démonté au retour.
 *   « Essayer » lance un d20 par le lanceur 3D de l'app (lib/dice-throw.ts).
 *
 * Module chargé à la demande (catalogue de 71 skins), à la première ouverture.
 */
import {
  ArrowLeft,
  Backpack,
  Check,
  ChevronDown,
  Crown,
  Dice5,
  Dices,
  Heart,
  Package,
  RotateCcw,
  Search,
  ShoppingCart,
  Store,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { messageErreur } from '@/lib/api';
import {
  ownsSkin,
  useDicePreferences,
  useUpdateDicePreferences,
  type DicePreferences,
} from '@/lib/dice-preferences';
import { prepareDice3D, previewDice3D } from '@/lib/dice-throw';
import { cn } from '@/lib/utils';
import { SkinThumbnail } from './skin-thumbnail';
import { DICE_SKINS, type DiceSkin } from './three/dice-definitions';

// Un seul canevas, monté avec la page de détail
const DicePreview = dynamic(() => import('./three/preview'), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-2xl" />,
});

type Onglet = 'catalogue' | 'collection' | 'premium';
type Rarete = NonNullable<DiceSkin['rarity']>;
type FiltreRarete = 'toutes' | Rarete;

/** Achat et abonnement : en attente du service billing. */
const BIENTOT = 'Bientôt disponible';
const PAR_PAGE = 12;

const RARETES: Record<
  Rarete,
  { libelle: string; ton: 'neutre' | 'succes' | 'info' | 'arcane' | 'primaire'; ordre: number }
> = {
  legendary: { libelle: 'Légendaire', ton: 'primaire', ordre: 4 },
  epic: { libelle: 'Épique', ton: 'arcane', ordre: 3 },
  rare: { libelle: 'Rare', ton: 'info', ordre: 2 },
  uncommon: { libelle: 'Peu commun', ton: 'succes', ordre: 1 },
  common: { libelle: 'Commun', ton: 'neutre', ordre: 0 },
};
const rarete = (s: DiceSkin) => RARETES[s.rarity ?? 'common'];
const prix = (s: DiceSkin) =>
  s.price === 0
    ? 'Gratuit'
    : (s.price / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** Tout le catalogue, du plus rare au plus commun. */
const CATALOGUE = Object.values(DICE_SKINS).sort((a, b) => rarete(b).ordre - rarete(a).ordre);

export default function SkinStore({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const prefs = useDicePreferences();
  const modifier = useUpdateDicePreferences();
  const [onglet, setOnglet] = useState<Onglet>('catalogue');
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<FiltreRarete>('toutes');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<DiceSkin | null>(null);

  const p = prefs.data;
  const possede = (id: string) => (p ? ownsSkin(p, id) : false);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return CATALOGUE.filter(
      (s) =>
        (onglet !== 'collection' || (p && ownsSkin(p, s.id))) &&
        (filtre === 'toutes' || (s.rarity ?? 'common') === filtre) &&
        (!q || s.name.toLowerCase().includes(q)),
    );
  }, [onglet, recherche, filtre, p]);
  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  const courante = Math.min(page, pages);
  const visibles = liste.slice((courante - 1) * PAR_PAGE, courante * PAR_PAGE);

  function changerOnglet(o: Onglet) {
    setOnglet(o);
    setDetail(null);
    setPage(1);
  }

  async function equiper(skin: DiceSkin) {
    try {
      await modifier.mutateAsync({ skinId: skin.id });
      if (p?.animation3d) prepareDice3D([skin.id]);
      toast.success(`${skin.name} équipé`);
    } catch (err) {
      toast.error('Impossible d’équiper ces dés', { description: messageErreur(err) });
    }
  }

  const acheter = () => toast.info(`Achat : ${BIENTOT.toLowerCase()}`);

  // Contenu : chargement, échec, onglet premium, fiche d'un dé, rien à montrer, ou la grille
  let vue: 'chargement' | 'erreur' | 'premium' | 'detail' | 'vide' | 'grille' = 'grille';
  if (prefs.isPending) vue = 'chargement';
  else if (prefs.isError || !p) vue = 'erreur';
  else if (onglet === 'premium') vue = 'premium';
  else if (detail) vue = 'detail';
  else if (visibles.length === 0) vue = 'vide';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setDetail(null);
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="flex h-[min(860px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        onEscapeKeyDown={(e) => {
          // Échap quitte d'abord la page de détail
          if (detail) {
            e.preventDefault();
            setDetail(null);
          }
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-4 pt-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3 pr-8">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
              <Store className="size-5 text-primary" aria-hidden />
            </span>
            <div className="mr-auto min-w-0">
              <DialogTitle className="flex items-center gap-2">
                Boutique de dés
                {p?.allSkins && (
                  <Badge ton="primaire">
                    <Crown aria-hidden />
                    Tous les dés
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                {p?.allSkins
                  ? 'Tout le catalogue est à vous : équipez librement.'
                  : 'Des dés 3D animés, à équiper pour tous vos lancers.'}
              </DialogDescription>
            </div>
            <Tabs value={onglet} onValueChange={(v) => changerOnglet(v as Onglet)}>
              <TabsList>
                <TabsTrigger value="catalogue">
                  <Store aria-hidden />
                  Catalogue
                </TabsTrigger>
                <TabsTrigger value="collection">
                  <Backpack aria-hidden />
                  Ma collection
                </TabsTrigger>
                <TabsTrigger value="premium">
                  <Crown aria-hidden />
                  Premium
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </DialogHeader>

        {onglet !== 'premium' && !detail && (
          <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-surface/40 px-5 py-3 sm:flex-row sm:items-center sm:px-6">
            <div className="relative sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <Input
                value={recherche}
                onChange={(e) => {
                  setRecherche(e.target.value);
                  setPage(1);
                }}
                placeholder="Chercher un dé…"
                aria-label="Chercher un dé"
                className="pl-9"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="justify-between sm:ml-auto sm:w-48">
                  {filtre === 'toutes' ? 'Toutes raretés' : RARETES[filtre].libelle}
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {(['toutes', 'legendary', 'epic', 'rare', 'uncommon', 'common'] as const).map(
                  (r) => (
                    <DropdownMenuItem
                      key={r}
                      onSelect={() => {
                        setFiltre(r);
                        setPage(1);
                      }}
                    >
                      <span className="flex-1">
                        {r === 'toutes' ? 'Toutes raretés' : RARETES[r].libelle}
                      </span>
                      {filtre === r && <Check className="text-primary" aria-hidden />}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {vue === 'chargement' && <GrilleChargement />}
          {vue === 'erreur' && (
            <p className="py-16 text-center text-sm text-destructive">
              Préférences de dés indisponibles : {messageErreur(prefs.error)}
            </p>
          )}
          {vue === 'premium' && p && <Premium tousLesDes={p.allSkins} />}
          {vue === 'detail' && p && detail && (
            <Detail
              skin={detail}
              prefs={p}
              equipement={modifier.isPending}
              onRetour={() => setDetail(null)}
              onEquiper={() => void equiper(detail)}
              onAcheter={acheter}
            />
          )}
          {vue === 'vide' && (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <Package className="size-10 text-subtle" aria-hidden />
              <p className="max-w-xs text-sm text-muted-foreground">
                {onglet === 'collection' && !recherche && filtre === 'toutes'
                  ? 'Votre collection est vide.'
                  : 'Aucun dé ne correspond à ces filtres.'}
              </p>
            </div>
          )}
          {vue === 'grille' && p && (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {visibles.map((s) => (
                  <li key={s.id}>
                    <Carte
                      skin={s}
                      possede={possede(s.id)}
                      equipe={p.skinId === s.id}
                      equipement={modifier.isPending}
                      onOuvrir={() => setDetail(s)}
                      onEquiper={() => void equiper(s)}
                      onAcheter={acheter}
                    />
                  </li>
                ))}
              </ul>
              {pages > 1 && (
                <nav
                  aria-label="Pages du catalogue"
                  className="mt-6 flex items-center justify-center gap-1.5"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={courante === 1}
                    onClick={() => setPage(courante - 1)}
                  >
                    Précédent
                  </Button>
                  {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                    <Button
                      key={n}
                      variant={n === courante ? 'secondary' : 'ghost'}
                      size="icon-sm"
                      aria-current={n === courante ? 'page' : undefined}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={courante === pages}
                    onClick={() => setPage(courante + 1)}
                  >
                    Suivant
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GrilleChargement() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
      ))}
    </div>
  );
}

function BoutonAction({
  skin,
  possede,
  equipe,
  equipement,
  onEquiper,
  onAcheter,
  grand = false,
}: Readonly<{
  skin: DiceSkin;
  possede: boolean;
  equipe: boolean;
  equipement: boolean;
  onEquiper: () => void;
  onAcheter: () => void;
  grand?: boolean;
}>) {
  if (possede)
    return (
      <Button
        size={grand ? 'lg' : 'sm'}
        variant={equipe ? 'secondary' : 'default'}
        disabled={equipe || equipement}
        className="w-full"
        onClick={(e) => {
          e.stopPropagation();
          onEquiper();
        }}
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
    );
  return (
    <Button
      size={grand ? 'lg' : 'sm'}
      variant="outline"
      disabled
      title={`${prix(skin)} · ${BIENTOT}`}
      className="w-full"
      onClick={(e) => {
        e.stopPropagation();
        onAcheter();
      }}
    >
      <ShoppingCart aria-hidden />
      {BIENTOT}
    </Button>
  );
}

function Carte({
  skin,
  possede,
  equipe,
  equipement,
  onOuvrir,
  onEquiper,
  onAcheter,
}: Readonly<{
  skin: DiceSkin;
  possede: boolean;
  equipe: boolean;
  equipement: boolean;
  onOuvrir: () => void;
  onEquiper: () => void;
  onAcheter: () => void;
}>) {
  const r = rarete(skin);
  return (
    <div
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-colors',
        equipe ? 'border-primary/40' : 'border-border hover:border-border-strong',
      )}
    >
      <button
        type="button"
        onClick={onOuvrir}
        aria-label={`Voir ${skin.name} en 3D`}
        className="relative block aspect-square w-full bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <SkinThumbnail
          skinId={skin.id}
          className="absolute inset-0 size-full p-3 transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          <Badge ton={r.ton}>{r.libelle}</Badge>
          {equipe && (
            <Badge ton="primaire">
              <Check aria-hidden />
              Équipé
            </Badge>
          )}
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="truncate text-[13px] font-semibold">{skin.name}</p>
        <p className="line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground">
          {skin.description}
        </p>
        <div className="mt-auto pt-3">
          <BoutonAction
            skin={skin}
            possede={possede}
            equipe={equipe}
            equipement={equipement}
            onEquiper={onEquiper}
            onAcheter={onAcheter}
          />
        </div>
      </div>
    </div>
  );
}

function Detail({
  skin,
  prefs,
  equipement,
  onRetour,
  onEquiper,
  onAcheter,
}: Readonly<{
  skin: DiceSkin;
  prefs: DicePreferences;
  equipement: boolean;
  onRetour: () => void;
  onEquiper: () => void;
  onAcheter: () => void;
}>) {
  const r = rarete(skin);
  const possede = ownsSkin(prefs, skin.id);
  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" onClick={onRetour} className="mb-4 -ml-2">
        <ArrowLeft aria-hidden />
        Retour au catalogue
      </Button>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-surface-2/60">
          {/* key : un skin = un canevas, jamais de changement de skin sur un contexte actif */}
          <DicePreview key={skin.id} skinId={skin.id} type="d20" className="size-full" />
          <span className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <RotateCcw className="size-3" aria-hidden />
            Glisser pour tourner
          </span>
        </div>
        <div className="flex flex-col gap-4 md:pt-2">
          <Badge ton={r.ton} taille="md" className="self-start">
            {r.libelle}
          </Badge>
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold tracking-tight">{skin.name}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{skin.description}</p>
            {!possede && <p className="text-sm font-medium text-foreground">{prix(skin)}</p>}
          </div>
          <div className="flex flex-col gap-2.5 border-t border-border pt-4">
            <BoutonAction
              skin={skin}
              possede={possede}
              equipe={prefs.skinId === skin.id}
              equipement={equipement}
              onEquiper={onEquiper}
              onAcheter={onAcheter}
              grand
            />
            <Button
              variant="secondary"
              size="lg"
              onClick={() => previewDice3D([{ type: 'd20', count: 1 }], skin.id)}
            >
              <Dices aria-hidden />
              Essayer un lancer
            </Button>
            <p className="text-center text-[11px] text-subtle">
              Le premier lancer peut prendre quelques secondes (préparation des effets).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Abonnement : paiement reporté, boutons désactivés. */
function Premium({ tousLesDes }: Readonly<{ tousLesDes: boolean }>) {
  const avantages = [
    { Icone: Dice5, texte: 'Tous les dés 3D animés débloqués' },
    { Icone: Package, texte: 'Les futurs dés inclus' },
    { Icone: Heart, texte: 'Soutien au développement' },
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-6 text-center sm:p-10">
        <Crown
          className="absolute -right-8 -top-8 size-56 rotate-12 text-primary opacity-[0.06]"
          aria-hidden
        />
        <div className="relative flex flex-col items-center gap-6">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
            <Crown className="size-7 text-primary" aria-hidden />
          </span>
          <div className="space-y-1.5">
            <h3 className="text-2xl font-semibold tracking-tight">
              {tousLesDes ? 'Tous les dés sont à vous' : 'Abonnement Premium'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {tousLesDes
                ? 'Votre compte a accès à tout le catalogue, présent et à venir.'
                : 'L’expérience complète, sans limite.'}
            </p>
          </div>
          <ul className="grid w-full gap-2.5 text-left sm:grid-cols-2">
            {avantages.map(({ Icone, texte }) => (
              <li
                key={texte}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/60 p-3"
              >
                <Icone className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="text-sm">{texte}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col items-center gap-2">
            <Button size="lg" disabled title={BIENTOT}>
              <Crown aria-hidden />
              {tousLesDes ? 'Gérer l’abonnement' : 'Devenir Premium'}
            </Button>
            <p className="text-xs font-medium uppercase tracking-widest text-primary">{BIENTOT}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
