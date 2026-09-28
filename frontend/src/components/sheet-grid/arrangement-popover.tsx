'use client';

/**
 * « Disposition » d'un bloc de tuiles, en personnalisation : colonnes (auto ou 1 à 6), ordre
 * des valeurs (glisser-déposer ou boutons monter et descendre), valeurs masquées (au moins
 * une reste affichée) et retour à la présentation du système. Chaque réglage est appliqué
 * aussitôt au bloc (aperçu) et enregistré avec la mise en page.
 */
import { ArrowDown, ArrowUp, Columns3, GripVertical, RotateCcw, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import {
  MAX_TILE_COLUMNS,
  arrangeTiles,
  orderedKeys,
  withArrangement,
  type Tile,
  type TileArrangement,
  type TileColumns,
} from '@/components/fiche/blocks/tiles/model';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const CHOIX_COLONNES: TileColumns[] = [
  'auto',
  ...Array.from({ length: MAX_TILE_COLUMNS }, (_, i) => i + 1),
];

/** Fond léger de l'accent (opacité par color-mix, jamais de hex). */
const FOND_ACCENT = 'bg-[color-mix(in_srgb,hsl(var(--primary))_14%,transparent)]';

export function ArrangementPopover({
  title,
  tiles,
  value,
  onChange,
  addable = [],
  onAdd,
  onRemove,
}: {
  title: string;
  /** Valeurs du bloc, dans l'ordre du système. */
  tiles: Tile[];
  value?: TileArrangement;
  /** undefined : retour à la présentation du système. */
  onChange: (next: TileArrangement | undefined) => void;
  /** Valeurs d'autres groupes qu'on peut ajouter au bloc. */
  addable?: Tile[];
  onAdd?: ((key: string) => void) | undefined;
  /** Retire une valeur du bloc (il en garde au moins une). */
  onRemove?: ((key: string) => void) | undefined;
}) {
  const keys = tiles.map((t) => t.key);
  const parCle = new Map(tiles.map((t) => [t.key, t]));
  const ordre = orderedKeys(keys, value);
  const affichees = new Set(arrangeTiles(keys, value));
  const colonnes = value?.columns ?? 'auto';
  const ids = useId();
  const liste = useRef<HTMLUListElement>(null);
  const [annonce, setAnnonce] = useState('');
  const [glisse, setGlisse] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);

  const emettre = (a: TileArrangement) => onChange(withArrangement(keys, a));
  const nom = (k: string) => parCle.get(k)?.label ?? k;

  function deplacer(cle: string, vers: number, focus?: 'up' | 'down') {
    const de = ordre.indexOf(cle);
    if (de < 0 || vers < 0 || vers >= ordre.length || vers === de) return;
    const suivant = [...ordre];
    suivant.splice(de, 1);
    suivant.splice(vers, 0, cle);
    emettre({ ...value, order: suivant });
    setAnnonce(`${nom(cle)} : position ${vers + 1} sur ${ordre.length}.`);
    if (!focus) return;
    // Le bouton utilisé peut devenir inactif en bout de liste : l'autre prend le focus
    requestAnimationFrame(() => {
      const li = liste.current?.querySelector<HTMLElement>(`[data-tile="${CSS.escape(cle)}"]`);
      const bouton =
        li?.querySelector<HTMLButtonElement>(`[data-move="${focus}"]:not(:disabled)`) ??
        li?.querySelector<HTMLButtonElement>('[data-move]:not(:disabled)');
      bouton?.focus();
    });
  }

  function basculer(cle: string, visible: boolean) {
    const masques = new Set(value?.hidden ?? []);
    if (visible) masques.delete(cle);
    else if (affichees.size > 1) masques.add(cle);
    else return;
    emettre({ ...value, hidden: ordre.filter((k) => masques.has(k)) });
    setAnnonce(`${nom(cle)} ${visible ? 'affichée' : 'masquée'}.`);
  }

  function choisirColonnes(c: TileColumns) {
    emettre({ ...value, columns: c });
    setAnnonce(c === 'auto' ? 'Colonnes automatiques.' : `${c} colonne(s).`);
  }

  // Groupe de boutons radio : une seule tabulation, les flèches changent le choix
  function surToucheColonnes(e: KeyboardEvent<HTMLDivElement>) {
    const i = CHOIX_COLONNES.indexOf(colonnes);
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    const cible =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? CHOIX_COLONNES.length - 1
          : delta
            ? (i + delta + CHOIX_COLONNES.length) % CHOIX_COLONNES.length
            : -1;
    if (cible < 0) return;
    e.preventDefault();
    e.stopPropagation();
    choisirColonnes(CHOIX_COLONNES[cible]!);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[cible]?.focus();
  }

  function surDepot(e: DragEvent<HTMLLIElement>, cible: string) {
    e.preventDefault();
    const cle = glisse ?? e.dataTransfer.getData('text/plain');
    setGlisse(null);
    setSurvol(null);
    if (cle && cle !== cible && ordre.includes(cle)) deplacer(cle, ordre.indexOf(cible));
  }

  const rangees =
    typeof colonnes === 'number'
      ? Math.ceil(affichees.size / Math.min(colonnes, affichees.size))
      : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Disposition du bloc ${title}`}
          title="Disposition"
          className={cn(
            'sheet-no-drag ml-1 flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground',
            'transition-colors duration-150 hover:bg-surface-3 hover:text-foreground motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground',
          )}
        >
          <Columns3 className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Disposition</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-0"
        aria-label={`Disposition du bloc ${title}`}
        // Rien ne remonte jusqu'à la grille (déplacement du bloc, raccourcis clavier)
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-4 p-4">
          <div>
            <p id={`${ids}-titre`} className="text-sm font-semibold">
              Disposition
            </p>
            <p className="text-xs text-muted-foreground">
              Colonnes et ordre des valeurs de « {title} ».
            </p>
          </div>

          <section aria-labelledby={`${ids}-colonnes`} className="space-y-1.5">
            <p id={`${ids}-colonnes`} className="text-xs font-medium text-muted-foreground">
              Colonnes
            </p>
            <div
              role="radiogroup"
              aria-labelledby={`${ids}-colonnes`}
              onKeyDown={surToucheColonnes}
              className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
            >
              {CHOIX_COLONNES.map((c) => {
                const actif = c === colonnes;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={actif}
                    aria-label={c === 'auto' ? 'Automatique' : `${c} colonne${c > 1 ? 's' : ''}`}
                    tabIndex={actif ? 0 : -1}
                    onClick={() => !actif && choisirColonnes(c)}
                    className={cn(
                      'h-7 min-w-0 flex-1 rounded-md text-xs font-medium tabular transition-colors duration-150 motion-reduce:transition-none',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      c === 'auto' && 'flex-[1.6]',
                      actif
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
                    )}
                  >
                    {c === 'auto' ? 'Auto' : c}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-subtle">
              {rangees === null
                ? 'Auto : s’adapte à la largeur du bloc.'
                : `${Math.min(colonnes as number, affichees.size)} par rangée, ${rangees} rangée${rangees > 1 ? 's' : ''}.`}
            </p>
          </section>

          <section aria-labelledby={`${ids}-valeurs`} className="space-y-1.5">
            <p id={`${ids}-valeurs`} className="text-xs font-medium text-muted-foreground">
              Valeurs
              <span className="font-normal text-subtle"> · glisser pour réordonner</span>
            </p>
            <ul
              ref={liste}
              aria-labelledby={`${ids}-valeurs`}
              className="max-h-64 space-y-1 overflow-y-auto pr-0.5 [scrollbar-width:thin]"
            >
              {ordre.map((cle, i) => {
                const tuile = parCle.get(cle);
                const visible = affichees.has(cle);
                const derniere = visible && affichees.size === 1;
                return (
                  <li
                    key={cle}
                    data-tile={cle}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', cle);
                      setGlisse(cle);
                    }}
                    onDragEnd={() => {
                      setGlisse(null);
                      setSurvol(null);
                    }}
                    onDragOver={(e) => {
                      if (!glisse) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (survol !== cle) setSurvol(cle);
                    }}
                    onDragLeave={() => survol === cle && setSurvol(null)}
                    onDrop={(e) => surDepot(e, cle)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border border-border bg-surface-2 py-1 pl-1 pr-1',
                      glisse === cle && 'opacity-50',
                      survol === cle && glisse !== cle && cn('border-primary', FOND_ACCENT),
                    )}
                  >
                    <GripVertical
                      className="size-3.5 shrink-0 cursor-grab text-subtle active:cursor-grabbing"
                      aria-hidden
                    />
                    <Switch
                      checked={visible}
                      disabled={derniere}
                      onCheckedChange={(v) => basculer(cle, v)}
                      aria-label={`Afficher ${tuile?.label ?? cle}`}
                      title={derniere ? 'Au moins une valeur reste affichée' : undefined}
                      className="scale-90"
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-sm',
                        !visible && 'text-subtle line-through',
                      )}
                    >
                      {tuile?.label ?? cle}
                      {tuile?.hint && (
                        <span className="ml-1.5 text-[11px] text-subtle">{tuile.hint}</span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      data-move="up"
                      disabled={i === 0}
                      onClick={() => deplacer(cle, i - 1, 'up')}
                      aria-label={`Monter ${tuile?.label ?? cle}`}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      data-move="down"
                      disabled={i === ordre.length - 1}
                      onClick={() => deplacer(cle, i + 1, 'down')}
                      aria-label={`Descendre ${tuile?.label ?? cle}`}
                    >
                      <ArrowDown />
                    </Button>
                    {onRemove && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={ordre.length <= 1}
                        onClick={() => {
                          onRemove(cle);
                          setAnnonce(`${tuile?.label ?? cle} retirée du bloc.`);
                        }}
                        aria-label={`Retirer ${tuile?.label ?? cle} du bloc`}
                      >
                        <X />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            {onAdd && addable.length > 0 && (
              <SelectField
                value=""
                onValueChange={(k) => {
                  if (!k) return;
                  onAdd(k);
                  setAnnonce(`${addable.find((t) => t.key === k)?.label ?? k} ajoutée au bloc.`);
                }}
                placeholder="Ajouter une valeur…"
                aria-label={`Ajouter une valeur au bloc ${title}`}
                className="h-8 text-xs"
                options={addable.map((t) => ({
                  valeur: t.key,
                  nom: t.hint ? `${t.label} (${t.hint})` : t.label,
                }))}
              />
            )}
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <p className="text-[11px] text-subtle">
            {value ? 'Disposition personnalisée' : 'Présentation du système'}
          </p>
          <Button
            variant="ghost"
            size="xs"
            disabled={!value}
            onClick={() => {
              onChange(undefined);
              setAnnonce('Disposition du système rétablie.');
            }}
          >
            <RotateCcw />
            Réinitialiser
          </Button>
        </div>
        <p className="sr-only" aria-live="polite">
          {annonce}
        </p>
      </PopoverContent>
    </Popover>
  );
}
