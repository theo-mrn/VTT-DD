'use client';

/**
 * Choix d'une entrée (docs/combat.md § 12.1) : armes, sorts, compétences en tuiles, comme les
 * tuiles d'action de la fiche (`SourceCard`). Aucun champ nommé : la tuile montre les champs que
 * l'action lit par ce paramètre (`arme.degats`, `arme.critique`…) et les listes de l'entrée.
 *
 * - `select` (à la déclaration) : un choix exclusif ; une entrée sans équipement (portée…) en
 *   boutons segmentés.
 * - `launch` (écran des dégâts) : chaque tuile lance ; touches 1 à 9 à partir de `firstShortcut`.
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
import { SourceCard, Stagger, type SourceField } from './launch';

/** Tuiles montrées d'office pour le catalogue ; au-delà, la liste « Autre… ». */
const CATALOGUE_CARDS = 6;
/** Au-delà, une entrée sans tuile se choisit dans une liste. */
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

/** L'entrée se présente en tuiles (arme : formule de dégâts, exemplaires) ou en boutons. */
function looksLikeGear(systeme: SystemeCharge, sorteId: string) {
  const sorte = systeme.sortes.get(sorteId);
  return Boolean(sorte && (sorte.exemplaires || sorte.champs.some((c) => c.type === 'formule')));
}

/** Champs d'une entrée que l'action lit (formule mise en avant), quatre au plus. */
function fieldsOf(fiche: Fiche, r: Resolved, refs: readonly string[]): SourceField[] {
  const sorte = fiche.systeme.sortes.get(r.entree.sorte);
  if (!sorte) return [];
  return champsAffiches(fiche, r.entree, sorte, r.possession)
    .filter(
      (c) =>
        !c.identite &&
        c.valeur !== '—' &&
        (refs.includes(c.champ.id) || c.champ.type === 'entrees') &&
        !(c.champ.type === 'booleen' && c.brut !== true) &&
        c.valeur.length <= 48,
    )
    .slice(0, 4)
    .map((c) => ({
      key: c.champ.id,
      label: c.champ.nom,
      value: c.champ.type === 'booleen' ? '' : c.valeur,
      formula: c.champ.type === 'formule',
    }));
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
  mode = 'select',
  prefer,
  firstShortcut = null,
}: Readonly<{
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  action: Action;
  param: EntryParam;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** `launch` : chaque tuile lance (écran des dégâts), pas de choix « Aucune ». */
  mode?: 'select' | 'launch';
  /** Entrées montrées d'abord (armes du type d'attaque choisi). */
  prefer?: (entree: Entree) => boolean;
  /** Raccourci de la première tuile (1 à 9), null : aucun. */
  firstShortcut?: number | null;
}>) {
  const options = useMemo(() => {
    const all = entryOptions(fiche, param);
    if (!prefer) return all;
    const first = (o: EntryOption) => {
      const e = fiche.systeme.entrees.get(o.id.split('#', 1)[0]!);
      return e && prefer(e) ? 0 : 1;
    };
    return [...all].sort((a, b) => first(a) - first(b));
  }, [fiche, param, prefer]);
  const launch = mode === 'launch';
  const none = param.facultatif && !launch;
  if (launch && !options.length) return null;
  const title = (
    <SectionTitle hint={paramDescription(param)}>
      {param.nom}
      {none && <span className="normal-case tracking-normal text-subtle">(facultatif)</span>}
    </SectionTitle>
  );
  const refs = paramFieldRefs(systeme, action, param.id);
  const gear = looksLikeGear(systeme, param.sorte);

  if (!gear && !launch) {
    const buttons = [
      ...(none || !options.length
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
            none={none}
          />
        )}
      </section>
    );
  }

  const owned = options.filter((o) => o.owned);
  // Catalogue : celles qui se passent d'être possédées (mains nues) en tuiles, les autres à
  // chercher dans la liste
  const waivers = possessionWaivers(systeme, action, param);
  const free = options.filter((o) => !o.owned && isWaived(fiche, waivers, o.id));
  const catalogue = options.filter((o) => !o.owned && !free.includes(o));
  const selectedOther = catalogue.find((o) => o.id === value);
  const shownOthers =
    catalogue.length <= CATALOGUE_CARDS ? catalogue : selectedOther ? [selectedOther] : [];
  const shown: { o: EntryOption; note: string | null }[] = [
    ...owned.map((o) => ({ o, note: null })),
    ...free.map((o) => ({ o, note: 'Toujours disponible' })),
    ...shownOthers.map((o) => ({ o, note: 'Catalogue' })),
  ];

  return (
    <section>
      {title}
      <div
        role={launch ? undefined : 'radiogroup'}
        aria-label={param.nom}
        className="grid gap-2.5 sm:grid-cols-2"
      >
        {none && (
          <button
            type="button"
            role="radio"
            aria-checked={value === ''}
            disabled={disabled}
            onClick={() => onChange('')}
            className={cn(
              'flex min-h-[4rem] items-center justify-center rounded-xl border border-dashed px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              value === ''
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border-strong text-muted-foreground hover:text-foreground',
            )}
          >
            Aucune
          </button>
        )}
        {shown.map(({ o, note }, i) => {
          const r = resolve(fiche, o);
          if (!r) return null;
          const sorte = fiche.systeme.sortes.get(r.entree.sorte);
          const n = firstShortcut !== null ? firstShortcut + i : null;
          return (
            <Stagger key={o.id} index={i}>
              <SourceCard
                icon={
                  sorte
                    ? iconeObjet(presentation?.iconesObjets ?? [], {
                        entree: r.entree,
                        sorte,
                        possession: r.possession,
                      })
                    : Library
                }
                name={o.nom}
                note={[o.rang > 0 ? `rang ${o.rang}` : null, note].filter(Boolean).join(' · ')}
                fields={fieldsOf(fiche, r, refs)}
                mode={mode}
                selected={!launch && value === o.id}
                shortcut={n !== null && n <= 9 ? n : null}
                disabled={disabled}
                onClick={() => onChange(o.id)}
              />
            </Stagger>
          );
        })}
      </div>
      {!options.length && !launch && (
        <p className="rounded-xl border border-dashed border-border-strong px-3 py-3 text-[13px] text-muted-foreground">
          Aucune disponible
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

/** Nombre de tuiles numérotées d'une entrée (pour enchaîner les raccourcis). */
export function entryCardCount(
  systeme: SystemeCharge,
  fiche: Fiche,
  action: Action,
  param: EntryParam,
): number {
  const options = entryOptions(fiche, param);
  const waivers = possessionWaivers(systeme, action, param);
  const catalogue = options.filter((o) => !o.owned && !isWaived(fiche, waivers, o.id));
  return options.length - (catalogue.length > CATALOGUE_CARDS ? catalogue.length : 0);
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
}: Readonly<{
  label: string;
  options: readonly EntryOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean | undefined;
  none?: boolean;
  icon?: boolean;
}>) {
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
