#!/usr/bin/env node
// Zippe un dossier de bundle de règles (table.json + assets/ + scripts/) en un .zip importable
// dans l'app (Export/Import, /creer, éditeur de règles). Usage :
//   npm run bundle:zip -- starwars-bundle
// Produit starwars-bundle.zip à la racine du repo. Même style que seed-game-content.mjs : node pur,
// aucune dépendance hors projet (fflate est une dépendance directe).
//
// Si <bundle>/rules/*.md existe, ces fichiers sont d'abord injectés dans table.json
// (gameSystem.rules) — une seule commande, jamais besoin d'éditer le JSON à la main pour changer une
// règle : cf buildRulesFromMarkdown ci-dessous.

import { zipSync } from 'fflate';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, basename } from 'node:path';

const dirArg = process.argv[2];
if (!dirArg) {
  console.error('Usage: npm run bundle:zip -- <dossier-du-bundle>');
  process.exit(1);
}

const bundleDir = resolve(process.cwd(), dirArg);
if (!existsSync(bundleDir) || !statSync(bundleDir).isDirectory()) {
  console.error(`Dossier introuvable : ${bundleDir}`);
  process.exit(1);
}
if (!existsSync(join(bundleDir, 'table.json'))) {
  console.error(`Bundle invalide : ${dirArg}/table.json manquant.`);
  process.exit(1);
}

/** Convention par fichier <bundle>/rules/*.md, un par règle : préfixe numérique optionnel pour
 *  l'ordre d'affichage (01-stress.md...), retiré du titre, ne sert qu'au tri. Première ligne
 *  "# Titre de la règle" → GameRuleEntry.title ; reste du fichier (texte brut, aucun markdown
 *  interprété à l'affichage, cf SearchMenu.tsx) → GameRuleEntry.description. */
function buildRulesFromMarkdown(rulesDir) {
  const files = readdirSync(rulesDir).filter((f) => f.endsWith('.md')).sort();
  return files.map((file) => {
    const raw = readFileSync(join(rulesDir, file), 'utf8').replace(/\r\n/g, '\n').trim();
    const firstLineEnd = raw.indexOf('\n');
    const firstLine = firstLineEnd === -1 ? raw : raw.slice(0, firstLineEnd);
    const rest = firstLineEnd === -1 ? '' : raw.slice(firstLineEnd + 1).trim();
    if (!firstLine.startsWith('# ')) {
      console.error(`${basename(rulesDir)}/${file} : la première ligne doit être "# Titre de la règle".`);
      process.exit(1);
    }
    return { title: firstLine.slice(2).trim(), description: rest };
  });
}

const rulesDir = join(bundleDir, 'rules');
if (existsSync(rulesDir)) {
  const tablePath = join(bundleDir, 'table.json');
  const table = JSON.parse(readFileSync(tablePath, 'utf8'));
  const rules = buildRulesFromMarkdown(rulesDir);
  table.gameSystem.rules = rules;
  writeFileSync(tablePath, JSON.stringify(table, null, 2) + '\n');
  console.log(`✓ gameSystem.rules régénéré depuis ${rules.length} fichier(s) de rules/`);
}

/** Collecte récursive des fichiers, chemins relatifs POSIX, sans fichiers cachés (.DS_Store...). */
function collectFiles(dir) {
  const out = {};
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      Object.assign(out, collectFiles(full));
    } else {
      const rel = relative(bundleDir, full).split('\\').join('/');
      out[rel] = new Uint8Array(readFileSync(full));
    }
  }
  return out;
}

const files = collectFiles(bundleDir);
const zipped = zipSync(files, { level: 6 });
const outPath = resolve(process.cwd(), `${basename(bundleDir)}.zip`);
writeFileSync(outPath, zipped);

const count = Object.keys(files).length;
const sizeMb = (zipped.length / 1024 / 1024).toFixed(2);
console.log(`✓ ${outPath} — ${count} fichier(s), ${sizeMb} Mo`);
