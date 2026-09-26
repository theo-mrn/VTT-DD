'use client';

/**
 * Lanceur de dés libre, hors personnage :
 * - dés à symboles du système (une touche par sorte, compteurs, lancer) ;
 * - notation libre (`2d6 + 3`, `4d6k3`, `1d20!`) vérifiée par le moteur.
 * Les jets sont tirés localement avec un générateur cryptographique et gardés
 * dans un historique propre au navigateur.
 */
import { History, Minus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Pool, Presentation, SystemeCharge } from '@vtt/rules';
import { Bouton, Message, styleChamp } from '@/components/account/elements';
import { Input } from '@/components/ui/input';
import { analyserNotation, lancerNotation, lancerPoolLibre } from '@/lib/rolls';
import { cn } from '@/lib/utils';
import {
  accentPresentation,
  apparenceSorte,
  attenuer,
  DeForme,
  texteSur,
  type ApparenceSorte,
} from './appearance';
import { Lancer3D, type Lancer3DHandle } from './throw-3d';
import { ResultatJet, resumerJet, type JetAffiche } from './roll-result';

export interface LanceurDesProps {
  /** Système chargé (`charger`) : ses dés à symboles et ses formules. */
  systeme: SystemeCharge;
  /** Présentation vérifiée du système (couleurs, formes, icônes) ; facultative. */
  presentation?: Presentation | null;
  /** Nombre de jets gardés dans l'historique (20 par défaut). */
  historiqueMax?: number;
  /**
   * Anime chaque lancer en 3D avec les skins de la présentation (visuel
   * seulement). Désactivé par défaut : le canevas WebGL est coûteux.
   */
  animation3d?: boolean;
  className?: string;
}

interface EntreeHistorique {
  id: string;
  date: number;
  jet: JetAffiche;
}

type Mode = 'symboles' | 'formule';

/** Dés proposés en raccourci quand la présentation n'en déclare aucun. */
const DES_STANDARDS = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

const cleStockage = (systeme: SystemeCharge) => `vtt-des-historique:${systeme.source.id}`;

function lireHistorique(systeme: SystemeCharge): EntreeHistorique[] {
  try {
    const brut = localStorage.getItem(cleStockage(systeme));
    const liste = brut ? (JSON.parse(brut) as EntreeHistorique[]) : [];
    return Array.isArray(liste) ? liste.filter((e) => e && e.jet && e.id) : [];
  } catch {
    return [];
  }
}

function ecrireHistorique(systeme: SystemeCharge, liste: EntreeHistorique[]) {
  try {
    localStorage.setItem(cleStockage(systeme), JSON.stringify(liste));
  } catch {
    // Stockage indisponible (navigation privée…) : l'historique reste en mémoire
  }
}

export function LanceurDes({
  systeme,
  presentation,
  historiqueMax = 20,
  animation3d = false,
  className,
}: LanceurDesProps) {
  const lanceur3d = useRef<Lancer3DHandle>(null);
  const sortes = useMemo(
    () =>
      (systeme.source.des?.sortes ?? []).map((s) => apparenceSorte(s.id, systeme, presentation)),
    [systeme, presentation],
  );
  const aSymboles = sortes.length > 0;
  const accent = accentPresentation(presentation);

  const [mode, setMode] = useState<Mode>(aSymboles ? 'symboles' : 'formule');
  const [compteurs, setCompteurs] = useState<Record<string, number>>({});
  const [notation, setNotation] = useState('1d20');
  const [erreur, setErreur] = useState<string | null>(null);
  const [historique, setHistorique] = useState<EntreeHistorique[]>([]);
  const [affiche, setAffiche] = useState<string | null>(null);

  // Changement de système : compteurs vidés, historique du système relu
  useEffect(() => {
    setMode(aSymboles ? 'symboles' : 'formule');
    setCompteurs({});
    setErreur(null);
    const h = lireHistorique(systeme);
    setHistorique(h);
    setAffiche(h[0]?.id ?? null);
  }, [systeme, aSymboles]);

  const pool: Pool = sortes
    .map((s) => ({ de: s.id, nombre: compteurs[s.id] ?? 0 }))
    .filter((p) => p.nombre > 0);
  const totalDes = pool.reduce((s, p) => s + p.nombre, 0);
  const analyse = useMemo(() => analyserNotation(notation), [notation]);

  const ajouterAuHistorique = (jet: JetAffiche) => {
    const entree: EntreeHistorique = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: Date.now(),
      jet,
    };
    const liste = [entree, ...historique].slice(0, historiqueMax);
    setHistorique(liste);
    setAffiche(entree.id);
    ecrireHistorique(systeme, liste);
  };

  const changer = (de: string, delta: number) =>
    setCompteurs((c) => ({ ...c, [de]: Math.max(0, Math.min(20, (c[de] ?? 0) + delta)) }));

  const lancerSymboles = () => {
    setErreur(null);
    if (totalDes === 0) return;
    try {
      ajouterAuHistorique({ sorte: 'symboles', pool, lancer: lancerPoolLibre(systeme, pool) });
      lanceur3d.current?.lancer(
        pool.flatMap((p) => {
          const a = sortes.find((s) => s.id === p.de);
          return Array.from({ length: p.nombre }, () => ({
            skin: a?.skin,
            forme: a?.forme ?? 'd6',
          }));
        }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lancer impossible');
    }
  };

  const lancerFormule = (e?: FormEvent) => {
    e?.preventDefault();
    setErreur(null);
    if (!analyse.ok) return;
    try {
      const r = lancerNotation(analyse.texte);
      ajouterAuHistorique({ sorte: 'formule', texte: r.texte, valeur: r.valeur, jets: r.jets });
      lanceur3d.current?.lancer(
        r.jets.flatMap((j) => {
          const a = apparenceSorte(`d${j.faces}`, systeme, presentation);
          return j.des.map(() => ({ skin: a.skin, forme: a.forme }));
        }),
      );
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Lancer impossible');
    }
  };

  /** Raccourci : ajoute un dé à la notation (`1d20` → `1d20 + 1d6`). */
  const ajouterDe = (de: string) =>
    setNotation((n) => (n.trim() ? `${n.trim()} + 1${de}` : `1${de}`));

  const raccourcis = (() => {
    const declares = Object.keys(presentation?.des?.sortes ?? {}).filter((id) => /^d\d+$/.test(id));
    return declares.length ? declares : DES_STANDARDS;
  })();

  const courant = historique.find((h) => h.id === affiche) ?? historique[0];

  return (
    <div className={cn('grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]', className)}>
      {animation3d && <Lancer3D ref={lanceur3d} />}
      <div className="min-w-0 space-y-5">
        {aSymboles && (
          <div
            className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1"
            role="tablist"
          >
            {(
              [
                ['symboles', 'Dés du système'],
                ['formule', 'Formule'],
              ] as const
            ).map(([m, libelle]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  mode === m ? 'font-semibold' : 'text-zinc-400 hover:text-white',
                )}
                style={mode === m ? { backgroundColor: accent, color: texteSur(accent) } : {}}
              >
                {libelle}
              </button>
            ))}
          </div>
        )}

        {mode === 'symboles' && aSymboles ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 xs:grid-cols-3 sm:grid-cols-4">
              {sortes.map((s) => (
                <ToucheDe
                  key={s.id}
                  sorte={s}
                  nombre={compteurs[s.id] ?? 0}
                  onAjouter={() => changer(s.id, 1)}
                  onRetirer={() => changer(s.id, -1)}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Bouton
                onClick={lancerSymboles}
                disabled={totalDes === 0}
                style={{ backgroundColor: accent, color: texteSur(accent) }}
              >
                Lancer {totalDes > 0 ? `${totalDes} dé${totalDes > 1 ? 's' : ''}` : ''}
              </Bouton>
              <Bouton ton="discret" onClick={() => setCompteurs({})} disabled={totalDes === 0}>
                <RotateCcw />
                Vider
              </Bouton>
              {totalDes > 0 && (
                <span className="text-sm text-zinc-400">
                  {pool
                    .map((p) => `${p.nombre} ${sortes.find((s) => s.id === p.de)?.court ?? p.de}`)
                    .join(' + ')}
                </span>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={lancerFormule} className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {raccourcis.map((de) => {
                const a = apparenceSorte(de, systeme, presentation);
                return (
                  <button
                    key={de}
                    type="button"
                    onClick={() => ajouterDe(de)}
                    className="rounded-lg p-0.5 transition-transform hover:scale-105"
                    title={`Ajouter 1${de}`}
                  >
                    <DeForme forme={a.forme} couleur={a.couleur} taille={40}>
                      {de}
                    </DeForme>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={notation}
                onChange={(e) => setNotation(e.target.value)}
                placeholder="2d6 + 3, 4d6k3, 1d20!"
                aria-label="Formule de dés"
                aria-invalid={!analyse.ok}
                className={cn(styleChamp, 'font-mono')}
                spellCheck={false}
                autoComplete="off"
              />
              <Bouton
                type="submit"
                disabled={!analyse.ok}
                className="h-10"
                style={{ backgroundColor: accent, color: texteSur(accent) }}
              >
                Lancer
              </Bouton>
              <Bouton
                type="button"
                ton="discret"
                className="h-10"
                onClick={() => setNotation('')}
                aria-label="Effacer la formule"
              >
                <RotateCcw />
              </Bouton>
            </div>
            {!analyse.ok && notation.trim() !== '' && (
              <p className="font-mono text-xs text-red-300">
                {notation}
                <br />
                {' '.repeat(Math.min(analyse.position, notation.length))}^ {analyse.message}
              </p>
            )}
            <p className="text-xs text-zinc-500">
              <code>k3</code> garde les 3 meilleurs, <code>kl1</code> le pire, <code>!</code> fait
              exploser le dé sur sa valeur maximale.
            </p>
          </form>
        )}

        {erreur && <Message>{erreur}</Message>}

        {courant ? (
          <ResultatJet jet={courant.jet} systeme={systeme} presentation={presentation} />
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
            Composez un jet puis lancez les dés.
          </p>
        )}
      </div>

      <aside className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <History className="h-4 w-4 text-zinc-500" />
            Derniers jets
          </h3>
          {historique.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setHistorique([]);
                setAffiche(null);
                ecrireHistorique(systeme, []);
              }}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Vider l'historique"
              title="Vider l'historique"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {historique.length === 0 ? (
          <p className="text-xs text-zinc-500">Aucun jet pour l’instant.</p>
        ) : (
          <ol className="space-y-1">
            {historique.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => setAffiche(h.id)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    h.id === courant?.id
                      ? 'border-zinc-600 bg-zinc-800 text-white'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700',
                  )}
                >
                  <span className="block truncate">{resumerJet(h.jet, systeme)}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(h.date).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}

/** Touche d'une sorte de dé : clic pour ajouter, bouton « − » ou clic droit pour retirer. */
function ToucheDe({
  sorte,
  nombre,
  onAjouter,
  onRetirer,
}: {
  sorte: ApparenceSorte;
  nombre: number;
  onAjouter(): void;
  onRetirer(): void;
}) {
  const clavier = (e: KeyboardEvent) => {
    if (e.key === '-' || e.key === 'Backspace') {
      e.preventDefault();
      onRetirer();
    }
  };
  return (
    <div
      className="relative flex items-center gap-2 rounded-xl border p-2 transition-colors"
      style={{
        borderColor: nombre > 0 ? sorte.couleur : attenuer(sorte.couleur, 30),
        backgroundColor: attenuer(sorte.couleur, nombre > 0 ? 14 : 5),
      }}
    >
      <button
        type="button"
        onClick={onAjouter}
        onContextMenu={(e) => {
          e.preventDefault();
          onRetirer();
        }}
        onKeyDown={clavier}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={`${sorte.nom}${sorte.original ? ` (${sorte.original})` : ''} : clic pour ajouter, clic droit pour retirer`}
      >
        <DeForme forme={sorte.forme} couleur={sorte.couleur} taille={38} plein={nombre > 0}>
          {nombre > 0 ? nombre : <Plus className="h-3.5 w-3.5" />}
        </DeForme>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-zinc-100">{sorte.court}</span>
          {sorte.original && (
            <span className="block truncate text-xs text-zinc-500">{sorte.original}</span>
          )}
        </span>
      </button>
      {nombre > 0 && (
        <button
          type="button"
          onClick={onRetirer}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          aria-label={`Retirer un dé ${sorte.nom}`}
        >
          <Minus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
