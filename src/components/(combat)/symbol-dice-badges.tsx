import { Check, X, TrendingUp, TrendingDown, Star, Skull, Dices, Flame, type LucideIcon } from "lucide-react"
import type { SymbolDiceBreakdownEntry } from "@/lib/rules-engine"

// Mapping générique par LABEL (pas de clé en dur du bundle Star Wars) : une stat dérivée dont le
// libellé contient un de ces mots reçoit l'icône/couleur associée. Un système à dés à symboles avec
// d'autres libellés retombe sur l'icône neutre — jamais un plantage ni un texte manquant.
const SYMBOL_STYLES: { match: RegExp; icon: LucideIcon; className: string }[] = [
  { match: /triomphe/i, icon: Star, className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { match: /désespoir/i, icon: Skull, className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  { match: /succès/i, icon: Check, className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { match: /échec/i, icon: X, className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { match: /avantage/i, icon: TrendingUp, className: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
  { match: /menace/i, icon: TrendingDown, className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
]
const DEFAULT_STYLE = { icon: Star, className: 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border-[var(--border-color)]' }

const styleFor = (label: string) => SYMBOL_STYLES.find((s) => s.match.test(label)) ?? DEFAULT_STYLE

/** Détail d'un jet à dés à symboles (ex EotE) sous forme de badges (icône + valeur) — un par symbole
 *  net non nul (Succès/Échec/Avantage/Menace/Triomphe/Désespoir), au lieu d'une ligne de texte
 *  concaténée. Rendu vide si breakdown est vide (jet "Aucun effet"). */
export function SymbolDiceBadges({ breakdown, className = "" }: { breakdown: SymbolDiceBreakdownEntry[] | undefined, className?: string }) {
  if (!breakdown || breakdown.length === 0) return null

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {breakdown.map((entry) => {
        const { icon: Icon, className: styleClass } = styleFor(entry.label)
        return (
          <span
            key={entry.key}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${styleClass}`}
          >
            <Icon className="h-3 w-3" />
            {entry.value} {entry.label}
          </span>
        )
      })}
    </div>
  )
}

export interface SymbolDiceCritInfo {
  critThreshold?: number
  critActivations?: number
  critTriumphs?: number
  critNetAdvantages?: number
}

/** Traçabilité complète d'un jet à dés à symboles pour le MJ : quels dés ont été lancés (par type,
 *  avec chaque face obtenue) et si le seuil Critique de l'arme est atteint — les mêmes informations
 *  que voit déjà le joueur sur son écran de résultat, jusque-là absentes côté MJ. */
export function SymbolDiceRollDetails({ diceDetail, crit, className = "" }: { diceDetail?: string, crit?: SymbolDiceCritInfo, className?: string }) {
  const hasCrit = crit?.critThreshold != null
  if (!diceDetail && !hasCrit) return null

  return (
    <div className={`space-y-1.5 ${className}`}>
      {diceDetail && (
        <div className="flex items-start gap-1.5 text-[10px] font-mono text-[var(--text-secondary)]">
          <Dices className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{diceDetail}</span>
        </div>
      )}
      {hasCrit && (
        (crit!.critActivations ?? 0) >= 1 ? (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-400">
            <Flame className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              Critique déclenchable{(crit!.critActivations ?? 0) > 1 ? ` ×${crit!.critActivations} (+10 au d100/activation en plus)` : ''}
              {' — '}
              {(crit!.critTriumphs ?? 0) > 0 ? 'Triomphe' : `${crit!.critNetAdvantages ?? 0}/${crit!.critThreshold} Avantages dépensés`}
            </span>
          </div>
        ) : (
          <div className="text-[10px] text-[var(--text-secondary)]">
            Crit {crit!.critThreshold} non déclenché ({crit!.critNetAdvantages ?? 0} Avantage{(crit!.critNetAdvantages ?? 0) > 1 ? 's' : ''}, pas de Triomphe)
          </div>
        )
      )}
    </div>
  )
}
