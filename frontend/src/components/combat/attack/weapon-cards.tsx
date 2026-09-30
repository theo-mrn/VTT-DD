'use client';

/**
 * Choix d'une entrée (docs/combat.md § 12.1, 2) : une arme se choisit sur des cartes comme
 * dans l'ancienne page (nom, dégâts, critique, qualités), les autres entrées (portée,
 * compétence…) en boutons. Aucun champ nommé : la carte montre les champs que l'action lit
 * par ce paramètre (`arme.degats`, `arme.critique`…), et les listes de l'entrée (qualités).
 *
 * Une action qui prend toute arme du catalogue (`possedee: false`) propose d'abord celles du
 * personnage ; les autres se cherchent dans la liste « Autre… ».
 */
import type { Action, Entree, Fiche, Possession, Presentation, SystemeCharge } from '@vtt/rules';
import { Check, ChevronsUpDown, Library } from 'lucide-react';
import { useMemo, useState } from 'react';
import { champsAffiches } from '@/components/fiche/blocks/inventory/model';
import { iconeObjet } from '@/components/fiche/blocks/inventory/item-icon';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { paramFieldRefs } from '@/lib/combat/actions';
import {
  entryOptions,
  isWaived,
  paramDescription,
  possessionWaivers,
  type EntryOption,
  type EntryParam,
} from '@/lib/combat/params';
import { cn } from '@/lib/utils';
import { Segmented, SectionTitle } from './controls';

/** Cartes montrées d'office pour le catalogue ; au-delà, la liste « Autre… ». */
const CATALOGUE_CARDS = 6;
/** Au-delà, une entrée sans carte se choisit dans une liste. */
const MAX_BUTTONS = 12;

interface Resolved {
  option: EntryOption;
  entree: Entree;
  possession: Possession | undefined;
}

function resolve(fiche: Fiche, option: EntryOption): Resolved | null {
  const [id, instance] = option.id.split('#') as [string, string | undefined];
  const entree = fiche.systeme.entrees.get(id);
  if (!entree) return null;
  const owned = fiche.possessions.get(id);
  const possession = instance
    ? owned?.exemplaires.find((e) => e.exemplaire === instance)
    : owned?.possession;
  return { option, entree, possession };
}

/** L'entrée se présente en cartes (arme : formule de dégâts, exemplaires) ou en boutons. */
function looksLikeGear(systeme: SystemeCharge, sorteId: string) {
  const sorte = systeme.sortes.get(sorteId);
  return Boolean(sorte && (sorte.exemplaires || sorte.champs.some((c) => c.type === 'formule')));
}

export function EntryPicker({
  systeme,
  presentation,
  fiche,
  action,
  param,
  value,
  onChange,
  disabled,
}: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  action: Action;
  param: EntryParam;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const options = useMemo(() => entryOptions(fiche, param), [fiche, param]);
  const hint = paramDescription(param);
  const title = (
    <SectionTitle hint={hint}>
      {param.nom}
      {param.facultatif && (
        <span className="normal-case tracking-normal text-subtle">(facultatif)</span>
      )}
    </SectionTitle>
  );

  if (!looksLikeGear(systeme, param.sorte)) {
    const buttons = [
      ...(param.facultatif || !options.length
        ? [{ value: '', label: options.length ? 'Aucune' : 'Aucune disponible' }]
        : []),
      ...options.map((o) => ({
        value: o.id,
        label: o.nom,
        meta: o.rang > 0 ? `rang ${o.rang}` : undefined,
      })),
    ];
    return (
      <section>
        {title}
        {buttons.length <= MAX_BUTTONS ? (
          <Segmented
            label={param.nom}
            options={buttons}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        ) : (
          <OtherPicker
            label={param.nom}
            options={options}
            value={value}
            onChange={onChange}
            disabled={disabled}
            none={param.facultatif}
          />
        )}
      </section>
    );
  }

  const refs = paramFieldRefs(systeme, action, param.id);
  const owned = options.filter((o) => o.owned);
  // Catalogue : celles qui se passent d'être possédées (mains nues) en cartes, les autres à
  // chercher dans la liste
  const waivers = possessionWaivers(systeme, action, param);
  const free = options.filter((o) => !o.owned && isWaived(fiche, waivers, o.id));
  const catalogue = options.filter((o) => !o.owned && !free.includes(o));
  // Tout le catalogue : les armes du personnage, puis quelques-unes du catalogue (la choisie
  // d'abord) ; le reste dans la liste
  const selectedOther = catalogue.find((o) => o.id === value);
  const shownOthers =
    catalogue.length <= CATALOGUE_CARDS ? catalogue : selectedOther ? [selectedOther] : [];
  const card = (o: EntryOption, note: string | null = null) => {
    const r = resolve(fiche, o);
    if (!r) return null;
    return (
      <WeaponCard
        key={o.id}
        fiche={fiche}
        presentation={presentation}
        resolved={r}
        refs={refs}
        selected={value === o.id}
        note={note}
        disabled={disabled}
        onSelect={() => onChange(o.id)}
      />
    );
  };

  return (
    <section>
      {title}
      <div role="radiogroup" aria-label={param.nom} className="grid gap-2.5 sm:grid-cols-2">
        {param.facultatif && (
          <button
            type="button"
            role="radio"
            aria-checked={value === ''}
            disabled={disabled}
            onClick={() => onChange('')}
            className={cn(
              'flex min-h-[4.5rem] items-center justify-center rounded-xl border border-dashed px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              value === ''
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border-strong text-muted-foreground hover:text-foreground',
            )}
          >
            Aucune
          </button>
        )}
        {owned.map((o) => card(o))}
        {free.map((o) => card(o, 'Toujours disponible'))}
        {shownOthers.map((o) => card(o, 'Catalogue'))}
      </div>
      {!options.length && (
        <p className="rounded-xl border border-dashed border-border-strong px-3 py-3 text-[13px] text-muted-foreground">
          Aucune disponible pour ce personnage.
        </p>
      )}
      {catalogue.length > shownOthers.length && (
        <div className="mt-2.5">
          <OtherPicker
            label={`Autre ${param.nom.toLowerCase()} du catalogue`}
            options={catalogue}
            value={value}
            onChange={onChange}
            disabled={disabled}
            icon
          />
        </div>
      )}
    </section>
  );
}

/** Carte d'une arme (ou de tout équipement) : icône, nom, champs lus par l'action. */
function WeaponCard({
  fiche,
  presentation,
  resolved,
  refs,
  selected,
  note,
  disabled,
  onSelect,
}: {
  fiche: Fiche;
  presentation: Presentation | null;
  resolved: Resolved;
  refs: readonly string[];
  selected: boolean;
  /** Précision sous le nom (« Toujours disponible », « Catalogue »). */
  note: string | null;
  disabled?: boolean | undefined;
  onSelect: () => void;
}) {
  const { option, entree, possession } = resolved;
  const sorte = fiche.systeme.sortes.get(entree.sorte);
  const Icon = sorte
    ? iconeObjet(presentation?.iconesObjets ?? [], { entree, sorte, possession })
    : Library;
  const fields = sorte
    ? champsAffiches(fiche, entree, sorte, possession)
        .filter(
          (c) =>
            !c.identite &&
            c.valeur !== '—' &&
            (refs.includes(c.champ.id) || c.champ.type === 'entrees') &&
            !(c.champ.type === 'booleen' && c.brut !== true) &&
            c.valeur.length <= 48,
        )
        .slice(0, 4)
    : [];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'group relative flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
        selected
          ? 'border-primary/60 bg-primary/[0.08] shadow-glow'
          : 'border-border bg-surface/70 hover:-translate-y-px hover:border-border-strong hover:bg-surface-2 motion-reduce:hover:translate-y-0',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-lg border',
          selected
            ? 'border-primary/40 bg-primary/15 text-primary'
            : 'border-border-strong bg-surface-2 text-muted-foreground',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 pr-5">
          <span className="truncate text-[14px] font-semibold">{option.nom}</span>
          {option.rang > 0 && (
            <span className="shrink-0 font-mono text-[11px] text-subtle">rang {option.rang}</span>
          )}
        </span>
        {note && <span className="block text-[11px] text-subtle">{note}</span>}
        {fields.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {fields.map((f) => (
              <span
                key={f.champ.id}
                className="inline-flex max-w-full items-baseline gap-1 truncate rounded-md bg-surface-3/80 px-1.5 py-0.5 text-[11px]"
              >
                {f.champ.type === 'booleen' ? (
                  <span className="text-muted-foreground">{f.champ.nom}</span>
                ) : (
                  <>
                    <span className="text-subtle">{f.champ.nom}</span>
                    <span className="truncate font-mono font-medium text-foreground">
                      {f.valeur}
                    </span>
                  </>
                )}
              </span>
            ))}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          'absolute right-2.5 top-2.5 grid size-4 place-items-center rounded-full border transition-colors',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border-strong text-transparent',
        )}
      >
        <Check className="size-2.5" strokeWidth={3.5} />
      </span>
    </button>
  );
}

/** Liste avec recherche, pour un catalogue ou une longue liste d'entrées. */
function OtherPicker({
  label,
  options,
  value,
  onChange,
  disabled,
  none = false,
  icon = false,
}: {
  label: string;
  options: readonly EntryOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean | undefined;
  none?: boolean;
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-10 w-full items-center gap-2 rounded-xl border border-border-strong bg-surface/70 px-3 text-left text-[13px] transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        >
          {icon && <Library className="size-4 text-subtle" aria-hidden />}
          <span className={cn('min-w-0 flex-1 truncate', !current && 'text-muted-foreground')}>
            {current?.nom ?? label}
          </span>
          <ChevronsUpDown className="size-4 text-subtle" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Chercher…" />
          <CommandList>
            <CommandEmpty>Rien trouvé.</CommandEmpty>
            <CommandGroup>
              {none && (
                <CommandItem
                  value="aucune"
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  Aucune
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.nom} ${o.id}`}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{o.nom}</span>
                  {o.rang > 0 && <span className="text-[11px] text-subtle">rang {o.rang}</span>}
                  {o.id === value && <Check className="text-primary" aria-hidden />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
