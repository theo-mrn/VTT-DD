import type { FormulaNode } from '@/modules/game-system/types';

// Grammaire fermée (Pratt parser à précédence simple), zéro dépendance :
//   expr    := term (('+'|'-') term)*
//   term    := factor (('*'|'/') factor)*
//   factor  := NUMBER | DICE_NOTATION | IDENT | call | '(' expr ')' | '-' factor
//   call    := ('mod'|'floor'|'ceil'|'min'|'max'|'clamp') '(' expr (',' expr)* ')'
// Whitelist stricte de fonctions — toute fonction hors liste est une erreur de parsing.
// Ce parser ne produit jamais de code exécutable : seulement des FormulaNode d'une union fermée.

export interface FormulaParseSuccess {
  ok: true;
  ast: FormulaNode;
}

export interface FormulaParseError {
  ok: false;
  error: string;
  position: number;
}

export type FormulaParseResult = FormulaParseSuccess | FormulaParseError;

const ALLOWED_FUNCTIONS = new Set(['mod', 'floor', 'ceil', 'min', 'max', 'clamp']);
const DICE_RE = /^\d*d\d+$/i;

type Token =
  | { kind: 'num'; value: number; pos: number }
  | { kind: 'dice'; notation: string; pos: number }
  | { kind: 'ident'; name: string; pos: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' | '(' | ')' | ','; pos: number };

class ParseError extends Error {
  constructor(message: string, public position: number) {
    super(message);
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ('+-*/(),'.includes(c)) {
      tokens.push({ kind: 'op', value: c as '+' | '-' | '*' | '/' | '(' | ')' | ',', pos: i });
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      while (i < input.length && /[0-9]/.test(input[i])) i++;
      // Notation de dé : suite de chiffres suivie de 'd' puis de chiffres (ex "3d6", "d20").
      if (input[i] === 'd' || input[i] === 'D') {
        const diceStart = i;
        i++;
        const sidesStart = i;
        while (i < input.length && /[0-9]/.test(input[i])) i++;
        if (i === sidesStart) throw new ParseError('Notation de dé invalide (attendu ex: 3d6)', diceStart);
        tokens.push({ kind: 'dice', notation: input.slice(start, i), pos: start });
        continue;
      }
      tokens.push({ kind: 'num', value: parseInt(input.slice(start, i), 10), pos: start });
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const start = i;
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) i++;
      // Une notation de dé peut aussi commencer par 'd' seul (ex "d20").
      if (input.slice(start, i).toLowerCase() === 'd' && /[0-9]/.test(input[i] ?? '')) {
        const sidesStart = i;
        while (i < input.length && /[0-9]/.test(input[i])) i++;
        tokens.push({ kind: 'dice', notation: input.slice(start, i), pos: start });
        continue;
      }
      tokens.push({ kind: 'ident', name: input.slice(start, i), pos: start });
      continue;
    }
    throw new ParseError(`Caractère inattendu "${c}"`, i);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private knownKeys: Set<string>) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) throw new ParseError('Fin d\'expression inattendue', this.tokens[this.tokens.length - 1]?.pos ?? 0);
    this.pos++;
    return tok;
  }

  private expectOp(value: '(' | ')' | ',') {
    const tok = this.next();
    if (tok.kind !== 'op' || tok.value !== value) {
      throw new ParseError(`Attendu "${value}"`, tok.pos);
    }
  }

  parseExpr(): FormulaNode {
    let node = this.parseTerm();
    while (this.peek()?.kind === 'op' && (this.peek() as Token & { kind: 'op' }).value === '+' || (this.peek()?.kind === 'op' && (this.peek() as Token & { kind: 'op' }).value === '-')) {
      const opTok = this.next() as Token & { kind: 'op' };
      const rhs = this.parseTerm();
      node = opTok.value === '+' ? { type: 'add', args: [node, rhs] } : { type: 'sub', args: [node, rhs] };
    }
    return node;
  }

  private parseTerm(): FormulaNode {
    let node = this.parseFactor();
    while (this.peek()?.kind === 'op' && ((this.peek() as Token & { kind: 'op' }).value === '*' || (this.peek() as Token & { kind: 'op' }).value === '/')) {
      const opTok = this.next() as Token & { kind: 'op' };
      const rhs = this.parseFactor();
      node = opTok.value === '*' ? { type: 'mul', args: [node, rhs] } : { type: 'div', args: [node, rhs] };
    }
    return node;
  }

  private parseFactor(): FormulaNode {
    const tok = this.peek();
    if (!tok) throw new ParseError('Expression incomplète', this.tokens[this.tokens.length - 1]?.pos ?? 0);

    if (tok.kind === 'op' && tok.value === '-') {
      this.next();
      const inner = this.parseFactor();
      return { type: 'sub', args: [{ type: 'const', value: 0 }, inner] };
    }
    if (tok.kind === 'op' && tok.value === '(') {
      this.next();
      const inner = this.parseExpr();
      this.expectOp(')');
      return inner;
    }
    if (tok.kind === 'num') {
      this.next();
      return { type: 'const', value: tok.value };
    }
    if (tok.kind === 'dice') {
      this.next();
      return { type: 'dice', notation: tok.notation };
    }
    if (tok.kind === 'ident') {
      this.next();
      if (this.peek()?.kind === 'op' && (this.peek() as Token & { kind: 'op' }).value === '(') {
        return this.parseCall(tok.name, tok.pos);
      }
      // "self" est un mot-clé réservé (pas une clé de stat) : valeur de la stat en cours d'évaluation,
      // utilisé uniquement dans la formule de modificateur globale du système.
      if (tok.name === 'self') {
        return { type: 'self' };
      }
      if (!this.knownKeys.has(tok.name)) {
        throw new ParseError(`Référence inconnue à la stat "${tok.name}"`, tok.pos);
      }
      return { type: 'stat', key: tok.name };
    }
    throw new ParseError('Expression inattendue', tok.pos);
  }

  private parseCall(name: string, pos: number): FormulaNode {
    if (!ALLOWED_FUNCTIONS.has(name)) {
      throw new ParseError(`Fonction inconnue "${name}"`, pos);
    }
    this.expectOp('(');

    if (name === 'mod') {
      const argTok = this.next();
      if (argTok.kind !== 'ident' || !this.knownKeys.has(argTok.name)) {
        throw new ParseError('mod() attend le nom d\'une stat', argTok.pos);
      }
      this.expectOp(')');
      return { type: 'modifier', key: argTok.name };
    }

    if (name === 'floor' || name === 'ceil') {
      const arg = this.parseExpr();
      this.expectOp(')');
      return { type: name, arg };
    }

    if (name === 'min' || name === 'max') {
      const args = [this.parseExpr()];
      while (this.peek()?.kind === 'op' && (this.peek() as Token & { kind: 'op' }).value === ',') {
        this.next();
        args.push(this.parseExpr());
      }
      this.expectOp(')');
      return { type: name, args };
    }

    // clamp(value, lo, hi)
    const arg = this.parseExpr();
    this.expectOp(',');
    const lo = this.parseExpr();
    this.expectOp(',');
    const hi = this.parseExpr();
    this.expectOp(')');
    return { type: 'clamp', arg, lo, hi };
  }
}

/** Parse une formule texte (ex "1 + mod(FOR) + 1d6") en FormulaNode. Ne l'évalue jamais elle-même. */
export function parseFormulaText(input: string, knownKeys: Iterable<string>): FormulaParseResult {
  try {
    const tokens = tokenize(input);
    if (tokens.length === 0) return { ok: false, error: 'Formule vide', position: 0 };
    const parser = new Parser(tokens, new Set(knownKeys));
    const ast = parser.parseExpr();
    return { ok: true, ast };
  } catch (err) {
    if (err instanceof ParseError) return { ok: false, error: err.message, position: err.position };
    return { ok: false, error: String(err), position: 0 };
  }
}

/** Réaffiche un AST sous forme texte éditable (round-trip avec parseFormulaText). */
export function formulaToText(node: FormulaNode): string {
  switch (node.type) {
    case 'const':
      return String(node.value);
    case 'stat':
      return node.key;
    case 'modifier':
      return `mod(${node.key})`;
    case 'bonus':
      return `bonus(${node.key})`;
    case 'dice':
      return node.notation;
    case 'diceField':
      return `dice(${node.key})`;
    case 'self':
      return 'self';
    case 'add':
      return node.args.map(formulaToText).join(' + ');
    case 'sub':
      return node.args.map(formulaToText).join(' - ');
    case 'mul':
      return node.args.map((a) => wrapIfBinary(a)).join(' * ');
    case 'div':
      return node.args.map((a) => wrapIfBinary(a)).join(' / ');
    case 'min':
      return `min(${node.args.map(formulaToText).join(', ')})`;
    case 'max':
      return `max(${node.args.map(formulaToText).join(', ')})`;
    case 'floor':
      return `floor(${formulaToText(node.arg)})`;
    case 'ceil':
      return `ceil(${formulaToText(node.arg)})`;
    case 'clamp':
      return `clamp(${formulaToText(node.arg)}, ${formulaToText(node.lo)}, ${formulaToText(node.hi)})`;
  }
}

function wrapIfBinary(node: FormulaNode): string {
  const text = formulaToText(node);
  return node.type === 'add' || node.type === 'sub' ? `(${text})` : text;
}
