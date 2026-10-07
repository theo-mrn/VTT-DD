#!/usr/bin/env node
/**
 * Textes d'interface encore écrits en dur (docs/i18n.md § 7).
 *
 * Heuristique, sans analyse syntaxique complète : on retire les commentaires, puis on relève
 * le texte JSX (entre deux balises) et les chaînes qui ressemblent à une phrase ou à un libellé
 * (majuscule initiale, lettre accentuée, mots courants du français). Une ligne marquée
 * `i18n-ignore` est sautée (valeur technique qui ressemble à du texte).
 *
 *   node scripts/i18n-coverage.mjs            état par dossier
 *   node scripts/i18n-coverage.mjs --files    détail par fichier
 *   node scripts/i18n-coverage.mjs <dossier>  limité à un dossier (relatif à src/)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Hors champ : catalogues, tests, outillage, contenus écrits par langue (`<page>/fr.tsx`). */
const EXCLUDED = [/\.test\.tsx?$/, /\/i18n\//, /\/test\//, /\.d\.ts$/, /\/[a-z]{2}\.tsx$/];

/** Mots techniques qui ressemblent à un libellé (touches, méthodes, types). */
const TECHNICAL = new Set([
  'Escape',
  'Enter',
  'Space',
  'Tab',
  'Backspace',
  'Delete',
  'Shift',
  'Control',
  'Meta',
  'Alt',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Infinity',
  'Content-Type',
  'Authorization',
  'Bearer',
  'Yner',
  'YNER',
  'Discord',
  'Google',
  'Stripe',
  'YouTube',
  'Mod',
  'Inter',
  'Geist',
]);

const FRENCH_WORDS =
  /(^|\s)(le|la|les|des|du|de|un|une|et|ou|pour|avec|sans|au|aux|est|pas|ne|sur|dans|en|vos|votre|mon|ma|mes|ce|cette|ces|qui|que|par|à|d’|l’)(\s|$)/i;
const ACCENTS = /[àâäçéèêëîïôöûùüÿœæÀÂÇÉÈÊËÎÏÔÛÙÜŒ’«»…]/;

/** Retire les commentaires en gardant les chaînes (et les numéros de ligne). */
export function stripComments(code) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
    i++;
  }
  return out;
}

/** Une chaîne qui se lit comme du texte d'interface. */
export function looksLikeText(s) {
  const t = s.trim();
  if (t.length < 2 || !/[a-zà-ÿ]/i.test(t)) return false;
  if (TECHNICAL.has(t)) return false;
  // Chemins, URL, clés pointées, identifiants, classes CSS, sélecteurs, formats
  if (/^(\.{0,2}\/|@\/|https?:|data:|#|\[|\(|--|[a-z]+:\/\/)/.test(t)) return false;
  if (/^[a-z0-9]+([._-][a-z0-9]+)+$/i.test(t) && !ACCENTS.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t)) return false;
  const tokens = t.split(/\s+/);
  const cssLike = tokens.every((w) =>
    /^[!-]?[a-z0-9]+([:/\-.[\]()%#,_=]+[a-zA-Z0-9.%#_()-]*)*$/.test(w),
  );
  if (cssLike && !FRENCH_WORDS.test(t) && !ACCENTS.test(t)) return false;
  if (ACCENTS.test(t)) return true;
  if (FRENCH_WORDS.test(t) && tokens.length > 1) return true;
  // Libellé : majuscule puis minuscules (« Fermer », « Nouvelle campagne »)
  return /^[A-ZÀ-Ý][a-zà-ÿ'’]+([\s,][^\s]+)*[.!?…:]?$/.test(t) && !/[{}();=<>]/.test(t);
}

/** Textes en dur d'un fichier : [{ line, text }]. */
export function scanSource(code, tsx) {
  const raw = code.split('\n');
  const lines = stripComments(code).split('\n');
  const found = [];
  lines.forEach((line, index) => {
    if (raw[index]?.includes('i18n-ignore')) return;
    if (/^\s*(import|export \* from|export \{[^}]*\} from)\b/.test(line)) return;
    if (/displayName\s*=/.test(line)) return;
    if (/new Error\(|console\.|'use (client|server)'|className=|class=/.test(line)) {
      // Une ligne className peut porter aussi un libellé : on ne garde que les attributs utiles
      if (!/(title|placeholder|aria-label|alt|label)=["'][^"']+["']/.test(line)) return;
    }
    const hits = new Set();
    for (const m of line.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`/g)) {
      const s = m[1] ?? m[2] ?? m[3] ?? '';
      if (looksLikeText(s)) hits.add(s.trim());
    }
    // Gabarit avec des valeurs : le texte autour d'elles (`par ${noms}`)
    for (const m of line.matchAll(/`([^`]*\$\{[^`]*)`/g)) {
      const fixed = (m[1] ?? '').replace(/\$\{[^}]*\}/g, ' ').trim();
      if (/[a-zà-ÿ]{2}/i.test(fixed) && (ACCENTS.test(fixed) || FRENCH_WORDS.test(` ${fixed} `)))
        hits.add(m[1].trim());
    }
    if (tsx) {
      for (const m of line.matchAll(/>([^<>{}]+)</g)) {
        // Flèche de fonction suivie d'un type générique (`=> api<T>`) : du code
        if (line[(m.index ?? 0) - 1] === '=') continue;
        const s = m[1].trim();
        if (/[;=()&|]/.test(s) || /^[,.]/.test(s) || !/[a-zà-ÿ]{2}/i.test(s)) continue;
        hits.add(s);
      }
      // Texte JSX seul sur sa ligne
      const alone = line.trim();
      if (
        /^[A-ZÀ-Ýa-zà-ÿ0-9«“"'’][^<>{}=;]*$/.test(alone) &&
        /[a-zà-ÿ]{2}/i.test(alone) &&
        /\s/.test(alone) &&
        !/^(return|const|let|if|else|case|default|await|type|interface|function)\b/.test(alone) &&
        !/[,(]$/.test(alone) &&
        (ACCENTS.test(alone) || FRENCH_WORDS.test(alone))
      ) {
        hits.add(alone);
      }
      // Un mot seul sur sa ligne, en texte JSX (« Retour », « Restaurer »)
      if (
        /^[A-ZÀ-Ý][a-zà-ÿ’']{2,}[.!?…]?$/.test(alone) &&
        !TECHNICAL.has(alone) &&
        /^\s*<|>\s*$|^\s*\{?\s*$/.test(raw[index - 1] ?? '')
      ) {
        hits.add(alone);
      }
    }
    for (const text of hits) found.push({ line: index + 1, text });
  });
  return found;
}

function* walk(dir) {
  if (!statSync(dir).isDirectory()) {
    if (!EXCLUDED.some((r) => r.test(dir))) yield dir;
    return;
  }
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(name) && !EXCLUDED.some((r) => r.test(p))) yield p;
  }
}

/**
 * Textes en dur sous un dossier (ou dans un fichier) de src/.
 * @param {string} [relative]
 * @returns {Record<string, { line: number; text: string }[]>}
 */
export function scanDir(relative = '.') {
  /** @type {Record<string, { line: number; text: string }[]>} */
  const result = {};
  for (const file of walk(path.join(SRC, relative))) {
    const hits = scanSource(readFileSync(file, 'utf8'), file.endsWith('.tsx'));
    if (hits.length) result[path.relative(SRC, file)] = hits;
  }
  return result;
}

function main() {
  const args = process.argv.slice(2);
  const files = args.includes('--files');
  const target = args.find((a) => !a.startsWith('--')) ?? '.';
  const result = scanDir(target);
  const byDir = new Map();
  let total = 0;
  for (const [file, hits] of Object.entries(result)) {
    total += hits.length;
    const parts = file.split(path.sep);
    const dir = parts.slice(0, Math.min(parts.length - 1, parts[0] === 'lib' ? 3 : 2)).join('/');
    byDir.set(dir, (byDir.get(dir) ?? 0) + hits.length);
  }
  if (files) {
    for (const [file, hits] of Object.entries(result).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${String(hits.length).padStart(5)}  ${file}`);
      if (args.includes('--lines'))
        for (const h of hits) console.log(`         ${h.line}: ${h.text}`);
    }
  } else {
    for (const [dir, n] of [...byDir].sort((a, b) => b[1] - a[1])) {
      console.log(`${String(n).padStart(5)}  ${dir}`);
    }
  }
  console.log(`${String(total).padStart(5)}  total`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
