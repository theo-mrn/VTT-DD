'use client';

/**
 * Carte d'un rapport d'attaque (MJ ; docs/combat.md § 7, § 12.4) : attaquant → cibles, action
 * et paramètres clés (arme), marques (hors tour, auto-attaque, ajusté à la main), source des
 * dés, visibilité, heure. Une ligne par cible : issue, jet (dés repliés), valeurs proposées
 * (résistances en info), table tirée ; puis Appliquer, Modifier, Ne pas appliquer. Coûts de
 * l'attaquant à part. Décidé : grisé, ce qui a été appliqué, « Annuler l'application ».
 * En cours : réactions attendues (répondre ou passer à la place du joueur), dés à lancer
 * (tirer par le serveur), abandonner.
 */
import type { Attack, AttackTarget } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import {
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  Clock,
  Dices,
  EyeOff,
  Pencil,
  ShieldQuestion,
  Undo2,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { DesSymboles, ResultatsSymboles } from '@/components/fiche/symboles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { combatErrorMessage } from '@/lib/combat/api';
import { hasSuccessRule } from '@/lib/combat/actions';
import { ATTACK_STATUS_LABELS, useAttackCommands } from '@/lib/combat/use-attacks';
import { decisionLabel, outcomeLabel, type OutcomeTone } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { ReactionForm } from '../player/reaction-prompt';
import type { CastMember } from '../turns/use-cast';
import { reportDefeated } from './defeated-dialog';
import { dieName, keyParams, modificationText, pathLabel, rollSummary, tableName } from './labels';
import {
  actorDecidable,
  buildApply,
  canRevert,
  decidableTargets,
  defeatedBy,
  DICE_ORIGIN_LABELS,
  diceOrigin,
  draftOf,
  isDecided,
  isOpen,
  isPending,
  revertConflictOf,
  toInput,
  type RevertConflict,
} from './model';

const HOUR = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const TONES: Record<OutcomeTone, 'arcane' | 'succes' | 'danger' | 'neutre' | 'alerte'> = {
  critical: 'arcane',
  success: 'succes',
  fumble: 'danger',
  failure: 'neutre',
  neutral: 'neutre',
};

export function ReportCard({
  campaignId,
  attack,
  systeme,
  presentation,
  cast,
  onDecide,
}: {
  campaignId: string;
  attack: Attack;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  cast: ReadonlyMap<string, CastMember>;
  /** Ouvre le tiroir de décision (modifier avant d'appliquer). */
  onDecide(attack: Attack): void;
}) {
  const commands = useAttackCommands(campaignId);
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [conflict, setConflict] = useState<RevertConflict[] | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const attacker = cast.get(attack.attackerId);
  const attackerName = attacker?.name ?? 'Personnage';
  const nameOf = (id: string) => cast.get(id)?.name ?? 'Personnage';
  const action = systeme?.actions.get(attack.action.id) ?? null;
  const successRule = hasSuccessRule(action);
  const decidable = decidableTargets(attack);
  const params = keyParams(systeme, attack.action.id, attack.params);
  const decided = isDecided(attack);
  const closed = attack.status === 'cancelled' || attack.status === 'failed';

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

  /** Une cible telle quelle (appliquer ou non), sans toucher aux autres. */
  const decideOne = (t: AttackTarget, apply: boolean) =>
    void run(`${t.characterId}:${apply}`, 'La décision n’a pas pu être appliquée', () =>
      commands.apply(attack.id, buildApply(attack, [{ ...draftOf(t), apply }], null)),
    );

  const decideActor = (apply: boolean) =>
    void run(`actor:${apply}`, 'La décision n’a pas pu être appliquée', () =>
      commands.apply(attack.id, { version: attack.version, targets: [], actor: { apply } }),
    );

  /** Tout tel quel : chaque cible à décider et les coûts de l'attaquant. */
  const applyAll = () =>
    void run('all', 'Le rapport n’a pas pu être appliqué', () =>
      commands.apply(
        attack.id,
        buildApply(
          attack,
          decidable.map(draftOf),
          actorDecidable(attack)
            ? { apply: true, modifications: attack.actor!.modifications.map(toInput) }
            : null,
        ),
      ),
    );

  const dismiss = () =>
    void run('dismiss', 'Le rapport n’a pas pu être écarté', () =>
      commands.dismiss(attack.id, { version: attack.version }),
    ).then(() => setConfirmDismiss(false));

  const revert = (force: boolean) =>
    void run('revert', 'L’application n’a pas pu être annulée', () =>
      commands.revert(attack.id, { version: attack.version, ...(force ? { force: true } : {}) }),
    ).then((ok) => ok && setConflict(null));

  const serverDice = () => {
    const step = attack.pendingSteps[0];
    if (!step) return;
    void run('dice', 'Les dés n’ont pas pu être tirés', () =>
      commands.submitDice(attack.id, { stepId: step.id, results: [], serverFallback: true }),
    );
  };

  const cancel = () =>
    void run('cancel', 'L’attaque n’a pas pu être abandonnée', () =>
      commands.cancel(attack.id, { version: attack.version }),
    );

  const origin = diceOrigin(attack);
  const targets = attack.targets;

  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border bg-card shadow-surface',
        isPending(attack) ? 'border-primary/30' : 'border-border',
        (decided || closed) && 'opacity-75',
      )}
    >
      <header className="flex items-start gap-2.5 border-b border-border px-3 py-2.5">
        <Illustration
          src={attacker?.portraitUrl ?? null}
          graine={attackerName}
          position="top"
          className="size-9 shrink-0 rounded-full ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1 text-sm font-semibold">
            <span className="truncate">{attackerName}</span>
            <ArrowRight className="size-3.5 shrink-0 text-subtle" aria-label="attaque" />
            <span className="truncate">{targets.map((t) => nameOf(t.characterId)).join(', ')}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {attack.action.name}
            {params.length ? ` · ${params.join(', ')}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Badge
              ton={
                isPending(attack)
                  ? 'primaire'
                  : attack.status === 'applied'
                    ? 'succes'
                    : isOpen(attack)
                      ? 'alerte'
                      : 'neutre'
              }
            >
              {ATTACK_STATUS_LABELS[attack.status]}
            </Badge>
            {attack.outOfTurn && <Badge ton="alerte">Hors tour</Badge>}
            {attack.selfTarget && <Badge ton="alerte">Auto-attaque</Badge>}
            {attack.adjustments && <Badge ton="info">Ajusté à la main</Badge>}
            {attack.visibility !== 'public' && (
              <Badge>
                <EyeOff />
                {attack.visibility === 'gm' ? 'Caché' : 'Privé'}
              </Badge>
            )}
            <Badge>
              <Dices />
              {DICE_ORIGIN_LABELS[origin]}
            </Badge>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-subtle">
          <Clock className="size-3" aria-hidden />
          {attack.round !== null ? `R${attack.round} · ` : ''}
          {HOUR.format(new Date(attack.createdAt))}
        </span>
      </header>

      <ul className="divide-y divide-border">
        {targets.map((t) => (
          <TargetRow
            key={t.characterId}
            attack={attack}
            target={t}
            name={nameOf(t.characterId)}
            portrait={cast.get(t.characterId)?.portraitUrl ?? null}
            entityType={cast.get(t.characterId)?.type ?? null}
            systeme={systeme}
            presentation={presentation}
            successRule={successRule}
            details={details}
            busy={busy}
            nameOf={nameOf}
            campaignId={campaignId}
            onApply={() => decideOne(t, true)}
            onSkip={() => decideOne(t, false)}
            onModify={() => onDecide(attack)}
          />
        ))}
        {attack.actor && attack.actor.modifications.length > 0 && (
          <li className="flex flex-wrap items-center gap-2 bg-surface/50 px-3 py-2">
            <span className="min-w-0 flex-1 text-[13px]">
              <span className="font-medium">Coûts de l’attaquant</span>
              <span className="text-muted-foreground">
                {' '}
                :{' '}
                {attack.actor.modifications
                  .map((m) => modificationText(systeme, toInput(m), attacker?.type))
                  .join(', ')}
              </span>
            </span>
            {actorDecidable(attack) ? (
              <span className="flex gap-1">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => decideActor(true)}
                  loading={busy === 'actor:true'}
                  disabled={busy !== null}
                >
                  <Check />
                  Appliquer
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => decideActor(false)}
                  loading={busy === 'actor:false'}
                  disabled={busy !== null}
                  aria-label="Ne pas appliquer les coûts de l’attaquant"
                >
                  <X />
                </Button>
              </span>
            ) : (
              <Badge ton={attack.actor.decision === 'applied' ? 'succes' : 'neutre'}>
                {decisionLabel(attack.actor.decision) ?? 'En attente'}
              </Badge>
            )}
          </li>
        )}
      </ul>

      {attack.note && (
        <p className="border-t border-border px-3 py-2 text-xs italic text-muted-foreground">
          « {attack.note} »
        </p>
      )}

      {conflict && (
        <div
          role="alert"
          className="space-y-2 border-t border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px]"
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
            <Button size="xs" variant="ghost" onClick={() => setConflict(null)}>
              Laisser
            </Button>
            <Button
              size="xs"
              variant="destructive"
              onClick={() => revert(true)}
              loading={busy === 'revert'}
            >
              Annuler quand même
            </Button>
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setDetails((d) => !d)}
          aria-expanded={details}
        >
          <ChevronDown className={cn('transition-transform', details && 'rotate-180')} />
          Détail
        </Button>
        <span className="flex-1" />
        {isOpen(attack) && attack.pendingSteps.length > 0 && (
          <Info texte="L’auteur ne lance pas ses dés : le serveur tire la suite">
            <Button size="xs" variant="secondary" onClick={serverDice} loading={busy === 'dice'}>
              <Dices />
              Tirer par le serveur
            </Button>
          </Info>
        )}
        {isOpen(attack) && (
          <Button
            size="xs"
            variant="ghost"
            onClick={cancel}
            loading={busy === 'cancel'}
            disabled={busy !== null}
          >
            <Ban />
            Abandonner
          </Button>
        )}
        {isPending(attack) && (
          <>
            <Button
              size="xs"
              variant="destructive"
              onClick={() => (confirmDismiss ? dismiss() : setConfirmDismiss(true))}
              onBlur={() => setConfirmDismiss(false)}
              loading={busy === 'dismiss'}
              disabled={busy !== null}
            >
              <X />
              {confirmDismiss ? 'Confirmer' : 'Écarter'}
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={() => onDecide(attack)}
              disabled={busy !== null}
            >
              <Pencil />
              Modifier
            </Button>
            {(decidable.length > 0 || actorDecidable(attack)) && (
              <Button
                size="xs"
                onClick={applyAll}
                loading={busy === 'all'}
                disabled={busy !== null}
              >
                <Check />
                Tout appliquer
              </Button>
            )}
          </>
        )}
        {canRevert(attack) && !conflict && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => revert(false)}
            loading={busy === 'revert'}
            disabled={busy !== null}
          >
            <Undo2 />
            Annuler l’application
          </Button>
        )}
      </footer>
    </article>
  );
}

function TargetRow({
  campaignId,
  attack,
  target: t,
  name,
  portrait,
  entityType,
  systeme,
  presentation,
  successRule,
  details,
  busy,
  nameOf,
  onApply,
  onSkip,
  onModify,
}: {
  campaignId: string;
  attack: Attack;
  target: AttackTarget;
  name: string;
  portrait: string | null;
  entityType: string | null;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  successRule: boolean;
  details: boolean;
  busy: string | null;
  nameOf(id: string): string;
  onApply(): void;
  onSkip(): void;
  onModify(): void;
}) {
  const [reacting, setReacting] = useState(false);
  const result = t.result ?? null;
  const outcome = outcomeLabel(result?.outcome ?? t.view?.outcome ?? null, successRule);
  const roll = result?.roll ?? t.view?.roll ?? null;
  const summary = rollSummary(systeme, roll);
  const decidable =
    attack.status === 'pending' &&
    t.status === 'resolved' &&
    (t.decision === 'pending' || t.decision === 'reverted');
  const mods = (result?.modifications ?? []).filter((m) => m.entity === 'target');
  const applied = t.applied ?? null;

  let status: ReactNode = null;
  if (t.status === 'awaiting_reaction') status = <Badge ton="alerte">Défense attendue</Badge>;
  else if (t.status === 'awaiting_dice') status = <Badge ton="alerte">Dés attendus</Badge>;
  else if (t.status === 'failed') status = <Badge ton="danger">Refusé</Badge>;
  else if (t.decision !== 'pending')
    status = (
      <Badge
        ton={t.decision === 'applied' ? 'succes' : t.decision === 'reverted' ? 'info' : 'neutre'}
      >
        {decisionLabel(t.decision)}
      </Badge>
    );

  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Illustration
          src={portrait}
          graine={name}
          position="top"
          className="size-7 shrink-0 rounded-full ring-1 ring-border"
        />
        <span className="min-w-0 truncate text-[13px] font-medium">{name}</span>
        {outcome && <Badge ton={TONES[outcome.tone]}>{outcome.label}</Badge>}
        {summary && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            jet {summary}
          </span>
        )}
        {status}
        <span className="flex-1" />
        {decidable && (
          <span className="flex gap-1">
            <Button
              size="xs"
              onClick={onApply}
              loading={busy === `${t.characterId}:true`}
              disabled={busy !== null}
            >
              <Check />
              Appliquer
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={onModify}
              disabled={busy !== null}
              aria-label={`Modifier avant d’appliquer à ${name}`}
            >
              <Pencil />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={onSkip}
              loading={busy === `${t.characterId}:false`}
              disabled={busy !== null}
              aria-label={`Ne pas appliquer à ${name}`}
            >
              <X />
            </Button>
          </span>
        )}
        {t.status === 'awaiting_reaction' && (
          <Button size="xs" variant="secondary" onClick={() => setReacting((r) => !r)}>
            <ShieldQuestion />
            Répondre
          </Button>
        )}
      </div>

      {t.error && <p className="text-xs text-destructive">{t.error}</p>}

      {/* Valeurs proposées, ou appliquées */}
      {applied ? (
        <p className="text-xs text-muted-foreground">
          Appliqué
          {applied.redirectedTo ? ` à ${nameOf(applied.redirectedTo)} (réattribué)` : ''} :{' '}
          {applied.modifications.length
            ? applied.modifications
                .map((m) => modificationText(systeme, toInput(m), entityType))
                .join(', ')
            : 'rien'}
          {applied.tables
            .filter((x) => x.entry)
            .map((x) => ` · ${tableName(systeme, x.table)} : ${x.entry}`)
            .join('')}
          {applied.defeated ? ' · hors de combat' : ''}
        </p>
      ) : mods.length ? (
        <p className="flex flex-wrap gap-1.5 text-xs">
          {mods.map((m, i) => {
            const text = modificationText(systeme, toInput(m), entityType);
            const resist =
              m.kind === 'attribute' && m.resistances?.length
                ? `Avant résistances : ${m.raw ?? '?'} · ${m.resistances
                    .map((r) => `${r.name}${r.ignored ? ' (écartée)' : ''}`)
                    .join(', ')}`
                : null;
            return resist ? (
              <Info key={i} texte={resist}>
                <span className="cursor-help rounded-md border border-border bg-surface px-1.5 py-0.5 underline decoration-dotted underline-offset-2">
                  {text}
                </span>
              </Info>
            ) : (
              <span key={i} className="rounded-md border border-border bg-surface px-1.5 py-0.5">
                {text}
              </span>
            );
          })}
        </p>
      ) : t.status === 'resolved' ? (
        <p className="text-xs text-subtle">Aucune valeur à appliquer.</p>
      ) : null}

      {(result?.tables ?? []).map((d, i) => (
        <p key={i} className="text-xs">
          <span className="font-medium">{d.name ?? tableName(systeme, d.table)}</span>
          <span className="text-muted-foreground">
            {' '}
            : {d.value} → {d.line?.name ?? 'aucune ligne'}
            {d.line?.description ? ` (${d.line.description})` : ''}
          </span>
        </p>
      ))}

      {reacting && t.status === 'awaiting_reaction' && (
        <div className="rounded-xl border border-border bg-surface p-3">
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

      {details && roll && (
        <div className="space-y-2 rounded-xl border border-border bg-background/40 p-2.5">
          {roll.kind === 'numeric' ? (
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
          ) : systeme ? (
            <>
              <DesSymboles
                systeme={systeme}
                presentation={presentation}
                des={roll.dice.map((d) => ({ de: d.die, face: d.face, symboles: d.symbols }))}
              />
              <ResultatsSymboles
                systeme={systeme}
                presentation={presentation}
                resultats={roll.results}
              />
              {roll.construction.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  {roll.construction.map((s, i) => (
                    <li key={i}>
                      {s.name} :{' '}
                      {s.operation === 'add'
                        ? '+'
                        : s.operation === 'remove'
                          ? '−'
                          : s.operation === 'upgrade'
                            ? '↑'
                            : '↓'}
                      {s.count} {dieName(systeme, s.die)}
                      {s.to ? ` → ${dieName(systeme, s.to)}` : ''}
                      {s.side === 'target' ? ' (cible)' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
          {(result?.explanations ?? t.view?.explanations ?? []).length > 0 && (
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {(result?.explanations ?? t.view?.explanations ?? []).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ol>
          )}
          {(result?.errors ?? []).map((e, i) => (
            <p key={i} className="text-[11px] text-warning">
              {e.where} : {e.message}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}
