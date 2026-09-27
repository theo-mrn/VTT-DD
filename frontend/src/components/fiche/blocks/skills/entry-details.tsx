'use client';

/**
 * Corps du détail d'une entrée (carte de compétence, rang de voie, nœud d'arbre) :
 * description assainie, bonus appliqués, effets du catalogue, effets de jet et champs.
 */
import type { Entree, Fiche } from '@vtt/rules';
import { Dices, Sparkles } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { describeEntry } from './model';
import { RichText } from './rich-text';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">{title}</p>
      {children}
    </div>
  );
}

export function EntryDetails({
  fiche,
  entry,
  showDescription = true,
}: {
  fiche: Fiche;
  entry: Entree;
  showDescription?: boolean;
}) {
  const d = useMemo(() => describeEntry(fiche, entry), [fiche, entry]);
  const appliedLabels = new Set(d.applied.map((b) => b.label));
  return (
    <div className="space-y-4">
      {d.fields.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.fields.map((f) => (
            <Badge key={f.name} taille="md">
              {f.name} : <span className="text-foreground">{f.value}</span>
            </Badge>
          ))}
        </div>
      )}
      {showDescription && entry.description && (
        <div className="max-h-64 overflow-y-auto pr-1">
          <RichText text={entry.description} />
        </div>
      )}
      {d.applied.length > 0 && (
        <Section title="Bonus actifs">
          <div className="flex flex-wrap gap-1.5">
            {d.applied.map((b, i) => (
              <Badge key={`${b.label}-${i}`} ton="primaire" taille="md">
                <Sparkles />
                {b.label}
              </Badge>
            ))}
          </div>
        </Section>
      )}
      {d.effects.filter((t) => !appliedLabels.has(t)).length > 0 && (
        <Section title="Effets">
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            {d.effects.map((t, i) => (
              <li key={`${t}-${i}`} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-subtle" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {d.rolls.length > 0 && (
        <Section title="Jets">
          <div className="flex flex-wrap gap-1.5">
            {d.rolls.map((t, i) => (
              <Badge key={`${t}-${i}`} ton="info" taille="md">
                <Dices />
                {t}
              </Badge>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
