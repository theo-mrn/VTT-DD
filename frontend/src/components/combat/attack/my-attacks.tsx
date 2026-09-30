'use client';

/**
 * « Mes attaques » (docs/combat.md § 12.1) : les attaques que j'ai lancées, du combat en cours
 * (ou les plus récentes hors combat), avec leur statut en direct. Un clic en montre le suivi.
 * Le service filtre la liste pour un joueur (ses attaques, vue de l'attaquant).
 */
import type { Attack } from '@vtt/contracts';
import { ChevronRight, Clock, EyeOff, Swords } from 'lucide-react';
import { EtatVide } from '@/components/commun/page';
import { Badge } from '@/components/ui/badge';
import { ATTACK_STATUS_LABELS, isClosed, useAttacks } from '@/lib/combat/use-attacks';
import { targetName, type KnownCharacter } from '@/lib/combat/view';

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function MyAttacks({
  campaignId,
  combatId,
  userId,
  known,
  onShow,
}: {
  campaignId: string;
  combatId: string | null;
  userId: string;
  known: ReadonlyMap<string, KnownCharacter>;
  onShow: (attack: Attack) => void;
}) {
  const { attacks, isLoading, isError } = useAttacks(campaignId, {
    ...(combatId ? { combatId } : {}),
    limit: 30,
  });
  const mine = attacks.filter((a) => a.createdBy === userId);

  if (isLoading)
    return <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">Chargement…</p>;
  if (isError)
    return (
      <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">
        Les attaques ne sont pas disponibles pour le moment.
      </p>
    );
  if (!mine.length)
    return (
      <EtatVide
        icone={Swords}
        titre="Aucune attaque"
        description={
          combatId
            ? 'Vous n’avez pas encore attaqué pendant ce combat.'
            : 'Vous n’avez pas encore attaqué.'
        }
        className="border-none bg-transparent py-6"
      />
    );

  return (
    <ul className="space-y-1.5">
      {mine.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onShow(a)}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-left transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {known.get(a.attackerId)?.name ?? 'Personnage'} · {a.action.name}
              </span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {a.targets.map((t) => targetName(t.characterId, known)).join(', ') || '—'}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <Badge
                ton={a.status === 'applied' ? 'succes' : isClosed(a.status) ? 'neutre' : 'alerte'}
              >
                {ATTACK_STATUS_LABELS[a.status]}
              </Badge>
              <span className="flex items-center gap-1.5 text-[11px] text-subtle">
                {a.visibility === 'gm' && <EyeOff className="size-3" aria-label="Cachée" />}
                {a.outOfTurn && <Clock className="size-3" aria-label="Hors tour" />}
                {time(a.createdAt)}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
