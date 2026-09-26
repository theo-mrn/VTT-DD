'use client';

import { acheterEtape, detailSolde, type ObjetAchetable } from '@vtt/rules';
import { Search, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { ecritures } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import { BoutonAchat } from '../bouton-achat';
import { useFiche } from '../contexte';
import { normaliser, VideFiche } from '../elements';
import { formaterNombre, nomObjet } from '../format';
import {
  boutonIcone,
  boutonSecondaire,
  caseValeur,
  champ,
  texte,
  texteAccent,
  texteSecondaire,
} from '../styles';
import { WidgetArbres } from '../widget-arbres';
import type { Etape } from './assistant';

/** Étape « acheter » : achats autorisés par l'étape, soldes, et annulation des achats faits. */
export function EtapeAcheter({ etape }: { etape: Etape<'acheter'> }) {
  const { systeme, fiche, etat, achats, ecrire, rembourser } = useFiche();
  const [recherche, setRecherche] = useState('');
  const [bloques, setBloques] = useState(false);

  const disponibles = achats.filter((a) => etape.achats.includes(a.achat.id));
  const monnaies = [...new Set(etape.achats.map((id) => systeme.achats.get(id)?.monnaie))]
    .filter((m): m is string => !!m && !!systeme.monnaies.get(m)?.pour.includes(etat.type))
    .map((m) => detailSolde(fiche, m));
  // Les nœuds d'arbre s'achètent sur la grille, plus lisible qu'une liste
  const avecNoeuds = etape.achats.some((id) => systeme.achats.get(id)?.obtient.type === 'noeud');
  const filtre = normaliser(recherche.trim());
  const journal = etat.journal
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.creation && etape.achats.includes(l.achat))
    .reverse();

  const acheter = (o: ObjetAchetable) =>
    ecrire(ecritures.etape(etape.id, { achat: o.achat, objet: o.objet }), (e) => {
      const r = acheterEtape(systeme, e, etape.id, { achat: o.achat, objet: o.objet });
      return r.ok ? r.etat : null;
    });

  return (
    <div className="space-y-5">
      {monnaies.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-live="polite">
          {monnaies.map((s) => (
            <div key={s.monnaie.id} className={cn(caseValeur, 'px-3 py-2')}>
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
                sur {formaterNombre(s.total)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className={cn(texteSecondaire, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')}
          />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher un achat"
            className={cn(champ, 'pl-9')}
          />
        </div>
        <button
          type="button"
          aria-pressed={bloques}
          className={cn(boutonSecondaire, 'text-xs')}
          onClick={() => setBloques((b) => !b)}
        >
          {bloques ? 'Masquer les achats impossibles' : 'Afficher les achats impossibles'}
        </button>
      </div>

      {disponibles
        .filter((a) => a.achat.obtient.type !== 'noeud')
        .map((a) => {
          const objets = a.objets
            .filter(
              (o) => (bloques || o.possible) && (!filtre || normaliser(o.nom).includes(filtre)),
            )
            .sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
          const monnaie = systeme.monnaies.get(a.achat.monnaie)?.nom ?? a.achat.monnaie;
          return (
            <section key={a.achat.id} aria-label={a.achat.nom} className="space-y-2">
              <div>
                <h3 className={cn(texte, 'text-sm font-semibold')}>{a.achat.nom}</h3>
                {a.achat.description && (
                  <p className={cn(texteSecondaire, 'text-xs')}>{a.achat.description}</p>
                )}
              </div>
              {objets.length ? (
                <ul className="max-h-80 divide-y divide-[color:var(--fiche-bordure)] overflow-y-auto rounded-xl border border-[color:var(--fiche-bordure)] px-3">
                  {objets.map((o) => (
                    <li key={o.objet} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className={cn(texte, 'block truncate text-sm')}>{o.nom}</span>
                        <span className={cn(texteSecondaire, 'block text-xs')}>
                          {o.possible
                            ? o.type === 'entree'
                              ? `${o.cout} ${monnaie}`
                              : `${o.actuel} → ${o.cible} · ${o.cout} ${monnaie}`
                            : o.blocages.map((b) => b.message).join(' ; ')}
                        </span>
                      </span>
                      <BoutonAchat
                        objet={o}
                        libelle={`${a.achat.nom} : ${o.nom}`}
                        monnaie={monnaie}
                        onAcheter={() => acheter(o)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <VideFiche>
                  {filtre ? 'Aucun résultat.' : 'Plus rien d’achetable pour l’instant.'}
                </VideFiche>
              )}
            </section>
          );
        })}

      {avecNoeuds && <WidgetArbres widget={{ type: 'arbres', titre: 'Arbres' }} />}

      {journal.length > 0 && (
        <section aria-label="Achats de cette étape" className="space-y-2">
          <h3 className={cn(texte, 'text-sm font-semibold')}>Achats faits</h3>
          <ul className="divide-y divide-[color:var(--fiche-bordure)] rounded-xl border border-[color:var(--fiche-bordure)] px-3">
            {journal.map(({ l, i }) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className={cn(texte, 'min-w-0 flex-1 truncate')}>
                  {nomObjet(systeme, etat.type, l)}
                  <span className={texteSecondaire}>
                    {' '}
                    · {systeme.achats.get(l.achat)?.nom ?? l.achat}
                  </span>
                </span>
                <span className={cn(texteSecondaire, 'tabular-nums')}>
                  −{formaterNombre(l.cout)}
                </span>
                <button
                  type="button"
                  className={cn(boutonIcone, 'h-8 w-8')}
                  aria-label={`Annuler : ${nomObjet(systeme, etat.type, l)}`}
                  onClick={() => void rembourser(i)}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
