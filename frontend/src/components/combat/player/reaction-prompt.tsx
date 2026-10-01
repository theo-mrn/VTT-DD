'use client';

/**
 * Défense active (docs/combat.md § 5.3, § 12.6) : quand une attaque vise un personnage qui
 * peut réagir (paramètres `par: cible` de l'action dont l'`exige` est vrai pour lui, Esquive
 * de Star Wars), qui l'incarne choisit sa réaction, ou passe. Le MJ répond pour n'importe
 * quelle cible depuis le rapport (même formulaire).
 *
 * Le joueur ne voit que ce que le serveur lui envoie : l'attaque filtrée pour lui, et le nom
 * de l'attaquant seulement s'il le connaît (liste de la campagne filtrée par le service ;
 * sinon « Un adversaire »).
 */
import type { ActionParams, Attack, AttackTarget } from '@vtt/contracts';
import type { SystemeCharge, Valeur } from '@vtt/rules';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ParamField } from '@/components/combat/attack/params-form';
import { useComputedSheet } from '@/components/combat/attack/use-attack-context';
import { Button } from '@/components/ui/button';
import { campagnes, clePersonnagesCampagne } from '@/lib/campagnes';
import { attacksApi, combatErrorMessage, combatKeys } from '@/lib/combat/api';
import { defaultParamValue, reactionParams } from '@/lib/combat/params';
import { useAttackCommands, useAttacks } from '@/lib/combat/use-attacks';
import { useCampaignEvents } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { awaitingMyReaction, reactionTitle } from './model';

/** Formulaire de réaction d'une cible : paramètres proposés, « Réagir » ou « Ne pas réagir ». */
export function ReactionForm({
  campaignId,
  attack,
  target,
  systeme,
  compact = false,
  onDone,
}: {
  campaignId: string;
  attack: Attack;
  target: AttackTarget;
  systeme: SystemeCharge | null;
  compact?: boolean;
  onDone?(): void;
}) {
  const commands = useAttackCommands(campaignId);
  const { fiche } = useComputedSheet({ systeme }, target.characterId);
  const action = systeme?.actions.get(attack.action.id) ?? null;
  const offered = new Set(target.reactionParams ?? []);
  const params = action
    ? reactionParams(action).filter((p) => !offered.size || offered.has(p.id))
    : [];
  const [values, setValues] = useState<Record<string, Valeur>>({});
  const [busy, setBusy] = useState<'react' | 'skip' | null>(null);

  const valueOf = (id: string) => {
    const p = params.find((x) => x.id === id)!;
    return values[id] ?? (fiche ? defaultParamValue(fiche, p) : '');
  };

  const send = async (skip: boolean) => {
    setBusy(skip ? 'skip' : 'react');
    try {
      const chosen: ActionParams = Object.fromEntries(
        params.map((p) => [p.id, valueOf(p.id)]).filter(([, v]) => v !== ''),
      );
      await commands.react(
        attack.id,
        skip
          ? { characterId: target.characterId, skip: true }
          : { characterId: target.characterId, params: chosen },
      );
      onDone?.();
    } catch (err) {
      toast.error('La réaction n’a pas pu être envoyée', { description: combatErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {fiche && params.length > 0 ? (
        <div className="grid gap-3">
          {params.map((p) => (
            <ParamField
              key={p.id}
              fiche={fiche}
              parametre={p}
              valeur={valueOf(p.id)}
              onValeur={(v) => setValues((s) => ({ ...s, [p.id]: v }))}
              compact
            />
          ))}
        </div>
      ) : params.length > 0 ? (
        <p className="text-[13px] text-muted-foreground">Chargement de la fiche…</p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void send(true)}
          loading={busy === 'skip'}
          disabled={busy !== null}
        >
          Ne pas réagir
        </Button>
        <Button
          size="sm"
          onClick={() => void send(false)}
          loading={busy === 'react'}
          disabled={busy !== null || (params.length > 0 && !fiche)}
        >
          <ShieldCheck />
          Réagir
        </Button>
      </div>
    </div>
  );
}

const attacksOf = (results: { data?: Attack }[]) => results.map((r) => r.data);

/**
 * Invites de réaction d'un joueur : les attaques qui attendent la défense d'un de ses
 * personnages. Signalées par `combat.attack_updated` (`reaction_requested`, envoyé aux seuls
 * joueurs concernés), relues en REST (vue filtrée) ; les attaques ouvertes que le service lui
 * liste complètent au (re)chargement.
 */
export function ReactionPrompts({
  campaignId,
  mine,
  systeme,
}: {
  campaignId: string;
  mine: ReadonlySet<string>;
  systeme: SystemeCharge | null;
}) {
  const [signaled, setSignaled] = useState<readonly string[]>([]);
  useCampaignEvents(campaignId, ['combat.attack_updated'], (e) => {
    const p = e.event.payload as { attackId?: unknown; change?: unknown };
    if (p.change === 'reaction_requested' && typeof p.attackId === 'string') {
      const id = p.attackId;
      setSignaled((s) => (s.includes(id) ? s : [...s, id].slice(-20)));
    }
  });
  const open = useAttacks(campaignId, { status: 'open', limit: 20 }, { enabled: mine.size > 0 });
  const fetched = useQueries({
    queries: signaled.map((id) => ({
      queryKey: combatKeys.attack(campaignId, id),
      queryFn: () => attacksApi.get(campaignId, id),
      staleTime: 5_000,
      retry: false,
    })),
    // Les attaques seules : le même tableau tant qu'elles ne changent pas (pas à chaque état)
    combine: attacksOf,
  });
  const known = useQuery({
    queryKey: clePersonnagesCampagne(campaignId),
    queryFn: () => campagnes.personnages(campaignId),
    enabled: mine.size > 0,
  });
  const names = useMemo(
    () => new Map((known.data ?? []).map((c) => [c.characterId, c.name ?? null])),
    [known.data],
  );

  const pending = useMemo(() => {
    const byId = new Map<string, Attack>();
    for (const a of open.attacks) byId.set(a.id, a);
    for (const a of fetched) if (a) byId.set(a.id, a);
    return [...byId.values()].flatMap((a) =>
      awaitingMyReaction(a, mine).map((t) => ({ attack: a, target: t })),
    );
  }, [open.attacks, fetched, mine]);

  const first = pending[0];
  if (!first) return null;

  return (
    <section
      role="alertdialog"
      aria-labelledby="reaction-title"
      className="pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-warning/40 bg-popover/95 p-3 shadow-elevated"
    >
      <div className="mb-2 flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p id="reaction-title" className="text-sm font-semibold">
            {reactionTitle(first.attack, first.target, names)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {first.attack.action.name} · choisissez votre défense
            {pending.length > 1 ? ` (${pending.length} en attente)` : ''}
          </p>
        </div>
      </div>
      <ReactionForm
        key={`${first.attack.id}:${first.target.characterId}`}
        campaignId={campaignId}
        attack={first.attack}
        target={first.target}
        systeme={systeme}
        compact
      />
    </section>
  );
}
