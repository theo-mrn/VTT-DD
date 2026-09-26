'use client';

import { soldes, type Widget } from '@vtt/rules';
import { ChevronDown, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useFiche } from './contexte';
import { Bloc, VideFiche } from './elements';
import { formaterNombre, nomObjet } from './format';
import { boutonIcone, caseValeur, focus, texte, texteAccent, texteSecondaire } from './styles';

type WidgetMonnaies = Extract<Widget, { type: 'monnaies' }>;

/** Soldes des monnaies (total gagné − dépenses du journal) et historique des achats. */
export function WidgetMonnaies({ widget }: { widget: WidgetMonnaies }) {
  const { systeme, fiche, etat, lectureSeule, rembourser } = useFiche();
  const [journal, setJournal] = useState(false);
  const liste = soldes(fiche);
  const lignes = etat.journal.map((l, i) => ({ l, i })).reverse();

  return (
    <Bloc titre={widget.titre}>
      {liste.length ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {liste.map((s) => (
            <div key={s.monnaie.id} className={cn(caseValeur, 'px-3 py-2.5')}>
              <p className={cn(texteSecondaire, 'text-xs uppercase tracking-wide')}>
                {s.monnaie.nom}
              </p>
              <p
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  s.solde < 0 ? 'text-red-400' : texteAccent,
                )}
              >
                {formaterNombre(s.solde)}
              </p>
              <p className={cn(texteSecondaire, 'text-xs tabular-nums')}>
                {formaterNombre(s.total)} gagné{s.total > 1 ? 's' : ''} ·{' '}
                {formaterNombre(s.depense)} dépensé{s.depense > 1 ? 's' : ''}
              </p>
              {s.erreur && <p className="mt-1 text-xs text-red-300">{s.erreur}</p>}
            </div>
          ))}
        </div>
      ) : (
        <VideFiche>Aucune monnaie pour ce type d&apos;entité.</VideFiche>
      )}

      {lignes.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={journal}
            onClick={() => setJournal((j) => !j)}
            className={cn(
              texteSecondaire,
              'flex items-center gap-1 rounded text-xs hover:underline',
              focus,
            )}
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', journal && 'rotate-180')}
            />
            Historique des achats ({lignes.length})
          </button>
          {journal && (
            <ul className="mt-2 max-h-72 divide-y divide-[color:var(--fiche-bordure)] overflow-y-auto">
              {lignes.map(({ l, i }) => (
                <li key={i} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className={cn(texte, 'block truncate')}>
                      {nomObjet(systeme, etat.type, l)}
                    </span>
                    <span className={cn(texteSecondaire, 'block text-xs')}>
                      {systeme.achats.get(l.achat)?.nom ?? l.achat}
                      {l.creation ? ' · création' : ''}
                      {l.date ? ` · ${new Date(l.date).toLocaleDateString('fr-FR')}` : ''}
                    </span>
                  </span>
                  <span className={cn(texte, 'tabular-nums')}>
                    −{formaterNombre(l.cout)}{' '}
                    <span className={texteSecondaire}>{systeme.monnaies.get(l.monnaie)?.nom}</span>
                  </span>
                  {!lectureSeule && (
                    <button
                      type="button"
                      className={cn(boutonIcone, 'h-8 w-8')}
                      aria-label={`Annuler l'achat : ${nomObjet(systeme, etat.type, l)}`}
                      title="Annuler cet achat (seul le dernier achat d'un même objet s'annule)"
                      onClick={() => void rembourser(i)}
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Bloc>
  );
}
