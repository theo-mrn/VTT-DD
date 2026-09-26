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
import { AppButton, Message, styleChamp } from '@/components/account/elements';
import { Input } from '@/components/ui/input';
import { parseNotation, rollNotation, rollFreePool } from '@/lib/rolls';
import { cn } from '@/lib/utils';
import {
  presentationAccent,
  kindAppearance,
  dim,
  ShapedDie,
  textOn,
  type KindAppearance,
} from './appearance';
import { Throw3D, type Throw3DHandle } from './throw-3d';
import { RollResult, summarizeRoll, type DisplayedRoll } from './roll-result';

export interface DiceLauncherProps {
  /** Système chargé (`charger`) : ses dés à symboles et ses formules. */
  system: SystemeCharge;
  /** Présentation vérifiée du système (couleurs, formes, icônes) ; facultative. */
  presentation?: Presentation | null;
  /** Nombre de jets gardés dans l'historique (20 par défaut). */
  maxHistory?: number;
  /**
   * Anime chaque lancer en 3D avec les skins de la présentation (visuel
   * seulement). Désactivé par défaut : le canevas WebGL est coûteux.
   */
  animation3d?: boolean;
  className?: string;
}

interface HistoryEntry {
  id: string;
  date: number;
  roll: DisplayedRoll;
}

type Mode = 'symboles' | 'formule';

/** Dés proposés en raccourci quand la présentation n'en déclare aucun. */
const STANDARD_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

const storageKey = (system: SystemeCharge) => `vtt-des-historique:${system.source.id}`;

function readHistory(system: SystemeCharge): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(system));
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && e.roll && e.id) : [];
  } catch {
    return [];
  }
}

function writeHistory(system: SystemeCharge, list: HistoryEntry[]) {
  try {
    localStorage.setItem(storageKey(system), JSON.stringify(list));
  } catch {
    // Stockage indisponible (navigation privée…) : l'historique reste en mémoire
  }
}

export function DiceLauncher({
  system,
  presentation,
  maxHistory = 20,
  animation3d = false,
  className,
}: DiceLauncherProps) {
  const thrower3d = useRef<Throw3DHandle>(null);
  const kinds = useMemo(
    () => (system.source.des?.sortes ?? []).map((s) => kindAppearance(s.id, system, presentation)),
    [system, presentation],
  );
  const hasSymbols = kinds.length > 0;
  const accent = presentationAccent(presentation);

  const [mode, setMode] = useState<Mode>(hasSymbols ? 'symboles' : 'formule');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notation, setNotation] = useState('1d20');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [shown, setShown] = useState<string | null>(null);

  // Changement de système : compteurs vidés, historique du système relu
  useEffect(() => {
    setMode(hasSymbols ? 'symboles' : 'formule');
    setCounts({});
    setError(null);
    const h = readHistory(system);
    setHistory(h);
    setShown(h[0]?.id ?? null);
  }, [system, hasSymbols]);

  const pool: Pool = kinds
    .map((s) => ({ de: s.id, nombre: counts[s.id] ?? 0 }))
    .filter((p) => p.nombre > 0);
  const totalDice = pool.reduce((s, p) => s + p.nombre, 0);
  const analysis = useMemo(() => parseNotation(notation), [notation]);

  const addToHistory = (roll: DisplayedRoll) => {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: Date.now(),
      roll,
    };
    const list = [entry, ...history].slice(0, maxHistory);
    setHistory(list);
    setShown(entry.id);
    writeHistory(system, list);
  };

  const change = (die: string, delta: number) =>
    setCounts((c) => ({ ...c, [die]: Math.max(0, Math.min(20, (c[die] ?? 0) + delta)) }));

  const rollSymbols = () => {
    setError(null);
    if (totalDice === 0) return;
    try {
      addToHistory({ kind: 'symboles', pool, roll: rollFreePool(system, pool) });
      thrower3d.current?.roll(
        pool.flatMap((p) => {
          const a = kinds.find((s) => s.id === p.de);
          return Array.from({ length: p.nombre }, () => ({
            skin: a?.skin,
            shape: a?.shape ?? 'd6',
          }));
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lancer impossible');
    }
  };

  const rollFormula = (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!analysis.ok) return;
    try {
      const r = rollNotation(analysis.text);
      addToHistory({ kind: 'formule', text: r.text, value: r.value, rolls: r.rolls });
      thrower3d.current?.roll(
        r.rolls.flatMap((j) => {
          const a = kindAppearance(`d${j.faces}`, system, presentation);
          return j.des.map(() => ({ skin: a.skin, shape: a.shape }));
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lancer impossible');
    }
  };

  /** Raccourci : ajoute un dé à la notation (`1d20` → `1d20 + 1d6`). */
  const addDie = (die: string) =>
    setNotation((n) => (n.trim() ? `${n.trim()} + 1${die}` : `1${die}`));

  const shortcuts = (() => {
    const declared = Object.keys(presentation?.des?.sortes ?? {}).filter((id) => /^d\d+$/.test(id));
    return declared.length ? declared : STANDARD_DICE;
  })();

  const latest = history.find((h) => h.id === shown) ?? history[0];

  return (
    <div className={cn('grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]', className)}>
      {animation3d && <Throw3D ref={thrower3d} />}
      <div className="min-w-0 space-y-5">
        {hasSymbols && (
          <div
            className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1"
            role="tablist"
          >
            {(
              [
                ['symboles', 'Dés du système'],
                ['formule', 'Formule'],
              ] as const
            ).map(([m, label]) => (
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
                style={mode === m ? { backgroundColor: accent, color: textOn(accent) } : {}}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === 'symboles' && hasSymbols ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 xs:grid-cols-3 sm:grid-cols-4">
              {kinds.map((s) => (
                <DieKey
                  key={s.id}
                  kind={s}
                  count={counts[s.id] ?? 0}
                  onAdd={() => change(s.id, 1)}
                  onRemove={() => change(s.id, -1)}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AppButton
                onClick={rollSymbols}
                disabled={totalDice === 0}
                style={{ backgroundColor: accent, color: textOn(accent) }}
              >
                Lancer {totalDice > 0 ? `${totalDice} dé${totalDice > 1 ? 's' : ''}` : ''}
              </AppButton>
              <AppButton tone="discret" onClick={() => setCounts({})} disabled={totalDice === 0}>
                <RotateCcw />
                Vider
              </AppButton>
              {totalDice > 0 && (
                <span className="text-sm text-zinc-400">
                  {pool
                    .map((p) => `${p.nombre} ${kinds.find((s) => s.id === p.de)?.short ?? p.de}`)
                    .join(' + ')}
                </span>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={rollFormula} className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {shortcuts.map((die) => {
                const a = kindAppearance(die, system, presentation);
                return (
                  <button
                    key={die}
                    type="button"
                    onClick={() => addDie(die)}
                    className="rounded-lg p-0.5 transition-transform hover:scale-105"
                    title={`Ajouter 1${die}`}
                  >
                    <ShapedDie shape={a.shape} color={a.color} size={40}>
                      {die}
                    </ShapedDie>
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
                aria-invalid={!analysis.ok}
                className={cn(styleChamp, 'font-mono')}
                spellCheck={false}
                autoComplete="off"
              />
              <AppButton
                type="submit"
                disabled={!analysis.ok}
                className="h-10"
                style={{ backgroundColor: accent, color: textOn(accent) }}
              >
                Lancer
              </AppButton>
              <AppButton
                type="button"
                tone="discret"
                className="h-10"
                onClick={() => setNotation('')}
                aria-label="Effacer la formule"
              >
                <RotateCcw />
              </AppButton>
            </div>
            {!analysis.ok && notation.trim() !== '' && (
              <p className="font-mono text-xs text-red-300">
                {notation}
                <br />
                {' '.repeat(Math.min(analysis.position, notation.length))}^ {analysis.message}
              </p>
            )}
            <p className="text-xs text-zinc-500">
              <code>k3</code> garde les 3 meilleurs, <code>kl1</code> le pire, <code>!</code> fait
              exploser le dé sur sa valeur maximale.
            </p>
          </form>
        )}

        {error && <Message>{error}</Message>}

        {latest ? (
          <RollResult roll={latest.roll} system={system} presentation={presentation} />
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
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setHistory([]);
                setShown(null);
                writeHistory(system, []);
              }}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Vider l'historique"
              title="Vider l'historique"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-500">Aucun jet pour l’instant.</p>
        ) : (
          <ol className="space-y-1">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => setShown(h.id)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    h.id === latest?.id
                      ? 'border-zinc-600 bg-zinc-800 text-white'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700',
                  )}
                >
                  <span className="block truncate">{summarizeRoll(h.roll, system)}</span>
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
function DieKey({
  kind,
  count,
  onAdd,
  onRemove,
}: {
  kind: KindAppearance;
  count: number;
  onAdd(): void;
  onRemove(): void;
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === '-' || e.key === 'Backspace') {
      e.preventDefault();
      onRemove();
    }
  };
  return (
    <div
      className="relative flex items-center gap-2 rounded-xl border p-2 transition-colors"
      style={{
        borderColor: count > 0 ? kind.color : dim(kind.color, 30),
        backgroundColor: dim(kind.color, count > 0 ? 14 : 5),
      }}
    >
      <button
        type="button"
        onClick={onAdd}
        onContextMenu={(e) => {
          e.preventDefault();
          onRemove();
        }}
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={`${kind.name}${kind.original ? ` (${kind.original})` : ''} : clic pour ajouter, clic droit pour retirer`}
      >
        <ShapedDie shape={kind.shape} color={kind.color} size={38} filled={count > 0}>
          {count > 0 ? count : <Plus className="h-3.5 w-3.5" />}
        </ShapedDie>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-zinc-100">{kind.short}</span>
          {kind.original && (
            <span className="block truncate text-xs text-zinc-500">{kind.original}</span>
          )}
        </span>
      </button>
      {count > 0 && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          aria-label={`Retirer un dé ${kind.name}`}
        >
          <Minus className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
