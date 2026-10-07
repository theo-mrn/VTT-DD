/**
 * Lecture minimale d'un message ICU pour les tests des catalogues (docs/i18n.md § 9) : ses
 * arguments (nom et type) et ses balises de texte riche, à toutes les profondeurs (branches de
 * `plural` et `select` comprises). La syntaxe elle-même est vérifiée en formatant le message
 * avec next-intl.
 */

export type IcuArgType =
  'text' | 'plural' | 'selectordinal' | 'select' | 'number' | 'date' | 'time';

export interface IcuSummary {
  args: Map<string, IcuArgType>;
  tags: Set<string>;
}

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;

export function readIcu(message: string): IcuSummary {
  const summary: IcuSummary = { args: new Map(), tags: new Set() };
  parseText(message, 0, summary, false);
  return summary;
}

/** Texte jusqu'à la fin ou jusqu'à l'accolade fermante d'une branche ; renvoie l'index atteint. */
function parseText(s: string, start: number, out: IcuSummary, inBranch: boolean): number {
  let i = start;
  while (i < s.length) {
    const c = s[i];
    if (c === '}' && inBranch) return i;
    if (c === '<') {
      const m = /^<\/?([A-Za-z][A-Za-z0-9]*)>/.exec(s.slice(i));
      if (m?.[1]) {
        out.tags.add(m[1]);
        i += m[0].length;
        continue;
      }
    }
    if (c === '{') {
      i = parseArgument(s, i + 1, out);
      continue;
    }
    i++;
  }
  return i;
}

function skipSpaces(s: string, i: number) {
  while (i < s.length && /\s/.test(s[i] ?? '')) i++;
  return i;
}

function parseArgument(s: string, start: number, out: IcuSummary): number {
  let i = skipSpaces(s, start);
  IDENT.lastIndex = i;
  const name = IDENT.exec(s)?.[0];
  if (!name) throw new Error(`argument sans nom à la position ${start}`);
  i = skipSpaces(s, i + name.length);
  if (s[i] === '}') {
    out.args.set(name, out.args.get(name) ?? 'text');
    return i + 1;
  }
  if (s[i] !== ',') throw new Error(`« , » ou « } » attendu après ${name}`);
  i = skipSpaces(s, i + 1);
  IDENT.lastIndex = i;
  const type = IDENT.exec(s)?.[0] as IcuArgType | undefined;
  if (!type) throw new Error(`type manquant pour ${name}`);
  out.args.set(name, type);
  i = skipSpaces(s, i + type.length);
  if (type === 'plural' || type === 'select' || type === 'selectordinal') {
    if (s[i] !== ',') throw new Error(`branches attendues pour ${name}`);
    i++;
    // Branches : « sélecteur {texte} » jusqu'à l'accolade fermante de l'argument
    for (;;) {
      i = skipSpaces(s, i);
      if (s[i] === '}') return i + 1;
      const selector = /^(=?[A-Za-z0-9_-]+|offset:\d+)/.exec(s.slice(i))?.[0];
      if (!selector) throw new Error(`sélecteur attendu dans ${name}`);
      i = skipSpaces(s, i + selector.length);
      if (selector.startsWith('offset:')) continue;
      if (s[i] !== '{') throw new Error(`« { » attendu après ${selector} dans ${name}`);
      i = parseText(s, i + 1, out, true);
      if (s[i] !== '}') throw new Error(`branche ${selector} non fermée dans ${name}`);
      i++;
    }
  }
  // number, date, time : style éventuel jusqu'à l'accolade fermante
  const end = s.indexOf('}', i);
  if (end === -1) throw new Error(`argument ${name} non fermé`);
  return end + 1;
}
