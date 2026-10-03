'use client';

/**
 * Carte d'un rapport d'attaque, une par cible comme l'ancienne app (docs/combat.md § 7,
 * § 12.4) : liseré d'état à gauche, action et arme, attaquant → cible, pastille Touché ou
 * Manqué (Critique, Échec critique), cases Jet et valeurs en gros chiffres, symboles, marques
 * (auto-attaque, hors tour, ajusté à la main, caché), réductions de la cible détaillées (brut,
 * type, chaque réduction, résultat), situation retenue, états donnés, tables tirées, dés et
 * déroulé repliés ; puis Appliquer, Modifier, Ne pas appliquer. Décidé : grisé, ce qui a été
 * appliqué, « Annuler l'application » (conflit : « Annuler quand même »). En cours : défense
 * à donner ou à passer, dés à tirer par le serveur, abandon. Les coûts de l'attaquant ont leur
 * propre ligne (`ActorCostCard`).
 */
import type { Attack, AttackTarget } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import {
  ArrowRight,
  Ban,
  Battery,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Dices,
  EyeOff,
  Filter,
  IdCard,
  MoreHorizontal,
  Pencil,
  ShieldOff,
  ShieldQuestion,
  Skull,
  Swords,
  Undo2,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { DesSymboles, ResultatsSymboles } from '@/components/fiche/symboles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info } from '@/components/ui/tooltip';
import { combatErrorMessage } from '@/lib/combat/api';
import { hasSuccessRule } from '@/lib/combat/actions';
import { ATTACK_STATUS_LABELS, useAttackCommands } from '@/lib/combat/use-attacks';
import { decisionLabel, outcomeLabel, type OutcomeTone } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { awaitingMyReaction } from '../player/model';
import { ReactionForm } from '../player/reaction-prompt';
import type { CastMember } from '../turns/use-cast';
import { reportDefeated } from './defeated-dialog';
import {
  attributeLabel,
  damageTypeName,
  dieName,
  keyParams,
  modificationText,
  pathLabel,
  situationText,
  tableName,
} from './labels';
import {
  actorDecidable,
  buildApply,
  canRevert,
  decidableTargets,
  defeatedBy,
  DICE_ORIGIN_LABELS,
  diceOrigin,
  draftOf,
  isDecidable,
  isOpen,
  isPending,
  reductionDetail,
  revertConflictOf,
  targetAmounts,
  targetOthers,
  toInput,
  type RevertConflict,
} from './model';

const HOUR = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const TONES: Record<OutcomeTone, 'arcane' | 'succes' | 'danger' | 'neutre' | 'alerte'> = {
  critical: 'arcane',
  success: 'succes',
  fumble: 'danger',
  failure: 'neutre',
  neutral: 'neutre',
};

/** Couleur du liseré : l'état de la carte d'un coup d'œil. */
function railOf(t: AttackTarget, tone: OutcomeTone | null, attack: Attack): string {
  if (attack.status === 'cancelled' || attack.status === 'failed' || t.status === 'failed')
    return 'bg-destructive/40';
  if (t.decision === 'applied') return 'bg-success/60';
  if (t.decision === 'skipped') return 'bg-border-strong';
  if (t.status === 'awaiting_reaction' || t.status === 'awaiting_dice') return 'bg-warning';
  if (tone === 'critical') return 'bg-arcane';
  if (tone === 'fumble') return 'bg-destructive';
  if (tone === 'failure') return 'bg-subtle';
  return 'bg-primary';
}

/** Actions communes à toutes les cartes d'une attaque (écarter, annuler, abandonner…). */
function useAttackActions(campaignId: string, attack: Attack) {
  const commands = useAttackCommands(campaignId);
  const [busy, setBusy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<RevertConflict[] | null>(null);

  const run = async (key: string, label: string, work: () => Promise<Attack>) => {
    setBusy(key);
    try {
      const updated = await work();
      reportDefeated(defeatedBy(updated));
      return true;
    } catch (err) {
      const c = revertConflictOf(err);
      if (key === 'revert' && c) setConflict(c);
      else toast.error(label, { description: combatErrorMessage(err) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    conflict,
    clearConflict: () => setConflict(null),
    /** Une cible telle quelle (appliquer ou non), sans toucher aux autres. */
    decideOne: (t: AttackTarget, apply: boolean) =>
      void run(`${t.characterId}:${apply}`, 'La décision n’a pas pu être appliquée', () =>
        commands.apply(attack.id, buildApply(attack, [{ ...draftOf(t), apply }], null)),
      ),
    /** Tout le rapport tel quel : chaque cible à décider et les coûts de l'attaquant. */
    applyAll: () =>
      void run('all', 'Le rapport n’a pas pu être appliqué', () =>
        commands.apply(
          attack.id,
          buildApply(
            attack,
            decidableTargets(attack).map(draftOf),
            actorDecidable(attack)
              ? { apply: true, modifications: attack.actor!.modifications.map(toInput) }
              : null,
          ),
        ),
      ),
    decideActor: (apply: boolean) =>
      void run(`actor:${apply}`, 'La décision n’a pas pu être appliquée', () =>
        commands.apply(attack.id, { version: attack.version, targets: [], actor: { apply } }),
      ),
    dismiss: () =>
      void run('dismiss', 'Le rapport n’a pas pu être écarté', () =>
        commands.dismiss(attack.id, { version: attack.version }),
      ),
    revert: (force: boolean) =>
      void run('revert', 'L’application n’a pas pu être annulée', () =>
        commands.revert(attack.id, {
          version: attack.version,
          ...(force ? { force: true } : {}),
        }),
      ).then((ok) => ok && setConflict(null)),
    serverDice: () => {
      const step = attack.pendingSteps[0];
      if (!step) return;
      void run('dice', 'Les dés n’ont pas pu être tirés', () =>
        commands.submitDice(attack.id, { stepId: step.id, results: [], serverFallback: true }),
      );
    },
    cancel: () =>
      void run('cancel', 'L’attaque n’a pas pu être abandonnée', () =>
        commands.cancel(attack.id, { version: attack.version }),
      ),
    /** Le MJ passe la défense des cibles qui n'ont pas répondu. */
    skipReactions: (targets: readonly AttackTarget[]) =>
      void run('skip', 'Les défenses n’ont pas pu être passées', async () => {
        let last = attack;
        for (const t of targets)
          last = await commands.react(attack.id, { characterId: t.characterId, skip: true });
        return last;
      }),
  };
}

export interface ReportCardProps {
  campaignId: string;
  attack: Attack;
  target: AttackTarget;
  /** Rang de la cible dans l'attaque (0…) et nombre de cibles. */
  index: number;
  count: number;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  cast: ReadonlyMap<string, CastMember>;
  /** Ouvre le tiroir de décision (modifier avant d'appliquer). */
  onDecide(attack: Attack): void;
  /** Ouvre la fiche détaillée d'un personnage. */
  onOpenCharacter(characterId: string): void;
  /** Ne montre que les rapports de ce personnage. */
  onFilter(characterId: string): void;
}

export function ReportCard({
  campaignId,
  attack,
  target: t,
  index,
  count,
  systeme,
  presentation,
  cast,
  onDecide,
  onOpenCharacter,
  onFilter,
}: Readonly<ReportCardProps>) {
  const actions = useAttackActions(campaignId, attack);
  const { busy, conflict } = actions;
  const [details, setDetails] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const attacker = cast.get(attack.attackerId);
  const member = cast.get(t.characterId);
  const nameOf = (id: string) => cast.get(id)?.name ?? 'Personnage';
  const attackerName = attacker?.name ?? 'Personnage';
  const name = member?.name ?? 'Personnage';
  const action = systeme?.actions.get(attack.action.id) ?? null;
  const result = t.result ?? null;
  const outcome = outcomeLabel(result?.outcome ?? t.view?.outcome ?? null, hasSuccessRule(action));
  const roll = result?.roll ?? t.view?.roll ?? null;
  const params = keyParams(systeme, attack.action.id, attack.params);
  const situation = situationText(systeme, attack.action.id, attack.params);
  const amounts = targetAmounts(t);
  const others = targetOthers(t);
  const applied = t.applied ?? null;
  const decidable = isPending(attack) && isDecidable(t);
  const decided = t.decision === 'applied' || t.decision === 'skipped';
  const closed = attack.status === 'cancelled' || attack.status === 'failed';
  const awaiting = awaitingMyReaction(attack, 'all');
  const selfTarget = t.characterId === attack.attackerId;
  const explanations = result?.explanations ?? t.view?.explanations ?? [];

  let status: ReactNode = null;
  if (closed) status = <Badge ton="danger">{ATTACK_STATUS_LABELS[attack.status]}</Badge>;
  else if (t.status === 'awaiting_reaction') status = <Badge ton="alerte">Défense attendue</Badge>;
  else if (t.status === 'awaiting_dice') status = <Badge ton="alerte">Dés attendus</Badge>;
  else if (t.status === 'failed') status = <Badge ton="danger">Refusé</Badge>;
  else if (outcome) status = <Badge ton={TONES[outcome.tone]}>{outcome.label}</Badge>;

  // Actions de la cible : une seule famille selon l'état de l'attaque
  let mode: 'decider' | 'reagir' | 'serveur' | 'annuler' | 'statut' = 'statut';
  let bordure = 'border-border';
  if (decidable)
    bordure =
      outcome?.tone === 'success' || outcome?.tone === 'critical'
        ? 'border-primary/35'
        : 'border-border-strong';
  if (decidable) mode = 'decider';
  else if (t.status === 'awaiting_reaction' && !closed) mode = 'reagir';
  else if (isOpen(attack) && attack.pendingSteps.length > 0) mode = 'serveur';
  else if (t.decision === 'applied' && canRevert(attack) && !conflict) mode = 'annuler';

  return (
    <article
      className={cn(
        'relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-surface transition-opacity',
        bordure,
        (decided || closed) && 'opacity-60 hover:opacity-100 focus-within:opacity-100',
      )}
      aria-label={`${attack.action.name} : ${attackerName} contre ${name}`}
    >
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 w-1', railOf(t, outcome?.tone ?? null, attack))}
      />

      <header className="flex items-start gap-2 pl-4 pr-2 pt-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Swords className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">
              {params.length ? params.join(', ') : attack.action.name}
            </span>
          </p>
          {params.length > 0 && (
            <p className="truncate text-[11px] text-muted-foreground">{attack.action.name}</p>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1">
          {status}
          <CardMenu
            attack={attack}
            target={t}
            attackerName={attackerName}
            name={name}
            busy={busy !== null}
            confirmDismiss={confirmDismiss}
            setConfirmDismiss={setConfirmDismiss}
            awaiting={awaiting}
            actions={actions}
            onDecide={() => onDecide(attack)}
            onOpenCharacter={onOpenCharacter}
            onFilter={onFilter}
          />
        </span>
      </header>

      <div className="flex items-center gap-1.5 pl-4 pr-3 pt-1.5 text-xs">
        <PersonChip
          name={attackerName}
          portrait={attacker?.portraitUrl ?? null}
          onClick={() => onOpenCharacter(attack.attackerId)}
        />
        <ArrowRight className="size-3.5 shrink-0 text-subtle" aria-label="attaque" />
        <PersonChip
          name={name}
          portrait={member?.portraitUrl ?? null}
          onClick={() => onOpenCharacter(t.characterId)}
          strong
        />
        {count > 1 && (
          <span className="shrink-0 text-[11px] text-subtle">
            cible {index + 1}/{count}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-subtle">
          <Clock className="size-3" aria-hidden />
          {attack.round !== null ? `R${attack.round} · ` : ''}
          {HOUR.format(new Date(attack.createdAt))}
        </span>
      </div>

      {(selfTarget || attack.outOfTurn || attack.adjustments || attack.visibility !== 'public') && (
        <div className="flex flex-wrap gap-1 pl-4 pr-3 pt-2">
          {selfTarget && (
            <Badge ton="danger" className="font-bold uppercase tracking-wide">
              <Skull />
              Auto-attaque
            </Badge>
          )}
          {attack.outOfTurn && <Badge ton="alerte">Hors tour</Badge>}
          {attack.adjustments && <Badge ton="info">Ajusté à la main</Badge>}
          {attack.visibility !== 'public' && (
            <Badge>
              <EyeOff />
              {attack.visibility === 'gm' ? 'Caché' : 'Privé'}
            </Badge>
          )}
        </div>
      )}

      {/* Cases en gros chiffres : le jet, puis chaque valeur proposée */}
      {roll && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2 pl-4 pr-3 pt-3">
          <NumberBox label={jetLabel(systeme, roll)} value={jetValue(systeme, roll)} />
          {amounts.map((m, i) => (
            <NumberBox
              key={i}
              label={attributeLabel(systeme, m.attribute, member?.type)}
              value={`${m.operation === 'add' ? '+' : '−'}${m.value}`}
              sub={m.damageType ? damageTypeName(systeme, m.damageType) : undefined}
              tone={harmful(m, presentation) ? 'danger' : 'success'}
            />
          ))}
        </div>
      )}

      <div className="space-y-1.5 pl-4 pr-3 pt-2 text-xs">
        {roll?.kind === 'symbols' && systeme && (
          <ResultatsSymboles
            systeme={systeme}
            presentation={presentation}
            resultats={roll.results}
          />
        )}

        {!applied &&
          amounts.map((m, i) => {
            const r = reductionDetail(m);
            if (!r) return null;
            return (
              <p
                key={i}
                className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-muted-foreground"
              >
                <span className="font-medium text-foreground">Réductions</span>
                <span className="font-mono tabular-nums">
                  {r.raw}
                  {r.damageType ? ` ${damageTypeName(systeme, r.damageType)}` : ''} brut
                </span>
                {r.lines.map((l, j) => (
                  <span
                    key={j}
                    className={cn(l.ignored && 'line-through opacity-60')}
                    title={l.ignored ? 'Écartée : une réduction plus forte s’applique' : undefined}
                  >
                    · {l.name} <span className="font-mono">{l.effect}</span>
                  </span>
                ))}
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  = {r.result}
                </span>
              </p>
            );
          })}

        {!applied && others.length > 0 && (
          <p className="flex flex-wrap gap-1">
            {others.map((m, i) => (
              <span key={i} className="rounded-md border border-border bg-surface px-1.5 py-0.5">
                {modificationText(systeme, toInput(m), member?.type)}
              </span>
            ))}
          </p>
        )}

        {t.status === 'resolved' &&
          !applied &&
          !amounts.length &&
          !others.length &&
          !result?.tables.length && <p className="text-subtle">Aucune valeur à appliquer.</p>}

        {situation.length > 0 && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Situation</span> : {situation.join(' · ')}
          </p>
        )}

        {(result?.tables ?? []).map((d, i) => (
          <p key={i}>
            <span className="font-medium">{d.name ?? tableName(systeme, d.table)}</span>
            <span className="text-muted-foreground">
              {' '}
              : {d.value} → {d.line?.name ?? 'aucune ligne'}
              {d.line?.description ? ` (${d.line.description})` : ''}
            </span>
          </p>
        ))}

        {t.error && <p className="text-destructive">{t.error}</p>}

        {applied && (
          <p className="rounded-lg border border-success/25 bg-success/5 px-2 py-1.5 text-muted-foreground">
            <Check className="mr-1 inline size-3.5 text-success" aria-hidden />
            Appliqué
            {applied.redirectedTo ? ` à ${nameOf(applied.redirectedTo)} (réattribué)` : ''} :{' '}
            {applied.modifications.length
              ? applied.modifications
                  .map((m) => modificationText(systeme, toInput(m), member?.type))
                  .join(', ')
              : 'rien'}
            {applied.tables
              .filter((x) => x.entry)
              .map((x) => ` · ${tableName(systeme, x.table)} : ${x.entry}`)
              .join('')}
            {applied.defeated ? ' · hors de combat' : ''}
          </p>
        )}
        {t.decision === 'skipped' && <p className="text-subtle">Non appliqué.</p>}
        {t.decision === 'reverted' && <p className="text-info">Application annulée : à décider.</p>}

        {index === 0 && attack.note && (
          <p className="italic text-muted-foreground">« {attack.note} »</p>
        )}
      </div>

      {reacting && t.status === 'awaiting_reaction' && (
        <div className="mx-3 ml-4 mt-2 rounded-xl border border-border bg-surface p-3">
          <ReactionForm
            campaignId={campaignId}
            attack={attack}
            target={t}
            systeme={systeme}
            compact
            onDone={() => setReacting(false)}
          />
        </div>
      )}

      {details && (
        <RollDetails
          attack={attack}
          target={t}
          systeme={systeme}
          presentation={presentation}
          explanations={explanations}
        />
      )}

      {conflict && (
        <div
          role="alert"
          className="mx-3 ml-4 mt-2 space-y-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px]"
        >
          <p>
            La fiche a changé depuis l’application : l’annuler rendrait des valeurs qui ont bougé
            entre-temps.
          </p>
          {conflict.length > 0 && (
            <ul className="text-[11px] text-muted-foreground">
              {conflict.map((c, i) => (
                <li key={i}>
                  {c.characterId ? `${nameOf(c.characterId)} : ` : ''}
                  {c.paths
                    .map((p) =>
                      pathLabel(systeme, p, c.characterId ? cast.get(c.characterId)?.type : null),
                    )
                    .join(', ')}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={actions.clearConflict}>
              Laisser
            </Button>
            <Button
              size="xs"
              variant="destructive"
              onClick={() => actions.revert(true)}
              loading={busy === 'revert'}
            >
              Annuler quand même
            </Button>
          </div>
        </div>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-1.5 pb-3 pl-4 pr-3 pt-3">
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
          aria-label={details ? 'Replier le détail du jet' : 'Détail du jet'}
        >
          <ChevronDown className={cn('transition-transform', details && 'rotate-180')} />
        </Button>
        {mode === 'decider' && (
          <>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => actions.decideOne(t, true)}
              loading={busy === `${t.characterId}:true`}
              disabled={busy !== null}
            >
              <Check />
              Appliquer
            </Button>
            <Info texte="Modifier avant d’appliquer">
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={() => onDecide(attack)}
                disabled={busy !== null}
                aria-label={`Modifier avant d’appliquer à ${name}`}
              >
                <Pencil />
              </Button>
            </Info>
            <Info texte="Ne pas appliquer">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => actions.decideOne(t, false)}
                loading={busy === `${t.characterId}:false`}
                disabled={busy !== null}
                aria-label={`Ne pas appliquer à ${name}`}
              >
                <X />
              </Button>
            </Info>
          </>
        )}
        {mode === 'reagir' && (
          <>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => setReacting((r) => !r)}
            >
              <ShieldQuestion />
              Répondre
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => actions.skipReactions([t])}
              loading={busy === 'skip'}
              disabled={busy !== null}
            >
              <ShieldOff />
              Passer
            </Button>
          </>
        )}
        {mode === 'serveur' && (
          <Info texte="L’auteur ne lance pas ses dés : le serveur tire la suite">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={actions.serverDice}
              loading={busy === 'dice'}
              disabled={busy !== null}
            >
              <Dices />
              Tirer par le serveur
            </Button>
          </Info>
        )}
        {mode === 'annuler' && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => actions.revert(false)}
            loading={busy === 'revert'}
            disabled={busy !== null}
          >
            <Undo2 />
            Annuler l’application{count > 1 ? ` (${count} cibles)` : ''}
          </Button>
        )}
        {mode === 'statut' && (
          <span className="ml-auto text-[11px] text-subtle">
            {decisionLabel(t.decision) ?? ATTACK_STATUS_LABELS[attack.status]}
          </span>
        )}
      </footer>
    </article>
  );
}

function PersonChip({
  name,
  portrait,
  onClick,
  strong,
}: Readonly<{
  name: string;
  portrait: string | null;
  onClick(): void;
  strong?: boolean;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-center gap-1.5 rounded-full py-0.5 pr-1.5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      title={`Fiche de ${name}`}
    >
      <Illustration
        largeur={24}
        src={portrait}
        graine={name}
        position="top"
        className="size-6 shrink-0 rounded-full ring-1 ring-border"
      />
      <span
        className={cn(
          'truncate',
          strong ? 'font-semibold text-foreground' : 'text-muted-foreground',
        )}
      >
        {name}
      </span>
    </button>
  );
}

function NumberBox({
  label,
  value,
  sub,
  tone,
}: Readonly<{
  label: string;
  value: string;
  sub?: string;
  tone?: 'success' | 'danger';
}>) {
  return (
    <div className="rounded-xl border border-border bg-background/50 px-2.5 py-1.5 text-center">
      <p className="truncate text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <p
        className={cn(
          'font-mono text-2xl font-bold leading-tight tabular-nums',
          tone ? TONE_TEXTE[tone] : 'text-foreground',
        )}
      >
        {value}
      </p>
      {sub && <p className="truncate text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/**
 * La valeur aggrave l'état de la cible : retirer d'une jauge qui se vide (PV), ajouter à une
 * jauge qui se remplit (Blessures, `sens: montant` de la présentation).
 */
export function harmful(
  m: { attribute: string; operation: 'add' | 'subtract' | 'set' },
  presentation: Presentation | null,
): boolean {
  const rising = presentation?.ressources[m.attribute]?.sens === 'montant';
  return (m.operation === 'subtract') !== rising;
}

type Roll = NonNullable<AttackTarget['view']>['roll'];

/** Case « Jet » : le total, ou le premier résultat déclaré du pool (succès nets…). */
function jetLabel(systeme: SystemeCharge | null, roll: Roll): string {
  if (roll.kind === 'numeric') return 'Jet';
  return systeme?.source.des?.resultats.find((r) => r.visible !== false)?.nom ?? 'Jet';
}

function jetValue(systeme: SystemeCharge | null, roll: Roll): string {
  if (roll.kind === 'numeric') return String(roll.total);
  const first = systeme?.source.des?.resultats.find((r) => r.visible !== false);
  return first ? String(roll.results[first.cle] ?? 0) : '–';
}

/** Dés, construction du pool, déroulé, erreurs des formules, source des dés. */
function RollDetails({
  attack,
  target: t,
  systeme,
  presentation,
  explanations,
}: Readonly<{
  attack: Attack;
  target: AttackTarget;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  explanations: readonly string[];
}>) {
  const roll = t.result?.roll ?? t.view?.roll ?? null;
  return (
    <div className="mx-3 ml-4 mt-2 space-y-2 rounded-xl border border-border bg-background/40 p-2.5">
      <p className="flex items-center gap-1 text-[11px] text-subtle">
        <Dices className="size-3" aria-hidden />
        {DICE_ORIGIN_LABELS[diceOrigin(attack)]}
      </p>
      {roll?.kind === 'numeric' && (
        <p className="font-mono text-xs tabular-nums">
          {roll.formula} :{' '}
          {roll.dice
            .map((g) =>
              g.values
                .map(
                  (d) =>
                    `${d.kept ? d.value : `(${d.value})`}${d.exploded ? '!' : ''}${d.source === 'server' ? '' : '·3D'}`,
                )
                .join(' '),
            )
            .join(' | ')}{' '}
          = {roll.value}
          {roll.bonuses
            .map((b) => ` ${b.value >= 0 ? '+' : '−'} ${Math.abs(b.value)} (${b.name})`)
            .join('')}{' '}
          → <span className="font-semibold">{roll.total}</span>
        </p>
      )}
      {roll && roll.kind !== 'numeric' && systeme && (
        <>
          <DesSymboles
            systeme={systeme}
            presentation={presentation}
            des={roll.dice.map((d) => ({ de: d.die, face: d.face, symboles: d.symbols }))}
          />
          {roll.construction.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {roll.construction.map((s, i) => (
                <li key={i}>
                  {s.name} : {SYMBOLE_CONSTRUCTION[s.operation] ?? '↓'}
                  {s.count} {dieName(systeme, s.die)}
                  {s.to ? ` → ${dieName(systeme, s.to)}` : ''}
                  {s.side === 'target' ? ' (cible)' : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {explanations.length > 0 && (
        <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
          {explanations.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ol>
      )}
      {(t.result?.errors ?? []).map((e, i) => (
        <p key={i} className="text-[11px] text-warning">
          {e.where} : {e.message}
        </p>
      ))}
    </div>
  );
}

/** Menu ⋯ d'une carte : ce qui vaut pour tout le rapport. */
function CardMenu({
  attack,
  target: t,
  attackerName,
  name,
  busy,
  confirmDismiss,
  setConfirmDismiss,
  awaiting,
  actions,
  onDecide,
  onOpenCharacter,
  onFilter,
}: Readonly<{
  attack: Attack;
  target: AttackTarget;
  attackerName: string;
  name: string;
  busy: boolean;
  confirmDismiss: boolean;
  setConfirmDismiss(v: boolean): void;
  awaiting: readonly AttackTarget[];
  actions: ReturnType<typeof useAttackActions>;
  onDecide(): void;
  onOpenCharacter(id: string): void;
  onFilter(id: string): void;
}>) {
  return (
    <DropdownMenu onOpenChange={(open) => !open && setConfirmDismiss(false)}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Actions du rapport" disabled={busy}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {isPending(attack) && (
          <DropdownMenuItem onSelect={onDecide}>
            <Pencil />
            Modifier le rapport…
          </DropdownMenuItem>
        )}
        {isPending(attack) &&
          decidableTargets(attack).length + (actorDecidable(attack) ? 1 : 0) > 1 && (
            <DropdownMenuItem onSelect={actions.applyAll}>
              <CheckCheck />
              Appliquer tout le rapport tel quel
            </DropdownMenuItem>
          )}
        {awaiting.length > 1 && (
          <DropdownMenuItem onSelect={() => actions.skipReactions(awaiting)}>
            <ShieldOff />
            Passer la défense de toutes les cibles
          </DropdownMenuItem>
        )}
        {isOpen(attack) && attack.pendingSteps.length > 0 && (
          <DropdownMenuItem onSelect={actions.serverDice}>
            <Dices />
            Tirer les dés par le serveur
          </DropdownMenuItem>
        )}
        {canRevert(attack) && t.decision !== 'applied' && (
          <DropdownMenuItem onSelect={() => actions.revert(false)}>
            <Undo2 />
            Annuler l’application du rapport
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onOpenCharacter(t.characterId)}>
          <IdCard />
          Fiche de {name}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onFilter(attack.attackerId)}>
          <Filter />
          Rapports de {attackerName}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onFilter(t.characterId)}>
          <Filter />
          Rapports de {name}
        </DropdownMenuItem>
        {(isPending(attack) || isOpen(attack)) && <DropdownMenuSeparator />}
        {isOpen(attack) && (
          <DropdownMenuItem onSelect={actions.cancel}>
            <Ban />
            Abandonner l’attaque
          </DropdownMenuItem>
        )}
        {isPending(attack) && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              if (!confirmDismiss) {
                e.preventDefault();
                setConfirmDismiss(true);
                return;
              }
              actions.dismiss();
            }}
          >
            <X />
            {confirmDismiss ? 'Confirmer : écarter tout le rapport' : 'Écarter tout le rapport'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Coûts de l'attaquant (stress, munitions…), sur une ligne à part. */
export function ActorCostCard({
  campaignId,
  attack,
  systeme,
  cast,
}: Readonly<{
  campaignId: string;
  attack: Attack;
  systeme: SystemeCharge | null;
  cast: ReadonlyMap<string, CastMember>;
}>) {
  const actions = useAttackActions(campaignId, attack);
  const attacker = cast.get(attack.attackerId);
  const actor = attack.actor;
  if (!actor?.modifications.length) return null;
  const decidable = actorDecidable(attack);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2',
        decidable ? 'border-border-strong bg-surface/60' : 'border-border opacity-60',
      )}
    >
      <Battery className="size-4 shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px]">
        <span className="font-medium">Coûts de {attacker?.name ?? 'l’attaquant'}</span>
        <span className="text-muted-foreground">
          {' '}
          ({attack.action.name}) :{' '}
          {actor.modifications
            .map((m) => modificationText(systeme, toInput(m), attacker?.type))
            .join(', ')}
        </span>
      </span>
      {decidable ? (
        <span className="flex gap-1">
          <Button
            size="xs"
            variant="secondary"
            onClick={() => actions.decideActor(true)}
            loading={actions.busy === 'actor:true'}
            disabled={actions.busy !== null}
          >
            <Check />
            Appliquer
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => actions.decideActor(false)}
            loading={actions.busy === 'actor:false'}
            disabled={actions.busy !== null}
            aria-label="Ne pas appliquer les coûts de l’attaquant"
          >
            <X />
          </Button>
        </span>
      ) : (
        <Badge ton={actor.decision === 'applied' ? 'succes' : 'neutre'}>
          {decisionLabel(actor.decision) ?? 'En attente'}
        </Badge>
      )}
    </div>
  );
}

const TONE_TEXTE = { success: 'text-success', danger: 'text-destructive' } as const;

/** Construction d'un pool : dés ajoutés, retirés, améliorés (↑) ou dégradés (↓). */
const SYMBOLE_CONSTRUCTION: Partial<Record<string, string>> = {
  add: '+',
  remove: '−',
  upgrade: '↑',
};
