'use client';

/**
 * Résultat d'une cible (docs/combat.md § 5.5, § 5.6, § 12.1, 7) : issue (Touché, Raté,
 * Critique, Échec critique, avec icône et texte), dés et total, ou symboles avec les icônes de
 * la présentation, valeurs que le système montre à l'attaquant, puis le statut de la décision
 * du MJ. Le MJ voit en plus les modifications proposées.
 *
 * Tout passe par `targetDisplay` : un joueur ne voit que la vue de l'attaquant envoyée par le
 * serveur, jamais une valeur de la cible.
 */
import type { Attack, AttackModification, AttackTarget } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { AlertTriangle, Check, ChevronDown, Crown, Skull, Target, X } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { DesDuJet } from '@/components/des/resultat-jet';
import { DesSymboles, ResultatsSymboles } from '@/components/fiche/symboles';
import { Badge } from '@/components/ui/badge';
import {
  decisionLabel,
  outcomeLabel,
  targetDisplay,
  targetName,
  type KnownCharacter,
  type OutcomeTone,
} from '@/lib/combat/view';
import { cn } from '@/lib/utils';

const TONES: Record<
  OutcomeTone,
  { ton: 'succes' | 'danger' | 'primaire' | 'neutre'; icon: ComponentType<{ className?: string }> }
> = {
  success: { ton: 'succes', icon: Check },
  critical: { ton: 'primaire', icon: Crown },
  fumble: { ton: 'danger', icon: Skull },
  failure: { ton: 'neutre', icon: X },
  neutral: { ton: 'neutre', icon: Target },
};

/** Nom d'un attribut du système (clé sinon), pour les modifications proposées au MJ. */
function attributeName(systeme: SystemeCharge, key: string): string {
  for (const e of systeme.entites.values()) {
    const a = e.attributs.get(key);
    if (a) return a.abrege ?? a.nom;
  }
  return key;
}

function modificationText(systeme: SystemeCharge, m: AttackModification): string {
  if (m.kind === 'attribute') {
    const sign = m.operation === 'subtract' ? '−' : m.operation === 'set' ? '=' : '+';
    const type = m.damageType
      ? ` ${systeme.source.typesDegats.find((t) => t.id === m.damageType)?.nom ?? m.damageType}`
      : '';
    const raw = m.raw !== undefined && m.raw !== m.value ? ` (${m.raw} avant résistances)` : '';
    return `${attributeName(systeme, m.attribute)} ${sign}${m.value}${type}${raw}`;
  }
  const name = systeme.entrees.get(m.entry)?.nom ?? m.entry;
  const duration = m.duration ? `, ${m.duration} round${m.duration > 1 ? 's' : ''}` : '';
  return `${m.operation === 'give' ? '+' : '−'} ${name}${duration}`;
}

export function ResultCard({
  attack,
  target,
  known,
  systeme,
  presentation,
  successRule,
}: {
  attack: Attack;
  target: AttackTarget;
  known: ReadonlyMap<string, KnownCharacter>;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  successRule: boolean;
}) {
  const [details, setDetails] = useState(false);
  const d = targetDisplay(attack, target);
  const name = targetName(d.characterId, known);
  const outcome = outcomeLabel(d.outcome, successRule);
  const tone = outcome ? TONES[outcome.tone] : null;
  const decision = decisionLabel(d.decision);

  return (
    <li className="space-y-2.5 rounded-xl border border-border bg-surface-2/50 p-3">
      <div className="flex items-center gap-2.5">
        <Illustration
          src={known.get(d.characterId)?.portraitUrl}
          graine={name}
          className="size-8 shrink-0 rounded-full"
        />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
        {tone && outcome && (
          <Badge ton={tone.ton} taille="md">
            <tone.icon className="size-3.5" aria-hidden />
            {outcome.label}
          </Badge>
        )}
      </div>

      {d.error && (
        <p className="flex items-start gap-1.5 text-[13px] text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {d.error}
        </p>
      )}

      {d.roll?.kind === 'numeric' && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-3xl font-semibold tabular-nums leading-none">
            {d.roll.total}
          </span>
          <DesDuJet
            taille="xs"
            entree
            groupes={d.roll.dice.map((g) => ({
              faces: g.faces,
              total: g.values.filter((v) => v.kept).reduce((s, v) => s + v.value, 0),
              dice: g.values.map((v) => ({ value: v.value, kept: v.kept, exploded: v.exploded })),
            }))}
          />
        </div>
      )}
      {d.roll?.kind === 'symbols' && (
        <div className="space-y-2">
          <ResultatsSymboles
            systeme={systeme}
            presentation={presentation}
            resultats={d.roll.results}
          />
          <DesSymboles
            systeme={systeme}
            presentation={presentation}
            des={d.roll.dice.map((x) => ({ de: x.die, face: x.face, symboles: x.symbols }))}
          />
        </div>
      )}

      {d.values.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {d.values.map((v) => (
            <div key={v.key} className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">{v.name ?? v.key}</dt>
              <dd className="font-mono font-semibold tabular-nums">{String(v.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {d.full && d.modifications.length > 0 && (
        <ul className="space-y-0.5 rounded-lg border border-primary/20 bg-primary/[0.05] px-2.5 py-1.5 text-[13px]">
          {d.modifications.map((m, i) => (
            <li key={i}>
              {m.entity === 'actor' ? 'Attaquant : ' : ''}
              {modificationText(systeme, m)}
            </li>
          ))}
        </ul>
      )}
      {d.full &&
        d.tables.map((t, i) => (
          <p key={i} className="text-[13px]">
            <span className="text-muted-foreground">{t.name ?? t.table} : </span>
            {t.line?.name ?? 'hors table'}{' '}
            <span className="font-mono text-subtle">({t.value})</span>
          </p>
        ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {decision ? (
          <Badge ton={d.decision === 'applied' ? 'succes' : 'neutre'}>{decision}</Badge>
        ) : d.status === 'resolved' ? (
          <span className="text-[12px] text-subtle">En attente de la décision du MJ</span>
        ) : (
          <span />
        )}
        {d.explanations.length > 0 && (
          <button
            type="button"
            aria-expanded={details}
            onClick={() => setDetails((v) => !v)}
            className="flex items-center gap-1 rounded text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', details && 'rotate-180')}
              aria-hidden
            />
            Déroulé
          </button>
        )}
      </div>
      {details && (
        <ol className="space-y-1 border-l border-border pl-3 text-[12px] text-muted-foreground">
          {d.roll?.kind === 'numeric' && (
            <li className="break-all font-mono text-[11px] text-subtle">{d.roll.formula}</li>
          )}
          {d.explanations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      )}
    </li>
  );
}
