'use client';

/**
 * En-tête du menu d'attaque (docs/combat.md § 12.1, 1) : qui attaque. Portrait, nom, valeurs
 * clés et ressources du bandeau de la fiche (présentation du système), et où il en est du
 * tour (« Son tour », « Hors tour »). Le MJ (ou un joueur qui incarne plusieurs personnages)
 * en change par la liste : participants du combat d'abord.
 */
import type { Fiche } from '@vtt/rules';
import { Clock, Swords } from 'lucide-react';
import { Illustration } from '@/components/commun/illustration';
import { BannerStats } from '@/components/fiche/banner';
import { widgetsDe, type ContexteFiche } from '@/components/fiche/widgets';
import { Badge } from '@/components/ui/badge';
import { SelectField, type SelectOption, type SelectOptionGroup } from '@/components/ui/select';
import type { TurnStanding } from '@/lib/combat/attack-flow';
import type { RosterCharacter } from '@/lib/combat/roster';
import type { AttackContext } from './use-attack-context';

export function AttackerHeader({
  ctx,
  attackerId,
  fiche,
  name,
  portraitUrl,
  standing,
  blocked,
  onChange,
  disabled,
}: {
  ctx: AttackContext;
  attackerId: string | null;
  fiche: Fiche | null;
  name: string | null;
  portraitUrl: string | null;
  standing: TurnStanding;
  blocked: boolean;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const known = attackerId ? ctx.known.get(attackerId) : undefined;
  const label = name ?? known?.name ?? 'Personnage';
  const options = attackerOptions(ctx);
  const choosable = ctx.attackers.length > 1 || !attackerId;

  const fc: ContexteFiche | null =
    fiche && ctx.systeme && attackerId
      ? {
          systeme: ctx.systeme,
          presentation: ctx.presentation,
          fiche,
          personnage: { id: attackerId, name: label, roomId: ctx.campagne?.id ?? null },
          mj: ctx.gm,
        }
      : null;
  const details = fc ? widgetsDe(fc).find((w) => w.type === 'details') : undefined;

  return (
    <section aria-label="Attaquant" className="space-y-3">
      <div className="flex items-center gap-3">
        <Illustration
          src={portraitUrl ?? known?.portraitUrl}
          graine={label}
          alt=""
          className="size-12 shrink-0 rounded-full border border-border-strong"
        />
        <div className="min-w-0 flex-1">
          {choosable ? (
            <SelectField
              value={attackerId ?? ''}
              onValueChange={(v) => onChange(v || null)}
              options={options}
              placeholder="Choisir qui attaque"
              aria-label="Attaquant"
              disabled={disabled}
              className="h-9"
            />
          ) : (
            <p className="truncate font-display text-lg font-semibold leading-tight">{label}</p>
          )}
          {attackerId && standing !== 'free' && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {standing === 'on_turn' ? (
                <Badge ton="primaire">
                  <Swords aria-hidden /> Son tour
                </Badge>
              ) : (
                <Badge ton={blocked ? 'danger' : 'alerte'}>
                  <Clock aria-hidden /> {blocked ? 'Pas son tour' : 'Hors tour'}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>
      {fc && (
        <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2 [&_dd]:text-base">
          <BannerStats ctx={fc} widget={details?.type === 'details' ? details : undefined} />
        </div>
      )}
      {blocked && (
        <p role="alert" className="text-[13px] text-destructive">
          Le MJ n’autorise pas les attaques hors du tour de votre personnage.
        </p>
      )}
    </section>
  );
}

/** Attaquants proposés : participants du combat d'abord (ordre du tour), puis les autres. */
function attackerOptions(ctx: AttackContext): (SelectOption | SelectOptionGroup)[] {
  const option = (c: RosterCharacter): SelectOption => ({
    valeur: c.id,
    nom: c.name ?? 'Personnage',
  });
  const order = ctx.combat?.order.map((p) => p.characterId) ?? [];
  const inCombat = ctx.attackers
    .filter((c) => order.includes(c.id))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const others = ctx.attackers.filter((c) => !order.includes(c.id));
  if (!inCombat.length) return others.map(option);
  return [
    { groupe: 'Combat en cours', options: inCombat.map(option) },
    ...(others.length ? [{ groupe: 'Hors du combat', options: others.map(option) }] : []),
  ];
}
