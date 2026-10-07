'use client';

/**
 * États d'un participant (docs/combat.md § 4.5, § 18) : ceux du catalogue du système (sortes
 * d'états déclarées par la présentation, avec leurs effets) et l'état libre (nom seul, sans
 * effet), pour un nombre de rounds, jusqu'au début ou à la fin du tour d'un personnage, ou
 * jusqu'au retrait. Choisir un état du catalogue reprend sa durée par défaut (donnée du
 * système). Écrits par les routes de la fiche (character) : le décompte à chaque passage de
 * tour et son retour arrière restent au serveur.
 */
import type { MomentDecompte, SystemeCharge } from '@vtt/rules';
import { Hourglass, Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SelectField } from '@/components/ui/select';
import { messageErreur } from '@/lib/api';
import {
  defaultDurationOf,
  DURATION_MOMENTS,
  durationShort,
  durationText,
  timingRequest,
  turnBased,
} from '@/lib/combat/durations';
import { STATE_ICONS } from '@/lib/combat/state-icons';
import type { FichePersonnage, OperationsPersonnage } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import { FREE_STATE_SOURCE, type TimedState } from './use-cast';

const FREE = '__libre__';

/** Personnage dont le tour peut compter (participants du combat). */
export interface Fighter {
  id: string;
  name: string;
}

/** « 2 rounds », « jusqu'à la fin de son prochain tour », « jusqu'au retrait ». */
export function durationLabel(
  state: Pick<TimedState, 'duration' | 'timing'>,
  o: { bearerId?: string; nameOf?: (id: string) => string | undefined } = {},
): string {
  return durationText({ duration: state.duration, timing: state.timing }, o);
}

/** Icône d'un état (présentation du système), dessinée par lucide. */
export function StateIcon({
  state,
  className,
}: Readonly<{ state: TimedState; className?: string }>) {
  const Icon = STATE_ICONS[state.icon];
  return <Icon className={className ?? 'size-3 shrink-0'} aria-hidden />;
}

/** Pastille d'un état : icône, nom et décomptes restants (libellé complet au survol). */
export function StateBadge({
  state,
  bearerId,
  nameOf,
  className,
}: Readonly<{
  state: TimedState;
  bearerId?: string;
  nameOf?: (id: string) => string | undefined;
  className?: string;
}>) {
  return (
    <span
      className={
        'inline-flex h-5 max-w-40 items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 text-[11px] font-medium text-warning ' +
        (className ?? '')
      }
      title={`${state.name} : ${durationLabel(state, { bearerId, nameOf })}`}
    >
      <StateIcon state={state} />
      <span className="truncate">{state.name}</span>
      {state.duration !== null && (
        <span className="shrink-0 font-mono tabular-nums opacity-80">{state.duration}</span>
      )}
    </span>
  );
}

/** Choix d'une durée : nombre, moment du décompte, et au tour de qui. */
interface DurationDraft {
  count: string;
  moment: MomentDecompte;
  anchor: string;
}

function DurationFields({
  idPrefix,
  draft,
  onChange,
  anchors,
  disabled,
}: Readonly<{
  idPrefix: string;
  draft: DurationDraft;
  onChange(d: DurationDraft): void;
  anchors: { valeur: string; nom: string }[];
  disabled?: boolean;
}>) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-count`} className="text-xs text-muted-foreground">
          Durée
        </Label>
        <Input
          id={`${idPrefix}-count`}
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="∞"
          value={draft.count}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, count: e.target.value })}
          className="h-9 text-right font-mono tabular-nums"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-moment`} className="text-xs text-muted-foreground">
          Décompte
        </Label>
        <SelectField
          id={`${idPrefix}-moment`}
          value={draft.moment}
          onValueChange={(v) => onChange({ ...draft, moment: v as MomentDecompte })}
          disabled={disabled || !draft.count.trim()}
          options={DURATION_MOMENTS.map((m) => ({ valeur: m.value, nom: m.label }))}
        />
      </div>
      {turnBased(draft.moment) && draft.count.trim() !== '' && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-anchor`} className="text-xs text-muted-foreground">
            Au tour de
          </Label>
          <SelectField
            id={`${idPrefix}-anchor`}
            value={draft.anchor}
            onValueChange={(v) => onChange({ ...draft, anchor: v })}
            disabled={disabled}
            options={anchors}
          />
        </div>
      )}
    </>
  );
}

const countOf = (d: DurationDraft) =>
  d.count.trim() ? Math.min(10_000, Math.max(1, Math.round(Number(d.count)))) : null;

export function StatesManager({
  systeme,
  stateSorts,
  states,
  sheet,
  ecritures,
  bearerId,
  fighters = [],
  actingId = null,
  disabled,
}: Readonly<{
  systeme: SystemeCharge;
  stateSorts: readonly string[];
  states: readonly TimedState[];
  sheet: FichePersonnage;
  ecritures: OperationsPersonnage;
  /** Porteur des états (la fiche). */
  bearerId: string;
  /** Participants du combat : le tour de l'un d'eux peut compter. */
  fighters?: readonly Fighter[];
  /** Participant qui agit : la source proposée quand le système dit `source`. */
  actingId?: string | null;
  disabled?: boolean;
}>) {
  const catalogue = [...systeme.entrees.values()]
    .filter((e) => stateSorts.includes(e.sorte))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const nameOf = (id: string) => fighters.find((f) => f.id === id)?.name;
  const anchors = [
    { valeur: bearerId, nom: 'Lui-même' },
    ...fighters.filter((f) => f.id !== bearerId).map((f) => ({ valeur: f.id, nom: f.name })),
  ];

  /** Durée proposée pour une entrée : celle du système, sinon vide (jusqu'au retrait). */
  const draftFor = (entry: string): DurationDraft => {
    const d = entry === FREE ? null : defaultDurationOf(systeme, entry);
    if (!d) return { count: '', moment: 'fin-round', anchor: bearerId };
    const source = d.anchor === 'source' && actingId ? actingId : bearerId;
    return { count: String(d.duration), moment: d.moment, anchor: source };
  };

  const [choice, setChoice] = useState<string>(catalogue[0]?.id ?? FREE);
  const [freeName, setFreeName] = useState('');
  const [draft, setDraft] = useState<DurationDraft>(() => draftFor(catalogue[0]?.id ?? FREE));
  const [busy, setBusy] = useState(false);

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      return true;
    } catch (err) {
      toast.error(label, { description: messageErreur(err) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const canAdd = choice === FREE ? freeName.trim().length > 0 : Boolean(choice);

  const add = async () => {
    if (!canAdd) return;
    const duree = countOf(draft);
    const decompte = duree ? timingRequest(draft.moment, draft.anchor, bearerId) : null;
    const timed = { ...(duree ? { duree } : {}), ...(decompte ? { decompte } : {}) };
    const ok =
      choice === FREE
        ? await run('L’état n’a pas pu être posé', () =>
            ecritures.bonus({
              nom: freeName.trim(),
              source: FREE_STATE_SOURCE,
              effets: [],
              ...timed,
            }),
          )
        : await run('L’état n’a pas pu être donné', () =>
            ecritures.possession({ entree: choice, ...timed }),
          );
    if (ok) {
      setFreeName('');
      setDraft(draftFor(choice));
    }
  };

  const remove = (s: TimedState) =>
    void run('L’état n’a pas pu être retiré', () =>
      s.kind === 'bonus'
        ? ecritures.retirerBonus(s.bonusId!)
        : ecritures.retirerPossession(s.entry!, s.instance),
    );

  /**
   * Nouvelle durée d'un état : `count` null le garde jusqu'au retrait ; `decompte` absent garde
   * le moment en cours (prolonger), null revient à la fin de round.
   */
  const changeDuration = (
    s: TimedState,
    count: number | null,
    decompte?: { moment: MomentDecompte; de?: string } | null,
  ) =>
    run('La durée n’a pas pu être changée', () => {
      if (s.kind === 'bonus') {
        const b = sheet.state.bonus.find((x) => x.id === s.bonusId);
        if (!b) return Promise.resolve();
        const current = b.decompte ? { moment: b.decompte.moment, de: b.decompte.de } : null;
        const next = decompte === undefined ? current : decompte;
        return ecritures.bonus({
          id: b.id,
          nom: b.nom,
          ...(b.source !== undefined ? { source: b.source } : {}),
          effets: b.effets,
          actif: b.actif,
          ...(count !== null ? { duree: count } : {}),
          ...(count !== null && next ? { decompte: next } : {}),
        });
      }
      return ecritures.possession({
        entree: s.entry!,
        ...(s.instance ? { exemplaire: s.instance } : {}),
        duree: count,
        ...(decompte !== undefined ? { decompte } : {}),
      });
    });

  return (
    <div className="space-y-3">
      {states.length ? (
        <ul className="space-y-1.5">
          {states.map((s) => (
            <li
              key={s.key}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5"
            >
              <StateIcon state={s} className="size-3.5 shrink-0 text-warning" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.name}</span>
              <span className="flex items-center gap-0.5">
                {s.duration !== null && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={disabled || busy || s.duration <= 1}
                    onClick={() => void changeDuration(s, s.duration! - 1)}
                    aria-label={`Un décompte de moins pour ${s.name}`}
                  >
                    <Minus />
                  </Button>
                )}
                <DurationEditor
                  state={s}
                  bearerId={bearerId}
                  anchors={anchors}
                  nameOf={nameOf}
                  disabled={disabled || busy}
                  onSave={(count, decompte) => changeDuration(s, count, decompte)}
                />
                {s.duration !== null && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={disabled || busy}
                    onClick={() => void changeDuration(s, s.duration! + 1)}
                    aria-label={`Un décompte de plus pour ${s.name}`}
                  >
                    <Plus />
                  </Button>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={disabled || busy}
                onClick={() => remove(s)}
                aria-label={`Retirer ${s.name}`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_5.5rem_8.5rem] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <Label htmlFor="state-choice" className="text-xs text-muted-foreground">
            État
          </Label>
          <SelectField
            id="state-choice"
            value={choice}
            onValueChange={(v) => {
              setChoice(v);
              setDraft(draftFor(v));
            }}
            disabled={disabled || busy}
            options={[
              ...catalogue.map((e) => ({ valeur: e.id, nom: e.nom })),
              { valeur: FREE, nom: 'État libre…' },
            ]}
          />
        </div>
        <DurationFields
          idPrefix="state-duration"
          draft={draft}
          onChange={setDraft}
          anchors={anchors}
          disabled={disabled || busy}
        />
        {choice === FREE && (
          <div className="col-span-2 space-y-1.5 sm:col-span-3">
            <Label htmlFor="state-free" className="text-xs text-muted-foreground">
              Nom de l’état libre
            </Label>
            <Input
              id="state-free"
              value={freeName}
              maxLength={200}
              placeholder="Terrifié, à terre, en feu…"
              disabled={disabled || busy}
              onChange={(e) => setFreeName(e.target.value)}
            />
          </div>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={disabled || busy || !canAdd}
          className="col-span-2 h-9 sm:col-span-3 sm:justify-self-end"
        >
          <Hourglass />
          Ajouter
        </Button>
      </form>
      {!catalogue.length && (
        <p className="text-[11px] text-subtle">
          Le système ne déclare pas d’états pour le combat : les états libres restent possibles.
        </p>
      )}
    </div>
  );
}

/**
 * Durée d'un état posé : son libellé court ouvre l'éditeur (nombre, moment, au tour de qui,
 * jusqu'au retrait) ; le libellé complet en info-bulle.
 */
function DurationEditor({
  state,
  bearerId,
  anchors,
  nameOf,
  disabled,
  onSave,
}: Readonly<{
  state: TimedState;
  bearerId: string;
  anchors: { valeur: string; nom: string }[];
  nameOf: (id: string) => string | undefined;
  disabled?: boolean;
  onSave(
    count: number | null,
    decompte: { moment: MomentDecompte; de?: string } | null,
  ): Promise<boolean>;
}>) {
  const [open, setOpen] = useState(false);
  const initial = (): DurationDraft => ({
    count: state.duration !== null ? String(state.duration) : '',
    moment: state.timing?.moment ?? 'fin-round',
    anchor: state.timing?.de ?? bearerId,
  });
  const [draft, setDraft] = useState<DurationDraft>(initial);
  const full = durationLabel(state, { bearerId, nameOf });
  const save = async (d: DurationDraft) => {
    const count = countOf(d);
    const ok = await onSave(count, count ? timingRequest(d.moment, d.anchor, bearerId) : null);
    if (ok) setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(initial());
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={full}
          aria-label={`Durée de ${state.name} : ${full}`}
          className={cn(
            'min-w-16 rounded-md px-1.5 py-0.5 text-center text-xs tabular-nums transition-colors',
            'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            state.duration === null ? 'text-subtle' : 'text-muted-foreground',
          )}
        >
          {durationShort(state) ?? 'jusqu’au retrait'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <p className="text-[13px] font-medium">{state.name}</p>
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void save(draft);
          }}
        >
          <DurationFields
            idPrefix={`edit-${state.key}`}
            draft={draft}
            onChange={setDraft}
            anchors={anchors}
            disabled={disabled}
          />
          <div className="flex justify-end gap-2 pt-1">
            {state.duration !== null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => void save({ ...draft, count: '' })}
              >
                Jusqu’au retrait
              </Button>
            )}
            <Button type="submit" size="sm" disabled={disabled}>
              Enregistrer
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
