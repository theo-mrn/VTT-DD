'use client';

/**
 * Bloc Inventaire : possessions des sortes déclarées par le widget (objets, armes,
 * armures…), en catégories (sortes, ou valeurs de `groupeChamp`), avec recherche,
 * quantités, exemplaires, état équipé, bonus des effets, détail, ajout depuis le catalogue
 * et retrait. Monnaies et charge seulement si le système en déclare pour ces sortes.
 *
 * Générique : tout vient du système chargé et du widget, aucune clé de jeu. Toute écriture
 * passe par `ctx.operations` (absent : lecture seule).
 */
import { acheter } from '@vtt/rules';
import { ChevronDown, Coins, Package, Plus, Search, TriangleAlert, X } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { EtatVide } from '@/components/commun/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';
import { AddDialog } from './add-dialog';
import { ItemDialog } from './item-dialog';
import { ItemCard, ItemRow } from './item-views';
import {
  ajouter,
  ajouterLibre,
  basculerActif,
  buildInventory,
  changerChamps,
  changerQuantite,
  correspond,
  nouvelExemplaireDe,
  retirer,
  type CatalogueEntry,
  type Categorie,
  type Ecriture,
  type Inventory,
  type InventoryItem,
  type ModeleLibre,
  type SaisieLibre,
} from './model';
import type { ItemActions } from './parts';
import { useWidth } from './use-width';

/** En dessous : liste compacte ; au-dessus : grille de cartes. */
const LARGEUR_CARTES = 440;
const TOUT = '*';

function InventoryBlock({ ctx, widget, mode }: SheetBlockProps<'inventaire'>) {
  const { fiche, systeme, presentation } = ctx;
  const ops = mode === 'read' ? ctx.operations : undefined;
  const editable = Boolean(ops);
  const racine = useRef<HTMLElement>(null);
  const largeur = useWidth(racine);
  const compact = largeur !== null && largeur < LARGEUR_CARTES;

  const inv = useMemo(() => buildInventory(fiche, widget, ctx.mj), [fiche, widget, ctx.mj]);
  const [terme, setTerme] = useState('');
  const [onglet, setOnglet] = useState(TOUT);
  const [replies, setReplies] = useState<Set<string>>(new Set());
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);

  const sortesInconnues = widget.sortes.filter((s) => !systeme.sortes.has(s));
  const categorieActive = inv.categories.some((c) => c.cle === onglet) ? onglet : TOUT;
  const detail = inv.items.find((i) => i.cle === ouvert) ?? null;

  function ecrire(w: Ecriture) {
    ops?.possession(w.demande, w.apercu);
  }

  const actions: ItemActions = {
    ouvrir: (item) => mode === 'read' && setOuvert(item.cle),
    ...(ops
      ? {
          quantite: (item: InventoryItem, q: number) =>
            q >= 1 && ecrire(changerQuantite(fiche.etat, item, q)),
          actif: (item: InventoryItem, actif: boolean) =>
            ecrire(basculerActif(fiche.etat, item, actif)),
          exemplaire: (item: InventoryItem) => {
            // Un objet personnalisé garde son nom et sa catégorie
            ecrire(
              nouvelExemplaireDe(
                fiche.etat,
                item.entree.id,
                item.entree.libre ? item.possession?.champs : undefined,
              ),
            );
            toast.success(`Nouvel exemplaire : ${item.nom}`);
          },
          retirer: (item: InventoryItem) => {
            const r = retirer(fiche.etat, item);
            ops.retirerPossession(r.entree, r.exemplaire, r.apercu);
            if (ouvert === item.cle) setOuvert(null);
          },
        }
      : {}),
  };

  function ajouterDuCatalogue(c: CatalogueEntry) {
    if (!ops || c.bloque) return;
    ecrire(ajouter(systeme, fiche.etat, c.entree.id));
    toast.success(`${c.entree.nom} ajouté`);
  }

  function ajouterObjetLibre(modele: ModeleLibre, saisie: SaisieLibre) {
    if (!ops) return;
    ecrire(ajouterLibre(fiche.etat, modele, saisie));
    toast.success(`${saisie.nom.trim()} ajouté`);
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

  const filtres = inv.items.filter((i) => correspond(i, terme));
  const sections = inv.categories
    .map((c) => ({ categorie: c, items: filtres.filter((i) => i.categorie.cle === c.cle) }))
    .filter((s) => s.items.length > 0);
  const plusieurs = inv.categories.length > 1;

  function liste(items: InventoryItem[], avecCategorie: boolean) {
    const props = (item: InventoryItem) => ({
      item,
      image: presentation?.images[item.entree.id],
      avecCategorie,
      actions,
      editable,
    });
    return compact ? (
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <ItemRow key={item.cle} {...props(item)} />
        ))}
      </ul>
    ) : (
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(13rem, 1fr))' }}
      >
        {items.map((item) => (
          <ItemCard key={item.cle} {...props(item)} />
        ))}
      </div>
    );
  }

  function contenu(cle: string) {
    if (inv.items.length === 0)
      return (
        <EtatVide
          icone={Package}
          titre="Inventaire vide"
          description={`Aucun élément parmi : ${nomsSortes(ctx.systeme, widget.sortes)}.`}
          className="px-4 py-8"
          action={
            editable ? (
              <Button size="sm" onClick={() => setAjout(true)}>
                <Plus /> Ajouter un objet
              </Button>
            ) : undefined
          }
        />
      );
    if (filtres.length === 0)
      return (
        <div className="flex flex-col items-center py-8 text-center">
          <Search className="mb-2 size-6 text-subtle" />
          <p className="text-sm font-medium">Aucun objet ne correspond à « {terme} »</p>
          <Button variant="link" size="sm" onClick={() => setTerme('')}>
            Effacer la recherche
          </Button>
        </div>
      );
    if (cle !== TOUT) {
      const items = filtres.filter((i) => i.categorie.cle === cle);
      return items.length ? (
        liste(items, false)
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Rien dans cette catégorie{terme ? ' pour cette recherche' : ''}.
        </p>
      );
    }
    if (!plusieurs) return liste(filtres, false);
    return (
      <div className="space-y-3">
        {sections.map(({ categorie, items }) => (
          <Section
            key={categorie.cle}
            categorie={categorie}
            nombre={items.length}
            replie={replies.has(categorie.cle) && !terme}
            onBasculer={() =>
              setReplies((r) => {
                const s = new Set(r);
                if (s.has(categorie.cle)) s.delete(categorie.cle);
                else s.add(categorie.cle);
                return s;
              })
            }
          >
            {liste(items, false)}
          </Section>
        ))}
      </div>
    );
  }

  return (
    <section
      ref={racine}
      aria-label={widget.titre}
      className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card shadow-surface"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="truncate">{widget.titre}</span>
          {inv.items.length > 0 && (
            <span className="text-xs font-normal text-subtle">{inv.items.length}</span>
          )}
        </h2>
        {editable && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setAjout(true)}
            aria-label={`Ajouter à ${widget.titre}`}
          >
            <Plus />
            {!compact && 'Ajouter'}
          </Button>
        )}
      </header>

      {sortesInconnues.length > 0 && (
        <p className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="size-3.5 shrink-0" />
          Sortes inconnues du système : {sortesInconnues.join(', ')}
        </p>
      )}

      <Tabs
        value={categorieActive}
        onValueChange={setOnglet}
        className={cn('flex min-h-0 flex-1 flex-col', mode === 'edit' && 'pointer-events-none')}
      >
        {inv.items.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pt-3">
            <div className={cn('min-w-0', compact ? 'w-full' : 'w-56 flex-none')}>
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
                onKeyDown={(e) => e.key === 'Escape' && setTerme('')}
                className="h-8 text-[13px]"
              />
            </div>
            {plusieurs && (
              <TabsList
                aria-label="Catégories"
                className="h-8 max-w-full justify-start overflow-x-auto [scrollbar-width:none]"
              >
                <TabsTrigger value={TOUT} className="text-xs">
                  Tout
                </TabsTrigger>
                {inv.categories.map((c) => (
                  <TabsTrigger key={c.cle} value={c.cle} className="text-xs">
                    {c.nom}
                    <span className="text-[10px] text-subtle">
                      {inv.items.filter((i) => i.categorie.cle === c.cle).length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:thin]">
          {/* Seul l'onglet actif est rendu (Radix démonte les autres) */}
          <TabsContent value={categorieActive} className="mt-0">
            {contenu(categorieActive)}
          </TabsContent>
        </div>
      </Tabs>

      <Pied inv={inv} />

      {mode === 'read' && (
        <>
          <ItemDialog
            fiche={fiche}
            item={detail}
            image={detail ? presentation?.images[detail.entree.id] : undefined}
            actions={actions}
            editable={editable}
            onChamps={
              ops ? (item, champs) => ecrire(changerChamps(fiche.etat, item, champs)) : undefined
            }
            onClose={() => setOuvert(null)}
          />
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

function Section({
  categorie,
  nombre,
  replie,
  onBasculer,
  children,
}: {
  categorie: Categorie;
  nombre: number;
  replie: boolean;
  onBasculer(): void;
  children: ReactNode;
}) {
  const id = `inventaire-${categorie.cle.replace(/[^\w-]/g, '_')}`;
  return (
    <section>
      <button
        type="button"
        onClick={onBasculer}
        aria-expanded={!replie}
        aria-controls={id}
        className="mb-2 flex w-full items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ChevronDown
          className={cn('size-3.5 text-subtle transition-transform', replie && '-rotate-90')}
        />
        <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">
          {categorie.nom}
        </span>
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-[11px] text-subtle">{nombre}</span>
      </button>
      <div id={id} hidden={replie}>
        {children}
      </div>
    </section>
  );
}

/** Monnaies des achats de ces sortes et charge déclarée par le système. */
function Pied({ inv }: { inv: Inventory }) {
  const { monnaies, charge } = inv;
  if (!monnaies.length && !charge.charges.length) return null;
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-xs">
      {monnaies.map((m) => (
        <span key={m.monnaie.id} className="flex items-center gap-1.5 text-muted-foreground">
          <Coins className="size-3.5 text-primary" />
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

export const inventoryBlock: SheetBlockDefinition<'inventaire'> = {
  type: 'inventaire',
  label: 'Inventaire',
  description: 'Objets, armes et équipement : quantités, équipé, bonus.',
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 3, h: 4 },
  Component: InventoryBlock,
};
