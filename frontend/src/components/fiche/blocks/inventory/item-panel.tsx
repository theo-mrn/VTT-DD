'use client';

/**
 * Détail d'un objet, modifiable sur place : nom, quantité, équipé, visibilité, dossier,
 * description, formules (dés d'une arme : formule libre vérifiée en direct, avec l'aperçu
 * pour ce personnage), caractéristiques propres de l'exemplaire, bonus (ajouter, activer,
 * retirer), puis nouvel exemplaire, don et suppression. Tout vient de la sorte : aucun
 * champ nommé.
 */
import {
  compilerEffets,
  variablesSource,
  type Effet,
  type Fiche,
  type InventoryFolder,
} from '@vtt/rules';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Gift,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, styleChampBase } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ItemIcon, SectionTitle } from './item-icon';
import { actionsDe, type ItemHandlers, type SectionDetail } from './item-menu';
import {
  attributsBonus,
  basculerBonus,
  bonusPropres,
  champsAffiches,
  effetBonus,
  formulesDe,
  sansBonus,
  verifierFormule,
  type FormuleAffichee,
  type InventoryItem,
  type ValeurChamp,
} from './model';
import { BonusBadges } from './parts';

/** Écritures du détail (absentes : lecture seule). */
export interface PanelWrites {
  quantite(item: InventoryItem, q: number): void;
  champs(item: InventoryItem, champs: Record<string, ValeurChamp>): void;
  effets(item: InventoryItem, effets: Effet[]): void;
  renommer(item: InventoryItem, nom: string): void;
}

export function ItemPanel({
  fiche,
  item,
  section,
  image,
  mj,
  folders,
  handlers,
  writes,
  onClose,
}: {
  fiche: Fiche;
  item: InventoryItem | null;
  /** Section montrée à l'ouverture (dés et formules, bonus). */
  section?: SectionDetail | null | undefined;
  image?: string | undefined;
  mj: boolean;
  folders: InventoryFolder[];
  handlers: ItemHandlers;
  /** Absent : lecture seule. */
  writes?: PanelWrites | undefined;
  onClose(): void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(48rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {item && (
          <Contenu
            key={item.cle}
            fiche={fiche}
            item={item}
            section={section ?? null}
            image={image}
            mj={mj}
            folders={folders}
            handlers={handlers}
            writes={writes}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Contenu({
  fiche,
  item,
  section,
  image,
  mj,
  folders,
  handlers,
  writes,
  onClose,
}: {
  fiche: Fiche;
  item: InventoryItem;
  section: SectionDetail | null;
  image?: string | undefined;
  mj: boolean;
  folders: InventoryFolder[];
  handlers: ItemHandlers;
  writes?: PanelWrites | undefined;
  onClose(): void;
}) {
  const { entree, sorte, possession } = item;
  const corps = useRef<HTMLDivElement>(null);
  // Ouvert depuis « Dés et formule… » ou « Bonus… » : la section visée
  useEffect(() => {
    if (!section) return;
    const cible = corps.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    cible?.scrollIntoView({ block: 'start' });
  }, [section]);
  const a = actionsDe(item, writes ? handlers : { ouvrir: handlers.ouvrir });
  const w = writes && possession ? writes : undefined;
  const formules = formulesDe(fiche, item);
  const sousTitre = [
    item.nom !== entree.nom ? entree.nom : sorte.nom,
    item.categorie.nom !== (sorte.nomPluriel ?? sorte.nom) ? item.categorie.nom : null,
    item.exemplaireLabel ? `exemplaire ${item.exemplaireLabel}` : null,
    possession ? null : 'accordé par un autre élément de la fiche',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <DialogHeader className="shrink-0 gap-1 border-b border-border bg-popover px-5 pb-4 pt-5">
        <div className="flex min-w-0 items-center gap-3 pr-8">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
            <ItemIcon sorte={sorte} image={image} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <Nom
              item={item}
              onRenommer={a.renommer && w ? (n) => w.renommer(item, n) : undefined}
            />
            <DialogDescription className="truncate text-xs">{sousTitre}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div
        ref={corps}
        className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5"
      >
        <Reglages item={item} folders={folders} handlers={handlers} writes={w} />

        <Description item={item} writes={w} />

        {formules.length > 0 && (
          <section aria-label="Formules" data-section="formules" className="scroll-mt-24">
            <SectionTitle>
              {formules.some((f) => f.des) ? 'Dés et formules' : 'Formules'}
            </SectionTitle>
            <div className="space-y-3">
              {formules.map((f) => (
                <EditeurFormule key={f.champ.id} fiche={fiche} item={item} formule={f} writes={w} />
              ))}
            </div>
          </section>
        )}

        <Caracteristiques fiche={fiche} item={item} writes={w} />

        <Bonus fiche={fiche} item={item} mj={mj} writes={w} />
      </div>

      {(a.exemplaire || a.donner || a.supprimer) && (
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-popover px-5 py-3">
          {a.exemplaire && (
            <Button variant="ghost" size="sm" onClick={() => a.exemplaire!(item)}>
              <Copy /> Nouvel exemplaire
            </Button>
          )}
          {a.donner && (
            <Button variant="secondary" size="sm" onClick={() => a.donner!(item)}>
              <Gift /> Donner…
            </Button>
          )}
          {a.supprimer && (
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto"
              onClick={() => {
                a.supprimer!(item);
                onClose();
              }}
            >
              <Trash2 /> Supprimer…
            </Button>
          )}
        </footer>
      )}
    </>
  );
}

/** Nom de l'objet, renommable sur place (champ `nomExemplaire` de la sorte). */
function Nom({ item, onRenommer }: { item: InventoryItem; onRenommer?: (nom: string) => void }) {
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState(item.nom);
  if (edition && onRenommer)
    return (
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (nom.trim()) onRenommer(nom.trim());
          setEdition(false);
        }}
      >
        <DialogTitle className="sr-only">{item.nom}</DialogTitle>
        <Input
          autoFocus
          aria-label="Nom de l’objet"
          value={nom}
          maxLength={200}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEdition(false);
            }
          }}
          className="h-8 px-2 font-display text-base"
        />
        <Button type="submit" size="icon-xs" aria-label="Enregistrer le nom">
          <Check />
        </Button>
      </form>
    );
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <DialogTitle className="truncate font-display text-lg">{item.nom}</DialogTitle>
      {onRenommer && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Renommer"
          onClick={() => {
            setNom(item.nom);
            setEdition(true);
          }}
        >
          <Pencil />
        </Button>
      )}
    </div>
  );
}

/** Quantité, équipé, visibilité, dossier, poids : réglages rapides. */
function Reglages({
  item,
  folders,
  handlers,
  writes,
}: {
  item: InventoryItem;
  folders: InventoryFolder[];
  handlers: ItemHandlers;
  writes?: PanelWrites | undefined;
}) {
  const id = useId();
  const a = actionsDe(item, writes ? handlers : { ouvrir: handlers.ouvrir });
  const cases: ReactNode[] = [];
  if (item.sorte.quantites)
    cases.push(
      <Case key="q" titre="Quantité" htmlFor={`${id}-q`}>
        {writes ? (
          <Quantite item={item} id={`${id}-q`} onChange={(q) => writes.quantite(item, q)} />
        ) : (
          <span className="font-mono text-sm tabular-nums">×{item.quantite}</span>
        )}
      </Case>,
    );
  if (item.sorte.activable)
    cases.push(
      <Case key="a" titre={item.actif ? 'Équipé' : 'Rangé'} htmlFor={`${id}-a`}>
        <span className="flex items-center gap-2">
          <ShieldCheck
            aria-hidden
            className={cn('size-4', item.actif ? 'text-success' : 'text-subtle')}
          />
          <Switch
            id={`${id}-a`}
            checked={item.actif}
            disabled={!a.equiper}
            onCheckedChange={(v) => a.equiper?.(item, v)}
          />
        </span>
      </Case>,
    );
  if (a.cacher || item.hidden)
    cases.push(
      <Case
        key="h"
        titre={item.hidden ? 'Caché aux autres joueurs' : 'Visible des autres joueurs'}
        htmlFor={`${id}-h`}
      >
        <span className="flex items-center gap-2">
          {item.hidden ? (
            <EyeOff aria-hidden className="size-4 text-subtle" />
          ) : (
            <Eye aria-hidden className="size-4 text-subtle" />
          )}
          <Switch
            id={`${id}-h`}
            checked={!item.hidden}
            disabled={!a.cacher}
            onCheckedChange={(v) => a.cacher?.(item, !v)}
          />
        </span>
      </Case>,
    );
  if (a.ranger && (folders.length > 0 || item.folder))
    cases.push(
      <Case key="d" titre="Dossier" htmlFor={`${id}-d`}>
        <select
          id={`${id}-d`}
          value={item.folder?.id ?? ''}
          onChange={(e) => a.ranger!(item, e.target.value || null)}
          className={cn(styleChampBase, 'h-8 max-w-40 px-2 text-xs')}
        >
          <option value="">Sans dossier</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Case>,
    );
  if (item.poids)
    cases.push(
      <Case key="p" titre={item.poids.champ.nom}>
        <span className="font-mono text-sm tabular-nums">
          {item.poids.unitaire * item.quantite}
          {item.quantite > 1 && (
            <span className="ml-1 text-xs text-subtle">
              ({item.poids.unitaire} × {item.quantite})
            </span>
          )}
        </span>
      </Case>,
    );
  if (!cases.length) return null;
  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border sm:grid-cols-2 [&>*]:border-b [&>*]:border-border sm:[&>*:nth-child(odd)]:border-r">
      {cases}
    </div>
  );
}

function Case({
  titre,
  htmlFor,
  children,
}: {
  titre: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="-mb-px flex min-h-12 items-center justify-between gap-3 px-3 py-2">
      <label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {titre}
      </label>
      {children}
    </div>
  );
}

/** Quantité : −, champ numérique, + ; au moins 1 (retirer l'objet : Supprimer). */
function Quantite({
  item,
  id,
  onChange,
}: {
  item: InventoryItem;
  id: string;
  onChange(q: number): void;
}) {
  const [saisie, setSaisie] = useState(String(item.quantite));
  const valider = () => {
    const q = Math.floor(Number(saisie));
    if (Number.isFinite(q) && q >= 1 && q !== item.quantite) onChange(q);
    else setSaisie(String(item.quantite));
  };
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Une unité de moins"
        disabled={item.quantite <= 1}
        onClick={() => {
          onChange(item.quantite - 1);
          setSaisie(String(item.quantite - 1));
        }}
      >
        <Minus />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => e.key === 'Enter' && valider()}
        className="h-8 w-16 px-2 text-center font-mono tabular-nums"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Une unité de plus"
        onClick={() => {
          onChange(item.quantite + 1);
          setSaisie(String(item.quantite + 1));
        }}
      >
        <Plus />
      </Button>
    </div>
  );
}

/** Description propre de l'exemplaire (champ `descriptionExemplaire`), sinon celle de l'entrée. */
function Description({ item, writes }: { item: InventoryItem; writes?: PanelWrites | undefined }) {
  const champ = item.sorte.descriptionExemplaire;
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(item.description ?? '');
  const modifiable = Boolean(writes && champ);
  if (!item.description && !modifiable) return null;
  return (
    <section aria-label="Description">
      <SectionTitle
        action={
          modifiable && !edition ? (
            <Button variant="ghost" size="xs" onClick={() => setEdition(true)}>
              <Pencil /> Modifier
            </Button>
          ) : undefined
        }
      >
        Description
      </SectionTitle>
      {edition ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            writes!.champs(item, { [champ!]: texte.trim() });
            setEdition(false);
          }}
        >
          <Textarea
            autoFocus
            aria-label="Description"
            value={texte}
            maxLength={2000}
            onChange={(e) => setTexte(e.target.value)}
            className="min-h-24 text-[13px]"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEdition(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm">
              Enregistrer
            </Button>
          </div>
        </form>
      ) : item.description ? (
        <p className="max-h-48 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      ) : (
        <p className="text-[13px] text-subtle">Aucune description.</p>
      )}
    </section>
  );
}

/**
 * Formule d'un champ de l'objet : aperçu pour ce personnage et, pour un exemplaire
 * modifiable, formule libre vérifiée en direct par le moteur (comme le fera le service).
 */
function EditeurFormule({
  fiche,
  item,
  formule,
  writes,
}: {
  fiche: Fiche;
  item: InventoryItem;
  formule: FormuleAffichee;
  writes?: PanelWrites | undefined;
}) {
  const id = useId();
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(formule.texte);
  const champ = formule.champ as Extract<typeof formule.champ, { type: 'formule' }>;
  const verif = useMemo(
    () => (edition && texte.trim() ? verifierFormule(fiche, item, champ, texte) : null),
    [edition, texte, fiche, item, champ],
  );
  const erreur = verif && !verif.ok ? verif.erreurs.join(' ; ') : null;

  function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!writes || !verif?.ok) return;
    writes.champs(item, { [champ.id]: verif.texte });
    setEdition(false);
  }

  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {champ.nom}
            {formule.propre && (
              <Badge ton="info" title="Formule propre à cet exemplaire">
                propre
              </Badge>
            )}
          </p>
          <p className="truncate font-mono text-sm font-semibold tabular-nums text-foreground">
            {formule.apercu}
          </p>
        </div>
        {writes && !edition && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setTexte(formule.texte);
              setEdition(true);
            }}
          >
            <Pencil /> Modifier
          </Button>
        )}
        {writes && !edition && formule.propre && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Revenir à la formule du catalogue pour ${champ.nom}`}
            title="Revenir à la formule du catalogue"
            onClick={() => writes.champs(item, { [champ.id]: '' })}
          >
            <RotateCcw />
          </Button>
        )}
      </div>
      {!edition && formule.texte !== formule.apercu && (
        <p className="mt-0.5 truncate font-mono text-[11px] text-subtle" title={formule.texte}>
          {formule.texte}
        </p>
      )}
      {edition && (
        <form onSubmit={enregistrer} className="mt-2 space-y-1.5">
          <label htmlFor={`${id}-f`} className="sr-only">
            Formule de {champ.nom}
          </label>
          <div className="flex gap-2">
            <Input
              id={`${id}-f`}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              value={texte}
              maxLength={500}
              placeholder={formule.des ? '1d6 + FOR + 2' : 'FOR + 2'}
              aria-invalid={erreur ? true : undefined}
              aria-describedby={`${id}-aide`}
              onChange={(e) => setTexte(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setEdition(false);
                }
              }}
              className="h-9 px-2.5 font-mono text-[13px]"
            />
            <Button type="submit" size="sm" disabled={!verif?.ok}>
              Enregistrer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Annuler"
              onClick={() => setEdition(false)}
            >
              <X />
            </Button>
          </div>
          <div id={`${id}-aide`} aria-live="polite" className="min-h-4 text-xs">
            {erreur ? (
              <p role="alert" className="text-destructive">
                {erreur}
              </p>
            ) : verif?.ok ? (
              <p className="text-muted-foreground">
                Pour ce personnage :{' '}
                <span className="font-mono text-foreground">{verif.apercu}</span>
              </p>
            ) : null}
          </div>
          <p className="text-[11px] leading-relaxed text-subtle">
            {formule.des ? 'Dés : 2d6, 4d6k3 (garder les 3 meilleurs). ' : ''}
            Attributs du personnage : CON ou @CON, mod(@DEX). Opérateurs + − * /, parenthèses,
            si(condition, alors, sinon). Champs de l’objet : source.
            {item.sorte.champs.find((c) => c.type === 'nombre')?.id ?? 'champ'}.
          </p>
        </form>
      )}
    </div>
  );
}

/** Caractéristiques de l'objet (hors formules et identité) : valeurs propres modifiables. */
function Caracteristiques({
  fiche,
  item,
  writes,
}: {
  fiche: Fiche;
  item: InventoryItem;
  writes?: PanelWrites | undefined;
}) {
  const champs = champsAffiches(fiche, item.entree, item.sorte, item.possession).filter(
    (c) => c.champ.type !== 'formule' && !c.identite,
  );
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState<Record<string, ValeurChamp>>({});
  const lisibles = champs.filter((c) => edition || c.valeur !== '—');
  const modifiables = Boolean(writes) && champs.some((c) => c.modifiable);
  if (!lisibles.length && !modifiables) return null;

  function enregistrer() {
    const changes = Object.fromEntries(
      Object.entries(brouillon).filter(
        ([id, v]) => champs.find((c) => c.champ.id === id)?.brut !== v,
      ),
    );
    if (Object.keys(changes).length) writes?.champs(item, changes);
    setBrouillon({});
    setEdition(false);
  }

  return (
    <section aria-label="Caractéristiques">
      <SectionTitle
        action={
          modifiables && !edition ? (
            <Button variant="ghost" size="xs" onClick={() => setEdition(true)}>
              <Pencil /> Modifier
            </Button>
          ) : undefined
        }
      >
        Caractéristiques
      </SectionTitle>
      {lisibles.length === 0 ? (
        <p className="text-[13px] text-subtle">Aucune caractéristique renseignée.</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
          {lisibles.map((c) => {
            const id = `champ-${item.cle}-${c.champ.id}`;
            const valeur = brouillon[c.champ.id] ?? c.brut;
            const saisir = (v: ValeurChamp) => setBrouillon((b) => ({ ...b, [c.champ.id]: v }));
            return (
              <div
                key={c.champ.id}
                className="flex min-h-9 min-w-0 items-center justify-between gap-3 border-b border-border py-1 text-[13px]"
              >
                <dt className="min-w-0 truncate text-muted-foreground">
                  <label htmlFor={edition && c.modifiable ? id : undefined}>{c.champ.nom}</label>
                </dt>
                <dd className="flex shrink-0 items-center gap-1.5 font-medium">
                  {edition && c.modifiable ? (
                    c.champ.type === 'choix' ? (
                      <select
                        id={id}
                        value={valeur === undefined ? '' : String(valeur)}
                        onChange={(e) => saisir(e.target.value)}
                        className={cn(styleChampBase, 'h-7 w-36 px-2 text-xs')}
                      >
                        {c.champ.options.map((o) => (
                          <option key={o.valeur} value={o.valeur}>
                            {o.nom}
                          </option>
                        ))}
                      </select>
                    ) : c.champ.type === 'booleen' ? (
                      <Switch id={id} checked={valeur === true} onCheckedChange={saisir} />
                    ) : (
                      <Input
                        id={id}
                        type={c.champ.type === 'nombre' ? 'number' : 'text'}
                        className={cn(
                          'h-7 px-2 text-xs',
                          c.champ.type === 'nombre' ? 'w-24 text-right' : 'w-40',
                        )}
                        value={valeur === undefined ? '' : String(valeur)}
                        onChange={(e) => {
                          const v =
                            c.champ.type === 'nombre' ? Number(e.target.value) : e.target.value;
                          if (c.champ.type === 'nombre' && !Number.isFinite(v)) return;
                          saisir(v);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && enregistrer()}
                      />
                    )
                  ) : (
                    <span className="max-w-48 truncate">{c.valeur}</span>
                  )}
                  {c.propre && !edition && (
                    <Badge ton="info" title="Valeur propre à cet exemplaire">
                      propre
                    </Badge>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {edition && (
        <div className="mt-3 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBrouillon({});
              setEdition(false);
            }}
          >
            Annuler
          </Button>
          <Button size="sm" onClick={enregistrer}>
            Enregistrer
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * Bonus : ceux du catalogue (lecture), puis ceux de l'exemplaire, qu'on ajoute, active,
 * désactive ou retire. Un bonus propre modifie un attribut numérique du personnage.
 */
function Bonus({
  fiche,
  item,
  mj,
  writes,
}: {
  fiche: Fiche;
  item: InventoryItem;
  mj: boolean;
  writes?: PanelWrites | undefined;
}) {
  const id = useId();
  const propres = bonusPropres(fiche, item);
  const nbPropres = item.possession?.effets.length ?? 0;
  const catalogue = item.bonus.slice(
    0,
    Math.max(0, item.bonus.length - propres.filter((b) => b.actif).length),
  );
  const attributs = useMemo(() => attributsBonus(fiche, mj), [fiche, mj]);
  const [ajout, setAjout] = useState(false);
  const [attribut, setAttribut] = useState(attributs[0]?.cle ?? '');
  const [valeur, setValeur] = useState('1');
  const [description, setDescription] = useState('');

  const effet = attribut && valeur.trim() ? effetBonus(attribut, valeur.trim(), description) : null;
  const erreurs = useMemo(() => {
    if (!effet) return [];
    const r = compilerEffets(
      fiche.systeme,
      fiche.etat.type,
      [effet],
      (i, x) => `bonus/${i}/${x}`,
      variablesSource(item.sorte),
    );
    return r.erreurs.map((e) => e.message);
  }, [effet, fiche, item.sorte]);

  if (!item.bonus.length && !nbPropres && !writes) return null;
  const groupes = [...new Set(attributs.map((x) => x.groupe ?? ''))];

  return (
    <section aria-label="Bonus" data-section="bonus" className="scroll-mt-24">
      <SectionTitle
        action={
          writes && !ajout && attributs.length > 0 ? (
            <Button variant="ghost" size="xs" onClick={() => setAjout(true)}>
              <Plus /> Ajouter un bonus
            </Button>
          ) : undefined
        }
      >
        Bonus
      </SectionTitle>
      {catalogue.length > 0 && (
        <div className="mb-2">
          <BonusBadges bonus={catalogue} taille="md" />
        </div>
      )}
      {propres.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {propres.map((b) => (
            <li key={b.index} className="flex min-h-10 items-center gap-2 px-3 py-1.5 text-[13px]">
              <span
                className={cn('min-w-0 flex-1 truncate', !b.actif && 'text-subtle line-through')}
              >
                {b.texte}
                {b.effet.description && b.effet.description !== b.texte && (
                  <span className="ml-1.5 text-xs text-subtle">{b.effet.description}</span>
                )}
              </span>
              {writes && (
                <>
                  <Switch
                    checked={b.actif}
                    aria-label={b.actif ? `Désactiver ${b.texte}` : `Activer ${b.texte}`}
                    onCheckedChange={() => writes.effets(item, basculerBonus(item, b.index))}
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Retirer ${b.texte}`}
                    onClick={() => writes.effets(item, sansBonus(item, b.index))}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {!item.bonus.length && !propres.length && !ajout && (
        <p className="text-[13px] text-subtle">Aucun bonus.</p>
      )}
      {item.sorte.activable && !item.actif && (item.bonus.length > 0 || propres.length > 0) && (
        <p className="mt-1.5 text-[11px] text-subtle">
          Les bonus s’appliquent une fois l’objet équipé.
        </p>
      )}
      {ajout && writes && (
        <form
          className="mt-3 space-y-2 rounded-xl border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!effet || erreurs.length) return;
            writes.effets(item, [...(item.possession?.effets ?? []), effet]);
            setAjout(false);
            setValeur('1');
            setDescription('');
          }}
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-1">
              <label htmlFor={`${id}-a`} className="text-xs text-muted-foreground">
                Attribut
              </label>
              <select
                id={`${id}-a`}
                value={attribut}
                onChange={(e) => setAttribut(e.target.value)}
                className={cn(styleChampBase, 'h-9 px-2 text-[13px]')}
              >
                {groupes.map((g) => {
                  const options = attributs
                    .filter((x) => (x.groupe ?? '') === g)
                    .map((x) => (
                      <option key={x.cle} value={x.cle}>
                        {x.nom}
                      </option>
                    ));
                  return g ? (
                    <optgroup key={g} label={g}>
                      {options}
                    </optgroup>
                  ) : (
                    options
                  );
                })}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-v`} className="text-xs text-muted-foreground">
                Valeur
              </label>
              <Input
                id={`${id}-v`}
                value={valeur}
                spellCheck={false}
                aria-invalid={erreurs.length ? true : undefined}
                aria-describedby={`${id}-e`}
                onChange={(e) => setValeur(e.target.value)}
                className="h-9 px-2 font-mono text-[13px]"
              />
            </div>
          </div>
          <Input
            aria-label="Description (facultative)"
            placeholder="Description (facultative)"
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            className="h-9 px-2 text-[13px]"
          />
          <p
            id={`${id}-e`}
            role={erreurs.length ? 'alert' : undefined}
            className="min-h-4 text-xs text-destructive"
          >
            {erreurs.join(' ; ')}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAjout(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={!effet || erreurs.length > 0}>
              <Plus /> Ajouter
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
