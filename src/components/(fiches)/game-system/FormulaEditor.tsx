'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Code2 } from 'lucide-react';
import type { FormulaNode, StatDefinition } from '@/modules/game-system/types';
import { evaluateFormula, formulaToText, parseFormulaText, parseDiceNotation, type FormulaContext } from '@/lib/rules-engine';

interface FormulaEditorProps {
  /** Formule actuelle (null = pas encore de calcul défini). */
  value: FormulaNode | null;
  onChange: (node: FormulaNode | null) => void;
  /** Stats connues au moment de l'édition, pour peupler les menus et calculer l'aperçu. */
  availableStats: StatDefinition[];
  /** Ex: "Défense" — utilisé dans les phrases d'aide ("Défense = ..."). */
  targetLabel?: string;
  /** Propose "Valeur de la stat" ({type:'self'}) comme type de valeur — uniquement pertinent pour la
   *  formule de modificateur GLOBALE du système, qui s'applique à n'importe quelle ability sans clé fixe. */
  allowSelf?: boolean;
}

type Op = '+' | '-' | '*' | '/';
type ValueKind = 'const' | 'stat' | 'modifier' | 'random' | 'self';

interface Line {
  id: string;
  op: Op;
  valueKind: ValueKind;
  constValue: number;
  statKey: string;
  randomMin: number;
  randomMax: number;
}

function newLineId() {
  return `l_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function defaultLine(op: Op, firstStatKey: string): Line {
  return { id: newLineId(), op, valueKind: 'const', constValue: 0, statKey: firstStatKey, randomMin: 1, randomMax: 20 };
}

/** "Aléatoire entre min et max" (inclus) — encodé en interne comme un tirage 1d(max-min+1),
 *  décalé de (min-1) si min !== 1. Le MJ ne voit et ne saisit que min/max, jamais de notation de dé. */
function randomRangeNode(min: number, max: number): FormulaNode {
  const faces = Math.max(1, max - min + 1);
  const roll: FormulaNode = { type: 'dice', notation: `1d${faces}` };
  return min === 1 ? roll : { type: 'add', args: [roll, { type: 'const', value: min - 1 }] };
}

/** Détecte si un noeud correspond exactement au motif produit par randomRangeNode, et retourne (min, max). */
function asRandomRange(n: FormulaNode): { min: number; max: number } | null {
  if (n.type === 'dice') {
    const parsed = /^1d(\d+)$/i.exec(n.notation.trim());
    if (!parsed) return null;
    return { min: 1, max: parseInt(parsed[1], 10) };
  }
  if (n.type === 'add' && n.args.length === 2 && n.args[0].type === 'dice' && n.args[1].type === 'const') {
    const parsed = /^1d(\d+)$/i.exec(n.args[0].notation.trim());
    if (!parsed) return null;
    const faces = parseInt(parsed[1], 10);
    const offset = n.args[1].value;
    return { min: offset + 1, max: offset + faces };
  }
  return null;
}

/** Décompose une formule (+/- de premier niveau, chaque terme pouvant être un simple mul/div à 2 opérandes)
 *  en lignes éditables. Retourne null si la structure est trop complexe pour ce mode (floor/clamp/min/max...). */
function nodeToLines(node: FormulaNode | null, firstStatKey: string): Line[] | null {
  if (!node) return [];

  function asValueNode(n: FormulaNode): { valueKind: ValueKind; constValue: number; statKey: string; randomMin: number; randomMax: number } | null {
    const range = asRandomRange(n);
    if (range) return { valueKind: 'random', constValue: 0, statKey: firstStatKey, randomMin: range.min, randomMax: range.max };
    if (n.type === 'const') return { valueKind: 'const', constValue: n.value, statKey: firstStatKey, randomMin: 1, randomMax: 20 };
    if (n.type === 'stat') return { valueKind: 'stat', constValue: 0, statKey: n.key, randomMin: 1, randomMax: 20 };
    if (n.type === 'modifier') return { valueKind: 'modifier', constValue: 0, statKey: n.key, randomMin: 1, randomMax: 20 };
    if (n.type === 'self') return { valueKind: 'self', constValue: 0, statKey: firstStatKey, randomMin: 1, randomMax: 20 };
    return null;
  }

  const lines: Line[] = [];
  function walk(n: FormulaNode, op: Op): boolean {
    // Un "aléatoire entre" se reconnaît en priorité, avant de descendre dans add/dice génériques.
    const range = asRandomRange(n);
    if (range) {
      lines.push({ id: newLineId(), op, valueKind: 'random', constValue: 0, statKey: firstStatKey, randomMin: range.min, randomMax: range.max });
      return true;
    }
    if (n.type === 'add') {
      for (const arg of n.args) if (!walk(arg, op)) return false;
      return true;
    }
    if (n.type === 'sub') {
      if (!walk(n.args[0], op)) return false;
      for (let i = 1; i < n.args.length; i++) {
        if (!walk(n.args[i], op === '+' ? '-' : '+')) return false;
      }
      return true;
    }
    if (n.type === 'mul' && n.args.length === 2) {
      const rhs = asValueNode(n.args[1]);
      const lhsConst = n.args[0].type === 'const' ? n.args[0].value : null;
      if (rhs && lhsConst !== null) {
        lines.push({ id: newLineId(), op: op === '-' ? '-' : '*', ...rhs, constValue: lhsConst });
        return true;
      }
      return false;
    }
    if (n.type === 'div' && n.args.length === 2) {
      const lhs = asValueNode(n.args[0]);
      const rhsConst = n.args[1].type === 'const' ? n.args[1].value : null;
      if (lhs && rhsConst !== null) {
        lines.push({ id: newLineId(), op: op === '-' ? '-' : '/', ...lhs, constValue: rhsConst });
        return true;
      }
      return false;
    }
    const simple = asValueNode(n);
    if (simple) {
      lines.push({ id: newLineId(), op, ...simple });
      return true;
    }
    return false;
  }

  if (!walk(node, '+')) return null;
  return lines;
}

/** Reconstruit un FormulaNode depuis les lignes. Chaque ligne applique son opérateur au terme accumulé :
 *  +/- ajoutent ou retranchent la valeur ; * et / multiplient/divisent l'accumulateur par la valeur. */
function linesToNode(lines: Line[]): FormulaNode | null {
  if (lines.length === 0) return null;

  const valueOf = (l: Line): FormulaNode => {
    if (l.valueKind === 'const') return { type: 'const', value: l.constValue };
    if (l.valueKind === 'stat') return { type: 'stat', key: l.statKey };
    if (l.valueKind === 'modifier') return { type: 'modifier', key: l.statKey };
    if (l.valueKind === 'self') return { type: 'self' };
    return randomRangeNode(l.randomMin, l.randomMax);
  };

  let acc: FormulaNode = lines[0].op === '-'
    ? { type: 'sub', args: [{ type: 'const', value: 0 }, valueOf(lines[0])] }
    : valueOf(lines[0]);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const rhs = valueOf(line);
    if (line.op === '+') acc = { type: 'add', args: [acc, rhs] };
    else if (line.op === '-') acc = { type: 'sub', args: [acc, rhs] };
    else if (line.op === '*') acc = { type: 'mul', args: [acc, rhs] };
    else acc = { type: 'div', args: [acc, rhs] };
  }
  return acc;
}

// Valeurs de dnd-classic par label, gardées pour l'exemple affiché sous l'éditeur — utilisées en
// fallback quand une stat du système custom porte exactement l'un de ces labels historiques.
const KNOWN_LABEL_EXAMPLES: Record<string, number> = { FOR: 14, DEX: 12, CON: 16, SAG: 10, INT: 8, CHA: 13 };

// Valeur d'exemple pour {type:'self'} (formule de modificateur globale) — arbitraire, cohérente avec
// les autres valeurs d'exemple ci-dessus.
const EXAMPLE_SELF_VALUE = 14;

const OP_LABEL: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export function FormulaEditor({ value, onChange, availableStats, targetLabel, allowSelf }: FormulaEditorProps) {
  const firstStatKey = availableStats[0]?.key ?? '';
  const [mode, setMode] = useState<'lignes' | 'texte'>('lignes');
  const initialLines = useMemo(() => nodeToLines(value, firstStatKey), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [lines, setLines] = useState<Line[]>(initialLines && initialLines.length > 0 ? initialLines : [defaultLine('+', firstStatKey)]);
  const [tooComplex] = useState(initialLines === null && value !== null);
  const [text, setText] = useState(() => (value ? formulaToText(value) : ''));
  const [textError, setTextError] = useState<string | null>(null);

  const statKeys = availableStats.map((s) => s.key);
  const statDefs = useMemo(() => Object.fromEntries(availableStats.map((s) => [s.key, s])), [availableStats]);

  // Valeur d'exemple par CLÉ réelle (pas juste par label dnd-classic) — fonctionne pour n'importe
  // quel système custom (ex clé "car1" affichée "FOR"), pas seulement dnd-classic.
  const exampleValues = useMemo(() => Object.fromEntries(availableStats.map((s) => [
    s.key,
    KNOWN_LABEL_EXAMPLES[s.label] ?? (typeof s.defaultValue === 'number' ? s.defaultValue : 14),
  ])), [availableStats]);

  const exampleSummary = availableStats.map((s) => `${s.label} ${exampleValues[s.key]}`).join(', ');

  const previewRange = useMemo(() => {
    const node = mode === 'lignes' ? linesToNode(lines) : value;
    if (!node) return null;
    try {
      const rollMin = (notation: string) => parseDiceNotation(notation)?.count ?? 1;
      const rollMax = (notation: string) => {
        const parsed = parseDiceNotation(notation);
        return parsed ? parsed.count * parsed.sides : 1;
      };
      const min = evaluateFormula(node, { rawStats: exampleValues, statDefs, roll: rollMin, self: EXAMPLE_SELF_VALUE } as FormulaContext);
      const max = evaluateFormula(node, { rawStats: exampleValues, statDefs, roll: rollMax, self: EXAMPLE_SELF_VALUE } as FormulaContext);
      return min === max ? { min, max: null } : { min, max };
    } catch {
      return null;
    }
  }, [mode, lines, value, statDefs, exampleValues]);

  const commit = (nextLines: Line[]) => {
    setLines(nextLines);
    onChange(linesToNode(nextLines));
  };

  const addLine = () => commit([...lines, defaultLine('+', firstStatKey)]);
  const removeLine = (id: string) => commit(lines.length > 1 ? lines.filter((l) => l.id !== id) : lines);
  const updateLine = (id: string, patch: Partial<Line>) => commit(lines.map((l) => {
    if (l.id !== id) return l;
    const next = { ...l, ...patch };
    // En passant sur "Variable"/"Modif. de", s'assurer que statKey pointe une stat réellement
    // disponible — sinon (ex aucune autre stat n'existait encore au moment de la création de cette
    // ligne) la formule référencerait silencieusement une clé vide, toujours résolue à 0.
    if ((next.valueKind === 'stat' || next.valueKind === 'modifier') && !statKeys.includes(next.statKey)) {
      next.statKey = firstStatKey;
    }
    return next;
  }));

  // Auto-corrige toute ligne existante dont statKey est vide/invalide (ex une stat référencée a été
  // supprimée depuis, ou la ligne a été créée avant que la stat référencée n'existe) dès qu'une stat
  // valide devient disponible — sans ça, la formule reste silencieusement bloquée sur une valeur figée.
  useEffect(() => {
    if (statKeys.length === 0) return;
    const hasInvalidStatKey = lines.some((l) => (l.valueKind === 'stat' || l.valueKind === 'modifier') && !statKeys.includes(l.statKey));
    if (!hasInvalidStatKey) return;
    commit(lines.map((l) => ((l.valueKind === 'stat' || l.valueKind === 'modifier') && !statKeys.includes(l.statKey)
      ? { ...l, statKey: firstStatKey }
      : l)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statKeys.join(','), firstStatKey]);

  const applyText = () => {
    if (!text.trim()) { onChange(null); setTextError(null); return; }
    const result = parseFormulaText(text, statKeys);
    if (!result.ok) { setTextError(result.error); return; }
    setTextError(null);
    onChange(result.ast);
    const asLines = nodeToLines(result.ast, firstStatKey);
    if (asLines) setLines(asLines.length > 0 ? asLines : [defaultLine('+', firstStatKey)]);
  };

  return (
    <div className="w-full min-w-0 space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          {targetLabel ? <>{targetLabel} = </> : 'Comment calculer cette valeur ?'}
        </p>
        <button
          type="button"
          onClick={() => setMode(mode === 'lignes' ? 'texte' : 'lignes')}
          className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          title="Mode avancé : écrire la formule sous forme de texte"
        >
          <Code2 size={11} /> {mode === 'lignes' ? 'Mode texte' : 'Mode lignes'}
        </button>
      </div>

      {tooComplex && mode === 'lignes' && (
        <p className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>
          Cette formule utilise une structure trop complexe pour ce mode — passez en mode texte pour la modifier, ou recommencez ici.
        </p>
      )}

      {mode === 'lignes' ? (
        <div className="space-y-1.5">
          {lines.map((line, i) => (
            <div key={line.id} className="flex items-center gap-1.5">
              <select
                value={line.op}
                onChange={(e) => updateLine(line.id, { op: e.target.value as Op })}
                disabled={i === 0}
                className="w-11 shrink-0 text-center bg-transparent border border-[var(--border-color)] rounded px-1 py-1.5 text-sm font-bold disabled:opacity-40"
                style={{ color: 'var(--text-primary)' }}
              >
                {(['+', '-', '*', '/'] as Op[]).map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
              </select>

              <select
                value={line.valueKind}
                onChange={(e) => updateLine(line.id, { valueKind: e.target.value as ValueKind })}
                className="w-24 shrink-0 bg-[var(--bg-darker)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs"
                style={{ color: 'var(--text-primary)' }}
              >
                <option value="const">Nombre</option>
                <option value="stat">Variable</option>
                <option value="modifier">Modif. de</option>
                <option value="random">Aléatoire entre</option>
                {allowSelf && <option value="self">Valeur de la stat</option>}
              </select>

              {line.valueKind === 'const' ? (
                <input
                  type="number"
                  value={line.constValue}
                  onChange={(e) => updateLine(line.id, { constValue: Number(e.target.value) })}
                  className="w-20 shrink-0 bg-[var(--bg-darker)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs text-center"
                  style={{ color: 'var(--text-primary)' }}
                />
              ) : line.valueKind === 'self' ? (
                <span className="text-[11px] italic flex-1 min-w-0" style={{ color: 'var(--text-secondary)' }}>
                  La valeur de la stat évaluée (ex FOR, DEX...)
                </span>
              ) : line.valueKind === 'random' ? (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    value={line.randomMin}
                    onChange={(e) => updateLine(line.id, { randomMin: Number(e.target.value) })}
                    className="w-14 bg-[var(--bg-darker)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs text-center"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>et</span>
                  <input
                    type="number"
                    value={line.randomMax}
                    onChange={(e) => updateLine(line.id, { randomMax: Number(e.target.value) })}
                    className="w-14 bg-[var(--bg-darker)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs text-center"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              ) : statKeys.length > 0 ? (
                <select
                  value={line.statKey}
                  onChange={(e) => updateLine(line.id, { statKey: e.target.value })}
                  className="min-w-0 flex-1 bg-[var(--bg-darker)] border border-[var(--border-color)] rounded-lg px-2 py-1.5 text-xs"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {statKeys.map((k) => <option key={k} value={k}>{statDefs[k]?.label ?? k}</option>)}
                </select>
              ) : (
                <span className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>Ajoutez d&apos;abord une autre stat.</span>
              )}

              <div className="flex-1 min-w-0" />
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(line.id)} className="shrink-0 text-sm px-1.5 py-1 rounded transition-colors hover:text-red-400" style={{ color: 'var(--text-secondary)' }}>✕</button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addLine}
            className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            + Ajouter une ligne
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={applyText}
            placeholder="ex: 18 + mod(DEX)"
            className="w-full bg-[var(--bg-darker)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm font-mono"
            style={{ color: 'var(--text-primary)' }}
          />
          {textError && <p className="text-[11px] text-red-400">{textError}</p>}
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            Fonctions : mod(), floor(), ceil(), min(), max(), clamp(). Dés : ex 1d6, 3d8.
          </p>
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-color)' }}>
        <span className="text-[10px] pt-1" style={{ color: 'var(--text-secondary)' }}>
          Exemple avec {exampleSummary || 'aucune autre stat définie'} → {previewRange?.max !== null && previewRange?.max !== undefined ? 'plage' : 'résultat'} :
        </span>
        <span className="pt-1 text-sm font-bold" style={{ color: 'var(--accent-brown)' }}>
          {previewRange === null
            ? '—'
            : previewRange.max !== null
              ? `${previewRange.min} à ${previewRange.max}`
              : previewRange.min}
        </span>
      </div>
    </div>
  );
}

/** Aperçu compact en lecture seule d'une formule, utilisé dans les listes (sans édition). */
export function FormulaPreview({ node, statLabel }: { node: FormulaNode | null | undefined; statLabel: (key: string) => string }) {
  if (!node) return <span className="italic" style={{ color: 'var(--text-secondary)' }}>Valeur saisie librement</span>;
  return <span className="font-mono">{formulaToText(node).replace(/\bmod\(([^)]+)\)/g, (_m, key) => `modificateur de ${statLabel(key)}`)}</span>;
}
