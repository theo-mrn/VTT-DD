'use client';

/**
 * Bloc Inventaire en grille d'emplacements, comme un inventaire de jeu : la tuile « + »,
 * les dossiers (on y entre d'un clic, un fil d'Ariane ramène en arrière, on y dépose un
 * objet), puis une tuile par objet (icône de sa catégorie, quantité, équipé, caché ; nom
 * et info clé en infobulle). Barre d'outils compacte : recherche, tri, filtre, catégories.
 * Clic : détail modifiable ; clic droit ou Maj+F10 : toutes les actions ; flèches pour
 * parcourir la grille, Entrée pour ouvrir, Suppr pour supprimer, Échap pour remonter.
 * Monnaies et charge en pied, si le système en déclare.
 *
 * Générique : catégories, icônes (présentation), champs, formules et bonus viennent du
 * système chargé et du widget, aucune clé de jeu. Toute écriture passe par
 * `ctx.operations` (absent : lecture seule) ; le service character vérifie tout.
 */
import { acheter, type InventoryFolder } from '@vtt/rules';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Coins,
  FolderPlus,
  Package,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { EtatVide } from '@/components/commun/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { SheetBlockProps } from '../types';
import { AddDialog } from './add-dialog';
import { ConfirmDialog, GiveDialog, PromptDialog, type Saisie } from './dialogs';
import { iconeObjet } from './item-icon';
import { AnchoredMenu, ContextMenu, type ItemHandlers, type SectionDetail } from './item-menu';
import { ItemPanel, type PanelWrites } from './item-panel';
import { AddTile, FolderTile, GLISSER_OBJET, ItemTile } from './item-tile';
import {
  ajouter,
  ajouterLibre,
  apercuDossiers,
  apresDon,
  basculerActif,
  buildInventory,
  cacher,
  changerChamps,
  changerQuantite,
  consommer,
  correspond,
  dansDossier,
  metaFormule,
  nouvelExemplaireDe,
  poserEffets,
  ranger,
  renommer,
  restaurer,
  retirer,
  trier,
  TRIS,
  type CatalogueEntry,
  type Ecriture,
  type Inventory,
  type InventoryItem,
  type ModeleLibre,
  type SaisieLibre,
  type Tri,
} from './model';
import { randomId } from '@/lib/random-id';

const TOUT = '*';

/** Grille des emplacements : autant de colonnes que la largeur du bloc en permet. */
const GRILLE = 'grid justify-start gap-1.5 [grid-template-columns:repeat(auto-fill,4.5rem)]';

/** Identifiant d'un nouveau dossier, choisi ici pour y ranger un objet aussitôt. */
function nouvelIdDossier(): string {
  return `dossier-${randomId()}`;
}

/** Tuile voisine dans la grille, par la géométrie (colonnes variables, sections). */
function voisine(tuiles: HTMLElement[], i: number, sens: 'haut' | 'bas'): number {
  const r = tuiles[i]!.getBoundingClientRect();
  const candidates = tuiles
    .map((t, j) => ({ j, b: t.getBoundingClientRect() }))
    .filter(({ b }) => (sens === 'bas' ? b.top > r.top + 4 : b.top < r.top - 4));
  if (!candidates.length) return i;
  const ligne =
    sens === 'bas'
      ? Math.min(...candidates.map((c) => c.b.top))
      : Math.max(...candidates.map((c) => c.b.top));
  const surLigne = candidates.filter((c) => Math.abs(c.b.top - ligne) < 4);
  surLigne.sort((a, b) => Math.abs(a.b.left - r.left) - Math.abs(b.b.left - r.left));
  return surLigne[0]!.j;
}

export function InventoryGrid({ ctx, widget, mode }: Readonly<SheetBlockProps<'inventaire'>>) {
  const { fiche, systeme, presentation, personnage } = ctx;
  const ops = mode === 'read' ? ctx.operations : undefined;
  const editable = Boolean(ops);
  const folders = fiche.etat.folders;
  const regles = presentation?.iconesObjets ?? [];
  // État le plus récent, pour les annulations lancées depuis un toast
  const etatCourant = useRef(fiche.etat);
  etatCourant.current = fiche.etat;
  const grille = useRef<HTMLDivElement>(null);

  const inv = useMemo(() => buildInventory(fiche, widget, ctx.mj), [fiche, widget, ctx.mj]);
  const metas = useMemo(
    () => new Map(inv.items.map((i) => [i.cle, metaFormule(fiche, i)])),
    [inv, fiche],
  );

  const [terme, setTerme] = useState('');
  const [tri, setTri] = useState<Tri>('nom');
  const [filtre, setFiltre] = useState(TOUT);
  const [parCategorie, setParCategorie] = useState(false);
  const [dossierChoisi, setDossier] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<{ cle: string; section: SectionDetail | null } | null>(null);
  const [ajout, setAjout] = useState(false);
  const [don, setDon] = useState<string | null>(null);
  const [suppression, setSuppression] = useState<string | null>(null);
  const [dossierSupprime, setDossierSupprime] = useState<InventoryFolder | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [menu, setMenu] = useState<{ item: InventoryItem; x: number; y: number } | null>(null);
  const [menuDossier, setMenuDossier] = useState<{
    folder: InventoryFolder;
    x: number;
    y: number;
  } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [racineSurvolee, setRacineSurvolee] = useState(false);

  const parCle = (cle: string | null) =>
    cle ? (inv.items.find((i) => i.cle === cle) ?? null) : null;
  const dossier = folders.find((f) => f.id === dossierChoisi) ?? null;
  const sortesInconnues = widget.sortes.filter((s) => !systeme.sortes.has(s));
  const filtreActif = inv.categories.some((c) => c.cle === filtre) ? filtre : TOUT;
  const recherche = terme.trim().length > 0;
  // Recherche ou filtre : tous les objets, dossiers compris ; sinon le dossier ouvert
  const aplati = recherche || filtreActif !== TOUT;
  const visibles = trier(
    inv.items.filter(
      (i) =>
        correspond(i, terme) &&
        (filtreActif === TOUT || i.categorie.cle === filtreActif) &&
        (aplati || (dossier ? i.folder?.id === dossier.id : !i.folder)),
    ),
    tri,
  );
  const dossiersVisibles = aplati || dossier ? [] : folders;
  const deplacable = editable && Boolean(ops?.dossiers);

  // ─── Écritures ─────────────────────────────────────────────────────────────

  function ecrire(w: Ecriture) {
    ops?.possession(w.demande, w.apercu);
  }

  function restaurerExemplaire(item: InventoryItem) {
    const avant = item.possession;
    if (!ops || !avant) return;
    const w = restaurer(etatCourant.current, avant);
    ops.possession(w.demande, w.apercu);
  }

  function supprimer(item: InventoryItem) {
    if (!ops || !item.possession) return;
    const r = retirer(fiche.etat, item);
    ops.retirerPossession(r.entree, r.exemplaire, r.apercu);
    if (ouvert?.cle === item.cle) setOuvert(null);
    toast.success(`${item.nom} supprimé`, {
      ...(item.quantite > 1 ? { description: `${item.quantite} unités` } : {}),
      action: { label: 'Annuler', onClick: () => restaurerExemplaire(item) },
    });
  }

  function dossiers(liste: { id?: string; name: string }[]) {
    ops?.dossiers?.(liste, apercuDossiers(fiche.etat, liste));
  }

  function creerDossier(pour?: InventoryItem) {
    setSaisie({
      titre: 'Nouveau dossier',
      ...(pour ? { description: `${pour.nom} y sera rangé.` } : {}),
      label: 'Nom du dossier',
      initial: '',
      type: 'texte',
      maxLength: 60,
      valider: 'Créer',
      onValider: (name) => {
        if (!ops?.dossiers) return;
        const id = nouvelIdDossier();
        const suivants = [...folders, { id, name }];
        const etat = apercuDossiers(fiche.etat, suivants);
        ops.dossiers(suivants, etat);
        if (pour) {
          const w = ranger(etat, pour, id);
          ops.possession(w.demande, w.apercu);
        }
        toast.success(`Dossier « ${name} » créé`);
      },
    });
  }

  function rangerObjet(item: InventoryItem, folder: string | null) {
    if (!ops?.dossiers || (item.folder?.id ?? null) === folder) return;
    ecrire(ranger(fiche.etat, item, folder));
    const f = folders.find((x) => x.id === folder);
    toast(f ? `${item.nom} rangé dans « ${f.name} »` : `${item.nom} sorti de son dossier`);
  }

  const handlers: ItemHandlers = {
    ouvrir: (item) => mode === 'read' && setOuvert({ cle: item.cle, section: null }),
    detailSur: (item, section) => mode === 'read' && setOuvert({ cle: item.cle, section }),
    ...(ops
      ? {
          equiper: (item: InventoryItem, actif: boolean) =>
            ecrire(basculerActif(fiche.etat, item, actif)),
          consommer: (item: InventoryItem) => {
            const c = consommer(fiche.etat, item);
            if (c.type === 'quantite') {
              ecrire(c.ecriture);
              toast(`${item.nom} : une unité consommée`, {
                description: `Il en reste ${item.quantite - 1}.`,
                action: {
                  label: 'Annuler',
                  onClick: () => ecrire(changerQuantite(etatCourant.current, item, item.quantite)),
                },
              });
            } else {
              ops.retirerPossession(c.retrait.entree, c.retrait.exemplaire, c.retrait.apercu);
              if (ouvert?.cle === item.cle) setOuvert(null);
              toast(`${item.nom} consommé : épuisé`, {
                action: { label: 'Annuler', onClick: () => restaurerExemplaire(item) },
              });
            }
          },
          renommer: (item: InventoryItem) =>
            setSaisie({
              titre: 'Renommer',
              label: 'Nom',
              initial: item.nom,
              type: 'texte',
              maxLength: 200,
              valider: 'Renommer',
              onValider: (nom) => ecrire(renommer(fiche.etat, item, nom)),
            }),
          quantite: (item: InventoryItem) =>
            setSaisie({
              titre: `Quantité : ${item.nom}`,
              label: 'Nombre d’unités',
              initial: String(item.quantite),
              type: 'nombre',
              min: 1,
              max: 1_000_000,
              valider: 'Enregistrer',
              onValider: (q) => ecrire(changerQuantite(fiche.etat, item, Number(q))),
            }),
          ...(ops.donner && personnage.roomId
            ? { donner: (item: InventoryItem) => setDon(item.cle) }
            : {}),
          cacher: (item: InventoryItem, hidden: boolean) => {
            ecrire(cacher(fiche.etat, item, hidden));
            toast(
              hidden
                ? `${item.nom} est caché aux autres joueurs`
                : `${item.nom} est visible de tous`,
            );
          },
          ...(ops.dossiers
            ? {
                ranger: rangerObjet,
                nouveauDossierPour: (item: InventoryItem) => creerDossier(item),
              }
            : {}),
          exemplaire: (item: InventoryItem) => {
            ecrire(
              dansDossier(
                nouvelExemplaireDe(
                  fiche.etat,
                  item.entree.id,
                  item.entree.libre ? item.possession?.champs : undefined,
                ),
                item.folder?.id ?? null,
              ),
            );
            toast.success(`Nouvel exemplaire : ${item.nom}`);
          },
          supprimer: (item: InventoryItem) => setSuppression(item.cle),
        }
      : {}),
  };

  const writes: PanelWrites | undefined = ops
    ? {
        quantite: (item, q) => ecrire(changerQuantite(fiche.etat, item, q)),
        champs: (item, champs) => ecrire(changerChamps(fiche.etat, item, champs)),
        effets: (item, effets) => ecrire(poserEffets(fiche.etat, item, effets)),
        renommer: (item, nom) => ecrire(renommer(fiche.etat, item, nom)),
      }
    : undefined;

  function donner(item: InventoryItem, to: { id: string; name: string }, quantite: number) {
    if (!ops?.donner) return;
    const ex = item.possession?.exemplaire;
    void ops
      .donner(
        {
          to: to.id,
          entree: item.entree.id,
          ...(ex !== undefined ? { exemplaire: ex } : {}),
          quantity: quantite,
        },
        apresDon(fiche.etat, item, quantite),
      )
      .then((ok) => {
        if (ok)
          toast.success(`${quantite > 1 ? `${quantite} × ` : ''}${item.nom} donné à ${to.name}`);
      });
  }

  function ajouterDuCatalogue(c: CatalogueEntry) {
    if (!ops || c.bloque) return;
    ecrire(dansDossier(ajouter(systeme, fiche.etat, c.entree.id), dossier?.id ?? null));
    toast.success(`${c.entree.nom} ajouté${dossier ? ` dans « ${dossier.name} »` : ''}`);
  }

  function ajouterObjetLibre(modele: ModeleLibre, s: SaisieLibre) {
    if (!ops) return;
    // Le dossier choisi dans la configuration l'emporte sur celui affiché dans la grille
    ecrire(
      dansDossier(
        ajouterLibre(fiche.etat, modele, s),
        s.folder !== undefined ? s.folder : (dossier?.id ?? null),
      ),
    );
    toast.success(`${s.nom.trim()} ajouté`);
    setAjout(false);
  }

  function acheterDuCatalogue(c: CatalogueEntry) {
    if (!ops || !c.achat?.possible) return;
    const r = acheter(systeme, fiche.etat, {
      achat: c.achat.achat,
      objet: c.entree.id,
      date: new Date().toISOString(),
    });
    if (!r.ok) {
      toast.error(r.erreur);
      return;
    }
    ops.acheter(c.achat.achat, c.entree.id, r.etat);
    toast.success(
      `${c.entree.nom} acheté (${c.achat.cout} ${systeme.monnaies.get(c.achat.monnaie)?.nom ?? ''})`,
    );
  }

  function deplacerDossier(f: InventoryFolder, sens: -1 | 1) {
    const i = folders.findIndex((x) => x.id === f.id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= folders.length) return;
    const suivants = [...folders];
    [suivants[i], suivants[j]] = [suivants[j]!, suivants[i]!];
    dossiers(suivants);
  }

  function renommerDossier(f: InventoryFolder) {
    setSaisie({
      titre: 'Renommer le dossier',
      label: 'Nom du dossier',
      initial: f.name,
      type: 'texte',
      maxLength: 60,
      valider: 'Renommer',
      onValider: (name) => dossiers(folders.map((x) => (x.id === f.id ? { ...x, name } : x))),
    });
  }

  // ─── Clavier : flèches dans la grille, Suppr, Échap ────────────────────────

  function clavier(e: KeyboardEvent<HTMLDivElement>) {
    const tuiles = [...(grille.current?.querySelectorAll<HTMLElement>('[data-tile]') ?? [])];
    const i = tuiles.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape' && dossier && i >= 0) {
      e.preventDefault();
      sortirDuDossier();
      return;
    }
    if (i < 0) return;
    const aller = (j: number) => {
      e.preventDefault();
      tuiles[Math.max(0, Math.min(tuiles.length - 1, j))]?.focus();
    };
    switch (e.key) {
      case 'ArrowRight':
        return aller(i + 1);
      case 'ArrowLeft':
        return aller(i - 1);
      case 'ArrowDown':
        return aller(voisine(tuiles, i, 'bas'));
      case 'ArrowUp':
        return aller(voisine(tuiles, i, 'haut'));
      case 'Home':
        return aller(0);
      case 'End':
        return aller(tuiles.length - 1);
      case 'Delete':
      case 'Backspace': {
        const item = parCle(tuiles[i]!.dataset.tile ?? null);
        if (item?.possession && handlers.supprimer) {
          e.preventDefault();
          handlers.supprimer(item);
        }
      }
    }
  }

  function entrerDans(f: InventoryFolder) {
    setDossier(f.id);
    setFocus(null);
    // Le focus suit dans le dossier ouvert
    requestAnimationFrame(() =>
      grille.current?.querySelector<HTMLElement>('[data-tile]:not([data-tile="ajouter"])')?.focus(),
    );
  }

  function sortirDuDossier() {
    const quitte = dossier;
    setDossier(null);
    requestAnimationFrame(() =>
      (
        (quitte &&
          grille.current?.querySelector<HTMLElement>(`[data-tile="dossier:${quitte.id}"]`)) ??
        grille.current?.querySelector<HTMLElement>('[data-tile]')
      )?.focus(),
    );
  }

  const detail = parCle(ouvert?.cle ?? null);
  const aDonner = parCle(don);
  const aSupprimer = parCle(suppression);

  // Clés des tuiles, dans l'ordre : la première reçoit le focus au clavier par défaut
  const cles = [
    ...(editable ? ['ajouter'] : []),
    ...dossiersVisibles.map((f) => `dossier:${f.id}`),
    ...visibles.map((i) => i.cle),
  ];
  const cleFocus = focus && cles.includes(focus) ? focus : (cles[0] ?? null);

  const tuileObjet = (item: InventoryItem) => (
    <ItemTile
      key={item.cle}
      item={item}
      icone={iconeObjet(regles, item)}
      image={presentation?.images[item.entree.id]}
      meta={metas.get(item.cle) ?? null}
      focusable={item.cle === cleFocus}
      deplacable={deplacable && Boolean(item.possession)}
      onFocusTile={() => setFocus(item.cle)}
      onOpen={() => handlers.ouvrir(item)}
      onMenu={(x, y) => mode === 'read' && setMenu({ item, x, y })}
    />
  );

  function contenu(): ReactNode {
    if (inv.items.length === 0 && !folders.length && !editable)
      return (
        <EtatVide
          icone={Package}
          titre="Inventaire vide"
          description={`Aucun élément parmi : ${nomsSortes(systeme, widget.sortes)}.`}
          className="px-4 py-8"
        />
      );
    const debut = (
      <>
        {editable && (
          <AddTile
            onClick={() => setAjout(true)}
            focusable={cleFocus === 'ajouter'}
            onFocusTile={() => setFocus('ajouter')}
          />
        )}
        {dossiersVisibles.map((f) => (
          <FolderTile
            key={f.id}
            id={f.id}
            nom={f.name}
            nombre={inv.items.filter((i) => i.folder?.id === f.id).length}
            focusable={cleFocus === `dossier:${f.id}`}
            deposable={deplacable}
            onFocusTile={() => setFocus(`dossier:${f.id}`)}
            onOpen={() => entrerDans(f)}
            onMenu={
              ops?.dossiers && mode === 'read'
                ? (x, y) => setMenuDossier({ folder: f, x, y })
                : undefined
            }
            onDeposer={(cle) => {
              const item = parCle(cle);
              if (item) rangerObjet(item, f.id);
            }}
          />
        ))}
      </>
    );
    const vide =
      visibles.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {recherche ? (
            <>
              Aucun objet ne correspond à « {terme} ».{' '}
              <Button variant="link" size="sm" className="h-auto" onClick={() => setTerme('')}>
                Effacer la recherche
              </Button>
            </>
          ) : filtreActif !== TOUT ? (
            'Rien dans cette catégorie.'
          ) : dossier ? (
            'Dossier vide : déposez-y un objet, ou rangez-le depuis son menu.'
          ) : inv.items.length === 0 ? (
            'Inventaire vide.'
          ) : null}
        </p>
      ) : null;

    if (!parCategorie)
      return (
        <>
          <div className={GRILLE}>
            {debut}
            {visibles.map(tuileObjet)}
          </div>
          {vide}
        </>
      );
    // Catégories : une section par catégorie présente, dans l'ordre du système
    const sections = inv.categories
      .map((c) => ({ c, items: visibles.filter((i) => i.categorie.cle === c.cle) }))
      .filter((s) => s.items.length > 0);
    return (
      <>
        {(editable || dossiersVisibles.length > 0) && <div className={GRILLE}>{debut}</div>}
        {sections.map(({ c, items }) => (
          <section key={c.cle} aria-label={c.nom} className="mt-3">
            <h3 className="sticky top-0 z-10 mb-2 flex items-center gap-2 bg-card py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {c.nom}
              <span className="font-mono tabular-nums text-subtle">{items.length}</span>
              <span aria-hidden className="h-px flex-1 bg-border" />
            </h3>
            <div className={GRILLE}>{items.map(tuileObjet)}</div>
          </section>
        ))}
        {vide}
      </>
    );
  }

  const deposerRacine = {
    onDragOver: (e: DragEvent) => {
      if (!deplacable || !e.dataTransfer.types.includes(GLISSER_OBJET)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setRacineSurvolee(true);
    },
    onDragLeave: () => setRacineSurvolee(false),
    onDrop: (e: DragEvent) => {
      setRacineSurvolee(false);
      const item = parCle(e.dataTransfer.getData(GLISSER_OBJET) || null);
      if (!item) return;
      e.preventDefault();
      rangerObjet(item, null);
    },
  };

  return (
    <section
      aria-label={widget.titre}
      className="relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-surface [container-type:inline-size]"
    >
      {/* Fond à petits points, comme le lanceur de dés (les tuiles restent unies et opaques) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-dots opacity-70 mask-radial"
      />

      {sortesInconnues.length > 0 && (
        <p className="mx-2.5 mb-1.5 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          Sortes inconnues du système : {sortesInconnues.join(', ')}
        </p>
      )}

      {(inv.items.length > 0 || folders.length > 0 || editable) && (
        <div
          className={cn(
            'flex shrink-0 items-center gap-1.5 px-2.5 pb-1.5 pt-2.5',
            mode === 'edit' && 'pointer-events-none',
          )}
        >
          <div className="min-w-0 flex-1 sm:max-w-64">
            <InputGroup
              avant={<Search />}
              apres={
                terme ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-6"
                    onClick={() => setTerme('')}
                    aria-label="Effacer la recherche"
                  >
                    <X />
                  </Button>
                ) : undefined
              }
              placeholder="Rechercher…"
              aria-label={`Rechercher dans ${widget.titre}`}
              value={terme}
              onChange={(e) => setTerme(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setTerme('');
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  grille.current?.querySelector<HTMLElement>('[data-tile]')?.focus();
                }
              }}
              className="h-8 text-[13px] [@media(pointer:coarse)]:h-11"
            />
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Affichage : trier, filtrer, regrouper"
                title="Trier, filtrer, regrouper"
                className={cn(
                  'relative [@media(pointer:coarse)]:size-11',
                  filtreActif !== TOUT && 'text-primary',
                )}
              >
                <SlidersHorizontal />
                {filtreActif !== TOUT && (
                  <span
                    aria-hidden
                    className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
                  />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Trier par
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={tri} onValueChange={(v) => setTri(v as Tri)}>
                {TRIS.map((t) => (
                  <DropdownMenuRadioItem key={t.cle} value={t.cle}>
                    {t.nom}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={parCategorie}
                onCheckedChange={(v) => setParCategorie(v === true)}
              >
                Regrouper par catégorie
              </DropdownMenuCheckboxItem>
              {inv.categories.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Catégorie
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={filtreActif} onValueChange={setFiltre}>
                    <DropdownMenuRadioItem value={TOUT}>Toutes</DropdownMenuRadioItem>
                    {inv.categories.map((c) => (
                      <DropdownMenuRadioItem key={c.cle} value={c.cle}>
                        <span className="flex-1 truncate">{c.nom}</span>
                        <span className="ml-2 font-mono text-[10px] text-subtle">
                          {inv.items.filter((i) => i.categorie.cle === c.cle).length}
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {editable && ops?.dossiers && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Nouveau dossier"
              title="Nouveau dossier"
              onClick={() => creerDossier()}
              className="[@media(pointer:coarse)]:size-11"
            >
              <FolderPlus />
            </Button>
          )}
        </div>
      )}

      {dossier && !aplati && (
        <nav
          aria-label="Fil d’Ariane"
          className="flex shrink-0 items-center gap-1 px-2.5 pb-1.5 text-xs"
        >
          <button
            type="button"
            onClick={sortirDuDossier}
            {...deposerRacine}
            className={cn(
              'inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors duration-150 hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11',
              racineSurvolee && 'bg-surface-3 text-foreground ring-1 ring-primary/60',
            )}
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            {widget.titre}
          </button>
          <ChevronRight aria-hidden className="size-3.5 text-subtle" />
          <span aria-current="page" className="truncate font-medium text-foreground">
            {dossier.name}
          </span>
        </nav>
      )}

      <div
        ref={grille}
        onKeyDown={clavier}
        className={cn(
          'relative min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5 pt-1 [scrollbar-width:thin]',
          mode === 'edit' && 'pointer-events-none',
        )}
      >
        {contenu()}
      </div>

      <Pied inv={inv} />

      {mode === 'read' && (
        <>
          <ContextMenu
            cible={menu}
            onClose={() => setMenu(null)}
            handlers={handlers}
            folders={folders}
          />
          <AnchoredMenu
            position={menuDossier}
            onClose={() => setMenuDossier(null)}
            className="w-52"
          >
            {menuDossier && (
              <>
                <DropdownMenuLabel className="truncate text-xs font-medium text-muted-foreground">
                  {menuDossier.folder.name}
                </DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => entrerDans(menuDossier.folder)}>
                  <ArrowRight /> Ouvrir
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => renommerDossier(menuDossier.folder)}>
                  <Pencil /> Renommer…
                </DropdownMenuItem>
                {folders[0]?.id !== menuDossier.folder.id && (
                  <DropdownMenuItem onSelect={() => deplacerDossier(menuDossier.folder, -1)}>
                    <ArrowLeft /> Placer avant
                  </DropdownMenuItem>
                )}
                {folders[folders.length - 1]?.id !== menuDossier.folder.id && (
                  <DropdownMenuItem onSelect={() => deplacerDossier(menuDossier.folder, 1)}>
                    <ArrowRight /> Placer après
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setDossierSupprime(menuDossier.folder)}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 /> Supprimer…
                </DropdownMenuItem>
              </>
            )}
          </AnchoredMenu>
          <ItemPanel
            fiche={fiche}
            item={detail}
            section={ouvert?.section ?? null}
            image={detail ? presentation?.images[detail.entree.id] : undefined}
            mj={ctx.mj === true}
            folders={folders}
            handlers={handlers}
            writes={writes}
            onClose={() => setOuvert(null)}
          />
          <GiveDialog
            item={aDonner}
            personnage={personnage}
            onDonner={donner}
            onClose={() => setDon(null)}
          />
          <ConfirmDialog
            ouvert={aSupprimer !== null}
            titre={`Supprimer ${aSupprimer?.nom ?? ''} ?`}
            description={
              aSupprimer && aSupprimer.quantite > 1
                ? `Les ${aSupprimer.quantite} unités quittent l’inventaire. Vous pourrez annuler juste après.`
                : 'L’objet quitte l’inventaire, avec ses valeurs et bonus propres. Vous pourrez annuler juste après.'
            }
            confirmer="Supprimer"
            onConfirmer={() => aSupprimer && supprimer(aSupprimer)}
            onClose={() => setSuppression(null)}
          />
          <ConfirmDialog
            ouvert={dossierSupprime !== null}
            titre={`Supprimer le dossier « ${dossierSupprime?.name ?? ''} » ?`}
            description="Les objets qu’il contient restent dans l’inventaire, hors dossier."
            confirmer="Supprimer le dossier"
            onConfirmer={() => {
              if (!dossierSupprime) return;
              if (dossier?.id === dossierSupprime.id) setDossier(null);
              dossiers(folders.filter((f) => f.id !== dossierSupprime.id));
              toast(`Dossier « ${dossierSupprime.name} » supprimé`);
            }}
            onClose={() => setDossierSupprime(null)}
          />
          <PromptDialog saisie={saisie} onClose={() => setSaisie(null)} />
          {editable && (
            <AddDialog
              open={ajout}
              onOpenChange={setAjout}
              fiche={fiche}
              widget={widget}
              presentation={presentation}
              onAjouter={ajouterDuCatalogue}
              onAcheter={acheterDuCatalogue}
              onLibre={ajouterObjetLibre}
              dossierOuvert={dossier?.id ?? null}
              mj={ctx.mj === true}
            />
          )}
        </>
      )}
    </section>
  );
}

function nomsSortes(systeme: SheetBlockProps['ctx']['systeme'], sortes: string[]): string {
  return sortes
    .map((s) => systeme.sortes.get(s))
    .map((s) => (s ? (s.nomPluriel ?? s.nom).toLowerCase() : null))
    .filter(Boolean)
    .join(', ');
}

/** Monnaies des achats de ces sortes et charge déclarée par le système. */
function Pied({ inv }: Readonly<{ inv: Inventory }>) {
  const { monnaies, charge } = inv;
  if (!monnaies.length && !charge.charges.length) return null;
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-2.5 py-1.5 text-xs">
      {monnaies.map((m) => (
        <span key={m.monnaie.id} className="flex items-center gap-1.5 text-muted-foreground">
          <Coins aria-hidden className="size-3.5 text-primary" />
          {m.monnaie.nom}
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {m.solde}
          </span>
        </span>
      ))}
      {charge.charges.map((c) => {
        const exces = c.limite ? c.valeur > c.limite.valeur : false;
        return (
          <div key={c.cle} className="flex min-w-[10rem] flex-1 items-center gap-2">
            <span className="shrink-0 text-muted-foreground">{c.nom}</span>
            {c.limite && (
              <Progress
                valeur={c.limite.valeur > 0 ? (c.valeur / c.limite.valeur) * 100 : 100}
                ton={exces ? 'danger' : 'primaire'}
                label={`${c.nom} : ${c.valeur} sur ${c.limite.valeur} (${c.limite.nom})`}
                className="min-w-12 flex-1"
              />
            )}
            <span
              className={cn(
                'shrink-0 font-mono font-semibold tabular-nums',
                exces ? 'text-destructive' : 'text-foreground',
              )}
              title={c.limite?.nom}
            >
              {c.valeur}
              {c.limite && <span className="font-normal text-subtle"> / {c.limite.valeur}</span>}
            </span>
            {c.alertes.map((a) => (
              <Badge key={a.cle} ton="alerte">
                {a.nom}
                {typeof a.valeur === 'number' ? ` ${a.valeur}` : ''}
              </Badge>
            ))}
          </div>
        );
      })}
    </footer>
  );
}
