'use client';

/**
 * États d'un participant (docs/combat.md § 4.5) : ceux du catalogue du système (sortes d'états
 * déclarées par la présentation, avec leurs effets) et l'état libre (nom seul, sans effet), à
 * durée en rounds ou jusqu'au retrait. Écrits par les routes de la fiche (character) : le
 * décompte de fin de round et son retour arrière restent au serveur.
 */
import type { SystemeCharge } from '@vtt/rules';
import { Hourglass, Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { messageErreur } from '@/lib/api';
import { STATE_ICONS } from '@/lib/combat/state-icons';
import type { DemandePossession, FichePersonnage, OperationsPersonnage } from '@/lib/personnages';
import { FREE_STATE_SOURCE, type TimedState } from './use-cast';

/** Demande de possession avec une durée (`duree`, docs/combat.md § 11.2). */
type TimedPossession = DemandePossession & { duree?: number };

const FREE = '__libre__';

/** « 2 rounds », « 1 round », « jusqu'au retrait ». */
export function durationLabel(duration: number | null): string {
  if (duration === null) return 'jusqu’au retrait';
  return `${duration} round${duration > 1 ? 's' : ''}`;
}

/** Icône d'un état (présentation du système), dessinée par lucide. */
export function StateIcon({
  state,
  className,
}: Readonly<{ state: TimedState; className?: string }>) {
  const Icon = STATE_ICONS[state.icon];
  return <Icon className={className ?? 'size-3 shrink-0'} aria-hidden />;
}

/** Pastille d'un état : icône, nom et durée restante. */
export function StateBadge({
  state,
  className,
}: Readonly<{ state: TimedState; className?: string }>) {
  return (
    <span
      className={
        'inline-flex h-5 max-w-40 items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 text-[11px] font-medium text-warning ' +
        (className ?? '')
      }
      title={`${state.name} : ${durationLabel(state.duration)}`}
    >
      <StateIcon state={state} />
      <span className="truncate">{state.name}</span>
      {state.duration !== null && (
        <span className="shrink-0 font-mono tabular-nums opacity-80">{state.duration}</span>
      )}
    </span>
  );
}

export function StatesManager({
  systeme,
  stateSorts,
  states,
  sheet,
  ecritures,
  disabled,
}: Readonly<{
  systeme: SystemeCharge;
  stateSorts: readonly string[];
  states: readonly TimedState[];
  sheet: FichePersonnage;
  ecritures: OperationsPersonnage;
  disabled?: boolean;
}>) {
  const catalogue = [...systeme.entrees.values()]
    .filter((e) => stateSorts.includes(e.sorte))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const [choice, setChoice] = useState<string>(catalogue[0]?.id ?? FREE);
  const [freeName, setFreeName] = useState('');
  const [duration, setDuration] = useState('');
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

  const rounds = duration.trim() ? Math.max(1, Math.round(Number(duration))) : null;
  const canAdd = choice === FREE ? freeName.trim().length > 0 : Boolean(choice);

  const add = async () => {
    if (!canAdd) return;
    const ok =
      choice === FREE
        ? await run('L’état n’a pas pu être posé', () =>
            ecritures.bonus({
              nom: freeName.trim(),
              source: FREE_STATE_SOURCE,
              effets: [],
              ...(rounds ? { duree: rounds } : {}),
            }),
          )
        : await run('L’état n’a pas pu être donné', () => {
            const d: TimedPossession = { entree: choice, ...(rounds ? { duree: rounds } : {}) };
            return ecritures.possession(d);
          });
    if (ok) {
      setFreeName('');
      setDuration('');
    }
  };

  const remove = (s: TimedState) =>
    void run('L’état n’a pas pu être retiré', () =>
      s.kind === 'bonus'
        ? ecritures.retirerBonus(s.bonusId!)
        : ecritures.retirerPossession(s.entry!, s.instance),
    );

  const changeDuration = (s: TimedState, next: number) => {
    if (next < 1) return;
    void run('La durée n’a pas pu être changée', () => {
      if (s.kind === 'bonus') {
        const b = sheet.state.bonus.find((x) => x.id === s.bonusId);
        if (!b) return Promise.resolve();
        return ecritures.bonus({
          id: b.id,
          nom: b.nom,
          source: b.source,
          effets: b.effets,
          actif: b.actif,
          duree: next,
        });
      }
      const d: TimedPossession = {
        entree: s.entry!,
        ...(s.instance ? { exemplaire: s.instance } : {}),
        duree: next,
      };
      return ecritures.possession(d);
    });
  };

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
              {s.duration !== null ? (
                <span className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={disabled || busy || s.duration <= 1}
                    onClick={() => changeDuration(s, s.duration! - 1)}
                    aria-label={`Un round de moins pour ${s.name}`}
                  >
                    <Minus />
                  </Button>
                  <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">
                    {durationLabel(s.duration)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={disabled || busy}
                    onClick={() => changeDuration(s, s.duration! + 1)}
                    aria-label={`Un round de plus pour ${s.name}`}
                  >
                    <Plus />
                  </Button>
                </span>
              ) : (
                <span className="text-xs text-subtle">jusqu’au retrait</span>
              )}
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
        className="grid gap-2 sm:grid-cols-[1fr_6.5rem_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="state-choice" className="text-xs text-muted-foreground">
            État
          </Label>
          <SelectField
            id="state-choice"
            value={choice}
            onValueChange={setChoice}
            disabled={disabled || busy}
            options={[
              ...catalogue.map((e) => ({ valeur: e.id, nom: e.nom })),
              { valeur: FREE, nom: 'État libre…' },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state-duration" className="text-xs text-muted-foreground">
            Durée (rounds)
          </Label>
          <Input
            id="state-duration"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="∞"
            value={duration}
            disabled={disabled || busy}
            onChange={(e) => setDuration(e.target.value)}
            className="h-9 text-right font-mono tabular-nums"
          />
        </div>
        <Button type="submit" size="sm" disabled={disabled || busy || !canAdd} className="h-9">
          <Hourglass />
          Ajouter
        </Button>
        {choice === FREE && (
          <div className="space-y-1.5 sm:col-span-3">
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
      </form>
      {!catalogue.length && (
        <p className="text-[11px] text-subtle">
          Le système ne déclare pas d’états pour le combat : les états libres restent possibles.
        </p>
      )}
    </div>
  );
}
