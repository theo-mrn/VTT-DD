'use client';

/**
 * Détail d'un objet : description, bonus, champs (valeurs propres de l'exemplaire
 * modifiables), quantité, état équipé, nouvel exemplaire et retrait.
 */
import type { Fiche } from '@vtt/rules';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, styleChampBase } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { champsAffiches, type InventoryItem, type ValeurChamp } from './model';
import { ActiveToggle, BonusBadges, QuantityStepper, Thumbnail, type ItemActions } from './parts';

export function ItemDialog({
  fiche,
  item,
  image,
  actions,
  editable,
  onChamps,
  onClose,
}: {
  fiche: Fiche;
  item: InventoryItem | null;
  image?: string | undefined;
  actions: ItemActions;
  editable: boolean;
  onChamps?: ((item: InventoryItem, champs: Record<string, ValeurChamp>) => void) | undefined;
  onClose(): void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-4 sm:max-w-xl">
        {item && (
          <Contenu
            key={item.cle}
            fiche={fiche}
            item={item}
            image={image}
            actions={actions}
            editable={editable}
            onChamps={onChamps}
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
  image,
  actions,
  editable,
  onChamps,
  onClose,
}: {
  fiche: Fiche;
  item: InventoryItem;
  image?: string | undefined;
  actions: ItemActions;
  editable: boolean;
  onChamps?: ((item: InventoryItem, champs: Record<string, ValeurChamp>) => void) | undefined;
  onClose(): void;
}) {
  const { entree, sorte, possession } = item;
  const champs = champsAffiches(fiche, entree, sorte, possession);
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState<Record<string, ValeurChamp>>({});
  const [confirmer, setConfirmer] = useState(false);
  const personnalisable =
    editable && Boolean(possession) && Boolean(onChamps) && champs.some((c) => c.modifiable);
  // Nom et description propres : en titre et en description, listés seulement pour les modifier
  const lisibles = champs.filter((c) => edition || (c.valeur !== '—' && !c.identite));

  function enregistrer() {
    const changes = Object.fromEntries(
      Object.entries(brouillon).filter(
        ([id, v]) => champs.find((c) => c.champ.id === id)?.brut !== v,
      ),
    );
    if (Object.keys(changes).length) onChamps?.(item, changes);
    setBrouillon({});
    setEdition(false);
  }

  const reglerQuantite =
    editable && possession && sorte.quantites && actions.quantite
      ? (q: number) => actions.quantite!(item, q)
      : undefined;
  const reglerActif =
    editable && sorte.activable && actions.actif
      ? (v: boolean) => actions.actif!(item, v)
      : undefined;

  return (
    <>
      <DialogHeader className="flex-row items-center gap-3 space-y-0 pr-8 text-left">
        <Thumbnail nom={item.nom} image={image} className="size-12 rounded-xl text-lg" />
        <div className="min-w-0">
          <DialogTitle className="truncate font-display text-xl">
            {item.nom}
            {item.exemplaireLabel && (
              <span className="ml-2 text-sm font-normal text-subtle">
                exemplaire {item.exemplaireLabel}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="truncate">
            {[
              // Objet renommé ou personnalisé : l'entrée dont il est un exemplaire
              item.nom !== entree.nom ? entree.nom : sorte.nom,
              item.categorie.nom !== (sorte.nomPluriel ?? sorte.nom) ? item.categorie.nom : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {!possession && ' · accordé par un autre élément de la fiche'}
          </DialogDescription>
        </div>
      </DialogHeader>

      {(sorte.activable || sorte.quantites || item.poids) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
          {sorte.activable && (
            <ActiveToggle nom={item.nom} actif={item.actif} onChange={reglerActif} />
          )}
          {sorte.quantites && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              Quantité
              <QuantityStepper nom={item.nom} quantite={item.quantite} onChange={reglerQuantite} />
            </span>
          )}
          {item.poids && (
            <span className="ml-auto text-xs text-muted-foreground">
              {item.poids.champ.nom}{' '}
              <span className="font-mono font-semibold text-foreground">
                {item.poids.unitaire * item.quantite}
              </span>
            </span>
          )}
        </div>
      )}

      {item.description && (
        <p className="max-h-48 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      )}

      {item.bonus.length > 0 && (
        <section aria-label="Effets">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
            Effets
          </p>
          <BonusBadges bonus={item.bonus} taille="md" />
          {item.bonus.some((b) => b.conditionnel) && (
            <p className="mt-1.5 text-[11px] text-subtle">* sous condition</p>
          )}
          {!item.actif && sorte.activable && (
            <p className="mt-1.5 text-[11px] text-subtle">Effets actifs une fois l’objet équipé.</p>
          )}
        </section>
      )}

      {lisibles.length > 0 && (
        <section aria-label="Caractéristiques">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">
              Caractéristiques
            </p>
            {personnalisable && !edition && (
              <Button variant="ghost" size="xs" onClick={() => setEdition(true)}>
                <Pencil /> Personnaliser
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {lisibles.map((c) => {
              const id = `champ-${item.cle}-${c.champ.id}`;
              const valeur = brouillon[c.champ.id] ?? c.brut;
              return (
                <div
                  key={c.champ.id}
                  className="flex min-w-0 items-center justify-between gap-3 border-b border-border py-1 text-[13px]"
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
                          onChange={(e) =>
                            setBrouillon((b) => ({ ...b, [c.champ.id]: e.target.value }))
                          }
                          className={cn(styleChampBase, 'h-7 w-36 px-2 text-xs')}
                        >
                          {c.champ.options.map((o) => (
                            <option key={o.valeur} value={o.valeur}>
                              {o.nom}
                            </option>
                          ))}
                        </select>
                      ) : c.champ.type === 'booleen' ? (
                        <Switch
                          id={id}
                          checked={valeur === true}
                          onCheckedChange={(v) => setBrouillon((b) => ({ ...b, [c.champ.id]: v }))}
                        />
                      ) : (
                        <Input
                          id={id}
                          type={c.champ.type === 'nombre' ? 'number' : 'text'}
                          className={cn(
                            'h-7 px-2 text-xs',
                            c.identite ? 'w-44' : 'w-28 text-right',
                          )}
                          value={valeur === undefined ? '' : String(valeur)}
                          onChange={(e) => {
                            const v =
                              c.champ.type === 'nombre' ? Number(e.target.value) : e.target.value;
                            if (c.champ.type === 'nombre' && !Number.isFinite(v)) return;
                            setBrouillon((b) => ({ ...b, [c.champ.id]: v }));
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
      )}

      {editable && possession && (actions.retirer || (sorte.exemplaires && actions.exemplaire)) && (
        <DialogFooter className="gap-2 sm:justify-between">
          {sorte.exemplaires && actions.exemplaire ? (
            <Button variant="secondary" size="sm" onClick={() => actions.exemplaire!(item)}>
              <Copy /> Nouvel exemplaire distinct
            </Button>
          ) : (
            <span />
          )}
          {actions.retirer &&
            (confirmer ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmer(false)}>
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  autoFocus
                  onClick={() => {
                    actions.retirer!(item);
                    onClose();
                  }}
                >
                  <Trash2 /> Confirmer le retrait
                </Button>
              </div>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setConfirmer(true)}>
                <Trash2 /> Retirer de l’inventaire
              </Button>
            ))}
        </DialogFooter>
      )}
    </>
  );
}
