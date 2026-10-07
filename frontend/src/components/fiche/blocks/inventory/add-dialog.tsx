'use client';

/**
 * Ajout depuis le catalogue du système : entrées des sortes du widget, recherche,
 * filtre par catégorie. « Ajouter » ouvre la configuration de l'objet (item-config) sur le
 * même écran, avant l'écriture ; Échap ou Retour ramène au catalogue. Si un achat du système
 * donne l'entrée, achat au coût de l'achat dans sa monnaie. Et, si le système déclare une
 * entrée `libre` pour ces sortes, configuration d'un objet personnalisé.
 */
import { useTranslations } from 'next-intl';
import type { Fiche, Presentation } from '@vtt/rules';
import {
  AlertTriangle,
  ChevronDown,
  Coins,
  PenLine,
  Plus,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InputGroup } from '@/components/ui/input';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  bonusDe,
  buildCatalogue,
  champsAffiches,
  correspond,
  modeleDe,
  modelesLibres,
  monnaiesInventaire,
  type CatalogueEntry,
  type InventoryWidget,
  type ModeleLibre,
  type SaisieLibre,
} from './model';
import { ECHAP_LOCAL, echapLocal } from '../../bonus-editor/escape';
import { ItemConfig, type CibleAjout } from './item-config';
import { BonusBadges, Thumbnail } from './parts';

const LIMITE = 120;

export function AddDialog({
  open,
  onOpenChange,
  fiche,
  widget,
  presentation,
  onAcheter,
  onLibre,
  dossierOuvert = null,
  mj = false,
}: Readonly<{
  open: boolean;
  /** Dossier ouvert dans la grille, proposé par défaut. */
  dossierOuvert?: string | null;
  mj?: boolean;
  onOpenChange(open: boolean): void;
  fiche: Fiche;
  widget: InventoryWidget;
  presentation: Presentation | null;
  /** Ajout sans configuration (conservé pour l'appelant ; l'ajout passe par `onLibre`). */
  onAjouter?(entree: CatalogueEntry): void;
  onAcheter(entree: CatalogueEntry): void;
  /** Ajout d'un objet configuré, en une écriture (catalogue ou objet personnalisé). */
  onLibre(modele: ModeleLibre, saisie: SaisieLibre): void;
}>) {
  const [cible, setCible] = useState<CibleAjout | null>(null);
  // Recherche et catégorie gardées au retour de la configuration
  const [terme, setTerme] = useState('');
  const [categorie, setCategorie] = useState<string | null>(null);
  const ouvrir = (o: boolean) => {
    if (!o) {
      setCible(null);
      setTerme('');
      setCategorie(null);
    }
    onOpenChange(o);
  };
  return (
    <Dialog open={open} onOpenChange={ouvrir}>
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (echapLocal(e)) e.preventDefault();
          else if (cible) {
            e.preventDefault();
            setCible(null);
          }
        }}
        className="flex max-h-[min(44rem,calc(100dvh-2rem))] flex-col gap-4 overflow-hidden sm:max-w-2xl"
      >
        {open &&
          (cible ? (
            <ItemConfig
              fiche={fiche}
              cible={cible}
              presentation={presentation}
              dossierOuvert={dossierOuvert}
              mj={mj}
              onRetour={() => setCible(null)}
              onAjouter={(m, s) => {
                onLibre(m, s);
                setCible(null);
              }}
            />
          ) : (
            <Catalogue
              fiche={fiche}
              widget={widget}
              presentation={presentation}
              terme={terme}
              onTerme={setTerme}
              categorie={categorie}
              onCategorie={setCategorie}
              onConfigurer={setCible}
              onAcheter={onAcheter}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

function Catalogue({
  fiche,
  widget,
  presentation,
  terme,
  onTerme: setTerme,
  categorie,
  onCategorie: setCategorie,
  onConfigurer,
  onAcheter,
}: Readonly<{
  fiche: Fiche;
  widget: InventoryWidget;
  presentation: Presentation | null;
  terme: string;
  onTerme(t: string): void;
  categorie: string | null;
  onCategorie(c: string | null): void;
  onConfigurer(cible: CibleAjout): void;
  onAcheter(entree: CatalogueEntry): void;
}>) {
  const t = useTranslations();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const modeles = useMemo(() => modelesLibres(fiche, widget), [fiche, widget]);
  const libre = (nom?: string) =>
    onConfigurer({ modeles, libre: true, ...(nom?.trim() ? { nom: nom.trim() } : {}) });
  const recherche = useDeferredValue(terme);
  const catalogue = useMemo(() => buildCatalogue(fiche, widget), [fiche, widget]);
  const categories = useMemo(() => {
    const r = new Map<string, { nom: string; n: number }>();
    for (const c of catalogue) {
      const x = r.get(c.categorie.cle);
      r.set(c.categorie.cle, { nom: c.categorie.nom, n: (x?.n ?? 0) + 1 });
    }
    return [...r];
  }, [catalogue]);
  const filtres = catalogue.filter(
    (c) => (!categorie || c.categorie.cle === categorie) && correspond(c, recherche),
  );
  const soldes = useMemo(() => monnaiesInventaire(fiche, widget.sortes), [fiche, widget]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ajouter à « {widget.titre} »</DialogTitle>
        <DialogDescription>
          Catalogue {fiche.systeme.source.nom} ·{' '}
          {widget.sortes
            .map((s) => fiche.systeme.sortes.get(s))
            .map((s) => s?.nomPluriel ?? s?.nom)
            .filter(Boolean)
            .join(', ')}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup
            avant={<Search />}
            placeholder={t('sheet.inventory.searchCatalog')}
            aria-label={t('sheet.inventory.searchCatalogLabel')}
            value={terme}
            autoFocus
            {...(terme ? ECHAP_LOCAL : {})}
            onChange={(e) => setTerme(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && terme) {
                e.preventDefault();
                e.stopPropagation();
                setTerme('');
              }
            }}
            className="h-9"
          />
          {modeles.length > 0 && (
            <Button variant="secondary" size="sm" className="shrink-0" onClick={() => libre(terme)}>
              <PenLine /> Objet personnalisé
            </Button>
          )}
          {soldes.map((s) => (
            <span
              key={s.monnaie.id}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-2.5 py-1.5 text-xs text-muted-foreground"
            >
              <Coins className="size-3.5 text-primary" />
              {s.monnaie.nom}
              <span className="font-mono font-semibold text-foreground">{s.solde}</span>
            </span>
          ))}
        </div>
        {categories.length > 1 && (
          <div
            role="group"
            aria-label={t('sheet.inventory.categories')}
            className="flex flex-wrap gap-1.5"
          >
            <Chip actif={categorie === null} onClick={() => setCategorie(null)}>
              Tout <span className="text-subtle">{catalogue.length}</span>
            </Chip>
            {categories.map(([cle, c]) => (
              <Chip key={cle} actif={categorie === cle} onClick={() => setCategorie(cle)}>
                {c.nom} <span className="text-subtle">{c.n}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-width:thin]">
        {filtres.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Search className="mb-3 size-8 text-subtle" />
            <p className="text-sm font-medium">{t('sheet.inventory.noEntry')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {catalogue.length === 0
                ? t('sheet.inventory.noEntryKinds')
                : t('sheet.inventory.tryAnother')}
            </p>
            {modeles.length > 0 && terme.trim() && (
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => libre(terme)}>
                <PenLine /> Créer « {terme.trim()} » comme objet personnalisé
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtres.slice(0, LIMITE).map((c) => (
              <Ligne
                key={c.entree.id}
                fiche={fiche}
                c={c}
                image={presentation?.images[c.entree.id]}
                avecCategorie={categorie === null && categories.length > 1}
                ouverte={ouverte === c.entree.id}
                onBasculer={() => setOuverte((o) => (o === c.entree.id ? null : c.entree.id))}
                onAjouter={() =>
                  onConfigurer({
                    modeles: [modeleDe(fiche, widget, c.entree, c.sorte)],
                    libre: false,
                  })
                }
                onAcheter={() => onAcheter(c)}
              />
            ))}
          </ul>
        )}
        {filtres.length > LIMITE && (
          <p className="py-3 text-center text-xs text-subtle">
            {filtres.length - LIMITE} autres entrées : affinez la recherche.
          </p>
        )}
      </div>
    </>
  );
}

function Chip({
  actif,
  onClick,
  children,
}: Readonly<{
  actif: boolean;
  onClick(): void;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        actif
          ? 'border-primary/40 bg-primary/10 text-primary-strong'
          : 'border-border-strong text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Ligne({
  fiche,
  c,
  image,
  avecCategorie,
  ouverte,
  onBasculer,
  onAjouter,
  onAcheter,
}: Readonly<{
  fiche: Fiche;
  c: CatalogueEntry;
  image?: string;
  avecCategorie: boolean;
  ouverte: boolean;
  onBasculer(): void;
  onAjouter(): void;
  onAcheter(): void;
}>) {
  const t = useTranslations();
  const monnaie = c.achat ? fiche.systeme.monnaies.get(c.achat.monnaie) : undefined;
  const idDetail = `catalogue-${c.entree.id}`;
  const ajoutUnite = c.sorte.quantites && c.possede > 0;
  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <Thumbnail image={image} sorte={c.sorte} />
        <button
          type="button"
          onClick={onBasculer}
          aria-expanded={ouverte}
          aria-controls={idDetail}
          className="group min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium group-hover:text-primary">
              {c.entree.nom}
            </span>
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 text-subtle transition-transform',
                ouverte && 'rotate-180',
              )}
            />
            {c.possede > 0 && (
              <Badge ton="succes" className="shrink-0">
                possédé{c.possede > 1 ? ` ×${c.possede}` : ''}
              </Badge>
            )}
            {c.exigeNonRempli && (
              <Info texte={t('sheet.inventory.prereqMissing')}>
                <AlertTriangle
                  className="size-3.5 shrink-0 text-warning"
                  aria-label={t('sheet.inventory.prereqMissing')}
                />
              </Info>
            )}
          </span>
          {(avecCategorie || c.entree.description) && (
            <span className="block truncate text-xs text-subtle">
              {[avecCategorie ? c.categorie.nom : null, c.entree.description]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {c.achat && monnaie && (
            <Info
              texte={
                c.achat.possible
                  ? `${c.achat.cout} ${monnaie.nom}`
                  : c.achat.blocages.map((b) => b.message).join(' · ')
              }
            >
              <span>
                <Button
                  size="xs"
                  disabled={!c.achat.possible}
                  onClick={onAcheter}
                  aria-label={t('sheet.inventory.buyFor', {
                    name: c.entree.nom,
                    price: `${c.achat.cout} ${monnaie.nom}`,
                  })}
                >
                  <ShoppingCart />
                  {c.achat.cout}
                </Button>
              </span>
            </Info>
          )}
          <Info
            texte={
              c.bloque ??
              (ajoutUnite ? t('sheet.inventory.unitsOrCopy') : t('sheet.inventory.configureFree'))
            }
          >
            <span>
              <Button
                variant="secondary"
                size="xs"
                disabled={Boolean(c.bloque)}
                onClick={onAjouter}
                aria-label={`Ajouter ${c.entree.nom}`}
              >
                <Plus />
                <span className="hidden sm:inline">{t('common.actions.add')}</span>
              </Button>
            </span>
          </Info>
        </div>
      </div>
      {ouverte && <Detail id={idDetail} fiche={fiche} c={c} />}
    </li>
  );
}

function Detail({ id, fiche, c }: Readonly<{ id: string; fiche: Fiche; c: CatalogueEntry }>) {
  const champs = champsAffiches(fiche, c.entree, c.sorte).filter((x) => x.valeur !== '—');
  const bonus = bonusDe(fiche, c.entree, c.sorte, undefined, undefined);
  return (
    <div id={id} className="mt-2 space-y-2 rounded-lg bg-surface-2/50 p-3 pl-12">
      {c.entree.description && (
        <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {c.entree.description}
        </p>
      )}
      <BonusBadges bonus={bonus} />
      {champs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {champs.map((x) => (
            <Badge key={x.champ.id}>
              {x.champ.nom} : <span className="text-foreground">{x.valeur}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
