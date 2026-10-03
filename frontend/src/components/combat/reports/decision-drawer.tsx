'use client';

/**
 * Tiroir de décision d'un rapport (docs/combat.md § 7.1, § 12.4) : pour chaque cible,
 * appliquer, ne pas appliquer ou décider plus tard ; modifier avant d'appliquer (valeur par
 * valeur, ±1 et saisie, moitié, double, résistance − n, aucun dégât, type de dégâts, état
 * ajouté ou retiré avec sa durée, table appliquée ou autre entrée, réattribution à un autre
 * personnage) avec l'aperçu de la ressource avant et après ; coûts de l'attaquant à part ;
 * note facultative. Aucun dé n'est relancé : le serveur applique ces valeurs telles quelles.
 */
import {
  ATTACK_NOTE_MAX,
  type Attack,
  type AttackModification,
  type AttackModificationInput,
  type AttackTableChoice,
  type AttackTarget,
} from '@vtt/contracts';
import type { SystemeCharge } from '@vtt/rules';
import { Check, Minus, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useComputedSheet } from '@/components/combat/attack/use-attack-context';
import { combatErrorMessage } from '@/lib/combat/api';
import { useAttackCommands } from '@/lib/combat/use-attacks';
import { outcomeLabel } from '@/lib/combat/view';
import { hasSuccessRule } from '@/lib/combat/actions';
import { cn } from '@/lib/utils';
import type { CastMember } from '../turns/use-cast';
import { reportDefeated } from './defeated-dialog';
import {
  attributeLabel,
  damageTypes,
  entryName,
  modificationText,
  rollSummary,
  tableName,
} from './labels';
import {
  actorDraftOf,
  addEntry,
  adjust,
  applyToValue,
  buildApply,
  decidableTargets,
  defeatedBy,
  double,
  draftOf,
  halve,
  isAmount,
  proposedFor,
  reduceBy,
  removeAt,
  setAmount,
  setDamageType,
  setDuration,
  toInput,
  zero,
  type ActorDraft,
  type TargetDraft,
} from './model';

type Mode = 'apply' | 'skip' | 'later';

export function DecisionDrawer({
  campaignId,
  attack,
  systeme,
  cast,
  stateSorts,
  onClose,
}: Readonly<{
  campaignId: string;
  attack: Attack | null;
  systeme: SystemeCharge | null;
  cast: ReadonlyMap<string, CastMember>;
  stateSorts: readonly string[];
  onClose(): void;
}>) {
  return (
    <Dialog open={attack !== null} onOpenChange={(open) => !open && onClose()}>
      {attack && (
        <SheetContent cote="right" className="overflow-y-auto sm:max-w-lg">
          <DrawerBody
            key={`${attack.id}:${attack.version}`}
            campaignId={campaignId}
            attack={attack}
            systeme={systeme}
            cast={cast}
            stateSorts={stateSorts}
            onClose={onClose}
          />
        </SheetContent>
      )}
    </Dialog>
  );
}

function DrawerBody({
  campaignId,
  attack,
  systeme,
  cast,
  stateSorts,
  onClose,
}: Readonly<{
  campaignId: string;
  attack: Attack;
  systeme: SystemeCharge | null;
  cast: ReadonlyMap<string, CastMember>;
  stateSorts: readonly string[];
  onClose(): void;
}>) {
  const commands = useAttackCommands(campaignId);
  const targets = decidableTargets(attack);
  const [drafts, setDrafts] = useState<Record<string, TargetDraft>>(() =>
    Object.fromEntries(targets.map((t) => [t.characterId, draftOf(t)])),
  );
  const [modes, setModes] = useState<Record<string, Mode>>(() =>
    Object.fromEntries(targets.map((t) => [t.characterId, 'apply' as Mode])),
  );
  const [actor, setActor] = useState<ActorDraft | null>(() => actorDraftOf(attack));
  const [actorLater, setActorLater] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const attacker = cast.get(attack.attackerId);
  const action = systeme?.actions.get(attack.action.id) ?? null;

  const chosen = targets
    .filter((t) => modes[t.characterId] !== 'later')
    .map((t) => ({ ...drafts[t.characterId]!, apply: modes[t.characterId] === 'apply' }));
  const actorSent = actor && !actorLater ? actor : null;
  const nothing = chosen.length === 0 && !actorSent;

  const submit = async () => {
    setBusy(true);
    try {
      const updated = await commands.apply(attack.id, buildApply(attack, chosen, actorSent, note));
      reportDefeated(defeatedBy(updated));
      toast.success(
        chosen.some((d) => d.apply) || actorSent?.apply ? 'Décision appliquée' : 'Rapport écarté',
      );
      onClose();
    } catch (err) {
      toast.error('La décision n’a pas pu être appliquée', {
        description: combatErrorMessage(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="space-y-1 px-5 pb-4 pt-5 pr-12">
        <DialogTitle className="text-base">Décider : {attack.action.name}</DialogTitle>
        <DialogDescription className="text-xs">
          {attacker?.name ?? 'Attaquant'} · les valeurs proposées tiennent déjà compte de la cible
          (encaissement, résistances). Rien n’est relancé.
        </DialogDescription>
      </header>

      <div className="flex-1 space-y-3 px-5 pb-4">
        {targets.map((t) => (
          <TargetEditor
            key={t.characterId}
            attack={attack}
            target={t}
            draft={drafts[t.characterId]!}
            mode={modes[t.characterId] ?? 'apply'}
            systeme={systeme}
            cast={cast}
            stateSorts={stateSorts}
            successRule={hasSuccessRule(action)}
            disabled={busy}
            onMode={(m) => setModes((s) => ({ ...s, [t.characterId]: m }))}
            onDraft={(d) => setDrafts((s) => ({ ...s, [t.characterId]: d }))}
          />
        ))}

        {actor && (
          <section className="rounded-xl border border-border bg-surface p-3">
            <div className="mb-2 flex items-center gap-2">
              <p className="flex-1 text-[13px] font-semibold">
                Coûts de l’attaquant{attacker ? ` (${attacker.name})` : ''}
              </p>
              <ModeSwitch
                value={actorLater ? 'later' : modeOf(actor.apply)}
                onChange={(m) => {
                  setActorLater(m === 'later');
                  if (m !== 'later') setActor({ ...actor, apply: m === 'apply' });
                }}
                disabled={busy}
                label="Coûts de l’attaquant"
              />
            </div>
            {!actorLater && actor.apply && (
              <ModificationsEditor
                mods={actor.modifications}
                original={attack.actor?.modifications ?? []}
                proposed={(attack.actor?.modifications ?? []).map(toInput)}
                systeme={systeme}
                entityType={attacker?.type ?? null}
                characterId={attack.attackerId}
                stateSorts={stateSorts}
                disabled={busy}
                onChange={(modifications) => setActor({ ...actor, modifications })}
              />
            )}
          </section>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="decision-note" className="text-xs text-muted-foreground">
            Note (facultative)
          </Label>
          <Textarea
            id="decision-note"
            value={note}
            maxLength={ATTACK_NOTE_MAX}
            placeholder="Esquive narrative, cible déjà à terre…"
            onChange={(e) => setNote(e.target.value)}
            className="min-h-16 text-[13px]"
          />
        </div>
      </div>

      <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-popover px-5 py-3">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Annuler
        </Button>
        <Button onClick={() => void submit()} loading={busy} disabled={nothing}>
          <Check />
          Valider la décision
        </Button>
      </footer>
    </div>
  );
}

function ModeSwitch({
  value,
  onChange,
  disabled,
  label,
}: Readonly<{
  value: Mode;
  onChange(m: Mode): void;
  disabled?: boolean;
  label: string;
}>) {
  const options: { v: Mode; t: string }[] = [
    { v: 'apply', t: 'Appliquer' },
    { v: 'skip', t: 'Ne pas appliquer' },
    { v: 'later', t: 'Plus tard' },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex shrink-0 overflow-hidden rounded-lg border border-border-strong"
    >
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cn(
            'px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60',
            value === o.v ? MODE_ACTIF[o.v] : 'text-muted-foreground hover:bg-surface-3',
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

function TargetEditor({
  attack,
  target: t,
  draft,
  mode,
  systeme,
  cast,
  stateSorts,
  successRule,
  disabled,
  onMode,
  onDraft,
}: Readonly<{
  attack: Attack;
  target: AttackTarget;
  draft: TargetDraft;
  mode: Mode;
  systeme: SystemeCharge | null;
  cast: ReadonlyMap<string, CastMember>;
  stateSorts: readonly string[];
  successRule: boolean;
  disabled: boolean;
  onMode(m: Mode): void;
  onDraft(d: TargetDraft): void;
}>) {
  const member = cast.get(t.characterId);
  const name = member?.name ?? 'Personnage';
  const outcome = outcomeLabel(t.result?.outcome ?? null, successRule);
  const roll = rollSummary(systeme, t.result?.roll ?? null);
  const touched = draft.redirectTo ?? t.characterId;
  const others = [...cast.values()].filter((m) => m.id !== t.characterId && !m.inCreation);

  return (
    <section
      className={cn(
        'rounded-xl border p-3 transition-colors',
        mode === 'apply'
          ? 'border-border bg-surface'
          : 'border-dashed border-border bg-transparent',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Illustration
          largeur={32}
          src={member?.portraitUrl ?? null}
          graine={name}
          position="top"
          className="size-8 rounded-full ring-1 ring-border"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {outcome && <Badge ton={TON_ISSUE[outcome.tone] ?? 'neutre'}>{outcome.label}</Badge>}
            {roll && <span className="font-mono tabular-nums">jet {roll}</span>}
          </span>
        </span>
        <ModeSwitch
          value={mode}
          onChange={onMode}
          disabled={disabled}
          label={`Décision pour ${name}`}
        />
      </div>

      {mode === 'apply' && (
        <div className="mt-3 space-y-3">
          <ModificationsEditor
            mods={draft.modifications}
            original={t.result?.modifications ?? []}
            proposed={proposedFor(t)}
            systeme={systeme}
            entityType={cast.get(touched)?.type ?? null}
            characterId={touched}
            stateSorts={stateSorts}
            disabled={disabled}
            onChange={(modifications) => onDraft({ ...draft, modifications })}
          />
          <TablesEditor
            attack={attack}
            target={t}
            tables={draft.tables}
            systeme={systeme}
            disabled={disabled}
            onChange={(tables) => onDraft({ ...draft, tables })}
          />
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`redirect-${t.characterId}`} className="text-xs text-muted-foreground">
              Appliquer à
            </Label>
            <SelectField
              id={`redirect-${t.characterId}`}
              value={draft.redirectTo ?? ''}
              disabled={disabled}
              onValueChange={(v) => onDraft({ ...draft, redirectTo: v || null })}
              className="h-8 w-56 text-[13px]"
              options={[
                { valeur: '', nom: `${name} (la cible)` },
                ...others.map((m) => ({ valeur: m.id, nom: m.name })),
              ]}
            />
          </div>
          {draft.redirectTo && (
            <p className="text-[11px] text-warning">
              Réattribué : les mêmes valeurs s’appliquent à {cast.get(draft.redirectTo)?.name}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Valeurs d'une cible (ou des coûts de l'attaquant), modifiables, avec l'aperçu avant/après. */
function ModificationsEditor({
  mods,
  original,
  proposed,
  systeme,
  entityType,
  characterId,
  stateSorts,
  disabled,
  onChange,
}: Readonly<{
  mods: readonly AttackModificationInput[];
  /** Modifications du rapport (résistances appliquées, en info). */
  original: readonly AttackModification[];
  /** Valeurs proposées, pour « Réinitialiser ». */
  proposed: readonly AttackModificationInput[];
  systeme: SystemeCharge | null;
  entityType: string | null;
  characterId: string;
  stateSorts: readonly string[];
  disabled: boolean;
  onChange(mods: AttackModificationInput[]): void;
}>) {
  const { fiche } = useComputedSheet({ systeme }, characterId);
  const [resist, setResist] = useState('1');
  const [newState, setNewState] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const types = damageTypes(systeme);
  const catalogue = useMemo(
    () =>
      systeme
        ? [...systeme.entrees.values()]
            .filter((e) => stateSorts.includes(e.sorte))
            .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
        : [],
    [systeme, stateSorts],
  );
  const resistancesOf = (attribute: string) =>
    original.flatMap((m) =>
      m.kind === 'attribute' && m.attribute === attribute ? (m.resistances ?? []) : [],
    );
  const hasAmounts = mods.some(isAmount);
  const current = (key: string) => {
    const v = fiche?.valeurs.get(key)?.valeur;
    return typeof v === 'number' ? v : null;
  };

  return (
    <div className="space-y-2">
      {mods.length === 0 && (
        <p className="text-[13px] text-muted-foreground">Rien à appliquer à ce personnage.</p>
      )}
      <ul className="space-y-1.5">
        {mods.map((m, i) => (
          <li key={i} className="rounded-lg border border-border bg-background/40 px-2.5 py-2">
            {m.kind === 'attribute' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-16 text-[13px] font-medium">
                  {attributeLabel(systeme, m.attribute, entityType)}
                </span>
                <span className="font-mono text-xs text-subtle" aria-hidden>
                  {SIGNE_OPERATION[m.operation] ?? '='}
                </span>
                <span className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={disabled || m.value <= 0}
                    onClick={() => onChange(adjust(mods, -1, i))}
                    aria-label="Un de moins"
                  >
                    <Minus />
                  </Button>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={String(m.value)}
                    disabled={disabled}
                    onChange={(e) => onChange(setAmount(mods, i, Number(e.target.value)))}
                    className="h-7 w-14 px-1 text-center font-mono tabular-nums"
                    aria-label={`Valeur : ${attributeLabel(systeme, m.attribute, entityType)}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={disabled}
                    onClick={() => onChange(adjust(mods, 1, i))}
                    aria-label="Un de plus"
                  >
                    <Plus />
                  </Button>
                </span>
                {types.length > 0 && m.operation !== 'set' && (
                  <SelectField
                    value={m.damageType ?? ''}
                    disabled={disabled}
                    onValueChange={(v) => onChange(setDamageType(mods, i, v || null))}
                    className="h-7 w-32 text-xs"
                    aria-label="Type de dégâts"
                    options={[
                      { valeur: '', nom: 'Sans type' },
                      ...types.map((d) => ({ valeur: d.id, nom: d.nom })),
                    ]}
                  />
                )}
                {current(m.attribute) !== null && (
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {current(m.attribute)} →{' '}
                    <span className="font-semibold text-foreground">
                      {applyToValue(current(m.attribute)!, m)}
                    </span>
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={disabled}
                  onClick={() => onChange(removeAt(mods, i))}
                  aria-label="Retirer cette valeur"
                  className={current(m.attribute) === null ? 'ml-auto' : ''}
                >
                  <Trash2 />
                </Button>
                {resistancesOf(m.attribute).length > 0 && (
                  <p className="w-full text-[11px] text-subtle">
                    Résistances :{' '}
                    {resistancesOf(m.attribute)
                      .map(
                        (r) =>
                          `${r.name} (${resistanceEffect(r.operation, r.value)})${r.ignored ? ', écartée' : ''}`,
                      )
                      .join(' · ')}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {m.operation === 'remove' ? 'Retirer : ' : ''}
                  {entryName(systeme, m.entry)}
                </span>
                {m.operation === 'give' && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="∞"
                    value={m.duration ? String(m.duration) : ''}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange(setDuration(mods, i, e.target.value ? Number(e.target.value) : null))
                    }
                    className="h-7 w-16 px-1 text-center font-mono tabular-nums"
                    aria-label={`Durée en rounds : ${entryName(systeme, m.entry)}`}
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  disabled={disabled}
                  onClick={() => onChange(removeAt(mods, i))}
                  aria-label={`Ne pas donner ${entryName(systeme, m.entry)}`}
                >
                  <X />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {hasAmounts && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="xs"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange(halve(mods))}
          >
            Moitié
          </Button>
          <Button
            size="xs"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange(double(mods))}
          >
            Double
          </Button>
          <span className="flex items-center gap-1">
            <Button
              size="xs"
              variant="secondary"
              disabled={disabled || !(Number(resist) > 0)}
              onClick={() => onChange(reduceBy(mods, Number(resist)))}
            >
              Résistance −
            </Button>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={resist}
              onChange={(e) => setResist(e.target.value)}
              className="h-7 w-12 px-1 text-center font-mono tabular-nums"
              aria-label="Résistance à retirer"
            />
          </span>
          <Button
            size="xs"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange(zero(mods))}
          >
            Aucun dégât
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={disabled}
            onClick={() => onChange([...proposed])}
          >
            <RotateCcw />
            Réinitialiser
          </Button>
        </div>
      )}

      <form
        className="flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newState) return;
          onChange(addEntry(mods, newState, newDuration ? Number(newDuration) : null));
          setNewState('');
          setNewDuration('');
        }}
      >
        {catalogue.length > 0 && (
          <>
            <SelectField
              value={newState}
              onValueChange={setNewState}
              disabled={disabled}
              className="h-7 w-40 text-xs"
              aria-label="État à ajouter"
              placeholder="Ajouter un état…"
              options={catalogue.map((e) => ({ valeur: e.id, nom: e.nom }))}
            />
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="∞"
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              className="h-7 w-14 px-1 text-center font-mono tabular-nums"
              aria-label="Durée de l’état ajouté, en rounds"
            />
            <Button type="submit" size="xs" variant="ghost" disabled={disabled || !newState}>
              <Plus />
              État
            </Button>
          </>
        )}
      </form>
      <p className="sr-only" aria-live="polite">
        {mods.map((m) => modificationText(systeme, m, entityType)).join(', ')}
      </p>
    </div>
  );
}

/** Tables tirées : appliquer la ligne, ne pas l'appliquer, ou donner une autre entrée. */
function TablesEditor({
  target: t,
  tables,
  systeme,
  disabled,
  onChange,
}: Readonly<{
  attack: Attack;
  target: AttackTarget;
  tables: readonly AttackTableChoice[];
  systeme: SystemeCharge | null;
  disabled: boolean;
  onChange(tables: AttackTableChoice[]): void;
}>) {
  const draws = t.result?.tables ?? [];
  if (!draws.length) return null;
  return (
    <ul className="space-y-1.5">
      {draws.map((d, i) => {
        const choice = tables[i] ?? { table: d.table, apply: true };
        const table = systeme?.tables.get(d.table);
        const entries = (table?.lignes ?? [])
          .filter((l) => l.entree)
          .map((l) => ({ valeur: l.entree!, nom: `${l.min}–${l.max} · ${l.nom}` }));
        const set = (patch: Partial<AttackTableChoice>) =>
          onChange(
            draws.map((x, j) =>
              j === i ? { ...choice, ...patch } : (tables[j] ?? { table: x.table, apply: true }),
            ),
          );
        return (
          <li key={i} className="rounded-lg border border-border bg-background/40 px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-[13px]">
                <span className="font-medium">{d.name ?? tableName(systeme, d.table)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  : {d.value}
                  {d.modifier ? ` (dont ${signed(d.modifier)})` : ''} →{' '}
                  {d.line?.name ?? 'aucune ligne'}
                </span>
              </span>
              <Button
                size="xs"
                variant={choice.apply ? 'secondary' : 'ghost'}
                aria-pressed={choice.apply}
                disabled={disabled}
                onClick={() => set({ apply: !choice.apply })}
              >
                {choice.apply ? <Check /> : <X />}
                {choice.apply ? 'Appliquée' : 'Écartée'}
              </Button>
            </div>
            {choice.apply && entries.length > 0 && (
              <SelectField
                value={choice.entry ?? ''}
                disabled={disabled}
                onValueChange={(v) => set({ entry: v || undefined })}
                className="mt-1.5 h-7 text-xs"
                aria-label="Entrée donnée"
                options={[
                  { valeur: '', nom: `Ligne tirée${d.line?.name ? ` (${d.line.name})` : ''}` },
                  ...entries,
                ]}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

const modeOf = (apply: boolean) => (apply ? 'apply' : 'skip');

/** Mode choisi du sélecteur : sa couleur. */
const MODE_ACTIF: Record<string, string> = {
  apply: 'bg-primary/15 text-primary-strong',
  skip: 'bg-destructive/15 text-destructive',
  later: 'bg-surface-3 text-foreground',
};

const TON_ISSUE: Partial<Record<string, 'arcane' | 'succes' | 'danger'>> = {
  critical: 'arcane',
  success: 'succes',
  fumble: 'danger',
};

const SIGNE_OPERATION: Partial<Record<string, string>> = { add: '+', subtract: '−' };

/** Effet d'une résistance, lisible : immunité, ×2, −3. */
function resistanceEffect(operation: string, value: number): string {
  if (operation === 'cancel') return 'immunité';
  if (operation === 'multiply') return `×${value}`;
  return `−${value}`;
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;
